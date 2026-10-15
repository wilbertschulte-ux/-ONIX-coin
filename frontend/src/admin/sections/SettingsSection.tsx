import { useCallback, useEffect, useRef, useState } from 'react';
import { createTranslator, getLanguageLocale, type AppLanguage } from '../../i18n';
import {
  downloadAdminJsonExport,
  downloadAdminUsersCsv,
  loadAdminEconomyConfig,
  loadAdminVersion,
} from '../adminApi';
import {
  acquireAdminMutationLock,
  getAdminSettingsLoadState,
  releaseAdminMutationLock,
  triggerAdminDownload,
  type AdminEconomyConfigResponse,
  type AdminExportKind,
  type AdminVersionResponse,
} from '../adminTypes';
import { ConfirmAdminAction } from '../components/ConfirmAdminAction';
import { AdminStateView } from '../components/AdminStateView';

type SettingsSectionProps = {
  apiBaseUrl: string;
  adminTelegramId: string;
  language: AppLanguage;
};

const activeConfigFields = [
  ['onixEurPer1000', 'admin.settings.config.onixEurPer1000'],
  ['minWithdrawOnix', 'admin.settings.config.minWithdrawOnix'],
  ['referralReward', 'admin.settings.config.referralReward'],
  ['referredUserReward', 'admin.settings.config.referredUserReward'],
  ['welcomeBonus', 'admin.settings.config.welcomeBonus'],
  ['chestCost', 'admin.settings.config.chestCost'],
  ['maxPaidReferralsPerDay', 'admin.settings.config.maxPaidReferralsPerDay'],
  ['maxPaidReferralsPerHour', 'admin.settings.config.maxPaidReferralsPerHour'],
] as const;

const diagnosticConfigFields = [
  ['dailyMissionBaseReward', 'admin.settings.config.dailyMissionBaseReward'],
  ['weeklyMissionBaseReward', 'admin.settings.config.weeklyMissionBaseReward'],
  ['seasonPrizes', 'admin.settings.config.seasonPrizes'],
  ['upgradeBaseCosts', 'admin.settings.config.upgradeBaseCosts'],
  ['perkBaseCosts', 'admin.settings.config.perkBaseCosts'],
] as const;

const formatConfigValue = (value: number | Record<string, number>, language: AppLanguage) => (
  typeof value === 'number'
    ? value.toLocaleString(getLanguageLocale(language), { maximumFractionDigits: 6 })
    : Object.entries(value || {}).map(([key, amount]) => `${key}: ${amount}`).join('\n') || '—'
);

const formatServerTime = (value: number, language: AppLanguage) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(getLanguageLocale(language));
};

export function SettingsSection({ apiBaseUrl, adminTelegramId, language }: SettingsSectionProps) {
  const t = createTranslator(language);
  const [economy, setEconomy] = useState<AdminEconomyConfigResponse | null>(null);
  const [version, setVersion] = useState<AdminVersionResponse | null>(null);
  const [economyLoading, setEconomyLoading] = useState(true);
  const [versionLoading, setVersionLoading] = useState(true);
  const [economyError, setEconomyError] = useState(false);
  const [versionError, setVersionError] = useState(false);
  const [confirmation, setConfirmation] = useState<AdminExportKind | null>(null);
  const [downloading, setDownloading] = useState<AdminExportKind | null>(null);
  const [exportNotice, setExportNotice] = useState<{ kind: AdminExportKind; success: boolean } | null>(null);
  const downloadLock = useRef(false);

  const refreshEconomy = useCallback(async () => {
    setEconomyLoading(true);
    setEconomyError(false);
    try {
      setEconomy(await loadAdminEconomyConfig(apiBaseUrl, adminTelegramId));
    } catch {
      setEconomyError(true);
    } finally {
      setEconomyLoading(false);
    }
  }, [apiBaseUrl, adminTelegramId]);

  const refreshVersion = useCallback(async () => {
    setVersionLoading(true);
    setVersionError(false);
    try {
      setVersion(await loadAdminVersion(apiBaseUrl));
    } catch {
      setVersionError(true);
    } finally {
      setVersionLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    let active = true;
    void loadAdminEconomyConfig(apiBaseUrl, adminTelegramId)
      .then((result) => { if (active) setEconomy(result); })
      .catch(() => { if (active) setEconomyError(true); })
      .finally(() => { if (active) setEconomyLoading(false); });
    void loadAdminVersion(apiBaseUrl)
      .then((result) => { if (active) setVersion(result); })
      .catch(() => { if (active) setVersionError(true); })
      .finally(() => { if (active) setVersionLoading(false); });
    return () => { active = false; };
  }, [apiBaseUrl, adminTelegramId]);

  const confirmDownload = async () => {
    const kind = confirmation;
    if (!kind || !acquireAdminMutationLock(downloadLock)) return;
    setConfirmation(null);
    setDownloading(kind);
    setExportNotice(null);
    try {
      const download = kind === 'json'
        ? await downloadAdminJsonExport(apiBaseUrl, adminTelegramId)
        : await downloadAdminUsersCsv(apiBaseUrl, adminTelegramId);
      triggerAdminDownload(download);
      setExportNotice({ kind, success: true });
    } catch {
      setExportNotice({ kind, success: false });
    } finally {
      setDownloading(null);
      releaseAdminMutationLock(downloadLock);
    }
  };

  const economyState = getAdminSettingsLoadState(economyLoading, economyError);
  const versionState = getAdminSettingsLoadState(versionLoading, versionError);
  const config = economy?.config;
  const overrideEntries = Object.entries(economy?.overrides || {});

  return (
    <section className="admin-settings-section">
      <div className="admin-section-heading">
        <div><span>{t('admin.settings.workspace')}</span><h1>{t('admin.shell.settings')}</h1><p>{t('admin.settings.intro')}</p></div>
      </div>

      <section className="admin-settings-panel" aria-labelledby="admin-settings-config-title">
        <header><div><span>{t('admin.settings.readOnly')}</span><h2 id="admin-settings-config-title">{t('admin.settings.config.title')}</h2></div><button type="button" onClick={() => void refreshEconomy()} disabled={economyLoading}>{t('admin.settings.refresh')}</button></header>
        <p className="admin-settings-runtime-warning">{t('admin.settings.config.runtimeWarning')}</p>
        {economyState === 'loading' && <AdminStateView icon="◌" title={t('admin.settings.config.loading')} />}
        {economyState === 'error' && <AdminStateView icon="!" title={t('admin.settings.config.error')} actionLabel={t('admin.settings.retry')} onAction={() => void refreshEconomy()} tone="error" />}
        {economyState === 'ready' && config && (
          <>
            <h3>{t('admin.settings.config.active')}</h3>
            <div className="admin-settings-value-grid">
              {activeConfigFields.map(([key, labelKey]) => <article key={key}><span>{t(labelKey)}</span><strong>{formatConfigValue(config[key], language)}</strong></article>)}
            </div>
            <h3>{t('admin.settings.config.diagnostic')}</h3>
            <p className="admin-settings-diagnostic-note">{t('admin.settings.config.diagnosticNotice')}</p>
            <div className="admin-settings-value-grid admin-settings-diagnostic-grid">
              {diagnosticConfigFields.map(([key, labelKey]) => <article key={key}><span>{t(labelKey)}</span><pre>{formatConfigValue(config[key] as number | Record<string, number>, language)}</pre></article>)}
            </div>
            <h3>{t('admin.settings.config.overrides')}</h3>
            {overrideEntries.length ? <div className="admin-settings-overrides">{overrideEntries.map(([key, value]) => <article key={key}><span>{key}</span><strong>{formatConfigValue(value, language)}</strong></article>)}</div> : <p className="admin-settings-empty">{t('admin.settings.config.noOverrides')}</p>}
          </>
        )}
      </section>

      <section className="admin-settings-panel" aria-labelledby="admin-settings-exports-title">
        <header><div><span>{t('admin.settings.sensitive')}</span><h2 id="admin-settings-exports-title">{t('admin.settings.exports.title')}</h2></div></header>
        <div className="admin-settings-export-grid">
          <article><div><strong>{t('admin.settings.exports.jsonTitle')}</strong><p>{t('admin.settings.exports.jsonDescription')}</p><small>onix-backup.json · application/json</small></div><button type="button" disabled={downloading !== null} onClick={() => setConfirmation('json')}>{downloading === 'json' ? t('admin.settings.exports.loading') : t('admin.settings.exports.downloadJson')}</button></article>
          <article><div><strong>{t('admin.settings.exports.csvTitle')}</strong><p>{t('admin.settings.exports.csvDescription')}</p><small>onix-users.csv · text/csv</small></div><button type="button" disabled={downloading !== null} onClick={() => setConfirmation('csv')}>{downloading === 'csv' ? t('admin.settings.exports.loading') : t('admin.settings.exports.downloadCsv')}</button></article>
        </div>
        {exportNotice && <p className={exportNotice.success ? 'admin-settings-notice is-success' : 'admin-settings-notice is-error'} role="status">{t(exportNotice.success ? 'admin.settings.exports.success' : 'admin.settings.exports.error', { format: exportNotice.kind.toUpperCase() })}</p>}
      </section>

      <section className="admin-settings-panel" aria-labelledby="admin-settings-system-title">
        <header><div><span>{t('admin.settings.readOnly')}</span><h2 id="admin-settings-system-title">{t('admin.settings.system.title')}</h2></div><button type="button" onClick={() => void refreshVersion()} disabled={versionLoading}>{t('admin.settings.refresh')}</button></header>
        {versionState === 'loading' && <AdminStateView icon="◌" title={t('admin.settings.system.loading')} />}
        {versionState === 'error' && <AdminStateView icon="!" title={t('admin.settings.system.error')} actionLabel={t('admin.settings.retry')} onAction={() => void refreshVersion()} tone="error" />}
        {versionState === 'ready' && version && <dl className="admin-settings-system-grid"><div><dt>{t('admin.settings.system.backendVersion')}</dt><dd>{version.version || '—'}</dd></div><div><dt>{t('admin.settings.system.service')}</dt><dd>{version.service || '—'}</dd></div><div><dt>{t('admin.settings.system.serverTime')}</dt><dd>{formatServerTime(version.time, language)}</dd></div><div><dt>{t('admin.settings.system.frontendVersion')}</dt><dd>{t('admin.settings.system.unavailable')}</dd></div></dl>}
      </section>

      <ConfirmAdminAction
        language={language}
        open={confirmation !== null}
        title={t('admin.settings.exports.confirmTitle')}
        description={t('admin.settings.exports.confirmDescription')}
        confirmLabel={t('admin.settings.exports.confirm')}
        busy={downloading !== null}
        onConfirm={() => void confirmDownload()}
        onCancel={() => setConfirmation(null)}
      />
    </section>
  );
}
