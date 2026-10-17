const express = require("express");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const GymConfig = require("../models/GymConfig");
const GymSetting = require("../models/GymSetting");
const Slot = require("../models/Slot");
const Membership = require("../models/Membership");
const getGymConfig = require("../services/gymConfig");
const listSlots = require("../utils/listSlots");
const User = require("../models/user");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const { dateAtGymTime, dateKey, endOfDate, startOfDate } = require("../utils/dates");
const { CATEGORIES, clockMinutes } = require("../utils/timeSlots");

const router = express.Router();
router.use(authMiddleware, adminMiddleware);

function requestBody(req) {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
}

function isIntegerInRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function minutesAtGym(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: process.env.GYM_TIMEZONE || "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

router.get("/slots", async (req, res) => {
  try {
    const dayKey = req.query.date || dateKey(new Date());
    const category = typeof req.query.category === "string" ? req.query.category.toLowerCase() : "yoga";
    if (!dateAtGymTime(dayKey, 0, 0)) return res.status(400).json({ message: "Choose a valid date." });
    if (!CATEGORIES.includes(category)) return res.status(400).json({ message: "Choose yoga, cardio or strength training." });
    const config = await getGymConfig();
    const slots = await listSlots({ userId: null, dayKey, category, config });
    return res.json({ slots, date: dayKey, today: dateKey(new Date()), category, gym: config });
  } catch (error) {
    console.error("Load admin availability error:", error.message);
    return res.status(500).json({ message: "We could not load equipment availability." });
  }
});

router.get("/config", async (req, res) => {
  try {
    const config = await getGymConfig();
    return res.json({ config, timeZone: process.env.GYM_TIMEZONE || "Asia/Kolkata" });
  } catch (error) {
    console.error("Load gym configuration error:", error.message);
    return res.status(500).json({ message: "We could not load gym settings." });
  }
});

router.patch("/config", async (req, res) => {
  const { opensAt, closesAt, capacities } = requestBody(req);
  const open = clockMinutes(opensAt);
  const close = clockMinutes(closesAt, true);
  if (open === null || close === null || open >= close) {
    return res.status(400).json({ message: "Set opening and closing times on 30-minute boundaries, with opening before closing." });
  }
  const nextCapacities = {};
  for (const category of CATEGORIES) {
    const value = capacities?.[category];
    if (!isIntegerInRange(value, 0, 500)) {
      return res.status(400).json({ message: "Equipment capacity must be a whole number from 0 to 500 for each training type." });
    }
    nextCapacities[category] = value;
  }

  try {
    const currentConfig = await getGymConfig();
    if (currentConfig.opensAt !== opensAt || currentConfig.closesAt !== closesAt) {
      const futureBookings = await Booking.find({ endsAt: { $gt: new Date() } }).select("startsAt endsAt").lean();
      const conflicts = futureBookings.some((booking) => {
        const bookingDay = dateKey(booking.startsAt);
        const lastDay = dateKey(new Date(booking.endsAt.getTime() - 1));
        const startMinute = minutesAtGym(booking.startsAt);
        let endMinute = minutesAtGym(booking.endsAt);
        if (lastDay === bookingDay && endMinute === 0) endMinute = 1440;
        return lastDay !== bookingDay || startMinute < open || endMinute > close;
      });
      if (conflicts) {
        return res.status(409).json({ message: "Existing bookings fall outside those hours. Cancel or move them before changing gym hours." });
      }
    }
    const config = await GymConfig.findOneAndUpdate(
      { _id: "default" },
      { $set: { opensAt, closesAt, capacities: nextCapacities } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    const now = new Date();
    await Promise.all(CATEGORIES.map((category) => Slot.updateMany(
      { category, startsAt: { $gte: now }, capacityOverride: { $ne: true } },
      { $set: { capacity: nextCapacities[category] } }
    )));
    return res.json({ config });
  } catch (error) {
    console.error("Update gym configuration error:", error.message);
    return res.status(500).json({ message: "We could not save gym settings." });
  }
});

router.patch("/slot-capacity", async (req, res) => {
  const body = requestBody(req);
  const date = body.date;
  const category = typeof body.category === "string" ? body.category.toLowerCase() : "";
  const startTime = body.startTime;
  const useDefault = body.useDefault;
  if (typeof useDefault !== "boolean") return res.status(400).json({ message: "Specify whether this interval should use the default capacity." });
  if (!CATEGORIES.includes(category)) return res.status(400).json({ message: "Choose yoga, cardio or strength training." });
  const minute = clockMinutes(startTime);
  if (minute === null) return res.status(400).json({ message: "Choose a start time on a 30-minute boundary." });
  const customCapacity = body.capacity;
  if (!useDefault && !isIntegerInRange(customCapacity, 0, 500)) {
    return res.status(400).json({ message: "Capacity must be a whole number from 0 to 500." });
  }
  try {
    const config = await getGymConfig();
    const opening = clockMinutes(config.opensAt);
    const closing = clockMinutes(config.closesAt, true);
    if (!dateAtGymTime(date, 0, 0) || minute < opening || minute >= closing) {
      return res.status(400).json({ message: "Choose a time inside the gym's operating hours." });
    }
    const startsAt = dateAtGymTime(date, Math.floor(minute / 60), minute % 60);
    if (!startsAt || startsAt <= new Date()) return res.status(400).json({ message: "Capacity can only be changed for a future interval." });
    const capacity = useDefault ? config.capacities[category] : customCapacity;
    const slot = await Slot.findOneAndUpdate(
      { category, startsAt },
      {
        $set: { category, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000), capacity, capacityOverride: !useDefault },
        $setOnInsert: { bookedCount: 0 }
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    return res.json({ slot });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "That interval was updated at the same time. Reload and try again." });
    console.error("Update interval capacity error:", error.message);
    return res.status(500).json({ message: "We could not change interval capacity." });
  }
});

router.get("/settings", async (req, res) => {
  try {
    const setting = await GymSetting.findOne({ key: "maxBookingsPerDay" }).lean();
    return res.json({ maxBookingsPerDay: setting?.value || 4 });
  } catch (error) {
    console.error("Load settings error:", error.message);
    return res.status(500).json({ message: "We could not load the booking limit." });
  }
});

router.patch("/settings", async (req, res) => {
  const value = requestBody(req).maxBookingsPerDay;
  if (!isIntegerInRange(value, 1, 48)) {
    return res.status(400).json({ message: "The daily booking limit must be a whole number from 1 to 48 half-hour blocks." });
  }
  try {
    await GymSetting.updateOne(
      { key: "maxBookingsPerDay" },
      { $set: { value } },
      { upsert: true, runValidators: true }
    );
    return res.json({ maxBookingsPerDay: value });
  } catch (error) {
    console.error("Update settings error:", error.message);
    return res.status(500).json({ message: "We could not save the booking limit." });
  }
});

router.get("/memberships", async (req, res) => {
  try {
    const memberships = await Membership.find()
      .populate("userId", "name email")
      .sort({ expiresAt: -1 })
      .limit(250)
      .lean();
    return res.json({
      memberships: memberships.map((membership) => ({
        ...membership,
        startDate: dateKey(membership.startsAt),
        endDate: dateKey(membership.expiresAt)
      }))
    });
  } catch (error) {
    console.error("Load memberships error:", error.message);
    return res.status(500).json({ message: "We could not load memberships." });
  }
});

function readMembershipDates(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Enter a membership plan and valid membership dates." };
  }
  const startsAt = startOfDate(body.startDate);
  const expiresAt = endOfDate(body.endDate);
  if (!startsAt || !expiresAt || startsAt > expiresAt) return { error: "Choose a valid membership start and end date." };
  const plan = typeof body.plan === "string" ? body.plan.trim() : "";
  if (!plan || plan.length > 80) return { error: "Enter a membership plan of up to 80 characters." };
  return { value: { plan, startsAt, expiresAt } };
}

router.post("/memberships", async (req, res) => {
  const body = requestBody(req);
  const parsed = readMembershipDates(body);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Enter a valid member account email." });
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "No account was found for that email." });
    const membership = await Membership.create({ userId: user._id, ...parsed.value });
    await membership.populate("userId", "name email");
    return res.status(201).json({ membership });
  } catch (error) {
    console.error("Create membership error:", error.message);
    return res.status(500).json({ message: "We could not add this membership." });
  }
});

router.patch("/memberships/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Choose a valid membership." });
  const body = requestBody(req);
  const parsed = readMembershipDates(body);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  try {
    const membership = await Membership.findById(req.params.id);
    if (!membership) return res.status(404).json({ message: "Membership not found." });
    if (typeof body.email === "string" && body.email.trim()) {
      const email = body.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "Enter a valid member account email." });
      const user = await User.findOne({ email });
      if (!user) return res.status(404).json({ message: "No account was found for that email." });
      membership.userId = user._id;
    }
    Object.assign(membership, parsed.value);
    await membership.save();
    await membership.populate("userId", "name email");
    return res.json({ membership });
  } catch (error) {
    console.error("Update membership error:", error.message);
    return res.status(500).json({ message: "We could not update this membership." });
  }
});

router.delete("/memberships/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Choose a valid membership." });
  try {
    const membership = await Membership.findByIdAndDelete(req.params.id);
    if (!membership) return res.status(404).json({ message: "Membership not found." });
    return res.json({ message: "Membership removed." });
  } catch (error) {
    console.error("Delete membership error:", error.message);
    return res.status(500).json({ message: "We could not remove this membership." });
  }
});

module.exports = router;
