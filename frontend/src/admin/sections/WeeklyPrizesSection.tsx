import { useCallback, useEffect, useRef, useState } from 'react';
import { createTranslator, getLanguageLocale, type AppLanguage } from '../../i18n';
import { awardAdminWeeklyPrizes, loadAdminWeeklyPrizePreview } from '../adminApi';
import {
  getAdminWeeklyPrizeViewState,
  type AdminWeeklyPrizePreviewResponse,
  type AdminWeeklyPrizeWinner,
} from '../adminTypes';
import { AdminStateView } from '../components/AdminStateView';
import { ConfirmAdminAction } from '../components/ConfirmAdminAction';

type WeeklyPrizesSectionProps = {
  apiBaseUrl: string;
  adminTelegramId: string;
  language: AppLanguage;
};

const formatInteger = (value: number | null | undefined, language: AppLanguage) =>
  value === null || value === undefined
    ? '—'
    : Math.trunc(Number(value || 0)).toLocaleString(getLanguageLocale(language));

const formatDateTime = (value: number | string | null, language: AppLanguage) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(getLanguageLocale(language));
};

export function WeeklyPrizesSection({ apiBaseUrl, adminTelegramId, language }: WeeklyPrizesSectionProps) {
  const t = createTranslator(language);
  const [preview, setPreview] = useState<AdminWeeklyPrizePreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [awarding, setAwarding] = useState(false);
  const awardingRef = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setPreview(await loadAdminWeeklyPrizePreview(apiBaseUrl, adminTelegramId));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, adminTelegramId]);

  useEffect(() => {
    let active = true;
    void loadAdminWeeklyPrizePreview(apiBaseUrl, adminTelegramId)
      .then((result) => {
        if (active) setPreview(result);
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

  const confirmAward = async () => {
    if (!preview || preview.alreadyAwarded || preview.preview.length === 0 || awardingRef.current) return;
    awardingRef.current = true;
    setAwarding(true);
    setNotice(null);
    try {
      const result = await awardAdminWeeklyPrizes(apiBaseUrl, adminTelegramId, preview.week);
      setPreview((current) => current ? {
        ...current,
        alreadyAwarded: true,
        awardedWinners: result.winners || [],
        diagnostics: result.diagnostics || current.diagnostics,
      } : current);
      setConfirmOpen(false);
      setNotice({ type: 'success', text: t('admin.prizes.awardSuccess') });
    } catch {
      setConfirmOpen(false);
      setNotice({ type: 'error', text: t('admin.prizes.awardError') });
    } finally {
      awardingRef.current = false;
      setAwarding(false);
    }
  };

  const state = getAdminWeeklyPrizeViewState(loading, error, preview);
  const winners: AdminWeeklyPrizeWinner[] = preview?.alreadyAwarded && preview.awardedWinners.length > 0
    ? preview.awardedWinners
    : preview?.preview || [];
  const diagnostics = preview?.diagnostics;

  if (state === 'loading') {
    return <AdminStateView icon="◌" title={t('admin.prizes.loading')} description={t('admin.prizes.loadingText')} />;
  }

  if (state === 'error') {
    return <AdminStateView icon="!" title={t('admin.prizes.loadError')} actionLabel={t('admin.prizes.refresh')} onAction={() => void refresh()} tone="error" />;
  }

  return (
    <section className="admin-prizes-section">
      <div className="admin-section-heading">
        <div>
          <span>{t('admin.prizes.previewLabel')}</span>
          <h1>{t('admin.shell.prizes')}</h1>
          <p>{t('admin.prizes.targetWeek', { week: preview?.week || '—' })}</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading || awarding}>{t('admin.prizes.refresh')}</button>
      </div>

      {notice && <div className={`admin-action-notice is-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.text}</div>}

      {preview?.alreadyAwarded && (
        <div className="admin-prize-status is-awarded" role="status">
          <strong>{t('admin.prizes.alreadyAwarded')}</strong>
          <span>{t('admin.prizes.awardedAt', { time: formatDateTime(preview.awardedAt, language) })}</span>
        </div>
      )}

      <div className="admin-prize-diagnostics" aria-label={t('admin.prizes.diagnostics')}>
        <div><span>{t('admin.prizes.sourceUsers')}</span><strong>{formatInteger(diagnostics?.sourceUsersCount, language)}</strong></div>
        <div><span>{t('admin.prizes.materializedScores')}</span><strong>{formatInteger(diagnostics?.materializedWeeklyScoreCount, language)}</strong></div>
        <div><span>{t('admin.prizes.eligibleUsers')}</span><strong>{formatInteger(diagnostics?.eligibleCount, language)}</strong></div>
        <div><span>{t('admin.prizes.winnersCount')}</span><strong>{formatInteger(diagnostics?.winnersCount, language)}</strong></div>
      </div>

      {state === 'empty' ? (
        <AdminStateView icon="◇" title={t('admin.prizes.noPlayers')} description={t('admin.prizes.emptyText')} />
      ) : (
        <div className="admin-prize-winners">
          {winners.map((winner) => (
            <article key={`${winner.place}-${winner.telegramId}`} className="admin-prize-winner-card">
              <div className="admin-prize-place">#{winner.place}</div>
              <div className="admin-prize-player">
                <strong>{winner.username || t('admin.players.fallbackName')}</strong>
                <span>ID: {winner.telegramId}</span>
                <small>{t('admin.prizes.weeklyEarned', { amount: formatInteger(winner.weeklyEarned, language) })}</small>
              </div>
              <div className="admin-prize-amount"><span>{t('admin.prizes.prize')}</span><strong>+{formatInteger(winner.prize, language)} ONIX</strong></div>
            </article>
          ))}
        </div>
      )}

      <div className="admin-prize-actions">
        <button
          type="button"
          className="is-award"
          onClick={() => setConfirmOpen(true)}
          disabled={awarding || !preview || preview.alreadyAwarded || preview.preview.length === 0}
        >
          {preview?.alreadyAwarded ? t('admin.prizes.alreadyAwarded') : t('admin.prizes.confirmAction')}
        </button>
      </div>

      <ConfirmAdminAction
        language={language}
        open={confirmOpen}
        title={t('admin.prizes.confirmTitle')}
        description={t('admin.prizes.confirmDescription', { week: preview?.week || '—', count: preview?.preview.length || 0 })}
        confirmLabel={t('admin.prizes.confirmAction')}
        busy={awarding}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void confirmAward()}
      />
    </section>
  );
}
