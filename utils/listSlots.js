const Booking = require("../models/Booking");
const Slot = require("../models/Slot");
const ensureEquipmentInterval = require("../services/equipmentInventory");
const { buildIntervals } = require("./timeSlots");

async function listSlots({ userId, dayKey, category, config }) {
  const intervals = buildIntervals(dayKey, config.opensAt, config.closesAt);
  if (!intervals.length) return [];

  await Promise.all(intervals.map(async (interval) => {
    await ensureEquipmentInterval(category, interval, config.capacities[category]);
  }));

  const first = intervals[0].startsAt;
  const last = intervals[intervals.length - 1].endsAt;
  const inventory = await Slot.find({ category, startsAt: { $gte: first, $lt: last } }).sort({ startsAt: 1 }).lean();
  const bookings = userId
    ? await Booking.find({ userId, category, startsAt: { $lt: last }, endsAt: { $gt: first } }).select("intervalIds").lean()
    : [];
  const ownIntervals = new Set(bookings.flatMap((booking) => booking.intervalIds || []).map(String));
  const inventoryByStart = new Map(inventory.map((slot) => [slot.startsAt.getTime(), slot]));

  return intervals.map((interval) => {
    const slot = inventoryByStart.get(interval.startsAt.getTime());
    const capacity = slot?.capacity ?? config.capacities[category];
    const bookedCount = slot?.bookedCount ?? 0;
    const remaining = Math.max(0, capacity - bookedCount);
    return {
      ...(slot || {}),
      _id: slot?._id,
      category,
      startsAt: interval.startsAt,
      endsAt: interval.endsAt,
      startTime: interval.startTime,
      endTime: interval.endTime,
      capacity,
      bookedCount,
      remaining,
      available: remaining > 0,
      isPast: interval.startsAt <= new Date(),
      bookedByMe: Boolean(slot && ownIntervals.has(String(slot._id))),
      capacityOverride: Boolean(slot?.capacityOverride)
    };
  });
}

module.exports = listSlots;
