const Slot = require("../models/Slot");

// Default capacity is written only when inventory is first created. Existing
// rows are changed by the admin configuration route, avoiding stale member
// requests overwriting a newer admin capacity update.
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
  return Slot.findOne({ category, startsAt: interval.startsAt });
}

module.exports = ensureEquipmentInterval;
