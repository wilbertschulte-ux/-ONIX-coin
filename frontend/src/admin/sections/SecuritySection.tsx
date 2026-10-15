import { useCallback, useEffect, useRef, useState } from 'react';
import { createTranslator, getLanguageLocale, type AppLanguage } from '../../i18n';
import {
  freezeAdminUser,
  loadAdminFrontendErrors,
  loadAdminSecurityLogs,
  loadAdminSuspiciousUsers,
} from '../adminApi';
import {
  applyAdminFreezeResult,
  getAdminCollectionState,
  type AdminFrontendErrorLog,
  type AdminSecurityLog,
  type AdminSecurityTab,
  type AdminSuspiciousUser,
} from '../adminTypes';
import { ConfirmAdminAction } from '../components/ConfirmAdminAction';
import { AdminStateView } from '../components/AdminStateView';

type SecuritySectionProps = {
  apiBaseUrl: string;
  adminTelegramId: string;
  language: AppLanguage;
};

type PendingFreeze = AdminSuspiciousUser | null;

const formatDateTime = (value: number, language: AppLanguage) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(getLanguageLocale(language));
};

export function SecuritySection({ apiBaseUrl, adminTelegramId, language }: SecuritySectionProps) {
  const t = createTranslator(language);
  const [activeTab, setActiveTab] = useState<AdminSecurityTab>('suspicious');
  const [suspiciousUsers, setSuspiciousUsers] = useState<AdminSuspiciousUser[]>([]);
  const [securityLogs, setSecurityLogs] = useState<AdminSecurityLog[]>([]);
  const [frontendErrors, setFrontendErrors] = useState<AdminFrontendErrorLog[]>([]);
  const [loading, setLoading] = useState<Record<AdminSecurityTab, boolean>>({
    suspicious: true,
    'security-logs': false,
    'frontend-errors': false,
  });
  const [errors, setErrors] = useState<Record<AdminSecurityTab, boolean>>({
    suspicious: false,
    'security-logs': false,
    'frontend-errors': false,
  });
  const [loaded, setLoaded] = useState<Record<AdminSecurityTab, boolean>>({
    suspicious: false,
    'security-logs': false,
    'frontend-errors': false,
  });
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [pendingFreeze, setPendingFreeze] = useState<PendingFreeze>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadTab = useCallback(async (tab: AdminSecurityTab) => {
    setLoading((current) => ({ ...current, [tab]: true }));
    setErrors((current) => ({ ...current, [tab]: false }));
    try {
      if (tab === 'suspicious') {
        const result = await loadAdminSuspiciousUsers(apiBaseUrl, adminTelegramId);
        setSuspiciousUsers(result.users || []);
      } else if (tab === 'security-logs') {
        const result = await loadAdminSecurityLogs(apiBaseUrl, adminTelegramId);
        setSecurityLogs(result.logs || []);
      } else {
        const result = await loadAdminFrontendErrors(apiBaseUrl, adminTelegramId);
        setFrontendErrors(result.logs || []);
      }
      setLoaded((current) => ({ ...current, [tab]: true }));
    } catch {
      setErrors((current) => ({ ...current, [tab]: true }));
    } finally {
      setLoading((current) => ({ ...current, [tab]: false }));
    }
  }, [apiBaseUrl, adminTelegramId]);

  useEffect(() => {
    let active = true;
    void loadAdminSuspiciousUsers(apiBaseUrl, adminTelegramId)
      .then((result) => {
        if (!active) return;
        setSuspiciousUsers(result.users || []);
        setLoaded((current) => ({ ...current, suspicious: true }));
      })
      .catch(() => {
        if (active) setErrors((current) => ({ ...current, suspicious: true }));
      })
      .finally(() => {
        if (active) setLoading((current) => ({ ...current, suspicious: false }));
      });
    return () => {
      active = false;
    };
  }, [apiBaseUrl, adminTelegramId]);

  const selectTab = (tab: AdminSecurityTab) => {
    setActiveTab(tab);
    setNotice(null);
    if (!loaded[tab] && !loading[tab]) void loadTab(tab);
  };

  const confirmFreeze = async () => {
    if (!pendingFreeze || submittingRef.current) return;
    const target = pendingFreeze;
    submittingRef.current = true;
    setSubmitting(true);
    setNotice(null);
    try {
      const result = await freezeAdminUser(
        apiBaseUrl,
        adminTelegramId,
        target,
        reasons[target.telegramId] || ''
      );
      setSuspiciousUsers((current) => applyAdminFreezeResult(current, result.user));
      setPendingFreeze(null);
      setNotice({
        type: 'success',
        text: t(result.user.isFrozen ? 'admin.security.freezeSuccess' : 'admin.security.unfreezeSuccess'),
      });
    } catch {
      setPendingFreeze(null);
      setNotice({ type: 'error', text: t('admin.security.freezeError') });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const itemCount = activeTab === 'suspicious'
    ? suspiciousUsers.length
    : activeTab === 'security-logs'
      ? securityLogs.length
      : frontendErrors.length;
  const state = getAdminCollectionState(loading[activeTab], errors[activeTab], itemCount);
  const emptyKey = activeTab === 'suspicious'
    ? 'admin.security.suspiciousEmpty'
    : activeTab === 'security-logs'
      ? 'admin.security.logsEmpty'
      : 'admin.security.frontendErrorsEmpty';

  return (
    <section className="admin-security-section">
      <div className="admin-section-heading">
        <div>
          <span>{t('admin.security.workspace')}</span>
          <h1>{t('admin.shell.security')}</h1>
          <p>{t('admin.security.intro')}</p>
        </div>
        <button type="button" onClick={() => void loadTab(activeTab)} disabled={loading[activeTab] || submitting}>
          {t('admin.security.refresh')}
        </button>
      </div>

      <div className="admin-security-tabs" role="tablist" aria-label={t('admin.security.tabs')}>
        {([
          ['suspicious', 'admin.security.suspiciousTab'],
          ['security-logs', 'admin.security.logsTab'],
          ['frontend-errors', 'admin.security.frontendErrorsTab'],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={activeTab === tab ? 'is-active' : ''}
            onClick={() => selectTab(tab)}
          >
            {t(label)}
          </button>
        ))}
      </div>

      {notice && <div className={`admin-action-notice is-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.text}</div>}
      {state === 'loading' && <AdminStateView icon="◌" title={t('admin.security.loading')} />}
      {state === 'error' && (
        <AdminStateView
          icon="!"
          title={t('admin.security.loadError')}
          actionLabel={t('admin.security.retry')}
          onAction={() => void loadTab(activeTab)}
          tone="error"
        />
      )}
      {state === 'empty' && <AdminStateView icon="✓" title={t(emptyKey)} />}

      {state === 'ready' && activeTab === 'suspicious' && (
        <div className="admin-security-card-list">
          {suspiciousUsers.map((user) => (
            <article key={user.telegramId} className="admin-security-card">
              <header>
                <div><strong>{user.username || t('admin.players.fallbackName')}</strong><small>ID: {user.telegramId}</small></div>
                <span className={user.isFrozen ? 'is-frozen' : 'is-suspicious'}>{t(user.isFrozen ? 'admin.security.frozen' : 'admin.security.suspicious')}</span>
              </header>
              <div className="admin-security-reasons">
                <strong>{t('admin.security.reasons')}</strong>
                {user.suspiciousReasons?.length
                  ? <ul>{user.suspiciousReasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}</ul>
                  : <p>—</p>}
              </div>
              {user.isFrozen && user.frozenReason && <p className="admin-security-frozen-reason">{user.frozenReason}</p>}
              {!user.isFrozen && (
                <label>
                  <span>{t('admin.security.freezeReason')}</span>
                  <textarea
                    value={reasons[user.telegramId] || ''}
                    onChange={(event) => setReasons((current) => ({ ...current, [user.telegramId]: event.target.value }))}
                    placeholder={t('admin.security.freezeReasonPlaceholder')}
                  />
                </label>
              )}
              <button type="button" className={user.isFrozen ? 'admin-security-unfreeze' : 'admin-security-freeze'} onClick={() => setPendingFreeze(user)} disabled={submitting}>
                {t(user.isFrozen ? 'admin.security.unfreeze' : 'admin.security.freeze')}
              </button>
            </article>
          ))}
        </div>
      )}

      {state === 'ready' && activeTab === 'security-logs' && (
        <div className="admin-security-card-list">
          {securityLogs.map((log, index) => (
            <article key={`${log.telegramId}-${log.createdAt}-${index}`} className="admin-security-card admin-log-card">
              <header><div><strong>{log.username || t('admin.players.fallbackName')}</strong><small>ID: {log.telegramId}</small></div><span>{log.type || 'info'}</span></header>
              <time>{formatDateTime(log.createdAt, language)}</time>
              <h2>{log.title || '—'}</h2>
              <details><summary>{t('admin.security.showDetails')}</summary><p>{log.details || '—'}</p></details>
            </article>
          ))}
        </div>
      )}

      {state === 'ready' && activeTab === 'frontend-errors' && (
        <div className="admin-security-card-list">
          {frontendErrors.map((error, index) => (
            <article key={`${error.telegramId}-${error.createdAt}-${index}`} className="admin-security-card admin-error-card">
              <header><div><strong>{error.username || t('admin.players.fallbackName')}</strong><small>ID: {error.telegramId}</small></div><span>v{error.appVersion || '—'}</span></header>
              <time>{formatDateTime(error.createdAt, language)}</time>
              <h2>{error.message || '—'}</h2>
              {error.stack && <details><summary>{t('admin.security.showStack')}</summary><pre>{error.stack}</pre></details>}
            </article>
          ))}
        </div>
      )}

      <ConfirmAdminAction
        language={language}
        open={Boolean(pendingFreeze)}
        title={t(pendingFreeze?.isFrozen ? 'admin.security.confirmUnfreezeTitle' : 'admin.security.confirmFreezeTitle')}
        description={t('admin.security.confirmDescription', { name: pendingFreeze?.username || pendingFreeze?.telegramId || '—' })}
        confirmLabel={t(pendingFreeze?.isFrozen ? 'admin.security.unfreeze' : 'admin.security.freeze')}
        busy={submitting}
        onCancel={() => setPendingFreeze(null)}
        onConfirm={() => void confirmFreeze()}
      />
    </section>
  );
}
