const mongoose = require('mongoose');

const physicalPrizeStatusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: true,
      enum: ['pending', 'approved', 'preparing', 'shipped', 'delivered', 'cancelled'],
    },
    action: {
      type: String,
      enum: ['created', 'status_changed', 'color_corrected'],
      default: 'status_changed',
    },
    previousStatus: { type: String, default: '', maxlength: 32 },
    color: { type: String, default: '', maxlength: 32 },
    previousColor: { type: String, default: '', maxlength: 32 },
    reasonCode: { type: String, default: '', maxlength: 48 },
    changedAt: { type: Date, required: true },
    changedBy: { type: String, required: true, maxlength: 64 },
    comment: { type: String, default: '', maxlength: 1000 },
    resolution: { type: String, default: '', maxlength: 1000 },
    operationKey: { type: String, default: '', maxlength: 128 },
  },
  { _id: false }
);

const physicalPrizeRequestSchema = new mongoose.Schema(
  {
    requestId: { type: String, required: true, unique: true, immutable: true },
    idempotencyKey: {
      type: String,
      required: true,
      immutable: true,
      maxlength: 128,
      match: /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/,
    },
    fortuneWheelProgressId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FortuneWheelProgress',
      required: true,
      unique: true,
      immutable: true,
    },
    campaignKey: { type: String, required: true, immutable: true, maxlength: 64 },
    telegramId: { type: String, required: true, immutable: true, maxlength: 32 },
    prizeCode: { type: String, required: true, immutable: true, maxlength: 64 },
    color: { type: String, required: true, maxlength: 32 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'preparing', 'shipped', 'delivered', 'cancelled'],
      default: 'pending',
    },
    statusHistory: {
      type: [physicalPrizeStatusHistorySchema],
      default: [],
    },
    telegramUsernameSnapshot: { type: String, default: '', maxlength: 64 },
    displayNameSnapshot: { type: String, default: '', maxlength: 160 },
    adminComment: { type: String, default: '', maxlength: 2000 },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: String, default: '', maxlength: 64 },
  },
  {
    collection: 'physical_prize_requests',
    timestamps: true,
  }
);

physicalPrizeRequestSchema.index(
  { campaignKey: 1, telegramId: 1, prizeCode: 1 },
  { unique: true }
);
physicalPrizeRequestSchema.index(
  { campaignKey: 1, telegramId: 1, idempotencyKey: 1 },
  { unique: true }
);
physicalPrizeRequestSchema.index({ status: 1, createdAt: -1, _id: -1 });
physicalPrizeRequestSchema.index({ telegramId: 1, createdAt: -1 });

module.exports =
  mongoose.models.PhysicalPrizeRequest ||
  mongoose.model('PhysicalPrizeRequest', physicalPrizeRequestSchema);
