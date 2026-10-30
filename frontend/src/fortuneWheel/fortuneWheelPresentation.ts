export type PrizeRequestStatusKey =
  | 'pending'
  | 'approved'
  | 'preparing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'processing';

export type PrizeColorDisplay =
  | { kind: 'staging' }
  | { kind: 'option'; number: number }
  | { kind: 'literal'; value: string };

const TECHNICAL_COLOR_CODE = /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/i;

export function getPrizeRequestStatusKey(status: string): PrizeRequestStatusKey {
  const normalized = status.trim().toLowerCase();
  if (
    normalized === 'pending' ||
    normalized === 'approved' ||
    normalized === 'preparing' ||
    normalized === 'shipped' ||
    normalized === 'delivered' ||
    normalized === 'cancelled'
  ) return normalized;
  return 'processing';
}

export function getPrizeColorDisplay(color: string, availableColors: readonly string[]): PrizeColorDisplay {
  const normalized = color.trim();
  if (normalized.toLowerCase() === 'staging-test') return { kind: 'staging' };

  if (TECHNICAL_COLOR_CODE.test(normalized)) {
    const index = availableColors.findIndex((candidate) => candidate === color);
    return { kind: 'option', number: index >= 0 ? index + 1 : 1 };
  }

  return { kind: 'literal', value: normalized };
}
