const mongoose = require("mongoose");

const gymSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      enum: ["maxBookingsPerDay"]
    },
    value: {
      type: Number,
      required: true,
      min: 1,
      max: 48
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("GymSetting", gymSettingSchema);
