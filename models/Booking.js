const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
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
      required: true
    },
    intervalIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Slot",
      required: true
    }],
    blockCount: {
      type: Number,
      required: true,
      min: 1
    },
    dayKey: {
      type: String,
      required: true
    }
  },
  { timestamps: true }
);

bookingSchema.index({ userId: 1, startsAt: 1 });
bookingSchema.index({ userId: 1, createdAt: -1 });
bookingSchema.index({ intervalIds: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
