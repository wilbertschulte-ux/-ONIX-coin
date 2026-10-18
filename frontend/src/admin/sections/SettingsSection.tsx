import { useCallback, useEffect, useRef, useState } from 'react';
import { createTranslator, getLanguageLocale, type AppLanguage } from '../../i18n';
import {
  downloadAdminJsonExport,
  downloadAdminUsersCsv,
  loadAdminEconomyConfig,
  loadAdminVersion,
  updateAdminEconomyConfig,
} from '../adminApi';
import {
  acquireAdminMutationLock,
  createAdminEconomyConfigDraft,
  getAdminEconomyConfigUpdate,
  getAdminSettingsLoadState,
  releaseAdminMutationLock,
  triggerAdminDownload,
  type AdminEconomyConfigDraft,
  type AdminEconomyConfigEditableKey,
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
  const configLock = useRef(false);
  const [configDraft, setConfigDraft] = useState<AdminEconomyConfigDraft | null>(null);
  const [savedConfigDraft, setSavedConfigDraft] = useState<AdminEconomyConfigDraft | null>(null);
  const [configConfirmation, setConfigConfirmation] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configNotice, setConfigNotice] = useState<'success' | 'error' | 'required' | 'invalid' | null>(null);

  const synchronizeEconomy = useCallback((result: AdminEconomyConfigResponse) => {
    const draft = createAdminEconomyConfigDraft(result.config);
    setEconomy(result);
    setConfigDraft(draft);
    setSavedConfigDraft(draft);
  }, []);

  const refreshEconomy = useCallback(async () => {
    setEconomyLoading(true);
    setEconomyError(false);
    try {
      synchronizeEconomy(await loadAdminEconomyConfig(apiBaseUrl, adminTelegramId));
      setConfigNotice(null);
    } catch {
      setEconomyError(true);
    } finally {
      setEconomyLoading(false);
    }
  }, [apiBaseUrl, adminTelegramId, synchronizeEconomy]);

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
      .then((result) => { if (active) synchronizeEconomy(result); })
      .catch(() => { if (active) setEconomyError(true); })
      .finally(() => { if (active) setEconomyLoading(false); });
    void loadAdminVersion(apiBaseUrl)
      .then((result) => { if (active) setVersion(result); })
      .catch(() => { if (active) setVersionError(true); })
      .finally(() => { if (active) setVersionLoading(false); });
    return () => { active = false; };
  }, [apiBaseUrl, adminTelegramId, synchronizeEconomy]);

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

  const configUpdate = configDraft && savedConfigDraft
    ? getAdminEconomyConfigUpdate(configDraft, savedConfigDraft)
    : { changedKeys: [], updates: {}, error: null };

  const requestConfigSave = () => {
    if (configUpdate.changedKeys.length === 0) return;
    if (configUpdate.error) {
      setConfigNotice(configUpdate.error);
      return;
    }
    setConfigNotice(null);
    setConfigConfirmation(true);
  };

  const confirmConfigSave = async () => {
    if (!configDraft || !savedConfigDraft || !acquireAdminMutationLock(configLock)) return;
    const update = getAdminEconomyConfigUpdate(configDraft, savedConfigDraft);
    if (update.changedKeys.length === 0 || update.error) {
      setConfigConfirmation(false);
      setConfigNotice(update.error);
      releaseAdminMutationLock(configLock);
      return;
    }
    setConfigSaving(true);
    setConfigNotice(null);
    try {
      await updateAdminEconomyConfig(apiBaseUrl, adminTelegramId, update.updates);
      synchronizeEconomy(await loadAdminEconomyConfig(apiBaseUrl, adminTelegramId));
      setConfigConfirmation(false);
      setConfigNotice('success');
    } catch {
      setConfigConfirmation(false);
      setConfigNotice('error');
    } finally {
      setConfigSaving(false);
      releaseAdminMutationLock(configLock);
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
        <header><div><span>{t('admin.settings.config.runtime')}</span><h2 id="admin-settings-config-title">{t('admin.settings.config.title')}</h2></div><button type="button" onClick={() => void refreshEconomy()} disabled={economyLoading || configSaving}>{t('admin.settings.refresh')}</button></header>
        <p className="admin-settings-runtime-warning">{t('admin.settings.config.runtimeWarning')}</p>
        {economyState === 'loading' && <AdminStateView icon="◌" title={t('admin.settings.config.loading')} />}
        {economyState === 'error' && <AdminStateView icon="!" title={t('admin.settings.config.error')} actionLabel={t('admin.settings.retry')} onAction={() => void refreshEconomy()} tone="error" />}
        {economyState === 'ready' && config && (
          <>
            <h3>{t('admin.settings.config.active')}</h3>
            {configDraft && <div className="admin-settings-config-form">
              {activeConfigFields.map(([key, labelKey]) => <label key={key}><span>{t(labelKey)}</span><input type="number" min="0" step="any" value={configDraft[key]} disabled={configSaving} onChange={(event) => setConfigDraft((current) => current ? { ...current, [key as AdminEconomyConfigEditableKey]: event.target.value } : current)} /></label>)}
            </div>}
            <div className="admin-settings-config-actions">
              <button type="button" disabled={configSaving || configUpdate.changedKeys.length === 0} onClick={() => { if (savedConfigDraft) setConfigDraft({ ...savedConfigDraft }); setConfigNotice(null); }}>{t('admin.settings.config.cancel')}</button>
              <button type="button" disabled={configSaving || configUpdate.changedKeys.length === 0} onClick={requestConfigSave}>{configSaving ? t('admin.settings.config.saving') : t('admin.settings.config.save')}</button>
            </div>
            {configUpdate.changedKeys.length > 0 && <p className="admin-settings-dirty" role="status">{t('admin.settings.config.unsaved', { count: configUpdate.changedKeys.length })}</p>}
            {configNotice && <p className={`admin-settings-notice is-${configNotice === 'success' ? 'success' : 'error'}`} role={configNotice === 'success' ? 'status' : 'alert'}>{t(configNotice === 'success' ? 'admin.settings.config.saveSuccess' : configNotice === 'required' ? 'admin.settings.config.valueRequired' : configNotice === 'invalid' ? 'admin.settings.config.invalidValue' : 'admin.settings.config.saveError')}</p>}
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
      <ConfirmAdminAction
        language={language}
        open={configConfirmation}
        title={t('admin.settings.config.confirmTitle')}
        description={t('admin.settings.config.confirmDescription', { count: configUpdate.changedKeys.length })}
        confirmLabel={t('admin.settings.config.confirm')}
        busy={configSaving}
        onConfirm={() => void confirmConfigSave()}
        onCancel={() => setConfigConfirmation(false)}
      />
    </section>
  );
}
