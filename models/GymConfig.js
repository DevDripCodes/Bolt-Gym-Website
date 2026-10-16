const mongoose = require("mongoose");

const gymConfigSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "default" },
    opensAt: { type: String, required: true, default: "06:00" },
    closesAt: { type: String, required: true, default: "22:00" },
    capacities: {
      yoga: { type: Number, min: 0, max: 500, default: 20 },
      cardio: { type: Number, min: 0, max: 500, default: 20 },
      strength: { type: Number, min: 0, max: 500, default: 20 }
    }
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("GymConfig", gymConfigSchema);
