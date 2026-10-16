const GymConfig = require("../models/GymConfig");

async function getGymConfig() {
  return GymConfig.findOneAndUpdate(
    { _id: "default" },
    { $setOnInsert: { opensAt: "06:00", closesAt: "22:00", capacities: { yoga: 20, cardio: 20, strength: 20 } } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
}

module.exports = getGymConfig;
