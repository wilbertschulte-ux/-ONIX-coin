const mongoose = require('mongoose');

const WeeklyScoreSchema = new mongoose.Schema({
  week: {
    type: String,
    required: true,
  },
  telegramId: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    default: '',
  },
  teamName: {
    type: String,
    default: '',
  },
  weeklyEarned: {
    type: Number,
    required: true,
    default: 0,
  },
  totalTaps: {
    type: Number,
    default: 0,
  },
  capturedAt: {
    type: Number,
    default: Date.now,
  },
});

WeeklyScoreSchema.index({ week: 1, telegramId: 1 }, { unique: true });
WeeklyScoreSchema.index({ week: 1, weeklyEarned: -1, telegramId: 1 });
WeeklyScoreSchema.index({ week: 1, teamName: 1 });

module.exports =
  mongoose.models.WeeklyScore || mongoose.model('WeeklyScore', WeeklyScoreSchema);
