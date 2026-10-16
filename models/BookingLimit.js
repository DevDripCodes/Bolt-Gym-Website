const mongoose = require("mongoose");

const bookingLimitSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    dayKey: {
      type: String,
      required: true
    },
    count: {
      type: Number,
      required: true,
      min: 0,
      max: 48,
      default: 0
    }
  },
  { timestamps: true }
);

bookingLimitSchema.index({ userId: 1, dayKey: 1 }, { unique: true });

module.exports = mongoose.model("BookingLimit", bookingLimitSchema);
