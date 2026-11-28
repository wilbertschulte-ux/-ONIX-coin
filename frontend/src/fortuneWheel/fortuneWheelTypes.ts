export type FortuneWheelRewardStatus = 'claimed' | 'available' | 'locked';
export type FortuneWheelRewardType = 'onix' | 'physical_prize';
export type FortuneWheelMode = 'legacy_fixed_v1' | 'weekly_random_v1';
export type FortuneWheelRewardCode = 'onix_5000' | 'onix_10000' | 'onix_25000' | 'onix_50000' | 'onix_250000' | 'iphone_duo';

export interface FortuneWheelEligibility { eligible: boolean; admitted?: boolean; code: string; }
export interface FortuneWheelReward { spin: 1 | 2 | 3; type: FortuneWheelRewardType; amount?: number; prizeCode?: string; status: FortuneWheelRewardStatus; }
export interface PhysicalPrizeStatusHistoryEntry { status: string; changedAt: string | null; }
export interface PhysicalPrizeRequestStatus { requestId: string; campaignKey: string; prizeCode: string; color: string; status: string; createdAt: string | null; statusHistory: PhysicalPrizeStatusHistoryEntry[]; }
export interface FortuneWheelClaim {
  spin: 1 | 2 | 3; rewardType: FortuneWheelRewardType; amount: number; prizeCode: string;
  rewardCode?: FortuneWheelRewardCode | string; configVersion?: string; drawVersion?: string; claimedAt: string;
}

export interface LegacyFortuneWheelStatus {
  mode?: 'legacy_fixed_v1'; campaignKey: string; enabled: boolean; guaranteed: true;
  eligibility: FortuneWheelEligibility; completedSpins: number; nextSpin: 1 | 2 | 3 | null; rewards: FortuneWheelReward[];
  physicalPrize: { reserved: boolean; unlocked: boolean; requestCreated: boolean; selectionLocked: boolean; canSelectColor: boolean; colors: string[]; request: PhysicalPrizeRequestStatus | null; };
}
export interface WeeklyFortuneWheelPrize {
  code: FortuneWheelRewardCode | string; type: FortuneWheelRewardType; amount: number; prizeCode: string;
  configuredWeightPpm: number; effectiveWeightPpm: number; available: boolean;
}
export interface WeeklyFortuneWheelStatus {
  mode: 'weekly_random_v1'; campaignKey: string; enabled: boolean; guaranteed: false;
  serverTime: string; weekKey: string; resetsAt: string; eligibility: FortuneWheelEligibility;
  spins: { limit: 3; used: number; remaining: number }; claims: FortuneWheelClaim[]; prizes: WeeklyFortuneWheelPrize[];
  inventory: { capacity: number; reserved: number; fulfilled: number; remaining: number } | null;
  physicalPrize: { alreadyOwned: boolean; unlocked: boolean; canSelectColor: boolean; colors: string[]; requests: PhysicalPrizeRequestStatus[]; };
}
export type FortuneWheelStatus = LegacyFortuneWheelStatus | WeeklyFortuneWheelStatus;

export interface FortuneWheelSpinResponse { success: true; idempotent: boolean; claim: FortuneWheelClaim; status: FortuneWheelStatus; user: Record<string, unknown>; }
export interface FortuneWheelColorResponse { success: true; idempotent: boolean; physicalPrizeRequest: PhysicalPrizeRequestStatus; status: FortuneWheelStatus; }
export interface KeyValueStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; }

const IDEMPOTENCY_PREFIX = 'onix:fortune-wheel:v2';
export interface FortuneWheelSectorDefinition { index: number; centerAngle: number; rewardCode: FortuneWheelRewardCode; }
export const FORTUNE_WHEEL_SECTORS: readonly FortuneWheelSectorDefinition[] = [
  { index: 0, centerAngle: 0, rewardCode: 'onix_5000' }, { index: 1, centerAngle: 60, rewardCode: 'onix_10000' },
  { index: 2, centerAngle: 120, rewardCode: 'onix_25000' }, { index: 3, centerAngle: 180, rewardCode: 'onix_50000' },
  { index: 4, centerAngle: 240, rewardCode: 'onix_250000' }, { index: 5, centerAngle: 300, rewardCode: 'iphone_duo' },
] as const;
export const LEGACY_FORTUNE_WHEEL_SECTORS: readonly FortuneWheelSectorDefinition[] = [
  { index: 0, centerAngle: 0, rewardCode: 'onix_50000' }, { index: 1, centerAngle: 60, rewardCode: 'iphone_duo' },
  { index: 2, centerAngle: 120, rewardCode: 'onix_250000' }, { index: 3, centerAngle: 180, rewardCode: 'onix_50000' },
  { index: 4, centerAngle: 240, rewardCode: 'iphone_duo' }, { index: 5, centerAngle: 300, rewardCode: 'onix_250000' },
] as const;
export const FORTUNE_WHEEL_POINTER_ANGLE = 270;

export function isWeeklyFortuneWheelStatus(status: FortuneWheelStatus): status is WeeklyFortuneWheelStatus { return status.mode === 'weekly_random_v1'; }
export function getPhysicalPrizeRequests(status: FortuneWheelStatus): PhysicalPrizeRequestStatus[] {
  return isWeeklyFortuneWheelStatus(status) ? status.physicalPrize.requests : status.physicalPrize.request ? [status.physicalPrize.request] : [];
}
function createClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('Secure client request identifiers are unavailable');
}
export function spinIdempotencyStorageKey(campaignKey: string, weekKey: string, spin: number): string { return `${IDEMPOTENCY_PREFIX}:spin:${campaignKey}:${weekKey}:${spin}`; }
export function colorIdempotencyStorageKey(campaignKey: string): string { return `${IDEMPOTENCY_PREFIX}:color:${campaignKey}`; }
export function colorChoiceStorageKey(campaignKey: string): string { return `${IDEMPOTENCY_PREFIX}:color-choice:${campaignKey}`; }
export function getOrCreateIdempotencyKey(storage: KeyValueStorage, storageKey: string): string { const existing = storage.getItem(storageKey)?.trim(); if (existing) return existing; const created = createClientRequestId(); storage.setItem(storageKey, created); return created; }
export function clearIdempotencyKey(storage: KeyValueStorage, storageKey: string): void { storage.removeItem(storageKey); }
function normalizeRotation(value: number): number { return ((value % 360) + 360) % 360; }
export function getLandingRotationByRewardCode(rewardCode: string, currentRotation: number): number {
  const sectorCenter = FORTUNE_WHEEL_SECTORS.find((sector) => sector.rewardCode === rewardCode)?.centerAngle;
  if (sectorCenter === undefined) throw new Error(`Missing Fortune Wheel sector for reward ${rewardCode}`);
  const desiredNormalized = normalizeRotation(FORTUNE_WHEEL_POINTER_ANGLE - sectorCenter);
  const forwardDelta = normalizeRotation(desiredNormalized - normalizeRotation(currentRotation));
  return currentRotation + 4 * 360 + forwardDelta;
}
export function getLandingRotation(spin: 1 | 2 | 3, currentRotation: number): number {
  const center: Record<1 | 2 | 3, number> = { 1: 0, 2: 120, 3: 240 };
  const desiredNormalized = normalizeRotation(FORTUNE_WHEEL_POINTER_ANGLE - center[spin]);
  return currentRotation + 4 * 360 + normalizeRotation(desiredNormalized - normalizeRotation(currentRotation));
}
export function getClaimRewardCode(claim: FortuneWheelClaim): FortuneWheelRewardCode {
  if (claim.rewardCode && FORTUNE_WHEEL_SECTORS.some((sector) => sector.rewardCode === claim.rewardCode)) return claim.rewardCode as FortuneWheelRewardCode;
  if (claim.rewardType === 'physical_prize') return 'iphone_duo';
  if (claim.amount === 50_000) return 'onix_50000';
  if (claim.amount === 250_000) return 'onix_250000';
  throw new Error('Server claim does not map to an approved wheel sector');
}
export function getExpectedSpin(status: FortuneWheelStatus): 1 | 2 | 3 | null {
  if (isWeeklyFortuneWheelStatus(status)) { const next = status.spins.used + 1; return status.spins.remaining > 0 && next <= 3 ? next as 1 | 2 | 3 : null; }
  return status.nextSpin;
}
export function canRequestSpin(status: FortuneWheelStatus | null): boolean {
  if (!status || !status.enabled || !status.eligibility.eligible) return false;
  if (isWeeklyFortuneWheelStatus(status)) return status.spins.remaining > 0;
  return Boolean(status.nextSpin && status.rewards.some((reward) => reward.spin === status.nextSpin && reward.status === 'available'));
}
export function shouldOfferColorSelection(status: FortuneWheelStatus | null): boolean {
  if (!status) return false;
  if (isWeeklyFortuneWheelStatus(status)) return Boolean(status.physicalPrize.unlocked && status.physicalPrize.canSelectColor && status.physicalPrize.colors.length > 0 && status.physicalPrize.requests.length === 0);
  return Boolean(status.physicalPrize.canSelectColor && status.physicalPrize.reserved && status.physicalPrize.unlocked && !status.physicalPrize.request && status.physicalPrize.colors.length > 0);
}
