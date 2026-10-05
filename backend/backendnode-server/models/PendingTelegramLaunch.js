const mongoose = require('mongoose');

const pendingAttributionSchema = new mongoose.Schema(
  {
    source: { type: String, required: true, maxlength: 64 },
    campaign: { type: String, default: '', maxlength: 48 },
    market: { type: String, default: '', maxlength: 8 },
    landingCode: { type: String, required: true, maxlength: 64 },
  },
  { _id: false }
);

const pendingTelegramLaunchSchema = new mongoose.Schema(
  {
    telegramId: {
      type: String,
      required: true,
      unique: true,
    },
    payload: {
      type: String,
      required: true,
      maxlength: 64,
    },
    referralTelegramId: {
      type: String,
      default: null,
    },
    attribution: {
      type: pendingAttributionSchema,
      default: undefined,
    },
    teamCode: {
      type: String,
      default: null,
    },
    createdAt: {
      type: Date,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    collection: 'pending_telegram_launches',
    bufferCommands: false,
    versionKey: false,
  }
);

pendingTelegramLaunchSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.PendingTelegramLaunch ||
  mongoose.model('PendingTelegramLaunch', pendingTelegramLaunchSchema);
