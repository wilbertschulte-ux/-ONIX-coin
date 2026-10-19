import { useCallback, useEffect, useState } from 'react';
import { createTranslator, getLanguageLocale, type AppLanguage, type MessageKey } from '../../i18n';
import { loadAdminAnalyticsDashboard } from '../adminApi';
import {
  EMPTY_ADMIN_ANALYTICS_FILTERS,
  getAdminAnalyticsViewState,
  type AdminAnalyticsDashboardResponse,
  type AdminAnalyticsEventName,
  type AdminAnalyticsFilters,
} from '../adminTypes';
import { AdminStateView } from '../components/AdminStateView';

type AnalyticsSectionProps = {
  apiBaseUrl: string;
  adminTelegramId: string;
  language: AppLanguage;
};

const eventLabelKeys = {
  landing: 'admin.analytics.event.landing',
  start: 'admin.analytics.event.start',
  active: 'admin.analytics.event.active',
  first_tap: 'admin.analytics.event.firstTap',
  first_task: 'admin.analytics.event.firstTask',
  promo_used: 'admin.analytics.event.promoUsed',
  referral: 'admin.analytics.event.referral',
  withdrawal: 'admin.analytics.event.withdrawal',
} as const satisfies Record<AdminAnalyticsEventName, MessageKey>;

const campaignMetrics = [
  ['users', 'admin.analytics.users'],
  ['active', 'admin.analytics.event.active'],
  ['firstTap', 'admin.analytics.event.firstTap'],
  ['firstTask', 'admin.analytics.event.firstTask'],
  ['promoUsed', 'admin.analytics.event.promoUsed'],
  ['referral', 'admin.analytics.event.referral'],
  ['withdrawal', 'admin.analytics.event.withdrawal'],
] as const;

const formatCount = (value: number, language: AppLanguage) => Number(value || 0).toLocaleString(getLanguageLocale(language), { maximumFractionDigits: 0 });
const formatPercent = (value: number, language: AppLanguage) => `${Number(value || 0).toLocaleString(getLanguageLocale(language), { maximumFractionDigits: 2 })}%`;

export function AnalyticsSection({ apiBaseUrl, adminTelegramId, language }: AnalyticsSectionProps) {
  const t = createTranslator(language);
  const [filters, setFilters] = useState<AdminAnalyticsFilters>({ ...EMPTY_ADMIN_ANALYTICS_FILTERS });
  const [dashboard, setDashboard] = useState<AdminAnalyticsDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadDashboard = useCallback(async (requestedFilters: AdminAnalyticsFilters) => {
    setLoading(true);
    setError(false);
    try {
      setDashboard(await loadAdminAnalyticsDashboard(apiBaseUrl, adminTelegramId, requestedFilters));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, adminTelegramId]);

  useEffect(() => {
    let active = true;
    void loadAdminAnalyticsDashboard(apiBaseUrl, adminTelegramId, EMPTY_ADMIN_ANALYTICS_FILTERS)
      .then((result) => { if (active) setDashboard(result); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [apiBaseUrl, adminTelegramId]);

  const viewState = getAdminAnalyticsViewState(loading, error, dashboard);
  const updateFilter = (key: keyof AdminAnalyticsFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="admin-analytics-section">
      <div className="admin-section-heading">
        <div><span>{t('admin.analytics.workspace')}</span><h1>{t('admin.shell.analytics')}</h1><p>{t('admin.analytics.intro')}</p></div>
      </div>

      <section className="admin-analytics-panel" aria-labelledby="admin-analytics-filters-title">
        <header><div><span>{t('admin.analytics.readOnly')}</span><h2 id="admin-analytics-filters-title">{t('admin.analytics.filters')}</h2></div></header>
        <div className="admin-analytics-filters">
          <label><span>{t('admin.analytics.from')}</span><input type="date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} /></label>
          <label><span>{t('admin.analytics.to')}</span><input type="date" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} /></label>
          <label><span>{t('admin.analytics.campaign')}</span><input value={filters.campaign} onChange={(event) => updateFilter('campaign', event.target.value)} placeholder={t('admin.analytics.all')} /></label>
          <label><span>{t('admin.analytics.source')}</span><input value={filters.source} onChange={(event) => updateFilter('source', event.target.value)} placeholder={t('admin.analytics.all')} /></label>
          <label><span>{t('admin.analytics.market')}</span><input value={filters.market} onChange={(event) => updateFilter('market', event.target.value)} placeholder={t('admin.analytics.all')} /></label>
        </div>
        <p className="admin-analytics-period-hint">{t('admin.analytics.periodHint')}</p>
        <button type="button" onClick={() => void loadDashboard(filters)} disabled={loading}>{t('admin.analytics.apply')}</button>
      </section>

      {viewState === 'loading' && <AdminStateView icon="◌" title={t('admin.analytics.loading')} />}
      {viewState === 'error' && <AdminStateView icon="!" title={t('admin.analytics.error')} actionLabel={t('admin.analytics.retry')} onAction={() => void loadDashboard(filters)} tone="error" />}
      {viewState === 'empty' && <AdminStateView icon="◇" title={t('admin.analytics.empty')} actionLabel={t('admin.analytics.retry')} onAction={() => void loadDashboard(filters)} />}
      {viewState === 'ready' && dashboard && (
        <div className="admin-analytics-results">
          <section className="admin-analytics-totals" aria-label={t('admin.analytics.summary')}>
            <article><span>{t('admin.analytics.totalEvents')}</span><strong>{formatCount(dashboard.totals.events, language)}</strong></article>
            <article><span>{t('admin.analytics.uniqueUsers')}</span><strong>{formatCount(dashboard.totals.users, language)}</strong></article>
          </section>

          <section className="admin-analytics-panel" aria-labelledby="admin-analytics-funnel-title">
            <header><div><span>{t('admin.analytics.uniqueUsers')}</span><h2 id="admin-analytics-funnel-title">{t('admin.analytics.funnel')}</h2></div></header>
            <div className="admin-analytics-funnel">
              {dashboard.funnel.map((item) => <article key={item.event}><div><strong>{t(eventLabelKeys[item.event])}</strong><small>{t('admin.analytics.eventCount', { count: formatCount(item.events, language) })}</small></div><b>{formatCount(item.users, language)}</b></article>)}
            </div>
          </section>

          <section className="admin-analytics-panel" aria-labelledby="admin-analytics-cohort-title">
            <header><div><span>{t('admin.analytics.startCohort', { count: formatCount(dashboard.cohortFunnel.cohortUsers, language) })}</span><h2 id="admin-analytics-cohort-title">{t('admin.analytics.cohortFunnel')}</h2></div></header>
            <p className="admin-analytics-period-hint">{t('admin.analytics.cohortLimitation')}</p>
            <div className="admin-analytics-funnel">
              {dashboard.cohortFunnel.stages.map((stage) => (
                <article key={stage.event}>
                  <div>
                    <strong>{t(eventLabelKeys[stage.event])}</strong>
                    <small>{t('admin.analytics.cohortConversion', {
                      cohort: formatPercent(stage.conversionFromCohort, language),
                      previous: formatPercent(stage.conversionFromPrevious, language),
                    })}</small>
                  </div>
                  <b>{formatCount(stage.users, language)}</b>
                </article>
              ))}
            </div>
          </section>

          <section className="admin-analytics-panel" aria-labelledby="admin-analytics-retention-title">
            <header><div><span>{t('admin.analytics.utcCalendar')}</span><h2 id="admin-analytics-retention-title">{t('admin.analytics.retention')}</h2></div></header>
            <div className="admin-analytics-totals">
              <article><span>{t('admin.analytics.cohortUsers')}</span><strong>{formatCount(dashboard.retention.cohortUsers, language)}</strong></article>
              <article><span>{t('admin.analytics.d1')}</span><strong>{formatPercent(dashboard.retention.d1Rate, language)}</strong><small>{t('admin.analytics.retainedUsers', { count: formatCount(dashboard.retention.d1Users, language) })}</small></article>
              <article><span>{t('admin.analytics.d7')}</span><strong>{formatPercent(dashboard.retention.d7Rate, language)}</strong><small>{t('admin.analytics.retainedUsers', { count: formatCount(dashboard.retention.d7Users, language) })}</small></article>
            </div>
          </section>

          <section className="admin-analytics-panel" aria-labelledby="admin-analytics-campaigns-title">
            <header><div><span>{dashboard.campaigns.length}</span><h2 id="admin-analytics-campaigns-title">{t('admin.analytics.campaignComparison')}</h2></div></header>
            {dashboard.campaigns.length ? <div className="admin-analytics-campaigns">{dashboard.campaigns.map((campaign, index) => <article key={`${campaign.campaign}-${index}`}><h3>{campaign.campaign || '—'}</h3><dl>{campaignMetrics.map(([key, labelKey]) => <div key={key}><dt>{t(labelKey)}</dt><dd>{formatCount(campaign[key], language)}</dd></div>)}</dl></article>)}</div> : <p className="admin-analytics-empty">{t('admin.analytics.campaignsEmpty')}</p>}
          </section>
        </div>
      )}
    </section>
  );
}
