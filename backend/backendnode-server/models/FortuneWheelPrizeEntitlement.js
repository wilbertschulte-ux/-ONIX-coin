const mongoose = require('mongoose');
const {
  FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
  IPHONE_DUO_CAMPAIGN_CAPACITY,
} = require('../fortuneWheelWeekly');

const LEGACY_MAX_PHYSICAL_PRIZE_SLOT = 10000;

const fortuneWheelPrizeEntitlementSchema = new mongoose.Schema(
  {
    campaignKey: {
      type: String,
      required: true,
      immutable: true,
      maxlength: 64,
      match: /^[a-z0-9][a-z0-9_-]{0,63}$/i,
    },
    telegramId: {
      type: String,
      required: true,
      immutable: true,
      maxlength: 32,
      match: /^\d{1,32}$/,
    },
    prizeCode: {
      type: String,
      required: true,
      immutable: true,
      enum: ['iphone_duo'],
    },
    slot: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      max: LEGACY_MAX_PHYSICAL_PRIZE_SLOT,
      validate: {
        validator(value) {
          return this.sourceMode === 'legacy_fixed_v1'
            ? Number.isInteger(value) && value <= LEGACY_MAX_PHYSICAL_PRIZE_SLOT
            : Number.isInteger(value) && value <= IPHONE_DUO_CAMPAIGN_CAPACITY;
        },
        message: 'Entitlement slot exceeds the capacity of its source mode',
      },
    },
    progressId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FortuneWheelProgress',
      required: true,
      immutable: true,
    },
    sourceMode: {
      type: String,
      required: true,
      immutable: true,
      enum: ['legacy_fixed_v1', 'weekly_random_v1'],
    },
    weekKey: {
      type: String,
      default: 'legacy',
      immutable: true,
      maxlength: 10,
      validate: {
        validator(value) {
          return this.sourceMode === 'legacy_fixed_v1'
            ? value === 'legacy'
            : /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
        },
        message: 'Entitlement week must match its source mode',
      },
    },
    configVersion: {
      type: String,
      required: true,
      immutable: true,
      maxlength: 64,
      validate: {
        validator(value) {
          return this.sourceMode === 'legacy_fixed_v1'
            ? Boolean(String(value || '').trim())
            : value === FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION;
        },
        message: 'Entitlement configuration version is invalid',
      },
    },
    status: {
      type: String,
      enum: ['reserved', 'fulfilled'],
      default: 'reserved',
    },
    reservedAt: { type: Date, required: true, immutable: true },
    fulfilledAt: { type: Date, default: null },
    physicalPrizeRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PhysicalPrizeRequest',
      default: null,
    },
  },
  {
    collection: 'fortune_wheel_prize_entitlements',
    timestamps: true,
    autoCreate: false,
    autoIndex: false,
  }
);

// This is the database-level one-iPhone-per-player-per-campaign invariant.
fortuneWheelPrizeEntitlementSchema.index(
  { campaignKey: 1, telegramId: 1, prizeCode: 1 },
  { unique: true }
);
fortuneWheelPrizeEntitlementSchema.index(
  { campaignKey: 1, prizeCode: 1, slot: 1 },
  { unique: true }
);
fortuneWheelPrizeEntitlementSchema.index(
  { progressId: 1 },
  { unique: true }
);

module.exports =
  mongoose.models.FortuneWheelPrizeEntitlement ||
  mongoose.model('FortuneWheelPrizeEntitlement', fortuneWheelPrizeEntitlementSchema);
