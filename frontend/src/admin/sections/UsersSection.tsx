import { useEffect, useRef, useState } from 'react';
import { createTranslator, getLanguageLocale, type AppLanguage } from '../../i18n';
import { addAdminUserNote, adjustAdminUserBalance, loadAdminUserProfile, searchAdminUsers, setAdminUserBan } from '../adminApi';
import { acquireAdminMutationLock, getAdminCollectionState, getAdminProfileViewState, parseAdminBalanceAmount, releaseAdminMutationLock, type AdminProfileMutationKind, type AdminUserProfile, type AdminUserSummary } from '../adminTypes';
import { ConfirmAdminAction } from '../components/ConfirmAdminAction';
import { AdminStateView } from '../components/AdminStateView';

type UsersSectionProps = { apiBaseUrl: string; adminTelegramId: string; language: AppLanguage };
type PendingProfileAction =
  | { kind: 'balance'; amount: number; reason: string }
  | { kind: 'ban'; ban: boolean; reason: string }
  | null;

const formatInteger = (value: number | undefined, language: AppLanguage) => Math.trunc(Number(value || 0)).toLocaleString(getLanguageLocale(language));
const formatDecimal = (value: number | undefined, language: AppLanguage) => Number(value || 0).toLocaleString(getLanguageLocale(language), { maximumFractionDigits: 2 });
const formatDate = (value: string | number | null | undefined, language: AppLanguage, withTime = false) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return withTime ? date.toLocaleString(getLanguageLocale(language)) : date.toLocaleDateString(getLanguageLocale(language));
};

export function UsersSection({ apiBaseUrl, adminTelegramId, language }: UsersSectionProps) {
  const t = createTranslator(language);
  const translateMutationNotice = (kind: AdminProfileMutationKind, success: boolean) => {
    if (kind === 'balance') return t(success ? 'admin.players.balanceSuccess' : 'admin.players.balanceError');
    if (kind === 'ban') return t(success ? 'admin.players.banSuccess' : 'admin.players.banError');
    if (kind === 'unban') return t(success ? 'admin.players.unbanSuccess' : 'admin.players.banError');
    return t(success ? 'admin.notes.success' : 'admin.notes.error');
  };
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
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceReason, setBalanceReason] = useState('');
  const [banReason, setBanReason] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingProfileAction>(null);
  const [mutating, setMutating] = useState(false);
  const mutationRef = useRef(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
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
    } catch { setError(true); } finally { setLoading(false); }
  };

  const resetProfileDrafts = () => {
    setBalanceAmount('');
    setBalanceReason('');
    setBanReason('');
    setNoteDraft('');
    setPendingAction(null);
    setNotice(null);
  };

  const openProfile = async (user: AdminUserSummary) => {
    setProfileLoading(true);
    setProfileError(false);
    setSelectedUser(null);
    resetProfileDrafts();
    try {
      const profile = await loadAdminUserProfile(apiBaseUrl, adminTelegramId, user.telegramId);
      setSelectedUser({ ...user, ...profile });
    } catch { setProfileError(true); } finally { setProfileLoading(false); }
  };

  const refreshProfile = async (targetTelegramId: string) => {
    const profile = await loadAdminUserProfile(apiBaseUrl, adminTelegramId, targetTelegramId);
    setSelectedUser(profile);
    setUsers((current) => current.map((user) => user.telegramId === targetTelegramId ? { ...user, ...profile } : user));
  };

  const requestBalanceAdjustment = () => {
    const amount = parseAdminBalanceAmount(balanceAmount);
    if (amount === null) return setNotice({ type: 'error', text: t('admin.players.invalidAmount') });
    if (!balanceReason.trim()) return setNotice({ type: 'error', text: t('admin.players.reasonRequired') });
    setNotice(null);
    setPendingAction({ kind: 'balance', amount, reason: balanceReason.trim() });
  };

  const requestBanChange = () => {
    if (!selectedUser) return;
    const ban = !selectedUser.isFrozen;
    if (ban && !banReason.trim()) return setNotice({ type: 'error', text: t('admin.players.reasonRequired') });
    setNotice(null);
    setPendingAction({ kind: 'ban', ban, reason: ban ? banReason.trim() : '' });
  };

  const confirmProfileAction = async () => {
    if (!selectedUser || !pendingAction || !acquireAdminMutationLock(mutationRef)) return;
    const targetTelegramId = selectedUser.telegramId;
    const action = pendingAction;
    setMutating(true);
    setNotice(null);
    try {
      if (action.kind === 'balance') await adjustAdminUserBalance(apiBaseUrl, adminTelegramId, targetTelegramId, action.amount, action.reason);
      else await setAdminUserBan(apiBaseUrl, adminTelegramId, targetTelegramId, action.ban, action.reason);
      await refreshProfile(targetTelegramId);
      if (action.kind === 'balance') { setBalanceAmount(''); setBalanceReason(''); } else setBanReason('');
      setPendingAction(null);
      setNotice({ type: 'success', text: translateMutationNotice(action.kind === 'balance' ? 'balance' : action.ban ? 'ban' : 'unban', true) });
    } catch {
      setPendingAction(null);
      setNotice({ type: 'error', text: translateMutationNotice(action.kind === 'balance' ? 'balance' : action.ban ? 'ban' : 'unban', false) });
    } finally {
      releaseAdminMutationLock(mutationRef);
      setMutating(false);
    }
  };

  const saveAdminNote = async () => {
    if (!selectedUser || !noteDraft.trim() || !acquireAdminMutationLock(mutationRef)) return;
    const targetTelegramId = selectedUser.telegramId;
    setMutating(true);
    setNotice(null);
    try {
      await addAdminUserNote(apiBaseUrl, adminTelegramId, targetTelegramId, noteDraft);
      await refreshProfile(targetTelegramId);
      setNoteDraft('');
      setNotice({ type: 'success', text: translateMutationNotice('note', true) });
    } catch { setNotice({ type: 'error', text: translateMutationNotice('note', false) }); } finally {
      releaseAdminMutationLock(mutationRef);
      setMutating(false);
    }
  };

  const listState = getAdminCollectionState(loading, error, users.length);
  const profileState = getAdminProfileViewState(profileLoading, profileError, selectedUser);

  const profileContent = profileState === 'loading' ? <AdminStateView icon="◌" title={t('admin.players.profileLoading')} />
    : profileState === 'error' ? <AdminStateView icon="!" title={t('admin.players.profileError')} actionLabel={t('admin.players.backToList')} onAction={() => setProfileError(false)} tone="error" />
      : selectedUser ? (
        <article className="admin-user-detail">
          <button type="button" className="admin-back-button" onClick={() => { setSelectedUser(null); resetProfileDrafts(); }}>{t('admin.players.backToList')}</button>
          <header className="admin-user-detail-head">
            {selectedUser.photoUrl ? <img src={selectedUser.photoUrl} alt="" /> : <span aria-hidden="true">👤</span>}
            <div><h2>{selectedUser.displayName || selectedUser.username || t('admin.players.fallbackName')}</h2><p>{selectedUser.telegramUsername ? `@${selectedUser.telegramUsername.replace(/^@+/, '')}` : t('admin.players.noUsername')}</p><small>ID: {selectedUser.telegramId}</small></div>
            <em className={selectedUser.isFrozen ? 'is-blocked' : selectedUser.isSuspicious ? 'is-suspicious' : 'is-active'}>{t(selectedUser.isFrozen ? 'admin.players.blocked' : selectedUser.isSuspicious ? 'admin.players.suspicious' : 'admin.players.active')}</em>
          </header>
          {notice && <div className={`admin-action-notice is-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.text}</div>}
          <div className="admin-user-metrics">
            <div><span>{t('admin.economy.balance')}</span><strong>{formatInteger(selectedUser.balance, language)} ONIX</strong></div>
            <div><span>{t('admin.players.totalEarned')}</span><strong>{formatInteger(selectedUser.totalEarned, language)}</strong></div>
            <div><span>{t('admin.players.weeklyEarned')}</span><strong>{formatInteger(selectedUser.weeklyEarned, language)}</strong></div>
            <div><span>{t('admin.players.levelLabel')}</span><strong>{formatInteger(selectedUser.level, language)}</strong></div>
          </div>
          <section className="admin-user-info-card"><h3>{t('admin.players.activity')}</h3><dl>
            <div><dt>{t('admin.players.registered')}</dt><dd>{formatDate(selectedUser.createdAt, language, true)}</dd></div>
            <div><dt>{t('admin.players.lastActivity')}</dt><dd>{formatDate(selectedUser.lastTapAt || selectedUser.updatedAt, language, true)}</dd></div>
            <div><dt>{t('admin.players.totalTaps')}</dt><dd>{formatInteger(selectedUser.totalTaps, language)}</dd></div>
            <div><dt>{t('admin.players.upgradesBought')}</dt><dd>{formatInteger(selectedUser.totalUpgradesBought, language)}</dd></div>
          </dl></section>
          <section className="admin-user-info-card"><h3>{t('admin.players.referralInfo')}</h3><dl>
            <div><dt>{t('admin.players.referrals')}</dt><dd>{formatInteger(selectedUser.referralsCount, language)}</dd></div>
            <div><dt>{t('admin.players.withdrawalRequests')}</dt><dd>{formatInteger(selectedUser.withdrawalRequestsCount, language)}</dd></div>
            <div><dt>{t('admin.players.promoCodes')}</dt><dd>{formatInteger(selectedUser.usedPromoCodesCount, language)}</dd></div>
            <div><dt>{t('admin.players.language')}</dt><dd>{selectedUser.languageCode || '—'}</dd></div>
          </dl></section>

          <section className="admin-user-action-card"><h3>{t('admin.players.balanceAdjustment')}</h3><div className="admin-user-action-fields">
            <input inputMode="decimal" value={balanceAmount} onChange={(event) => setBalanceAmount(event.target.value)} placeholder={t('admin.players.amountPlaceholder')} />
            <input value={balanceReason} onChange={(event) => setBalanceReason(event.target.value)} placeholder={t('admin.players.reasonPlaceholder')} />
          </div><button type="button" onClick={requestBalanceAdjustment} disabled={mutating}>{t('admin.players.adjustBalance')}</button></section>

          <section className="admin-user-action-card is-danger-zone"><h3>{t('admin.players.accessControl')}</h3>
            {!selectedUser.isFrozen && <input value={banReason} onChange={(event) => setBanReason(event.target.value)} placeholder={t('admin.players.banReasonPlaceholder')} />}
            <button type="button" className={selectedUser.isFrozen ? 'is-safe' : 'is-danger'} onClick={requestBanChange} disabled={mutating}>{t(selectedUser.isFrozen ? 'admin.players.unban' : 'admin.players.ban')}</button>
          </section>

          <section className="admin-user-history-card"><h3>{t('admin.players.transactionHistory')}</h3><div className="admin-user-history-list">
            {(selectedUser.transactions || []).length ? selectedUser.transactions.map((transaction, index) => <article key={`${transaction.createdAt}-${transaction.type}-${index}`}><header><strong>{transaction.title || transaction.type || '—'}</strong><b className={transaction.amount < 0 ? 'is-negative' : 'is-positive'}>{transaction.amount > 0 ? '+' : ''}{formatDecimal(transaction.amount, language)} ONIX</b></header><p>{transaction.type || '—'} · {transaction.status || '—'}</p><time>{formatDate(transaction.createdAt, language, true)}</time></article>)
              : <p className="admin-user-history-empty">{t('admin.players.transactionsEmpty')}</p>}
          </div></section>

          <section className="admin-user-history-card"><h3>{t('admin.players.withdrawalHistory')}</h3><div className="admin-user-history-list">
            {(selectedUser.withdrawalRequests || []).length ? selectedUser.withdrawalRequests.map((request, index) => {
              const statusKey = request.status === 'approved' ? 'admin.players.withdrawalApproved' : request.status === 'rejected' ? 'admin.players.withdrawalRejected' : 'admin.players.withdrawalPending';
              return <article key={`${request.createdAt}-${index}`}><header><strong>{formatDecimal(request.amount, language)} ONIX</strong><b>{t(statusKey)}</b></header><p>≈ {formatDecimal(request.eurAmount, language)} EUR</p>{request.adminComment && <p>{request.adminComment}</p>}<time>{formatDate(request.createdAt, language, true)}</time></article>;
            }) : <p className="admin-user-history-empty">{t('admin.players.withdrawalsEmpty')}</p>}
          </div></section>

          <section className="admin-user-history-card"><h3>{t('admin.players.securityLogs')}</h3><div className="admin-user-history-list">
            {(selectedUser.securityLogs || []).length ? selectedUser.securityLogs.map((log, index) => <article key={`${log.createdAt}-${log.type}-${index}`}><header><strong>{log.title || '—'}</strong><b>{log.type || '—'}</b></header><p>{log.details || '—'}</p><time>{formatDate(log.createdAt, language, true)}</time></article>)
              : <p className="admin-user-history-empty">{t('admin.players.securityLogsEmpty')}</p>}
          </div></section>

          <section className="admin-user-history-card"><h3>{t('admin.notes.title')}</h3><div className="admin-note-form"><textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder={t('admin.notes.placeholder')} maxLength={500} /><button type="button" onClick={() => void saveAdminNote()} disabled={mutating || !noteDraft.trim()}>{t(mutating ? 'admin.notes.saving' : 'admin.notes.add')}</button></div><div className="admin-user-history-list">
            {(selectedUser.adminNotes || []).length ? selectedUser.adminNotes.map((note, index) => <article key={`${note.createdAt}-${index}`}><p>{note.text}</p><time>{formatDate(note.createdAt, language, true)} · ID: {note.adminTelegramId || '—'}</time></article>)
              : <p className="admin-user-history-empty">{t('admin.notes.empty')}</p>}
          </div></section>

          {selectedUser.telegramProfileUrl && <a className="admin-link-button" href={selectedUser.telegramProfileUrl} target="_blank" rel="noreferrer">{t('admin.players.openTelegram')}</a>}
          <ConfirmAdminAction language={language} open={Boolean(pendingAction)} title={t(pendingAction?.kind === 'balance' ? 'admin.players.confirmBalanceTitle' : pendingAction?.ban ? 'admin.players.confirmBanTitle' : 'admin.players.confirmUnbanTitle')} description={pendingAction?.kind === 'balance' ? t('admin.players.confirmBalanceDescription', { amount: pendingAction.amount, name: selectedUser.username || selectedUser.telegramId }) : t('admin.players.confirmBanDescription', { name: selectedUser.username || selectedUser.telegramId })} confirmLabel={t(pendingAction?.kind === 'balance' ? 'admin.players.adjustBalance' : pendingAction?.ban ? 'admin.players.ban' : 'admin.players.unban')} busy={mutating} onCancel={() => setPendingAction(null)} onConfirm={() => void confirmProfileAction()} />
        </article>
      ) : <AdminStateView icon="👤" title={t('admin.players.selectPrompt')} description={t('admin.players.selectPromptText')} />;

  return <section className={`admin-users-section${selectedUser || profileLoading || profileError ? ' has-selection' : ''}`}>
    <div className="admin-users-list-pane">
      <div className="admin-section-heading admin-section-heading-compact"><div><span>{t('admin.players.directory')}</span><h1>{t('admin.shell.users')}</h1><p>{t('admin.players.total', { count: total })}</p></div></div>
      <form className="admin-search-form" onSubmit={(event) => { event.preventDefault(); void loadPage(1); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('admin.players.searchPlaceholder')} /><button type="submit" disabled={loading}>{t('admin.players.find')}</button></form>
      {query && <button type="button" className="admin-clear-search" onClick={() => { setQuery(''); void loadPage(1, ''); }}>{t('admin.players.showAll')}</button>}
      {listState === 'loading' && <AdminStateView icon="◌" title={t('admin.players.loading')} />}
      {listState === 'error' && <AdminStateView icon="!" title={t('admin.players.loadError')} actionLabel={t('admin.launch.refresh')} onAction={() => void loadPage(page)} tone="error" />}
      {listState === 'empty' && <AdminStateView icon="◇" title={t('admin.players.empty')} />}
      {listState === 'ready' && <div className="admin-user-list">{users.map((user) => <button key={user.telegramId} type="button" className={selectedUser?.telegramId === user.telegramId ? 'is-selected' : ''} onClick={() => void openProfile(user)}><div><strong>{user.displayName || user.username || t('admin.players.fallbackName')}</strong><span>{user.telegramUsername ? `@${user.telegramUsername.replace(/^@+/, '')}` : `ID: ${user.telegramId}`}</span><small>{t('admin.players.level', { level: user.level || 1 })} · {formatDate(user.updatedAt, language)}</small></div><aside><strong>{formatInteger(user.balance, language)}</strong><small>ONIX</small></aside></button>)}</div>}
      {totalPages > 1 && !loading && <div className="admin-pagination"><button type="button" onClick={() => void loadPage(page - 1)} disabled={page <= 1}>{t('admin.players.previous')}</button><span>{t('admin.players.page', { page, total: totalPages })}</span><button type="button" onClick={() => void loadPage(page + 1)} disabled={page >= totalPages}>{t('admin.players.next')}</button></div>}
    </div>
    <div className="admin-user-detail-pane">{profileContent}</div>
  </section>;
}
