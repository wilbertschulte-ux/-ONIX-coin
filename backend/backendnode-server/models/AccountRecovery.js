const mongoose = require('mongoose');

const accountRecoverySchema = new mongoose.Schema(
  {
    recoveryId: { type: String, required: true, unique: true, immutable: true },
    oldTelegramId: { type: String, required: true, immutable: true },
    newTelegramId: { type: String, required: true, immutable: true },
    status: {
      type: String,
      enum: ['processing', 'completed'],
      required: true,
    },
    previewTokenHash: { type: String, required: true, immutable: true },
    initiatedBy: { type: String, required: true, immutable: true },
    backup: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
    analyticsAlias: {
      oldTelegramId: { type: String, required: true, immutable: true },
      newTelegramId: { type: String, required: true, immutable: true },
    },
    result: { type: mongoose.Schema.Types.Mixed, default: undefined },
    generatedAt: { type: Date, required: true, immutable: true },
    completedAt: { type: Date, default: null },
  },
  {
    collection: 'account_recoveries',
    versionKey: false,
  }
);

accountRecoverySchema.index({ oldTelegramId: 1, newTelegramId: 1, generatedAt: -1 });

module.exports =
  mongoose.models.AccountRecovery || mongoose.model('AccountRecovery', accountRecoverySchema);
