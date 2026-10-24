const PHYSICAL_PRIZE_STATUSES = Object.freeze([
  'pending',
  'approved',
  'preparing',
  'shipped',
  'delivered',
  'cancelled',
]);

const PHYSICAL_PRIZE_TRANSITIONS = Object.freeze({
  pending: Object.freeze(['approved', 'cancelled']),
  approved: Object.freeze(['preparing']),
  preparing: Object.freeze(['shipped']),
  shipped: Object.freeze(['delivered']),
  delivered: Object.freeze([]),
  cancelled: Object.freeze([]),
});

const OPERATION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const CANCELLATION_REASON_PATTERN = /^[a-z0-9][a-z0-9_-]{1,47}$/;

function parseCancellationReasons(environment = process.env) {
  return [...new Set(
    String(environment.FORTUNE_WHEEL_CANCELLATION_REASONS || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => CANCELLATION_REASON_PATTERN.test(value))
  )];
}

function normalizeAdminPhysicalPrizeListQuery(query = {}) {
  const rawStatus = String(query.status || '').trim().toLowerCase();
  const status = rawStatus === 'all' ? '' : rawStatus;
  const search = String(query.search || '').trim();
  const sort = String(query.sort || 'newest').trim().toLowerCase();
  const page = Math.max(1, Math.trunc(Number(query.page) || 1));
  const limit = Math.min(50, Math.max(1, Math.trunc(Number(query.limit) || 20)));

  if (status && !PHYSICAL_PRIZE_STATUSES.includes(status)) {
    return { ok: false, code: 'INVALID_PHYSICAL_PRIZE_STATUS' };
  }
  if (search.length > 64) {
    return { ok: false, code: 'PHYSICAL_PRIZE_SEARCH_TOO_LONG' };
  }
  if (!['newest', 'oldest'].includes(sort)) {
    return { ok: false, code: 'INVALID_PHYSICAL_PRIZE_SORT' };
  }

  return { ok: true, status, search, sort, page, limit };
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildAdminPhysicalPrizeFilter(normalized) {
  const filter = {};
  if (normalized.status) filter.status = normalized.status;
  if (normalized.search) {
    const safeSearch = new RegExp(`^${escapeRegExp(normalized.search)}`);
    filter.$or = [{ requestId: safeSearch }, { telegramId: safeSearch }];
  }
  return filter;
}

function isValidAdminPhysicalPrizeOperationKey(value) {
  return OPERATION_KEY_PATTERN.test(String(value || '').trim());
}

function serializeAdminPhysicalPrizeRequest(request, { cancellationReasons = [] } = {}) {
  const source = typeof request?.toObject === 'function'
    ? request.toObject({ flattenMaps: true })
    : request || {};
  return {
    requestId: String(source.requestId || ''),
    campaignKey: String(source.campaignKey || ''),
    telegramId: String(source.telegramId || ''),
    telegramUsername: String(source.telegramUsernameSnapshot || ''),
    prizeCode: String(source.prizeCode || ''),
    color: String(source.color || ''),
    status: String(source.status || 'pending'),
    createdAt: source.createdAt || null,
    updatedAt: source.updatedAt || null,
    reviewedAt: source.reviewedAt || null,
    reviewedBy: String(source.reviewedBy || ''),
    version: Number(source.__v || 0),
    statusHistory: (source.statusHistory || []).map((entry) => ({
      action: String(entry.action || 'status_changed'),
      status: String(entry.status || ''),
      previousStatus: String(entry.previousStatus || ''),
      color: String(entry.color || ''),
      previousColor: String(entry.previousColor || ''),
      reasonCode: String(entry.reasonCode || ''),
      reason: String(entry.comment || ''),
      resolution: String(entry.resolution || ''),
      changedAt: entry.changedAt || null,
      changedBy: String(entry.changedBy || ''),
      operationKey: String(entry.operationKey || ''),
    })),
    allowedTransitions: [...(PHYSICAL_PRIZE_TRANSITIONS[source.status] || [])]
      .filter((status) => status !== 'cancelled' || cancellationReasons.length > 0),
  };
}

function validateCommonMutation({ request, expectedVersion, idempotencyKey }) {
  if (!request) return { ok: false, code: 'PHYSICAL_PRIZE_REQUEST_NOT_FOUND' };
  if (!Number.isInteger(Number(expectedVersion)) || Number(expectedVersion) < 0) {
    return { ok: false, code: 'INVALID_EXPECTED_VERSION' };
  }
  if (!OPERATION_KEY_PATTERN.test(String(idempotencyKey || '').trim())) {
    return { ok: false, code: 'INVALID_IDEMPOTENCY_KEY' };
  }
  return { ok: true };
}

function validateStatusTransition({
  request,
  nextStatus,
  reason,
  reasonCode,
  resolution,
  expectedVersion,
  idempotencyKey,
  cancellationReasons = [],
}) {
  const common = validateCommonMutation({ request, expectedVersion, idempotencyKey });
  if (!common.ok) return common;
  const targetStatus = String(nextStatus || '').trim().toLowerCase();
  const cleanReason = String(reason || '').trim();
  const cleanReasonCode = String(reasonCode || '').trim().toLowerCase();
  const cleanResolution = String(resolution || '').trim();

  if (!PHYSICAL_PRIZE_STATUSES.includes(targetStatus)) {
    return { ok: false, code: 'INVALID_PHYSICAL_PRIZE_STATUS' };
  }
  if (!(PHYSICAL_PRIZE_TRANSITIONS[request.status] || []).includes(targetStatus)) {
    return { ok: false, code: 'INVALID_PHYSICAL_PRIZE_TRANSITION' };
  }
  if (cleanReason.length < 3 || cleanReason.length > 500) {
    return { ok: false, code: 'PHYSICAL_PRIZE_REASON_REQUIRED' };
  }
  if (targetStatus === 'cancelled') {
    if (!cancellationReasons.includes(cleanReasonCode)) {
      return { ok: false, code: 'CANCELLATION_REASON_NOT_ALLOWED' };
    }
    if (cleanResolution.length < 3 || cleanResolution.length > 500) {
      return { ok: false, code: 'CANCELLATION_RESOLUTION_REQUIRED' };
    }
  }
  return {
    ok: true,
    nextStatus: targetStatus,
    reason: cleanReason,
    reasonCode: targetStatus === 'cancelled' ? cleanReasonCode : '',
    resolution: targetStatus === 'cancelled' ? cleanResolution : '',
    idempotencyKey: String(idempotencyKey).trim(),
    expectedVersion: Number(expectedVersion),
  };
}

function validateColorCorrection({ request, color, reason, expectedVersion, idempotencyKey, allowedColors = [] }) {
  const common = validateCommonMutation({ request, expectedVersion, idempotencyKey });
  if (!common.ok) return common;
  const cleanColor = String(color || '').trim().toLowerCase();
  const cleanReason = String(reason || '').trim();
  if (!['pending', 'approved', 'preparing'].includes(request.status)) {
    return { ok: false, code: 'PHYSICAL_PRIZE_COLOR_LOCKED' };
  }
  if (!allowedColors.includes(cleanColor)) {
    return { ok: false, code: 'INVALID_IPHONE_COLOR' };
  }
  if (cleanColor === request.color) {
    return { ok: false, code: 'PHYSICAL_PRIZE_COLOR_UNCHANGED' };
  }
  if (cleanReason.length < 3 || cleanReason.length > 500) {
    return { ok: false, code: 'PHYSICAL_PRIZE_REASON_REQUIRED' };
  }
  return {
    ok: true,
    color: cleanColor,
    reason: cleanReason,
    idempotencyKey: String(idempotencyKey).trim(),
    expectedVersion: Number(expectedVersion),
  };
}

function findIdempotentHistoryEntry(request, operationKey) {
  return (request?.statusHistory || []).find(
    (entry) => String(entry.operationKey || '') === String(operationKey || '')
  ) || null;
}

module.exports = {
  PHYSICAL_PRIZE_STATUSES,
  PHYSICAL_PRIZE_TRANSITIONS,
  buildAdminPhysicalPrizeFilter,
  findIdempotentHistoryEntry,
  isValidAdminPhysicalPrizeOperationKey,
  normalizeAdminPhysicalPrizeListQuery,
  parseCancellationReasons,
  serializeAdminPhysicalPrizeRequest,
  validateColorCorrection,
  validateStatusTransition,
};
