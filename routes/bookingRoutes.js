const express = require("express");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const BookingLimit = require("../models/BookingLimit");
const GymSetting = require("../models/GymSetting");
const Membership = require("../models/Membership");
const Slot = require("../models/Slot");
const authMiddleware = require("../middleware/authMiddleware");
const ensureEquipmentInterval = require("../services/equipmentInventory");
const getGymConfig = require("../services/gymConfig");
const { dateKey } = require("../utils/dates");
const { CATEGORIES, parseBookingRange } = require("../utils/timeSlots");

const router = express.Router();
router.use(authMiddleware);

router.get("/me", async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.userId }).sort({ startsAt: 1 }).limit(100);
    return res.json({ bookings });
  } catch (error) {
    console.error("Load bookings error:", error.message);
    return res.status(500).json({ message: "We could not load your bookings." });
  }
});

async function reserveDailyBlocks(userId, day, blocks, max) {
  try {
    await BookingLimit.updateOne(
      { userId, dayKey: day },
      { $setOnInsert: { userId, dayKey: day, count: 0 } },
      { upsert: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    // A simultaneous first request may have created the unique counter row.
    if (error.code !== 11000) throw error;
  }
  return BookingLimit.findOneAndUpdate(
    { userId, dayKey: day, count: { $lte: max - blocks } },
    { $inc: { count: blocks } },
    { new: true }
  );
}

async function releaseDailyBlocks(userId, day, blocks) {
  await BookingLimit.updateOne({ userId, dayKey: day, count: { $gte: blocks } }, { $inc: { count: -blocks } });
}

async function releaseInventorySlots(slotIds) {
  if (!slotIds.length) return;
  await Slot.updateMany({ _id: { $in: slotIds }, bookedCount: { $gt: 0 } }, { $inc: { bookedCount: -1 } });
}

router.post("/", async (req, res) => {
  const { date, category } = req.body;
  const startTime = req.body.startTime;
  const endTime = req.body.endTime;
  if (!CATEGORIES.includes(category)) return res.status(400).json({ message: "Choose yoga, cardio or strength training." });

  let range;
  let day;
  let reservedSlots = [];
  let reservedBlocks = 0;
  try {
    const config = await getGymConfig();
    range = parseBookingRange(date, startTime, endTime, config);
    if (!range) return res.status(400).json({ message: "Choose a 30-minute-aligned time range within the gym's hours for that date." });
    if (range.startsAt <= new Date()) return res.status(409).json({ message: "Bookings must start in the future." });

    const membership = await Membership.findOne({
      userId: req.userId,
      startsAt: { $lte: new Date() },
      expiresAt: { $gt: range.endsAt }
    });
    if (!membership) {
      return res.status(403).json({ message: "An active membership that covers the full booking is required." });
    }

    if (await Booking.exists({ userId: req.userId, startsAt: { $lt: range.endsAt }, endsAt: { $gt: range.startsAt } })) {
      return res.status(409).json({ message: "You already have a booking that overlaps this time." });
    }

    const setting = await GymSetting.findOne({ key: "maxBookingsPerDay" }).lean();
    const maxPerDay = setting?.value ?? 4;
    day = range.dayKey;
    const blockCount = range.intervals.length;
    const dailyReservation = await reserveDailyBlocks(req.userId, day, blockCount, maxPerDay);
    if (!dailyReservation) {
      return res.status(429).json({ message: `Your daily limit is ${maxPerDay} half-hour blocks.` });
    }
    reservedBlocks = blockCount;

    for (const interval of range.intervals) {
      const inventory = await ensureEquipmentInterval(category, interval, config.capacities[category]);
      const reserved = await Slot.findOneAndUpdate(
        {
          _id: inventory._id,
          startsAt: { $gt: new Date() },
          $expr: { $lt: ["$bookedCount", "$capacity"] }
        },
        { $inc: { bookedCount: 1 } },
        { new: true }
      );
      if (!reserved) {
        const toRelease = reservedSlots;
        reservedSlots = [];
        const blocksToRelease = reservedBlocks;
        reservedBlocks = 0;
        const releases = await Promise.allSettled([
          releaseInventorySlots(toRelease),
          releaseDailyBlocks(req.userId, day, blocksToRelease)
        ]);
        if (releases.some((result) => result.status === "rejected")) console.error("Booking rollback failed.");
        return res.status(409).json({ message: `Equipment is full for ${interval.startTime}–${interval.endTime}. Reload availability and choose another time.` });
      }
      reservedSlots.push(reserved._id);
    }

    const booking = await Booking.create({
      userId: req.userId,
      category,
      startsAt: range.startsAt,
      endsAt: range.endsAt,
      intervalIds: reservedSlots,
      blockCount: range.intervals.length,
      dayKey: day
    });
    reservedSlots = [];
    reservedBlocks = 0;
    return res.status(201).json({ booking });
  } catch (error) {
    const cleanup = [];
    if (reservedSlots.length) cleanup.push(releaseInventorySlots(reservedSlots));
    if (reservedBlocks && day) cleanup.push(releaseDailyBlocks(req.userId, day, reservedBlocks));
    const results = await Promise.allSettled(cleanup);
    if (results.some((result) => result.status === "rejected")) console.error("Booking rollback failed.");
    console.error("Create booking error:", error.message);
    return res.status(500).json({ message: "We could not complete this booking. Please try again." });
  }
});

router.delete("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Choose a valid booking." });
  try {
    const booking = await Booking.findOne({ _id: req.params.id, userId: req.userId });
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    if (booking.startsAt <= new Date()) return res.status(409).json({ message: "A booking that has started cannot be cancelled." });

    const removed = await Booking.findOneAndDelete({ _id: booking._id, userId: req.userId });
    if (!removed) return res.status(404).json({ message: "Booking not found." });
    await Promise.all([
      releaseInventorySlots(removed.intervalIds || []),
      releaseDailyBlocks(removed.userId, removed.dayKey, removed.blockCount || removed.intervalIds.length)
    ]);
    return res.json({ message: "Booking cancelled." });
  } catch (error) {
    console.error("Cancel booking error:", error.message);
    return res.status(500).json({ message: "We could not cancel this booking." });
  }
});

module.exports = router;
