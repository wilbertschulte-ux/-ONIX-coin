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
export type FortuneWheelSectorKind = 'onix-50k' | 'onix-250k' | 'iphone-duo';

export interface FortuneWheelSectorDefinition {
  index: number;
  centerAngle: number;
  spin: 1 | 2 | 3;
  kind: FortuneWheelSectorKind;
  primary: boolean;
}

export const FORTUNE_WHEEL_SECTORS: readonly FortuneWheelSectorDefinition[] = [
  { index: 0, centerAngle: 0, spin: 1, kind: 'onix-50k', primary: true },
  { index: 1, centerAngle: 60, spin: 3, kind: 'iphone-duo', primary: false },
  { index: 2, centerAngle: 120, spin: 2, kind: 'onix-250k', primary: true },
  { index: 3, centerAngle: 180, spin: 1, kind: 'onix-50k', primary: false },
  { index: 4, centerAngle: 240, spin: 3, kind: 'iphone-duo', primary: true },
  { index: 5, centerAngle: 300, spin: 2, kind: 'onix-250k', primary: false },
] as const;

export const FORTUNE_WHEEL_POINTER_ANGLE = 270;

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
  // Sector labels are laid out clockwise from the right-hand axis (0deg), while
  // the fixed pointer is at the top (270deg) in that same coordinate system.
  // Rotate the server-confirmed reward sector to the pointer; never choose a
  // client-side result or a random landing position.
  const sectorCenter = FORTUNE_WHEEL_SECTORS.find((sector) => sector.spin === spin && sector.primary)?.centerAngle;
  if (sectorCenter === undefined) throw new Error(`Missing Fortune Wheel sector for spin ${spin}`);
  const normalizedCurrent = ((currentRotation % 360) + 360) % 360;
  const desiredNormalized = (FORTUNE_WHEEL_POINTER_ANGLE - sectorCenter + 360) % 360;
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
