const Booking = require("../models/Booking");
const BookingLimit = require("../models/BookingLimit");
const Slot = require("../models/Slot");
const { dateKey } = require("../utils/dates");

async function removeLegacyIndexes() {
  const bookingIndexes = await Booking.collection.indexes();
  for (const index of bookingIndexes) {
    if (index.name !== "_id_" && index.key.slotId === 1) {
      await Booking.collection.dropIndex(index.name);
    }
    if (index.name !== "_id_" && index.unique && index.key.userId === 1 && index.key.intervalIds === 1) {
      await Booking.collection.dropIndex(index.name);
    }
  }

  const slotIndexes = await Slot.collection.indexes();
  for (const index of slotIndexes) {
    if (index.unique && Object.keys(index.key).length === 1 && index.key.startsAt === 1) {
      await Slot.collection.dropIndex(index.name);
    }
  }
}

async function migrateLegacyBookings() {
  const legacyBookings = await Booking.collection.find({ slotId: { $exists: true }, intervalIds: { $exists: false } }).toArray();
  for (const booking of legacyBookings) {
    const slot = await Slot.collection.findOne({ _id: booking.slotId });
    if (!slot || !slot.startsAt || !slot.endsAt || !slot.category) {
      await Booking.collection.deleteOne({ _id: booking._id });
      continue;
    }
    await Booking.collection.updateOne(
      { _id: booking._id },
      {
        $set: {
          category: slot.category,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          intervalIds: [slot._id],
          blockKeys: [slot.startsAt.toISOString()],
          blockCount: 1,
          dayKey: booking.dayKey || dateKey(slot.startsAt)
        },
        $unset: { slotId: "" }
      }
    );
  }
}

function blockKeysForBooking(booking) {
  if (!booking.startsAt || !booking.endsAt) return [];
  const startsAt = new Date(booking.startsAt);
  const endsAt = new Date(booking.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || startsAt >= endsAt) return [];

  const keys = [];
  for (let time = startsAt.getTime(); time < endsAt.getTime(); time += 30 * 60 * 1000) {
    keys.push(new Date(time).toISOString());
  }
  return keys;
}

async function addMissingBlockKeys() {
  const bookings = await Booking.collection.find({ $or: [{ blockKeys: { $exists: false } }, { blockKeys: { $size: 0 } }] }).toArray();
  const operations = bookings.map((booking) => {
    const blockKeys = blockKeysForBooking(booking);
    return {
      updateOne: {
        filter: { _id: booking._id },
        update: { $set: { blockKeys } }
      }
    };
  });
  if (operations.length) await Booking.collection.bulkWrite(operations);
}

async function reconcileCounters() {
  await Slot.updateMany({ capacity: { $exists: false } }, { $set: { capacity: 20 } });
  await Slot.updateMany({ capacityOverride: { $exists: false } }, { $set: { capacityOverride: false } });
  await Slot.updateMany({}, { $set: { bookedCount: 0 } });
  await BookingLimit.updateMany({}, { $set: { count: 0 } });

  const [slotCounts, dailyCounts] = await Promise.all([
    Booking.aggregate([
      { $unwind: "$intervalIds" },
      { $group: { _id: "$intervalIds", count: { $sum: 1 } } }
    ]),
    Booking.aggregate([
      { $group: { _id: { userId: "$userId", dayKey: "$dayKey" }, count: { $sum: { $ifNull: ["$blockCount", 1] } } } }
    ])
  ]);

  if (slotCounts.length) {
    await Slot.bulkWrite(slotCounts.map(({ _id, count }) => ({
      updateOne: { filter: { _id }, update: { $set: { bookedCount: count } } }
    })));
  }
  if (dailyCounts.length) {
    await BookingLimit.bulkWrite(dailyCounts.map(({ _id, count }) => ({
      updateOne: {
        filter: { userId: _id.userId, dayKey: _id.dayKey },
        update: { $set: { count } },
        upsert: true
      }
    })));
  }
}

async function prepareBookingInventory() {
  await removeLegacyIndexes();
  await migrateLegacyBookings();
  await addMissingBlockKeys();
  await reconcileCounters();
}

module.exports = prepareBookingInventory;
