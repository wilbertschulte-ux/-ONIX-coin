import { useEffect, useState } from 'react';
import { createTranslator, getLanguageLocale, type AppLanguage } from '../../i18n';
import { loadAdminUserProfile, searchAdminUsers } from '../adminApi';
import {
  getAdminCollectionState,
  type AdminUserProfile,
  type AdminUserSummary,
} from '../adminTypes';
import { AdminStateView } from '../components/AdminStateView';

type UsersSectionProps = {
  apiBaseUrl: string;
  adminTelegramId: string;
  language: AppLanguage;
};

const formatInteger = (value: number | undefined, language: AppLanguage) =>
  Math.trunc(Number(value || 0)).toLocaleString(getLanguageLocale(language));

const formatDate = (value: string | number | null | undefined, language: AppLanguage, withTime = false) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return withTime ? date.toLocaleString(getLanguageLocale(language)) : date.toLocaleDateString(getLanguageLocale(language));
};

export function UsersSection({ apiBaseUrl, adminTelegramId, language }: UsersSectionProps) {
  const t = createTranslator(language);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(false);

  useEffect(() => {
    let active = true;
    void searchAdminUsers(apiBaseUrl, adminTelegramId, '', 1)
      .then((result) => {
        if (!active) return;
        setUsers(result.users || []);
        setPage(Number(result.pagination?.page || 1));
        setTotal(Number(result.pagination?.total || 0));
        setTotalPages(Number(result.pagination?.totalPages || 1));
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

  const loadPage = async (targetPage: number, targetQuery = query) => {
    setLoading(true);
    setError(false);
    setSelectedUser(null);
    try {
      const result = await searchAdminUsers(apiBaseUrl, adminTelegramId, targetQuery, targetPage);
      setUsers(result.users || []);
      setPage(Number(result.pagination?.page || targetPage));
      setTotal(Number(result.pagination?.total || 0));
      setTotalPages(Number(result.pagination?.totalPages || 1));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const openProfile = async (user: AdminUserSummary) => {
    setProfileLoading(true);
    setProfileError(false);
    setSelectedUser(null);
    try {
      const profile = await loadAdminUserProfile(apiBaseUrl, adminTelegramId, user.telegramId);
      setSelectedUser({ ...user, ...profile });
    } catch {
      setProfileError(true);
    } finally {
      setProfileLoading(false);
    }
  };

  const listState = getAdminCollectionState(loading, error, users.length);

  const profileContent = profileLoading ? (
    <AdminStateView icon="◌" title={t('admin.players.profileLoading')} />
  ) : profileError ? (
    <AdminStateView
      icon="!"
      title={t('admin.players.profileError')}
      actionLabel={t('admin.players.backToList')}
      onAction={() => setProfileError(false)}
      tone="error"
    />
  ) : selectedUser ? (
    <article className="admin-user-detail">
      <button type="button" className="admin-back-button" onClick={() => setSelectedUser(null)}>{t('admin.players.backToList')}</button>
      <header className="admin-user-detail-head">
        {selectedUser.photoUrl ? <img src={selectedUser.photoUrl} alt="" /> : <span aria-hidden="true">👤</span>}
        <div>
          <h2>{selectedUser.displayName || selectedUser.username || t('admin.players.fallbackName')}</h2>
          <p>{selectedUser.telegramUsername ? `@${selectedUser.telegramUsername.replace(/^@+/, '')}` : t('admin.players.noUsername')}</p>
          <small>ID: {selectedUser.telegramId}</small>
        </div>
        <em className={selectedUser.isFrozen ? 'is-blocked' : selectedUser.isSuspicious ? 'is-suspicious' : 'is-active'}>
          {t(selectedUser.isFrozen ? 'admin.players.blocked' : selectedUser.isSuspicious ? 'admin.players.suspicious' : 'admin.players.active')}
        </em>
      </header>

      <div className="admin-user-metrics">
        <div><span>{t('admin.economy.balance')}</span><strong>{formatInteger(selectedUser.balance, language)} ONIX</strong></div>
        <div><span>{t('admin.players.totalEarned')}</span><strong>{formatInteger(selectedUser.totalEarned, language)}</strong></div>
        <div><span>{t('admin.players.weeklyEarned')}</span><strong>{formatInteger(selectedUser.weeklyEarned, language)}</strong></div>
        <div><span>{t('admin.players.levelLabel')}</span><strong>{formatInteger(selectedUser.level, language)}</strong></div>
      </div>

      <section className="admin-user-info-card">
        <h3>{t('admin.players.activity')}</h3>
        <dl>
          <div><dt>{t('admin.players.registered')}</dt><dd>{formatDate(selectedUser.createdAt, language, true)}</dd></div>
          <div><dt>{t('admin.players.lastActivity')}</dt><dd>{formatDate(selectedUser.lastTapAt || selectedUser.updatedAt, language, true)}</dd></div>
          <div><dt>{t('admin.players.totalTaps')}</dt><dd>{formatInteger(selectedUser.totalTaps, language)}</dd></div>
          <div><dt>{t('admin.players.upgradesBought')}</dt><dd>{formatInteger(selectedUser.totalUpgradesBought, language)}</dd></div>
        </dl>
      </section>

      <section className="admin-user-info-card">
        <h3>{t('admin.players.referralInfo')}</h3>
        <dl>
          <div><dt>{t('admin.players.referrals')}</dt><dd>{formatInteger(selectedUser.referralsCount, language)}</dd></div>
          <div><dt>{t('admin.players.withdrawalRequests')}</dt><dd>{formatInteger(selectedUser.withdrawalRequestsCount, language)}</dd></div>
          <div><dt>{t('admin.players.promoCodes')}</dt><dd>{formatInteger(selectedUser.usedPromoCodesCount, language)}</dd></div>
          <div><dt>{t('admin.players.language')}</dt><dd>{selectedUser.languageCode || '—'}</dd></div>
        </dl>
      </section>

      {selectedUser.telegramProfileUrl && (
        <a className="admin-link-button" href={selectedUser.telegramProfileUrl} target="_blank" rel="noreferrer">
          {t('admin.players.openTelegram')}
        </a>
      )}
    </article>
  ) : (
    <AdminStateView icon="👤" title={t('admin.players.selectPrompt')} description={t('admin.players.selectPromptText')} />
  );

  return (
    <section className={`admin-users-section${selectedUser || profileLoading || profileError ? ' has-selection' : ''}`}>
      <div className="admin-users-list-pane">
        <div className="admin-section-heading admin-section-heading-compact">
          <div><span>{t('admin.players.directory')}</span><h1>{t('admin.shell.users')}</h1><p>{t('admin.players.total', { count: total })}</p></div>
        </div>
        <form
          className="admin-search-form"
          onSubmit={(event) => {
            event.preventDefault();
            void loadPage(1);
          }}
        >
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('admin.players.searchPlaceholder')} />
          <button type="submit" disabled={loading}>{t('admin.players.find')}</button>
        </form>
        {query && <button type="button" className="admin-clear-search" onClick={() => { setQuery(''); void loadPage(1, ''); }}>{t('admin.players.showAll')}</button>}

        {listState === 'loading' && <AdminStateView icon="◌" title={t('admin.players.loading')} />}
        {listState === 'error' && <AdminStateView icon="!" title={t('admin.players.loadError')} actionLabel={t('admin.launch.refresh')} onAction={() => void loadPage(page)} tone="error" />}
        {listState === 'empty' && <AdminStateView icon="◇" title={t('admin.players.empty')} />}
        {listState === 'ready' && (
          <div className="admin-user-list">
            {users.map((user) => (
              <button key={user.telegramId} type="button" className={selectedUser?.telegramId === user.telegramId ? 'is-selected' : ''} onClick={() => void openProfile(user)}>
                <div>
                  <strong>{user.displayName || user.username || t('admin.players.fallbackName')}</strong>
                  <span>{user.telegramUsername ? `@${user.telegramUsername.replace(/^@+/, '')}` : `ID: ${user.telegramId}`}</span>
                  <small>{t('admin.players.level', { level: user.level || 1 })} · {formatDate(user.updatedAt, language)}</small>
                </div>
                <aside><strong>{formatInteger(user.balance, language)}</strong><small>ONIX</small></aside>
              </button>
            ))}
          </div>
        )}

        {totalPages > 1 && !loading && (
          <div className="admin-pagination">
            <button type="button" onClick={() => void loadPage(page - 1)} disabled={page <= 1}>{t('admin.players.previous')}</button>
            <span>{t('admin.players.page', { page, total: totalPages })}</span>
            <button type="button" onClick={() => void loadPage(page + 1)} disabled={page >= totalPages}>{t('admin.players.next')}</button>
          </div>
        )}
      </div>
      <div className="admin-user-detail-pane">{profileContent}</div>
    </section>
  );
}
