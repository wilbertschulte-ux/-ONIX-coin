export type FortuneWheelRewardStatus = 'claimed' | 'available' | 'locked';
export type FortuneWheelRewardType = 'onix' | 'physical_prize';

export interface FortuneWheelEligibility {
  eligible: boolean;
  admitted?: boolean;
  code: string;
}

export interface FortuneWheelReward {
  spin: 1 | 2 | 3;
  type: FortuneWheelRewardType;
  amount?: number;
  prizeCode?: string;
  status: FortuneWheelRewardStatus;
}

export interface PhysicalPrizeStatusHistoryEntry {
  status: string;
  changedAt: string | null;
}

export interface PhysicalPrizeRequestStatus {
  requestId: string;
  campaignKey: string;
  prizeCode: string;
  color: string;
  status: string;
  createdAt: string | null;
  statusHistory: PhysicalPrizeStatusHistoryEntry[];
}

export interface FortuneWheelStatus {
  campaignKey: string;
  enabled: boolean;
  guaranteed: true;
  eligibility: FortuneWheelEligibility;
  completedSpins: number;
  nextSpin: 1 | 2 | 3 | null;
  rewards: FortuneWheelReward[];
  physicalPrize: {
    reserved: boolean;
    unlocked: boolean;
    requestCreated: boolean;
    selectionLocked: boolean;
    canSelectColor: boolean;
    colors: string[];
    request: PhysicalPrizeRequestStatus | null;
  };
}

export interface FortuneWheelClaim {
  spin: 1 | 2 | 3;
  rewardType: FortuneWheelRewardType;
  amount: number;
  prizeCode: string;
  claimedAt: string;
}

export interface FortuneWheelSpinResponse {
  success: true;
  idempotent: boolean;
  claim: FortuneWheelClaim;
  status: FortuneWheelStatus;
  user: Record<string, unknown>;
}

export interface FortuneWheelColorResponse {
  success: true;
  idempotent: boolean;
  physicalPrizeRequest: PhysicalPrizeRequestStatus;
  status: FortuneWheelStatus;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const IDEMPOTENCY_PREFIX = 'onix:fortune-wheel:v1';
const SPIN_SECTOR_BY_NUMBER: Record<1 | 2 | 3, number> = { 1: 0, 2: 2, 3: 4 };

function createClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }

  throw new Error('Secure client request identifiers are unavailable');
}

export function spinIdempotencyStorageKey(campaignKey: string, spin: number): string {
  return `${IDEMPOTENCY_PREFIX}:spin:${campaignKey}:${spin}`;
}

export function colorIdempotencyStorageKey(campaignKey: string): string {
  return `${IDEMPOTENCY_PREFIX}:color:${campaignKey}`;
}

export function colorChoiceStorageKey(campaignKey: string): string {
  return `${IDEMPOTENCY_PREFIX}:color-choice:${campaignKey}`;
}

export function getOrCreateIdempotencyKey(storage: KeyValueStorage, storageKey: string): string {
  const existing = storage.getItem(storageKey)?.trim();
  if (existing) return existing;

  const created = createClientRequestId();
  storage.setItem(storageKey, created);
  return created;
}

export function clearIdempotencyKey(storage: KeyValueStorage, storageKey: string): void {
  storage.removeItem(storageKey);
}

export function getLandingRotation(spin: 1 | 2 | 3, currentRotation: number): number {
  const sectorAngle = 60;
  // The CSS gradient starts at -30deg, so sector zero is centered under the
  // top pointer at 0deg. Spins map only to the matching repeated reward sector.
  const sectorCenter = SPIN_SECTOR_BY_NUMBER[spin] * sectorAngle;
  const normalizedCurrent = ((currentRotation % 360) + 360) % 360;
  const desiredNormalized = (360 - sectorCenter) % 360;
  const forwardDelta = (desiredNormalized - normalizedCurrent + 360) % 360;
  return currentRotation + 4 * 360 + forwardDelta;
}

export function canRequestSpin(status: FortuneWheelStatus | null): boolean {
  return Boolean(
    status?.enabled &&
      status.eligibility.eligible &&
      status.nextSpin &&
      status.rewards.some((reward) => reward.spin === status.nextSpin && reward.status === 'available')
  );
}

export function shouldOfferColorSelection(status: FortuneWheelStatus | null): boolean {
  return Boolean(
    status?.physicalPrize.canSelectColor &&
      status.physicalPrize.reserved &&
      status.physicalPrize.unlocked &&
      !status.physicalPrize.request &&
      status.physicalPrize.colors.length > 0
  );
}
