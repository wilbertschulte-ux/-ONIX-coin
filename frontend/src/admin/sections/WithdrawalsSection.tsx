import { useEffect, useRef, useState } from 'react';
import { createTranslator, getLanguageLocale, type AppLanguage } from '../../i18n';
import { loadAdminWithdrawals, reviewAdminWithdrawal } from '../adminApi';
import {
  getAdminCollectionState,
  type AdminWithdrawalAction,
  type AdminWithdrawalRequest,
} from '../adminTypes';
import { AdminStateView } from '../components/AdminStateView';
import { ConfirmAdminAction } from '../components/ConfirmAdminAction';

type WithdrawalsSectionProps = {
  apiBaseUrl: string;
  adminTelegramId: string;
  language: AppLanguage;
};

type PendingReview = {
  request: AdminWithdrawalRequest;
  action: AdminWithdrawalAction;
} | null;

const requestKey = (request: AdminWithdrawalRequest) => `${request.userTelegramId}:${request.requestIndex}`;

const formatOnix = (value: number, language: AppLanguage) =>
  Math.trunc(Number(value || 0)).toLocaleString(getLanguageLocale(language));

const formatEur = (value: number, language: AppLanguage) =>
  Number(value || 0).toLocaleString(getLanguageLocale(language), { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDateTime = (value: number, language: AppLanguage) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(getLanguageLocale(language));
};

export function WithdrawalsSection({ apiBaseUrl, adminTelegramId, language }: WithdrawalsSectionProps) {
  const t = createTranslator(language);
  const [requests, setRequests] = useState<AdminWithdrawalRequest[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const reviewingRef = useRef(false);
  const [pendingReview, setPendingReview] = useState<PendingReview>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    void loadAdminWithdrawals(apiBaseUrl, adminTelegramId)
      .then((result) => {
        if (active) setRequests(result.requests || []);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiBaseUrl, adminTelegramId]);

  const refresh = async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await loadAdminWithdrawals(apiBaseUrl, adminTelegramId);
      setRequests(result.requests || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const confirmReview = async () => {
    if (!pendingReview || reviewingRef.current) return;
    const { request, action } = pendingReview;
    const key = requestKey(request);
    reviewingRef.current = true;
    setReviewing(true);
    setNotice(null);
    try {
      await reviewAdminWithdrawal(apiBaseUrl, adminTelegramId, request, action, comments[key] || '');
      setComments((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setPendingReview(null);
      setNotice({
        type: 'success',
        text: t(action === 'approved' ? 'admin.withdrawals.approved' : 'admin.withdrawals.rejected'),
      });
      await refresh();
    } catch {
      setPendingReview(null);
      setNotice({ type: 'error', text: t('admin.withdrawals.actionError') });
    } finally {
      reviewingRef.current = false;
      setReviewing(false);
    }
  };

  const state = getAdminCollectionState(loading, error, requests.length);

  return (
    <section className="admin-withdrawals-section">
      <div className="admin-section-heading">
        <div>
          <span>{t('admin.withdrawals.queue')}</span>
          <h1>{t('admin.shell.withdrawals')}</h1>
          <p>{t('admin.withdrawals.pendingCount', { count: requests.length })}</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading || reviewing}>{t('admin.withdrawals.refresh')}</button>
      </div>

      {notice && <div className={`admin-action-notice is-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.text}</div>}
      {state === 'loading' && <AdminStateView icon="◌" title={t('admin.withdrawals.loading')} />}
      {state === 'error' && <AdminStateView icon="!" title={t('admin.withdrawals.loadError')} actionLabel={t('admin.withdrawals.refresh')} onAction={() => void refresh()} tone="error" />}
      {state === 'empty' && <AdminStateView icon="✓" title={t('admin.withdrawals.empty')} description={t('admin.withdrawals.emptyText')} />}

      {state === 'ready' && (
        <div className="admin-withdrawal-list">
          {requests.map((request) => {
            const key = requestKey(request);
            return (
              <article key={key} className="admin-withdrawal-card">
                <header>
                  <div><strong>{request.username || t('admin.players.fallbackName')}</strong><small>ID: {request.userTelegramId}</small></div>
                  <span>{t('admin.withdrawals.pending')}</span>
                </header>
                <div className="admin-withdrawal-amounts">
                  <div><span>{t('admin.withdrawals.amountOnix')}</span><strong>{formatOnix(request.amount, language)} ONIX</strong></div>
                  <div><span>{t('admin.withdrawals.eurAmount')}</span><strong>≈ {formatEur(request.eurAmount, language)} €</strong></div>
                </div>
                <dl>
                  <div><dt>{t('admin.withdrawals.createdAt')}</dt><dd>{formatDateTime(request.createdAt, language)}</dd></div>
                  <div><dt>{t('admin.economy.balance')}</dt><dd>{formatOnix(request.userStats?.balance || 0, language)} ONIX</dd></div>
                  <div><dt>{t('admin.players.totalEarned')}</dt><dd>{formatOnix(request.userStats?.totalEarned || 0, language)}</dd></div>
                  <div><dt>{t('admin.players.referrals')}</dt><dd>{formatOnix(request.userStats?.referralsCount || 0, language)}</dd></div>
                </dl>
                <label>
                  <span>{t('admin.withdrawals.commentPlaceholder')}</span>
                  <textarea
                    value={comments[key] || ''}
                    onChange={(event) => setComments((current) => ({ ...current, [key]: event.target.value }))}
                    placeholder={t('admin.withdrawals.commentOptional')}
                    disabled={reviewing}
                  />
                </label>
                <div className="admin-withdrawal-actions">
                  <button type="button" className="is-reject" onClick={() => setPendingReview({ request, action: 'rejected' })} disabled={reviewing}>{t('admin.withdrawals.reject')}</button>
                  <button type="button" className="is-approve" onClick={() => setPendingReview({ request, action: 'approved' })} disabled={reviewing}>{t('admin.withdrawals.approve')}</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ConfirmAdminAction
        language={language}
        open={Boolean(pendingReview)}
        title={t(pendingReview?.action === 'approved' ? 'admin.withdrawals.confirmApproveTitle' : 'admin.withdrawals.confirmRejectTitle')}
        description={pendingReview ? t('admin.withdrawals.confirmDescription', {
          amount: formatOnix(pendingReview.request.amount, language),
          name: pendingReview.request.username || t('admin.players.fallbackName'),
        }) : ''}
        confirmLabel={t(pendingReview?.action === 'approved' ? 'admin.withdrawals.approve' : 'admin.withdrawals.reject')}
        busy={reviewing}
        onCancel={() => setPendingReview(null)}
        onConfirm={() => void confirmReview()}
      />
    </section>
  );
}
