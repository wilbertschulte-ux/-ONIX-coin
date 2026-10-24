import { useCallback, useEffect, useRef, useState } from 'react';
import { createTranslator, getLanguageLocale, type AppLanguage } from '../../i18n';
import {
  correctAdminPhysicalPrizeColor,
  loadAdminPhysicalPrizes,
  updateAdminPhysicalPrizeStatus,
} from '../adminApi';
import {
  getAdminCollectionState,
  type AdminPhysicalPrizeFilters,
  type AdminPhysicalPrizeListResponse,
  type AdminPhysicalPrizeRequest,
  type AdminPhysicalPrizeStatus,
} from '../adminTypes';
import { AdminStateView } from '../components/AdminStateView';
import { ConfirmAdminAction } from '../components/ConfirmAdminAction';

type PhysicalPrizesSectionProps = {
  apiBaseUrl: string;
  adminTelegramId: string;
  language: AppLanguage;
};

type OperationDraft = {
  kind: 'status' | 'color';
  request: AdminPhysicalPrizeRequest;
  nextStatus: AdminPhysicalPrizeStatus | '';
  color: string;
  reason: string;
  reasonCode: string;
  resolution: string;
  idempotencyKey: string;
};

const initialFilters: AdminPhysicalPrizeFilters = {
  status: '',
  search: '',
  sort: 'newest',
  page: 1,
};

function createOperationKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, '0')).join('');
}

function formatDate(value: string | null, language: AppLanguage): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(getLanguageLocale(language));
}

function prizeName(code: string): string {
  return code === 'iphone_duo' ? 'iPhone Duo' : code || '—';
}

export function PhysicalPrizesSection({ apiBaseUrl, adminTelegramId, language }: PhysicalPrizesSectionProps) {
  const t = createTranslator(language);
  const [filters, setFilters] = useState<AdminPhysicalPrizeFilters>(initialFilters);
  const [searchInput, setSearchInput] = useState('');
  const [data, setData] = useState<AdminPhysicalPrizeListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [draft, setDraft] = useState<OperationDraft | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const mutationLock = useRef(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async (nextFilters: AdminPhysicalPrizeFilters) => {
    setLoading(true);
    setError(false);
    try {
      setData(await loadAdminPhysicalPrizes(apiBaseUrl, adminTelegramId, nextFilters));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, adminTelegramId]);

  useEffect(() => {
    let active = true;
    void loadAdminPhysicalPrizes(apiBaseUrl, adminTelegramId, initialFilters)
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [apiBaseUrl, adminTelegramId]);

  const applyFilters = () => {
    const next = { ...filters, search: searchInput, page: 1 };
    setFilters(next);
    setDraft(null);
    void load(next);
  };

  const changePage = (page: number) => {
    const next = { ...filters, page };
    setFilters(next);
    setDraft(null);
    void load(next);
  };

  const beginStatusChange = (request: AdminPhysicalPrizeRequest, nextStatus: AdminPhysicalPrizeStatus) => {
    setNotice(null);
    setDraft({
      kind: 'status', request, nextStatus, color: request.color, reason: '', reasonCode: '', resolution: '',
      idempotencyKey: createOperationKey(),
    });
  };

  const beginColorCorrection = (request: AdminPhysicalPrizeRequest) => {
    setNotice(null);
    setDraft({
      kind: 'color', request, nextStatus: '', color: request.color, reason: '', reasonCode: '', resolution: '',
      idempotencyKey: createOperationKey(),
    });
  };

  const draftValid = Boolean(
    draft &&
    draft.reason.trim().length >= 3 &&
    (draft.kind === 'status'
      ? draft.nextStatus && (draft.nextStatus !== 'cancelled' || (draft.reasonCode && draft.resolution.trim().length >= 3))
      : draft.color !== draft.request.color && data?.filters.availableColors.includes(draft.color))
  );

  const confirmOperation = async () => {
    if (!draft || !draftValid || mutationLock.current) return;
    mutationLock.current = true;
    setSubmitting(true);
    setNotice(null);
    try {
      const updated = draft.kind === 'status'
        ? await updateAdminPhysicalPrizeStatus(
            apiBaseUrl,
            adminTelegramId,
            draft.request,
            draft.nextStatus as AdminPhysicalPrizeStatus,
            draft.reason,
            draft.reasonCode,
            draft.resolution,
            draft.idempotencyKey
          )
        : await correctAdminPhysicalPrizeColor(
            apiBaseUrl,
            adminTelegramId,
            draft.request,
            draft.color,
            draft.reason,
            draft.idempotencyKey
          );
      setData((current) => current ? {
        ...current,
        requests: current.requests.map((request) => request.requestId === updated.requestId ? updated : request),
      } : current);
      setConfirmOpen(false);
      setDraft(null);
      setNotice({ type: 'success', text: t('admin.physicalPrizes.updateSuccess') });
      await load(filters);
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
  const state = getAdminCollectionState(loading, error, requests.length);

  return (
    <section className="admin-physical-prizes-section">
      <div className="admin-section-heading">
        <div>
          <span>{t('admin.physicalPrizes.workspace')}</span>
          <h1>{t('admin.shell.physicalPrizes')}</h1>
          <p>{t('admin.physicalPrizes.intro')}</p>
        </div>
        <button type="button" onClick={() => void load(filters)} disabled={loading || submitting}>{t('admin.physicalPrizes.refresh')}</button>
      </div>

      <form className="admin-physical-prize-filters" onSubmit={(event) => { event.preventDefault(); applyFilters(); }}>
        <label>
          <span>{t('admin.physicalPrizes.search')}</span>
          <input value={searchInput} maxLength={64} onChange={(event) => setSearchInput(event.target.value)} placeholder={t('admin.physicalPrizes.searchPlaceholder')} />
        </label>
        <label>
          <span>{t('admin.physicalPrizes.status')}</span>
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as AdminPhysicalPrizeFilters['status'] }))}>
            <option value="">{t('admin.physicalPrizes.allStatuses')}</option>
            {(data?.filters.statuses || []).map((status) => <option key={status} value={status}>{t(`admin.physicalPrizes.status.${status}`)}</option>)}
          </select>
        </label>
        <label>
          <span>{t('admin.physicalPrizes.sort')}</span>
          <select value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as 'newest' | 'oldest' }))}>
            <option value="newest">{t('admin.physicalPrizes.newest')}</option>
            <option value="oldest">{t('admin.physicalPrizes.oldest')}</option>
          </select>
        </label>
        <button type="submit" disabled={loading}>{t('admin.physicalPrizes.applyFilters')}</button>
      </form>

      {notice && <div className={`admin-action-notice is-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.text}</div>}
      {state === 'loading' && <AdminStateView icon="◌" title={t('admin.physicalPrizes.loading')} />}
      {state === 'error' && <AdminStateView icon="!" title={t('admin.physicalPrizes.loadError')} actionLabel={t('admin.physicalPrizes.retry')} onAction={() => void load(filters)} tone="error" />}
      {state === 'empty' && <AdminStateView icon="◇" title={t('admin.physicalPrizes.empty')} />}

      {state === 'ready' && (
        <div className="admin-physical-prize-list">
          {requests.map((request) => (
            <article key={request.requestId} className="admin-physical-prize-card">
              <header>
                <div>
                  <strong>{prizeName(request.prizeCode)}</strong>
                  <small>{t('admin.physicalPrizes.requestId')}: {request.requestId}</small>
                </div>
                <span className={`is-${request.status}`}>{t(`admin.physicalPrizes.status.${request.status}`)}</span>
              </header>
              <dl className="admin-physical-prize-facts">
                <div><dt>{t('admin.physicalPrizes.telegramId')}</dt><dd>{request.telegramId}</dd></div>
                <div><dt>{t('admin.physicalPrizes.username')}</dt><dd>{request.telegramUsername ? `@${request.telegramUsername}` : '—'}</dd></div>
                <div><dt>{t('admin.physicalPrizes.color')}</dt><dd>{request.color}</dd></div>
                <div><dt>{t('admin.physicalPrizes.createdAt')}</dt><dd>{formatDate(request.createdAt, language)}</dd></div>
                <div><dt>{t('admin.physicalPrizes.updatedAt')}</dt><dd>{formatDate(request.updatedAt, language)}</dd></div>
              </dl>

              <details className="admin-physical-prize-history">
                <summary>{t('admin.physicalPrizes.history')} ({request.statusHistory.length})</summary>
                <div>
                  {[...request.statusHistory].reverse().map((entry, index) => (
                    <article key={`${entry.changedAt}-${entry.operationKey}-${index}`}>
                      <strong>{t(`admin.physicalPrizes.action.${entry.action}`)}</strong>
                      <time>{formatDate(entry.changedAt, language)}</time>
                      <p>{entry.previousStatus ? `${entry.previousStatus} → ${entry.status}` : entry.status}</p>
                      {entry.previousColor && entry.previousColor !== entry.color && <p>{entry.previousColor} → {entry.color}</p>}
                      {entry.reason && <p>{entry.reason}</p>}
                      {entry.reasonCode && <small>{entry.reasonCode}</small>}
                      {entry.resolution && <p>{entry.resolution}</p>}
                      <small>{entry.changedBy || '—'}</small>
                    </article>
                  ))}
                </div>
              </details>

              <div className="admin-physical-prize-actions">
                {request.allowedTransitions.map((status) => (
                  <button key={status} type="button" onClick={() => beginStatusChange(request, status)} disabled={submitting}>
                    {t(`admin.physicalPrizes.move.${status}`)}
                  </button>
                ))}
                {['pending', 'approved', 'preparing'].includes(request.status) && availableColors.length > 1 && (
                  <button type="button" onClick={() => beginColorCorrection(request)} disabled={submitting}>{t('admin.physicalPrizes.correctColor')}</button>
                )}
              </div>

              {draft?.request.requestId === request.requestId && (
                <div className="admin-physical-prize-editor">
                  <strong>{draft.kind === 'color' ? t('admin.physicalPrizes.correctColor') : t('admin.physicalPrizes.statusChange')}</strong>
                  {draft.kind === 'color' && (
                    <label><span>{t('admin.physicalPrizes.newColor')}</span><select value={draft.color} onChange={(event) => setDraft((current) => current ? { ...current, color: event.target.value } : current)}>{availableColors.map((color) => <option key={color} value={color}>{color}</option>)}</select></label>
                  )}
                  {draft.nextStatus === 'cancelled' && (
                    <>
                      <label><span>{t('admin.physicalPrizes.cancellationReason')}</span><select value={draft.reasonCode} onChange={(event) => setDraft((current) => current ? { ...current, reasonCode: event.target.value } : current)}><option value="">—</option>{cancellationReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select></label>
                      <label><span>{t('admin.physicalPrizes.resolution')}</span><textarea value={draft.resolution} maxLength={500} onChange={(event) => setDraft((current) => current ? { ...current, resolution: event.target.value } : current)} /></label>
                    </>
                  )}
                  <label><span>{t('admin.physicalPrizes.reason')}</span><textarea value={draft.reason} maxLength={500} onChange={(event) => setDraft((current) => current ? { ...current, reason: event.target.value } : current)} /></label>
                  <div><button type="button" onClick={() => setDraft(null)} disabled={submitting}>{t('admin.shell.cancel')}</button><button type="button" onClick={() => setConfirmOpen(true)} disabled={!draftValid || submitting}>{t('admin.physicalPrizes.reviewAction')}</button></div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {data && data.pagination.totalPages > 1 && (
        <nav className="admin-physical-prize-pagination" aria-label={t('admin.physicalPrizes.pagination')}>
          <button type="button" disabled={!data.pagination.hasPrevPage || loading} onClick={() => changePage(data.pagination.page - 1)}>{t('admin.physicalPrizes.previous')}</button>
          <span>{data.pagination.page} / {data.pagination.totalPages}</span>
          <button type="button" disabled={!data.pagination.hasNextPage || loading} onClick={() => changePage(data.pagination.page + 1)}>{t('admin.physicalPrizes.next')}</button>
        </nav>
      )}

      <ConfirmAdminAction
        language={language}
        open={confirmOpen}
        title={t('admin.physicalPrizes.confirmTitle')}
        description={t('admin.physicalPrizes.confirmDescription', { requestId: draft?.request.requestId || '—' })}
        confirmLabel={t('admin.physicalPrizes.confirmAction')}
        busy={submitting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void confirmOperation()}
      />
    </section>
  );
}
