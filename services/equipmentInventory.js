const Slot = require("../models/Slot");

async function ensureEquipmentInterval(category, interval, defaultCapacity) {
  try {
    await Slot.updateOne(
      { category, startsAt: interval.startsAt },
      {
        $setOnInsert: {
          category,
          startsAt: interval.startsAt,
          endsAt: interval.endsAt,
          capacity: defaultCapacity,
          capacityOverride: false,
          bookedCount: 0
        }
      },
      { upsert: true }
    );
  } catch (error) {
    // Another request can create the same category/time inventory row first.
    if (error.code !== 11000) throw error;
  }
  await Slot.updateOne(
    { category, startsAt: interval.startsAt, capacityOverride: { $ne: true } },
    { $set: { capacity: defaultCapacity } }
  );
  return Slot.findOne({ category, startsAt: interval.startsAt });
}

module.exports = ensureEquipmentInterval;
