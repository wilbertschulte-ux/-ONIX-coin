import { useCallback, useEffect, useState } from 'react';
import { createTranslator, getLanguageLocale, type AppLanguage } from '../../i18n';
import { loadAdminEconomyDashboard, loadAdminOperations } from '../adminApi';
import {
  getAdminEconomyMetricGroups,
  getAdminEconomyViewState,
  getAdminOperationPreview,
  getAdminOperationsViewState,
  type AdminEconomyDashboardResponse,
  type AdminEconomyMetricUnit,
  type AdminOperationsResponse,
} from '../adminTypes';
import { AdminStateView } from '../components/AdminStateView';

type EconomySectionProps = {
  apiBaseUrl: string;
  adminTelegramId: string;
  language: AppLanguage;
};

const formatValue = (value: number, unit: AdminEconomyMetricUnit, language: AppLanguage) => {
  const formatted = Number(value || 0).toLocaleString(getLanguageLocale(language), {
    maximumFractionDigits: unit === 'count' ? 0 : 2,
  });
  return unit === 'onix' ? `${formatted} ONIX` : unit === 'eur' ? `${formatted} EUR` : formatted;
};

const formatDateTime = (value: number | null | undefined, language: AppLanguage) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(getLanguageLocale(language));
};

export function EconomySection({ apiBaseUrl, adminTelegramId, language }: EconomySectionProps) {
  const t = createTranslator(language);
  const [dashboard, setDashboard] = useState<AdminEconomyDashboardResponse | null>(null);
  const [operations, setOperations] = useState<AdminOperationsResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [operationsLoading, setOperationsLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState(false);
  const [operationsError, setOperationsError] = useState(false);

  const refreshDashboard = useCallback(async () => {
    setDashboardLoading(true);
    setDashboardError(false);
    try {
      setDashboard(await loadAdminEconomyDashboard(apiBaseUrl, adminTelegramId));
    } catch {
      setDashboardError(true);
    } finally {
      setDashboardLoading(false);
    }
  }, [apiBaseUrl, adminTelegramId]);

  const refreshOperations = useCallback(async () => {
    setOperationsLoading(true);
    setOperationsError(false);
    try {
      setOperations(await loadAdminOperations(apiBaseUrl, adminTelegramId));
    } catch {
      setOperationsError(true);
    } finally {
      setOperationsLoading(false);
    }
  }, [apiBaseUrl, adminTelegramId]);

  useEffect(() => {
    let active = true;
    void loadAdminEconomyDashboard(apiBaseUrl, adminTelegramId)
      .then((result) => { if (active) setDashboard(result); })
      .catch(() => { if (active) setDashboardError(true); })
      .finally(() => { if (active) setDashboardLoading(false); });
    void loadAdminOperations(apiBaseUrl, adminTelegramId)
      .then((result) => { if (active) setOperations(result); })
      .catch(() => { if (active) setOperationsError(true); })
      .finally(() => { if (active) setOperationsLoading(false); });
    return () => { active = false; };
  }, [apiBaseUrl, adminTelegramId]);

  const dashboardState = getAdminEconomyViewState(dashboardLoading, dashboardError, dashboard);
  const operationsState = getAdminOperationsViewState(operationsLoading, operationsError, operations);
  const operationPreview = operations ? getAdminOperationPreview(operations) : null;

  return (
    <section className="admin-economy-section">
      <div className="admin-section-heading">
        <div><span>{t('admin.economy.workspace')}</span><h1>{t('admin.shell.economy')}</h1><p>{t('admin.economy.intro')}</p></div>
        <button type="button" onClick={() => { void refreshDashboard(); void refreshOperations(); }} disabled={dashboardLoading || operationsLoading}>{t('admin.economy.refreshAll')}</button>
      </div>

      <section className="admin-economy-panel" aria-labelledby="admin-economy-dashboard-title">
        <header><div><span>{t('admin.economy.readOnly')}</span><h2 id="admin-economy-dashboard-title">{t('admin.economy.dashboard')}</h2></div><button type="button" onClick={() => void refreshDashboard()} disabled={dashboardLoading}>{t('admin.economy.refresh')}</button></header>
        {dashboardState === 'loading' && <AdminStateView icon="◌" title={t('admin.economy.loading')} />}
        {dashboardState === 'error' && <AdminStateView icon="!" title={t('admin.economy.loadError')} actionLabel={t('admin.economy.retry')} onAction={() => void refreshDashboard()} tone="error" />}
        {dashboardState === 'empty' && <AdminStateView icon="◇" title={t('admin.economy.empty')} />}
        {dashboardState === 'ready' && dashboard && (
          <>
            <div className="admin-economy-groups">
              {getAdminEconomyMetricGroups(dashboard).map((group) => <section key={group.id} className="admin-economy-metric-group"><h3>{t(group.titleKey)}</h3><div className="admin-economy-metrics">{group.metrics.map((metric) => <article key={metric.key}><span>{t(metric.labelKey)}</span><strong>{formatValue(metric.value, metric.unit, language)}</strong></article>)}</div></section>)}
            </div>
            <section className="admin-transaction-types"><header><h3>{t('admin.economy.transactionTypes')}</h3><span>{dashboard.transactionTypes.length}</span></header>{dashboard.transactionTypes.length ? <div>{dashboard.transactionTypes.map((item) => <article key={item.type}><div><strong>{item.type}</strong><small>{t('admin.economy.transactionTypeCount', { count: item.count })}</small></div><b className={item.amount < 0 ? 'is-negative' : 'is-positive'}>{item.amount > 0 ? '+' : ''}{formatValue(item.amount, 'onix', language)}</b></article>)}</div> : <p>{t('admin.economy.transactionTypesEmpty')}</p>}</section>
          </>
        )}
      </section>

      <section className="admin-economy-panel" aria-labelledby="admin-operations-title">
        <header><div><span>{t('admin.economy.readOnly')}</span><h2 id="admin-operations-title">{t('admin.operations.title')}</h2></div><button type="button" onClick={() => void refreshOperations()} disabled={operationsLoading}>{t('admin.operations.refresh')}</button></header>
        {operationsState === 'loading' && <AdminStateView icon="◌" title={t('admin.operations.loading')} />}
        {operationsState === 'error' && <AdminStateView icon="!" title={t('admin.operations.error')} actionLabel={t('admin.operations.retry')} onAction={() => void refreshOperations()} tone="error" />}
        {operationsState === 'empty' && <AdminStateView icon="◇" title={t('admin.operations.empty')} />}
        {operationsState === 'ready' && operationPreview && (
          <div className="admin-operations-grid">
            <section><header><h3>{t('admin.operations.withdrawals')}</h3><span>{operationPreview.withdrawalTotal}</span></header><p className="admin-operation-limit">{t('admin.operations.latest', { count: operationPreview.withdrawals.length, total: operationPreview.withdrawalTotal })}</p><div className="admin-operation-list">{operationPreview.withdrawals.map((item, index) => <article key={`${item.telegramId}-${item.createdAt}-${index}`}><header><div><strong>{item.username || t('admin.players.fallbackName')}</strong><small>ID: {item.telegramId}</small></div><b>{formatValue(item.amount, 'onix', language)}</b></header><dl><div><dt>{t('admin.operations.status')}</dt><dd>{item.status || '—'}</dd></div><div><dt>{t('admin.operations.eurAmount')}</dt><dd>{formatValue(item.eurAmount, 'eur', language)}</dd></div></dl>{item.adminComment && <p>{item.adminComment}</p>}<time>{formatDateTime(item.createdAt, language)}</time></article>)}</div></section>
            <section><header><h3>{t('admin.operations.transactions')}</h3><span>{operationPreview.transactionTotal}</span></header><p className="admin-operation-limit">{t('admin.operations.latest', { count: operationPreview.transactions.length, total: operationPreview.transactionTotal })}</p><div className="admin-operation-list">{operationPreview.transactions.map((item, index) => <article key={`${item.telegramId}-${item.createdAt}-${item.type}-${index}`}><header><div><strong>{item.username || t('admin.players.fallbackName')}</strong><small>ID: {item.telegramId}</small></div><b className={item.amount < 0 ? 'is-negative' : 'is-positive'}>{item.amount > 0 ? '+' : ''}{formatValue(item.amount, 'onix', language)}</b></header><dl><div><dt>{t('admin.operations.type')}</dt><dd>{item.type || '—'}</dd></div><div><dt>{t('admin.operations.status')}</dt><dd>{item.status || '—'}</dd></div></dl><p>{item.title || '—'}</p><time>{formatDateTime(item.createdAt, language)}</time></article>)}</div></section>
          </div>
        )}
      </section>
    </section>
  );
}
