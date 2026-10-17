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
    blockKeys: [{
      type: String,
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
// A member can appear only once in each 30-minute block. This closes the gap
// between the overlap check and simultaneous requests across training types.
bookingSchema.index({ userId: 1, blockKeys: 1 }, { unique: true });

bookingSchema.path("intervalIds").validate(
  (value) => Array.isArray(value) && value.length > 0,
  "A booking must include at least one equipment interval."
);
bookingSchema.path("blockKeys").validate(
  (value) => Array.isArray(value) && value.length > 0,
  "A booking must include at least one booking block."
);

bookingSchema.pre("validate", function validateRange() {
  if (this.startsAt && this.endsAt && this.endsAt <= this.startsAt) {
    this.invalidate("endsAt", "A booking must end after it starts.");
  }
});

module.exports = mongoose.model("Booking", bookingSchema);
