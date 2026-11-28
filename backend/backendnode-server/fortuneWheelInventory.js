const mongoose = require('mongoose');
const FortuneWheelProgress = require('./models/FortuneWheelProgress');
const FortuneWheelPrizeInventory = require('./models/FortuneWheelPrizeInventory');
const FortuneWheelPrizeEntitlement = require('./models/FortuneWheelPrizeEntitlement');
const PhysicalPrizeRequest = require('./models/PhysicalPrizeRequest');
const {
  FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
  IPHONE_DUO_CAMPAIGN_CAPACITY,
} = require('./fortuneWheelWeekly');

const SAFE_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

class FortuneWheelInventoryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FortuneWheelInventoryError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new FortuneWheelInventoryError(code, message);
}

function requireSession(session) {
  if (!session || typeof session !== 'object') {
    fail('FORTUNE_WHEEL_SESSION_REQUIRED', 'Physical prize reservation requires a MongoDB session');
  }
}

function validateReservationInput({ campaignKey, telegramId, prizeCode, progressId, weekKey, configVersion }) {
  if (!SAFE_CODE_PATTERN.test(String(campaignKey || ''))) {
    fail('FORTUNE_WHEEL_CAMPAIGN_INVALID', 'A safe campaign key is required');
  }
  if (!/^\d{1,32}$/.test(String(telegramId || ''))) {
    fail('FORTUNE_WHEEL_TELEGRAM_ID_INVALID', 'A Telegram identity is required');
  }
  if (prizeCode !== 'iphone_duo') {
    fail('FORTUNE_WHEEL_PRIZE_INVALID', 'Only the approved iPhone Duo prize can be reserved');
  }
  if (!mongoose.isValidObjectId(progressId)) {
    fail('FORTUNE_WHEEL_PROGRESS_ID_INVALID', 'A valid weekly progress ID is required');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(weekKey || ''))) {
    fail('FORTUNE_WHEEL_WEEK_INVALID', 'A UTC week key is required');
  }
  if (configVersion !== FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION) {
    fail('FORTUNE_WHEEL_CONFIG_VERSION_INVALID', 'The approved configuration version is required');
  }
}

async function queryWithSession(query, session) {
  return typeof query?.session === 'function' ? query.session(session) : query;
}

async function reservePhysicalPrizeEntitlement({
  campaignKey,
  telegramId,
  prizeCode = 'iphone_duo',
  progressId,
  weekKey,
  configVersion = FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
  session,
  now = new Date(),
  InventoryModel = FortuneWheelPrizeInventory,
  EntitlementModel = FortuneWheelPrizeEntitlement,
  ProgressModel = FortuneWheelProgress,
  PhysicalPrizeRequestModel = PhysicalPrizeRequest,
}) {
  requireSession(session);
  validateReservationInput({ campaignKey, telegramId, prizeCode, progressId, weekKey, configVersion });

  const existing = await queryWithSession(EntitlementModel.findOne({
    campaignKey,
    telegramId: String(telegramId),
    prizeCode,
  }), session);
  if (existing) {
    return Object.freeze({ reserved: false, alreadyEntitled: true, entitlement: existing });
  }

  // Legacy reservations must be backfilled into the unique entitlement ledger
  // before weekly writes are enabled. Fail closed rather than grant a second prize.
  const [legacyProgress, legacyRequest] = await Promise.all([
    queryWithSession(ProgressModel.findOne({
      campaignKey,
      telegramId: String(telegramId),
      mode: { $ne: 'weekly_random_v1' },
      'physicalPrizeReservation.slot': { $gt: 0 },
    }).select('_id'), session),
    queryWithSession(PhysicalPrizeRequestModel.findOne({
      campaignKey,
      telegramId: String(telegramId),
      prizeCode,
    }).select('_id'), session),
  ]);
  if (legacyProgress || legacyRequest) {
    fail(
      'LEGACY_ENTITLEMENT_NOT_MIGRATED',
      'Legacy physical prize entitlement must be migrated before weekly reservation'
    );
  }

  const inventory = await InventoryModel.findOneAndUpdate(
    {
      campaignKey,
      prizeCode,
      configVersion,
      capacity: IPHONE_DUO_CAMPAIGN_CAPACITY,
      reserved: { $lt: IPHONE_DUO_CAMPAIGN_CAPACITY },
      $expr: { $lt: ['$reserved', '$capacity'] },
    },
    { $inc: { reserved: 1 } },
    { new: true, runValidators: true, session }
  );
  if (!inventory) {
    fail('PHYSICAL_PRIZE_CAPACITY_EXHAUSTED', 'No physical prize capacity is available');
  }

  const slot = Number(inventory.reserved);
  const [entitlement] = await EntitlementModel.create(
    [{
      campaignKey,
      telegramId: String(telegramId),
      prizeCode,
      slot,
      progressId,
      sourceMode: 'weekly_random_v1',
      weekKey,
      configVersion,
      status: 'reserved',
      reservedAt: now,
    }],
    { session }
  );

  return Object.freeze({
    reserved: true,
    alreadyEntitled: false,
    entitlement,
    inventory,
  });
}

module.exports = {
  FortuneWheelInventoryError,
  reservePhysicalPrizeEntitlement,
  validateReservationInput,
};
