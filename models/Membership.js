const mongoose = require("mongoose");

const membershipSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    plan: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    startsAt: {
      type: Date,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true
    }
  },
  { timestamps: true }
);

membershipSchema.index({ userId: 1, expiresAt: -1 });

module.exports = mongoose.model("Membership", membershipSchema);
