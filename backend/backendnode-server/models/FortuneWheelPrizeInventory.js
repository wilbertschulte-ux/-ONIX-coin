const mongoose = require('mongoose');
const {
  FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
  IPHONE_DUO_CAMPAIGN_CAPACITY,
} = require('../fortuneWheelWeekly');

const fortuneWheelPrizeInventorySchema = new mongoose.Schema(
  {
    campaignKey: {
      type: String,
      required: true,
      immutable: true,
      maxlength: 64,
      match: /^[a-z0-9][a-z0-9_-]{0,63}$/i,
    },
    prizeCode: {
      type: String,
      required: true,
      immutable: true,
      enum: ['iphone_duo'],
    },
    capacity: {
      type: Number,
      required: true,
      immutable: true,
      min: 0,
      max: IPHONE_DUO_CAMPAIGN_CAPACITY,
      validate: {
        validator(value) {
          return this.prizeCode !== 'iphone_duo' || value === IPHONE_DUO_CAMPAIGN_CAPACITY;
        },
        message: 'iPhone Duo capacity must match the approved campaign capacity',
      },
    },
    reserved: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator(value) {
          return Number.isInteger(value) && value <= Number(this.capacity);
        },
        message: 'Reserved physical prizes cannot exceed capacity',
      },
    },
    fulfilled: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator(value) {
          return Number.isInteger(value) && value <= Number(this.reserved);
        },
        message: 'Fulfilled physical prizes cannot exceed reserved prizes',
      },
    },
    configVersion: {
      type: String,
      required: true,
      immutable: true,
      enum: [FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION],
    },
  },
  {
    collection: 'fortune_wheel_prize_inventory',
    timestamps: true,
    autoCreate: false,
    autoIndex: false,
  }
);

fortuneWheelPrizeInventorySchema.index(
  { campaignKey: 1, prizeCode: 1 },
  { unique: true }
);

module.exports =
  mongoose.models.FortuneWheelPrizeInventory ||
  mongoose.model('FortuneWheelPrizeInventory', fortuneWheelPrizeInventorySchema);
