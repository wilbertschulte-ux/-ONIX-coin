import { useCallback, useEffect, useRef, useState } from 'react';
import { createTranslator, getLanguageLocale, type AppLanguage } from '../../i18n';
import { correctAdminPhysicalPrizeColor, loadAdminFortuneWheelDashboard, loadAdminPhysicalPrizes, updateAdminPhysicalPrizeStatus } from '../adminApi';
import {
  getAdminCollectionState,
  type AdminFortuneWheelCampaignKey,
  type AdminFortuneWheelDashboardResponse,
  type AdminFortuneWheelEntitlementStatus,
  type AdminFortuneWheelFilters,
  type AdminPhysicalPrizeFilters,
  type AdminPhysicalPrizeListResponse,
  type AdminPhysicalPrizeRequest,
  type AdminPhysicalPrizeStatus,
} from '../adminTypes';
import { AdminStateView } from '../components/AdminStateView';
import { ConfirmAdminAction } from '../components/ConfirmAdminAction';

type PhysicalPrizesSectionProps = { apiBaseUrl: string; adminTelegramId: string; language: AppLanguage };
type OperationDraft = {
  kind: 'status' | 'color'; request: AdminPhysicalPrizeRequest; nextStatus: AdminPhysicalPrizeStatus | '';
  color: string; reason: string; reasonCode: string; resolution: string; idempotencyKey: string;
};

const WEEKLY_CAMPAIGN: AdminFortuneWheelCampaignKey = 'fortune-wheel-weekly-v1';
const LEGACY_CAMPAIGNS: AdminFortuneWheelCampaignKey[] = [
  'fortune-wheel-v1',
  'fortune-wheel-staging-v1',
];
const initialFilters: AdminPhysicalPrizeFilters = { campaignKey: WEEKLY_CAMPAIGN, weekKey: '', status: '', search: '', sort: 'newest', page: 1 };
const initialFortuneFilters: AdminFortuneWheelFilters = { campaignKey: WEEKLY_CAMPAIGN, weekKey: '', entitlementStatus: '', entitlementSearch: '', entitlementPage: 1 };

function createOperationKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, '0')).join('');
}

function formatDate(value: string | null, language: AppLanguage): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(getLanguageLocale(language));
}

function formatNumber(value: number, language: AppLanguage): string {
  return new Intl.NumberFormat(getLanguageLocale(language)).format(Number(value || 0));
}

function formatProbability(weightPpm: number, language: AppLanguage): string {
  return `${new Intl.NumberFormat(getLanguageLocale(language), { maximumFractionDigits: 4 }).format(Number(weightPpm || 0) / 10_000)}%`;
}

function prizeName(code: string): string {
  if (code === 'iphone_duo') return 'iPhone Duo';
  const amount = /^onix_(\d+)$/.exec(code)?.[1];
  return amount ? `${Number(amount).toLocaleString('de-DE')} ONIX` : code || '—';
}

export function PhysicalPrizesSection({ apiBaseUrl, adminTelegramId, language }: PhysicalPrizesSectionProps) {
  const t = createTranslator(language);
  const [filters, setFilters] = useState<AdminPhysicalPrizeFilters>(initialFilters);
  const [fortuneFilters, setFortuneFilters] = useState<AdminFortuneWheelFilters>(initialFortuneFilters);
  const [searchInput, setSearchInput] = useState('');
  const [data, setData] = useState<AdminPhysicalPrizeListResponse | null>(null);
  const [dashboard, setDashboard] = useState<AdminFortuneWheelDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [draft, setDraft] = useState<OperationDraft | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const mutationLock = useRef(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async (nextFilters: AdminPhysicalPrizeFilters, nextFortuneFilters: AdminFortuneWheelFilters) => {
    setLoading(true);
    setError(false);
    try {
      const [requests, fortuneDashboard] = await Promise.all([
        loadAdminPhysicalPrizes(apiBaseUrl, adminTelegramId, nextFilters),
        loadAdminFortuneWheelDashboard(apiBaseUrl, adminTelegramId, nextFortuneFilters),
      ]);
      setData(requests);
      setDashboard(fortuneDashboard);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, adminTelegramId]);

  useEffect(() => {
    let active = true;
    Promise.all([
      loadAdminPhysicalPrizes(apiBaseUrl, adminTelegramId, initialFilters),
      loadAdminFortuneWheelDashboard(apiBaseUrl, adminTelegramId, initialFortuneFilters),
    ]).then(([requests, fortuneDashboard]) => {
      if (!active) return;
      setData(requests);
      setDashboard(fortuneDashboard);
    }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [apiBaseUrl, adminTelegramId]);

  const selectCampaign = (campaignKey: AdminFortuneWheelCampaignKey) => {
    const nextFilters = { ...filters, campaignKey, weekKey: '', page: 1 };
    const nextFortuneFilters = { ...fortuneFilters, campaignKey, weekKey: '', entitlementPage: 1 };
    setFilters(nextFilters);
    setFortuneFilters(nextFortuneFilters);
    setDraft(null);
    void load(nextFilters, nextFortuneFilters);
  };

  const applyFilters = () => {
    const nextFilters = { ...filters, search: searchInput, page: 1 };
    const nextFortuneFilters = { ...fortuneFilters, entitlementSearch: searchInput, entitlementPage: 1 };
    setFilters(nextFilters);
    setFortuneFilters(nextFortuneFilters);
    setDraft(null);
    void load(nextFilters, nextFortuneFilters);
  };

  const changeRequestPage = (page: number) => {
    const next = { ...filters, page };
    setFilters(next);
    setDraft(null);
    void load(next, fortuneFilters);
  };

  const changeEntitlementPage = (page: number) => {
    const next = { ...fortuneFilters, entitlementPage: page };
    setFortuneFilters(next);
    void load(filters, next);
  };

  const beginStatusChange = (request: AdminPhysicalPrizeRequest, nextStatus: AdminPhysicalPrizeStatus) => {
    setNotice(null);
    setDraft({ kind: 'status', request, nextStatus, color: request.color, reason: '', reasonCode: '', resolution: '', idempotencyKey: createOperationKey() });
  };

  const beginColorCorrection = (request: AdminPhysicalPrizeRequest) => {
    setNotice(null);
    setDraft({ kind: 'color', request, nextStatus: '', color: request.color, reason: '', reasonCode: '', resolution: '', idempotencyKey: createOperationKey() });
  };

  const draftValid = Boolean(draft && draft.reason.trim().length >= 3 && (draft.kind === 'status'
    ? draft.nextStatus && (draft.nextStatus !== 'cancelled' || (draft.reasonCode && draft.resolution.trim().length >= 3))
    : draft.color !== draft.request.color && data?.filters.availableColors.includes(draft.color)));

  const confirmOperation = async () => {
    if (!draft || !draftValid || mutationLock.current) return;
    mutationLock.current = true;
    setSubmitting(true);
    setNotice(null);
    try {
      const updated = draft.kind === 'status'
        ? await updateAdminPhysicalPrizeStatus(apiBaseUrl, adminTelegramId, draft.request, draft.nextStatus as AdminPhysicalPrizeStatus, draft.reason, draft.reasonCode, draft.resolution, draft.idempotencyKey)
        : await correctAdminPhysicalPrizeColor(apiBaseUrl, adminTelegramId, draft.request, draft.color, draft.reason, draft.idempotencyKey);
      setData((current) => current ? { ...current, requests: current.requests.map((request) => request.requestId === updated.requestId ? updated : request) } : current);
      setConfirmOpen(false);
      setDraft(null);
      setNotice({ type: 'success', text: t('admin.physicalPrizes.updateSuccess') });
      await load(filters, fortuneFilters);
    } catch {
      setConfirmOpen(false);
      setNotice({ type: 'error', text: t('admin.physicalPrizes.updateError') });
    } finally {
      mutationLock.current = false;
      setSubmitting(false);
    }
  };

  const requests = data?.requests || [];
  const availableColors = data?.filters.availableColors || [];
  const cancellationReasons = data?.filters.cancellationReasons || [];
  const requestState = getAdminCollectionState(loading, error, requests.length);
  const campaign = dashboard?.dashboard;
  const entitlements = dashboard?.entitlements || [];

  return (
    <section className="admin-physical-prizes-section">
      <div className="admin-section-heading"><div><span>{t('admin.physicalPrizes.workspace')}</span><h1>{t('admin.shell.physicalPrizes')}</h1><p>{t('admin.physicalPrizes.intro')}</p></div><button type="button" onClick={() => void load(filters, fortuneFilters)} disabled={loading || submitting}>{t('admin.physicalPrizes.refresh')}</button></div>

      <div className="admin-fortune-campaign-switch" role="group" aria-label={t('admin.physicalPrizes.campaign')}>
        {LEGACY_CAMPAIGNS.map((campaignKey) => (
          <button type="button" key={campaignKey} className={filters.campaignKey === campaignKey ? 'is-active' : ''} onClick={() => selectCampaign(campaignKey)} disabled={loading}>
            {t('admin.physicalPrizes.legacyCampaign')} · {campaignKey}
          </button>
        ))}
        <button type="button" className={filters.campaignKey === WEEKLY_CAMPAIGN ? 'is-active' : ''} onClick={() => selectCampaign(WEEKLY_CAMPAIGN)} disabled={loading}>{t('admin.physicalPrizes.weeklyCampaign')}</button>
      </div>

      {campaign && <section className="admin-fortune-dashboard" aria-label={t('admin.physicalPrizes.campaignStats')}>
        <header><div><small>{campaign.campaignKey}</small><strong>{campaign.mode}</strong></div><span className={campaign.active ? 'is-active' : 'is-inactive'}>{campaign.active ? t('admin.physicalPrizes.campaignActive') : t('admin.physicalPrizes.campaignInactive')}</span></header>
        {campaign.week && <p className="admin-fortune-week">{t('admin.physicalPrizes.utcWeek')}: <strong>{campaign.week.weekKey}</strong>{campaign.week.resetsAt && <> · {t('admin.physicalPrizes.resetsAt')}: {formatDate(campaign.week.resetsAt, language)}</>}</p>}
        {!campaign.readiness.ready && <div className="admin-action-notice is-error">{t('admin.physicalPrizes.readinessBlocked')}: {campaign.readiness.code}</div>}
        <div className="admin-fortune-metrics">
          <article><span>{t('admin.physicalPrizes.uniquePlayers')}</span><strong>{formatNumber(campaign.stats.uniquePlayers, language)}</strong></article>
          <article><span>{t('admin.physicalPrizes.spinsUsed')}</span><strong>{formatNumber(campaign.stats.spinsUsed, language)}</strong></article>
          <article><span>{t('admin.physicalPrizes.totalOnix')}</span><strong>{formatNumber(campaign.stats.totalOnix, language)}</strong></article>
          <article><span>{t('admin.physicalPrizes.awaitingColor')}</span><strong>{formatNumber(dashboard?.awaitingColorTotal || 0, language)}</strong></article>
          {campaign.inventory && <><article><span>{t('admin.physicalPrizes.inventoryTotal')}</span><strong>{campaign.inventory.capacity}</strong></article><article><span>{t('admin.physicalPrizes.inventoryReserved')}</span><strong>{campaign.inventory.reserved}</strong></article><article><span>{t('admin.physicalPrizes.inventoryDelivered')}</span><strong>{campaign.inventory.fulfilled}</strong></article><article><span>{t('admin.physicalPrizes.inventoryRemaining')}</span><strong>{campaign.inventory.remaining}</strong></article></>}
        </div>
        <div className="admin-fortune-dashboard-columns">
          <article><h2>{t('admin.physicalPrizes.rewardStats')}</h2><div className="admin-fortune-data-list">{campaign.stats.rewards.length === 0 && <p>{t('admin.physicalPrizes.noRewardStats')}</p>}{campaign.stats.rewards.map((reward) => <div key={reward.rewardCode}><span>{prizeName(reward.rewardCode)}</span><strong>{reward.count}</strong></div>)}</div></article>
          <article><h2>{t('admin.physicalPrizes.probabilities')}</h2><div className="admin-fortune-data-list">{campaign.configuredProbabilities.length === 0 && <p>{t('admin.physicalPrizes.legacyFixed')}</p>}{campaign.configuredProbabilities.map((configured) => { const effective = campaign.effectiveProbabilities.find((item) => item.rewardCode === configured.rewardCode); return <div key={configured.rewardCode} className={effective?.available === false ? 'is-unavailable' : ''}><span>{prizeName(configured.rewardCode)}</span><strong>{formatProbability(configured.weightPpm || 0, language)} → {formatProbability(effective?.effectiveWeightPpm || 0, language)}</strong></div>; })}</div></article>
        </div>
      </section>}

      <form className="admin-physical-prize-filters" onSubmit={(event) => { event.preventDefault(); applyFilters(); }}>
        <label><span>{t('admin.physicalPrizes.search')}</span><input value={searchInput} maxLength={64} onChange={(event) => setSearchInput(event.target.value)} placeholder={t('admin.physicalPrizes.searchPlaceholder')} /></label>
        {filters.campaignKey === WEEKLY_CAMPAIGN && <label><span>{t('admin.physicalPrizes.week')}</span><input value={filters.weekKey} maxLength={10} placeholder="YYYY-MM-DD" onChange={(event) => { const weekKey = event.target.value; setFilters((current) => ({ ...current, weekKey })); setFortuneFilters((current) => ({ ...current, weekKey })); }} /></label>}
        <label><span>{t('admin.physicalPrizes.status')}</span><select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as AdminPhysicalPrizeFilters['status'] }))}><option value="">{t('admin.physicalPrizes.allStatuses')}</option>{(data?.filters.statuses || []).map((status) => <option key={status} value={status}>{t(`admin.physicalPrizes.status.${status}`)}</option>)}</select></label>
        <label><span>{t('admin.physicalPrizes.entitlementStatus')}</span><select value={fortuneFilters.entitlementStatus} onChange={(event) => setFortuneFilters((current) => ({ ...current, entitlementStatus: event.target.value as AdminFortuneWheelEntitlementStatus }))}><option value="">{t('admin.physicalPrizes.allStatuses')}</option>{(dashboard?.filters.entitlementStatuses || []).map((status) => <option key={status} value={status}>{t(`admin.physicalPrizes.entitlement.${status}`)}</option>)}</select></label>
        <label><span>{t('admin.physicalPrizes.sort')}</span><select value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as 'newest' | 'oldest' }))}><option value="newest">{t('admin.physicalPrizes.newest')}</option><option value="oldest">{t('admin.physicalPrizes.oldest')}</option></select></label>
        <button type="submit" disabled={loading}>{t('admin.physicalPrizes.applyFilters')}</button>
      </form>

      {notice && <div className={`admin-action-notice is-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.text}</div>}
      {loading && !dashboard && <AdminStateView icon="◌" title={t('admin.physicalPrizes.loading')} />}
      {error && <AdminStateView icon="!" title={t('admin.physicalPrizes.loadError')} actionLabel={t('admin.physicalPrizes.retry')} onAction={() => void load(filters, fortuneFilters)} tone="error" />}

      {!error && dashboard && <section className="admin-fortune-entitlements">
        <div className="admin-subsection-heading"><div><span>{t('admin.physicalPrizes.ledger')}</span><h2>{t('admin.physicalPrizes.entitlements')}</h2></div></div>
        {entitlements.length === 0 ? <AdminStateView icon="◇" title={t('admin.physicalPrizes.entitlementsEmpty')} /> : <div className="admin-fortune-entitlement-list">{entitlements.map((entitlement) => <article key={entitlement.id} className={entitlement.awaitingColor ? 'is-awaiting-color' : ''}>
          <header><div><strong>{entitlement.telegramUsername ? `@${entitlement.telegramUsername}` : entitlement.telegramId}</strong><small>{entitlement.telegramId}</small></div><span>{t(`admin.physicalPrizes.entitlement.${entitlement.awaitingColor ? 'awaiting_color' : entitlement.status}`)}</span></header>
          <dl><div><dt>{t('admin.physicalPrizes.campaign')}</dt><dd>{entitlement.campaignKey}</dd></div><div><dt>{t('admin.physicalPrizes.week')}</dt><dd>{entitlement.weekKey}</dd></div><div><dt>{t('admin.physicalPrizes.slot')}</dt><dd>{entitlement.slot}</dd></div><div><dt>{t('admin.physicalPrizes.color')}</dt><dd>{entitlement.color || '—'}</dd></div><div><dt>{t('admin.physicalPrizes.requestId')}</dt><dd>{entitlement.requestId || '—'}</dd></div><div><dt>{t('admin.physicalPrizes.wonAt')}</dt><dd>{formatDate(entitlement.wonAt, language)}</dd></div></dl>
        </article>)}</div>}
        {dashboard.entitlementPagination.totalPages > 1 && <nav className="admin-physical-prize-pagination" aria-label={t('admin.physicalPrizes.pagination')}><button type="button" disabled={!dashboard.entitlementPagination.hasPrevPage || loading} onClick={() => changeEntitlementPage(dashboard.entitlementPagination.page - 1)}>{t('admin.physicalPrizes.previous')}</button><span>{dashboard.entitlementPagination.page} / {dashboard.entitlementPagination.totalPages}</span><button type="button" disabled={!dashboard.entitlementPagination.hasNextPage || loading} onClick={() => changeEntitlementPage(dashboard.entitlementPagination.page + 1)}>{t('admin.physicalPrizes.next')}</button></nav>}
      </section>}

      {!error && requestState === 'empty' && <AdminStateView icon="◇" title={t('admin.physicalPrizes.empty')} />}
      {!error && requestState === 'ready' && <div className="admin-physical-prize-list">{requests.map((request) => <article key={request.requestId} className="admin-physical-prize-card">
        <header><div><strong>{prizeName(request.prizeCode)}</strong><small>{t('admin.physicalPrizes.requestId')}: {request.requestId}</small></div><span className={`is-${request.status}`}>{t(`admin.physicalPrizes.status.${request.status}`)}</span></header>
        <dl className="admin-physical-prize-facts"><div><dt>{t('admin.physicalPrizes.campaign')}</dt><dd>{request.campaignKey}</dd></div><div><dt>{t('admin.physicalPrizes.telegramId')}</dt><dd>{request.telegramId}</dd></div><div><dt>{t('admin.physicalPrizes.username')}</dt><dd>{request.telegramUsername ? `@${request.telegramUsername}` : '—'}</dd></div><div><dt>{t('admin.physicalPrizes.color')}</dt><dd>{request.color}</dd></div><div><dt>{t('admin.physicalPrizes.createdAt')}</dt><dd>{formatDate(request.createdAt, language)}</dd></div><div><dt>{t('admin.physicalPrizes.updatedAt')}</dt><dd>{formatDate(request.updatedAt, language)}</dd></div></dl>
        <details className="admin-physical-prize-history"><summary>{t('admin.physicalPrizes.history')} ({request.statusHistory.length})</summary><div>{[...request.statusHistory].reverse().map((entry, index) => <article key={`${entry.changedAt}-${entry.operationKey}-${index}`}><strong>{t(`admin.physicalPrizes.action.${entry.action}`)}</strong><time>{formatDate(entry.changedAt, language)}</time><p>{entry.previousStatus ? `${entry.previousStatus} → ${entry.status}` : entry.status}</p>{entry.previousColor && entry.previousColor !== entry.color && <p>{entry.previousColor} → {entry.color}</p>}{entry.reason && <p>{entry.reason}</p>}{entry.reasonCode && <small>{entry.reasonCode}</small>}{entry.resolution && <p>{entry.resolution}</p>}<small>{entry.changedBy || '—'}</small></article>)}</div></details>
        <div className="admin-physical-prize-actions">{request.allowedTransitions.map((status) => <button key={status} type="button" onClick={() => beginStatusChange(request, status)} disabled={submitting}>{t(`admin.physicalPrizes.move.${status}`)}</button>)}{['pending', 'approved', 'preparing'].includes(request.status) && availableColors.length > 1 && <button type="button" onClick={() => beginColorCorrection(request)} disabled={submitting}>{t('admin.physicalPrizes.correctColor')}</button>}</div>
        {draft?.request.requestId === request.requestId && <div className="admin-physical-prize-editor"><strong>{draft.kind === 'color' ? t('admin.physicalPrizes.correctColor') : t('admin.physicalPrizes.statusChange')}</strong>{draft.kind === 'color' && <label><span>{t('admin.physicalPrizes.newColor')}</span><select value={draft.color} onChange={(event) => setDraft((current) => current ? { ...current, color: event.target.value } : current)}>{availableColors.map((color) => <option key={color} value={color}>{color}</option>)}</select></label>}{draft.nextStatus === 'cancelled' && <><label><span>{t('admin.physicalPrizes.cancellationReason')}</span><select value={draft.reasonCode} onChange={(event) => setDraft((current) => current ? { ...current, reasonCode: event.target.value } : current)}><option value="">—</option>{cancellationReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select></label><label><span>{t('admin.physicalPrizes.resolution')}</span><textarea value={draft.resolution} maxLength={500} onChange={(event) => setDraft((current) => current ? { ...current, resolution: event.target.value } : current)} /></label></>}<label><span>{t('admin.physicalPrizes.reason')}</span><textarea value={draft.reason} maxLength={500} onChange={(event) => setDraft((current) => current ? { ...current, reason: event.target.value } : current)} /></label><div><button type="button" onClick={() => setDraft(null)} disabled={submitting}>{t('admin.shell.cancel')}</button><button type="button" onClick={() => setConfirmOpen(true)} disabled={!draftValid || submitting}>{t('admin.physicalPrizes.reviewAction')}</button></div></div>}
      </article>)}</div>}

      {data && data.pagination.totalPages > 1 && <nav className="admin-physical-prize-pagination" aria-label={t('admin.physicalPrizes.pagination')}><button type="button" disabled={!data.pagination.hasPrevPage || loading} onClick={() => changeRequestPage(data.pagination.page - 1)}>{t('admin.physicalPrizes.previous')}</button><span>{data.pagination.page} / {data.pagination.totalPages}</span><button type="button" disabled={!data.pagination.hasNextPage || loading} onClick={() => changeRequestPage(data.pagination.page + 1)}>{t('admin.physicalPrizes.next')}</button></nav>}
      <ConfirmAdminAction language={language} open={confirmOpen} title={t('admin.physicalPrizes.confirmTitle')} description={t('admin.physicalPrizes.confirmDescription', { requestId: draft?.request.requestId || '—' })} confirmLabel={t('admin.physicalPrizes.confirmAction')} busy={submitting} onCancel={() => setConfirmOpen(false)} onConfirm={() => void confirmOperation()} />
    </section>
  );
}
