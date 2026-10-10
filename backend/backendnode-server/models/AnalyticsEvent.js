const mongoose = require('mongoose');

const ANALYTICS_EVENT_TYPES = [
  'landing',
  'start',
  'active',
  'first_tap',
  'first_task',
  'promo_used',
  'referral',
  'withdrawal',
];

const analyticsEventSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true },
    event: { type: String, required: true, enum: ANALYTICS_EVENT_TYPES },
    source: { type: String, default: '', maxlength: 64 },
    campaign: { type: String, default: '', maxlength: 48 },
    market: { type: String, default: '', maxlength: 8 },
    landingCode: { type: String, default: '', maxlength: 64 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: undefined },
    occurredAt: { type: Date, required: true },
    deduplicationKey: { type: String, default: undefined, maxlength: 128 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'analytics_events',
    bufferCommands: false,
  }
);

analyticsEventSchema.index({ telegramId: 1, occurredAt: -1 });
analyticsEventSchema.index({ event: 1, occurredAt: -1 });
analyticsEventSchema.index({ occurredAt: -1 });
analyticsEventSchema.index({ campaign: 1, event: 1, occurredAt: -1 });
analyticsEventSchema.index(
  { telegramId: 1, event: 1, deduplicationKey: 1 },
  {
    unique: true,
    partialFilterExpression: { deduplicationKey: { $type: 'string' } },
  }
);

const AnalyticsEvent =
  mongoose.models.AnalyticsEvent || mongoose.model('AnalyticsEvent', analyticsEventSchema);

module.exports = AnalyticsEvent;
module.exports.ANALYTICS_EVENT_TYPES = ANALYTICS_EVENT_TYPES;
