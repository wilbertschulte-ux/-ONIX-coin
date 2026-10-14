import { useCallback, useEffect, useState } from 'react';
import { createTranslator, type AppLanguage } from '../../i18n';
import { loadAdminHealth } from '../adminApi';
import type { AdminHealthResponse } from '../adminTypes';
import { AdminStateView } from '../components/AdminStateView';

type LaunchChecklistSectionProps = {
  apiBaseUrl: string;
  language: AppLanguage;
};

export function LaunchChecklistSection({ apiBaseUrl, language }: LaunchChecklistSectionProps) {
  const t = createTranslator(language);
  const [health, setHealth] = useState<AdminHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await loadAdminHealth(apiBaseUrl);
      setHealth(result);
      setError(!result.ok);
    } catch {
      setHealth(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    let active = true;

    void loadAdminHealth(apiBaseUrl)
      .then((result) => {
        if (!active) return;
        setHealth(result);
        setError(!result.ok);
      })
      .catch(() => {
        if (!active) return;
        setHealth(null);
        setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [apiBaseUrl]);

  if (loading) {
    return <AdminStateView icon="◌" title={t('admin.launch.loading')} description={t('admin.launch.loadingText')} />;
  }

  const checklist = [
    {
      title: t('admin.launch.backendHealth'),
      description: health?.ok ? t('admin.launch.backendOk', { count: Number(health.users || 0) }) : t('admin.launch.checkRender'),
      ok: Boolean(health?.ok),
    },
    { title: t('admin.launch.telegram'), description: t('admin.launch.telegramText'), ok: false },
    { title: t('admin.launch.wallet'), description: t('admin.launch.walletText'), ok: false },
    { title: t('admin.launch.referrals'), description: t('admin.launch.referralsText'), ok: false },
    { title: t('admin.launch.seasonCron'), description: t('admin.launch.seasonCronText'), ok: false },
    { title: t('admin.launch.antiAbuse'), description: t('admin.launch.antiAbuseText'), ok: false },
  ];

  return (
    <section className="admin-launch-section">
      <div className="admin-section-heading">
        <div>
          <span>{t('admin.shell.systemStatus')}</span>
          <h1>{t('admin.shell.launch')}</h1>
          <p>{t('admin.shell.launchIntro')}</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading}>{t('admin.launch.refresh')}</button>
      </div>
      {error && (
        <div className="admin-inline-error" role="alert">
          <strong>{t('admin.launch.error')}</strong>
          <span>{t('admin.launch.errorText')}</span>
        </div>
      )}
      <div className="admin-checklist">
        {checklist.map((item) => (
          <article key={item.title}>
            <span className={item.ok ? 'is-ok' : ''} aria-hidden="true">{item.ok ? '✓' : '!'}</span>
            <div><strong>{item.title}</strong><p>{item.description}</p></div>
            <em>{item.ok ? t('admin.launch.ok') : t('admin.launch.check')}</em>
          </article>
        ))}
      </div>
    </section>
  );
}
