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
    rewardCode: { type: String, default: '', maxlength: 64 },
    configVersion: { type: String, default: '', maxlength: 64 },
    drawVersion: { type: String, default: '', maxlength: 64 },
    idempotencyKey: {
      type: String,
      required: true,
      maxlength: 128,
    },
    claimedAt: { type: Date, required: true },
  },
  { _id: false }
);

const physicalPrizeReservationSchema = new mongoose.Schema(
  {
    slot: { type: Number, required: true, min: 1, immutable: true },
    reservedAt: { type: Date, required: true, immutable: true },
    status: {
      type: String,
      enum: ['reserved', 'fulfilled'],
      default: 'reserved',
    },
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
      type: physicalPrizeReservationSchema,
      default: undefined,
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
    autoCreate: false,
    autoIndex: false,
  }
);

fortuneWheelProgressSchema.add({
  mode: {
    type: String,
    enum: ['legacy_fixed_v1', 'weekly_random_v1'],
    default: 'legacy_fixed_v1',
  },
  schemaVersion: {
    type: Number,
    enum: [1, 2],
    default: 1,
  },
  weekKey: {
    type: String,
    default: undefined,
    maxlength: 10,
    match: /^\d{4}-\d{2}-\d{2}$/,
  },
  weekStartsAt: { type: Date, default: null },
  weekEndsAt: { type: Date, default: null },
  spinsUsed: {
    type: Number,
    default: undefined,
    min: 0,
    max: 3,
  },
  physicalPrizeEntitlementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FortuneWheelPrizeEntitlement',
    default: null,
  },
});

fortuneWheelProgressSchema.path('claims').validate(function validateModeClaims(claims) {
  if (this.mode !== 'weekly_random_v1') return true;
  if (this.schemaVersion !== 2 || !Number.isInteger(this.spinsUsed)) return false;
  if (claims.length !== this.spinsUsed) return false;
  const orderedSpins = claims.map((claim) => Number(claim.spin)).sort((a, b) => a - b);
  if (!orderedSpins.every((spin, index) => spin === index + 1)) return false;
  return claims.every((claim) => (
    /^[a-z0-9][a-z0-9_-]{0,63}$/.test(String(claim.rewardCode || '')) &&
    /^[a-z0-9][a-z0-9_-]{0,63}$/.test(String(claim.configVersion || '')) &&
    /^[a-z0-9][a-z0-9_-]{0,63}$/.test(String(claim.drawVersion || ''))
  ));
}, 'Weekly fortune wheel claims must match spinsUsed and include versioned reward data');

fortuneWheelProgressSchema.path('weekKey').validate(function validateWeeklyPeriod(weekKey) {
  if (this.mode !== 'weekly_random_v1') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(weekKey || ''))) return false;
  if (!(this.weekStartsAt instanceof Date) || !(this.weekEndsAt instanceof Date)) return false;
  if (!Number.isFinite(this.weekStartsAt.getTime()) || !Number.isFinite(this.weekEndsAt.getTime())) return false;
  if (this.weekStartsAt.getUTCDay() !== 1) return false;
  if (
    this.weekStartsAt.getUTCHours() !== 0 ||
    this.weekStartsAt.getUTCMinutes() !== 0 ||
    this.weekStartsAt.getUTCSeconds() !== 0 ||
    this.weekStartsAt.getUTCMilliseconds() !== 0
  ) return false;
  if (this.weekStartsAt.toISOString().slice(0, 10) !== weekKey) return false;
  return this.weekEndsAt.getTime() - this.weekStartsAt.getTime() === 7 * 24 * 60 * 60 * 1000;
}, 'Weekly fortune wheel period must be one Monday-to-Monday UTC week');

fortuneWheelProgressSchema.index(
  { campaignKey: 1, telegramId: 1 },
  { unique: true }
);
// Prepared for weekly_random_v1. The legacy unique index above intentionally
// remains in place until a separately reviewed migration has completed.
fortuneWheelProgressSchema.index(
  { campaignKey: 1, telegramId: 1, weekKey: 1 },
  { unique: true }
);
fortuneWheelProgressSchema.index(
  { campaignKey: 1, telegramId: 1, 'claims.idempotencyKey': 1 },
  {
    unique: true,
    partialFilterExpression: { 'claims.idempotencyKey': { $type: 'string' } },
  }
);
fortuneWheelProgressSchema.index(
  { campaignKey: 1, 'physicalPrizeReservation.slot': 1 },
  { unique: true }
);

module.exports =
  mongoose.models.FortuneWheelProgress ||
  mongoose.model('FortuneWheelProgress', fortuneWheelProgressSchema);
