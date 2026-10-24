const mongoose = require('mongoose');

const fortuneWheelClaimSchema = new mongoose.Schema(
  {
    spin: { type: Number, required: true, min: 1, max: 3 },
    rewardType: {
      type: String,
      required: true,
      enum: ['onix', 'physical_prize'],
    },
    amount: { type: Number, default: 0, min: 0 },
    prizeCode: { type: String, default: '', maxlength: 64 },
    idempotencyKey: {
      type: String,
      required: true,
      maxlength: 128,
    },
    claimedAt: { type: Date, required: true },
  },
  { _id: false }
);

const fortuneWheelProgressSchema = new mongoose.Schema(
  {
    campaignKey: {
      type: String,
      required: true,
      immutable: true,
      maxlength: 64,
    },
    telegramId: {
      type: String,
      required: true,
      immutable: true,
      maxlength: 32,
    },
    completedSpins: {
      type: Number,
      default: 0,
      min: 0,
      max: 3,
    },
    claims: {
      type: [fortuneWheelClaimSchema],
      default: [],
      validate: {
        validator(claims) {
          if (!Array.isArray(claims) || claims.length > 3) return false;
          const spins = claims.map((claim) => Number(claim.spin));
          const idempotencyKeys = claims.map((claim) => String(claim.idempotencyKey || ''));
          return (
            new Set(spins).size === spins.length &&
            idempotencyKeys.every(Boolean) &&
            new Set(idempotencyKeys).size === idempotencyKeys.length
          );
        },
        message: 'Fortune wheel claims must contain unique spins and idempotency keys',
      },
    },
    physicalPrizeReservation: {
      slot: { type: Number, required: true, min: 1, immutable: true },
      reservedAt: { type: Date, required: true, immutable: true },
      status: {
        type: String,
        enum: ['reserved', 'fulfilled'],
        default: 'reserved',
      },
    },
    iphoneUnlockedAt: { type: Date, default: null },
    physicalPrizeRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PhysicalPrizeRequest',
      default: null,
    },
  },
  {
    collection: 'fortune_wheel_progress',
    timestamps: true,
  }
);

fortuneWheelProgressSchema.index(
  { campaignKey: 1, telegramId: 1 },
  { unique: true }
);
fortuneWheelProgressSchema.index(
  { campaignKey: 1, 'physicalPrizeReservation.slot': 1 },
  { unique: true }
);

module.exports =
  mongoose.models.FortuneWheelProgress ||
  mongoose.model('FortuneWheelProgress', fortuneWheelProgressSchema);
