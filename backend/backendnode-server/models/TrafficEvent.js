const mongoose = require('mongoose');

const trafficEventSchema = new mongoose.Schema(
  {
    eventKey: {
      type: String,
      required: true,
      unique: true,
    },
    telegramId: {
      type: String,
      required: true,
    },
    event: {
      type: String,
      required: true,
      enum: ['landing', 'start', 'active', 'withdrawal'],
    },
    source: {
      type: String,
      required: true,
      maxlength: 64,
    },
    campaign: {
      type: String,
      default: '',
      maxlength: 48,
    },
    market: {
      type: String,
      default: '',
      maxlength: 8,
    },
    landingCode: {
      type: String,
      default: '',
      maxlength: 64,
    },
    occurredAt: {
      type: Date,
      required: true,
    },
    dayKey: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'traffic_events',
    bufferCommands: false,
  }
);

trafficEventSchema.index({ source: 1, event: 1, occurredAt: 1 });
trafficEventSchema.index({ telegramId: 1, occurredAt: 1 });

module.exports = mongoose.models.TrafficEvent || mongoose.model('TrafficEvent', trafficEventSchema);
