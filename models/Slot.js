const mongoose = require("mongoose");

const slotSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      enum: ["yoga", "cardio", "strength"]
    },
    startsAt: {
      type: Date,
      required: true
    },
    endsAt: {
      type: Date,
      required: true,
      validate: {
        validator(value) {
          const startsAt = this.startsAt || (typeof this.get === "function" && this.get("startsAt"));
          return startsAt && value.getTime() - new Date(startsAt).getTime() === 30 * 60 * 1000;
        },
        message: "An equipment slot must be exactly 30 minutes."
      }
    },
    capacity: {
      type: Number,
      required: true,
      min: 0,
      max: 500,
      default: 20
    },
    capacityOverride: {
      type: Boolean,
      default: false
    },
    bookedCount: {
      type: Number,
      min: 0,
      default: 0
    }
  },
  { timestamps: true }
);

// One inventory row represents one 30-minute window for one training type.
slotSchema.index({ category: 1, startsAt: 1 }, { unique: true });
slotSchema.index({ startsAt: 1, category: 1 });

module.exports = mongoose.model("Slot", slotSchema);
