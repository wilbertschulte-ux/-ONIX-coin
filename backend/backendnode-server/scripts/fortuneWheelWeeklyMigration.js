#!/usr/bin/env node
require('dotenv').config();

const mongoose = require('mongoose');
const {
  FORTUNE_WHEEL_ENTITLEMENT_LEDGER_RECOVERY_VERSION,
} = require('../accountRecovery');
const {
  MIGRATION_CONFIRMATION,
  WEEKLY_CAMPAIGN_KEY,
  analyzeFortuneWheelMigration,
  applyFortuneWheelMigration,
  assertMigrationEnvironment,
  loadMigrationSnapshot,
} = require('../fortuneWheelMigration');

function readArgument(name) {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : '';
}

function safeSummary(report) {
  return {
    ok: report.ok,
    dryRun: report.dryRun,
    sourceCampaignKey: report.sourceCampaignKey,
    sourceCampaignKeys: report.sourceCampaignKeys,
    targetCampaignKey: report.targetCampaignKey,
    counts: report.counts,
    blockerCodes: report.blockers.map((blocker) => blocker.code),
    warningCodes: report.warnings.map((warning) => warning.code),
    plannedIndexes: report.operations.createIndexes,
    createInventory: report.operations.createInventory,
    dropLegacyProgressIndex: report.operations.dropLegacyProgressIndex,
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const confirmation = readArgument('confirm');
  const backupReference = readArgument('backup-reference');
  const safety = assertMigrationEnvironment({
    environment: process.env,
    apply,
    confirmation,
    backupReference,
    accountRecoveryLedgerVersion: FORTUNE_WHEEL_ENTITLEMENT_LEDGER_RECOVERY_VERSION,
  });

  await mongoose.connect(safety.deployment.mongoUri, { autoIndex: false });
  if (mongoose.connection.name !== safety.deployment.mongoDatabase) {
    throw Object.assign(new Error('Connected database does not match staging configuration'), {
      code: 'MIGRATION_DATABASE_MISMATCH',
    });
  }

  if (!apply) {
    const report = analyzeFortuneWheelMigration(await loadMigrationSnapshot(mongoose.connection));
    console.log(JSON.stringify(safeSummary(report), null, 2));
    return;
  }

  const result = await applyFortuneWheelMigration({
    connection: mongoose.connection,
    environment: process.env,
    confirmation,
    backupReference,
    accountRecoveryLedgerVersion: FORTUNE_WHEEL_ENTITLEMENT_LEDGER_RECOVERY_VERSION,
  });
  console.log(JSON.stringify({
    applied: result.applied,
    targetCampaignKey: WEEKLY_CAMPAIGN_KEY,
    backupReference: result.backupReference,
    verification: safeSummary(result.after),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      success: false,
      code: error?.code || 'MIGRATION_FAILED',
    }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });

// Deliberately no automatic invocation example here. Dry-run is the default;
// writes additionally require --apply, the exact confirmation phrase shown in
// documentation/review, a verified backup reference, and staging-only env guards.
void MIGRATION_CONFIRMATION;
