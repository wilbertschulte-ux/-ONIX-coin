import { useRef, useState } from 'react';
import { createTranslator, type AppLanguage } from '../../i18n';
import { getAdminApiErrorDetail, runAdminBroadcast } from '../adminApi';
import {
  acquireAdminMutationLock,
  canSendAdminBroadcast,
  isAdminBroadcastMessageValid,
  releaseAdminMutationLock,
  type AdminBroadcastResponse,
} from '../adminTypes';
import { ConfirmAdminAction } from '../components/ConfirmAdminAction';

type BroadcastSectionProps = {
  apiBaseUrl: string;
  adminTelegramId: string;
  language: AppLanguage;
};

type BroadcastRequestKind = 'dry-run' | 'send';

export function BroadcastSection({ apiBaseUrl, adminTelegramId, language }: BroadcastSectionProps) {
  const t = createTranslator(language);
  const [message, setMessage] = useState('');
  const [dryRunMessage, setDryRunMessage] = useState<string | null>(null);
  const [dryRunResult, setDryRunResult] = useState<AdminBroadcastResponse | null>(null);
  const [sendResult, setSendResult] = useState<AdminBroadcastResponse | null>(null);
  const [busy, setBusy] = useState<BroadcastRequestKind | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [validationError, setValidationError] = useState(false);
  const [requestError, setRequestError] = useState<{ kind: BroadcastRequestKind; detail: string } | null>(null);
  const requestLock = useRef(false);

  const changeMessage = (value: string) => {
    if (completed) return;
    setMessage(value);
    setDryRunMessage(null);
    setDryRunResult(null);
    setSendResult(null);
    setValidationError(false);
    setRequestError(null);
  };

  const runDryRun = async () => {
    if (!isAdminBroadcastMessageValid(message)) {
      setValidationError(true);
      return;
    }
    if (!acquireAdminMutationLock(requestLock)) return;
    setBusy('dry-run');
    setRequestError(null);
    setValidationError(false);
    try {
      const result = await runAdminBroadcast(apiBaseUrl, adminTelegramId, message, true);
      if (!result.dryRun) throw new Error('Unexpected broadcast response');
      setDryRunMessage(message);
      setDryRunResult(result);
    } catch (error) {
      setDryRunMessage(null);
      setDryRunResult(null);
      setRequestError({ kind: 'dry-run', detail: getAdminApiErrorDetail(error) });
    } finally {
      setBusy(null);
      releaseAdminMutationLock(requestLock);
    }
  };

  const sendBroadcast = async () => {
    if (!canSendAdminBroadcast(message, dryRunMessage, dryRunResult, completed)) return;
    if (!acquireAdminMutationLock(requestLock)) return;
    setConfirmationOpen(false);
    setBusy('send');
    setRequestError(null);
    try {
      const result = await runAdminBroadcast(apiBaseUrl, adminTelegramId, message, false);
      if (result.dryRun) throw new Error('Unexpected broadcast response');
      setSendResult(result);
      setCompleted(true);
    } catch (error) {
      setRequestError({ kind: 'send', detail: getAdminApiErrorDetail(error) });
    } finally {
      setBusy(null);
      releaseAdminMutationLock(requestLock);
    }
  };

  const sendReady = canSendAdminBroadcast(message, dryRunMessage, dryRunResult, completed);

  return (
    <section className="admin-broadcast-section">
      <div className="admin-section-heading">
        <div><span>{t('admin.broadcast.workspace')}</span><h1>{t('admin.shell.broadcast')}</h1><p>{t('admin.broadcast.intro')}</p></div>
      </div>

      <section className="admin-broadcast-panel" aria-labelledby="admin-broadcast-message-title">
        <header><div><span>{t('admin.broadcast.stepMessage')}</span><h2 id="admin-broadcast-message-title">{t('admin.broadcast.message')}</h2></div></header>
        <label className="admin-broadcast-message-field">
          <span>{t('admin.broadcast.messageLabel')}</span>
          <textarea
            value={message}
            onChange={(event) => changeMessage(event.target.value)}
            placeholder={t('admin.broadcast.messagePlaceholder')}
            disabled={busy !== null || completed}
          />
        </label>
        {validationError && <p className="admin-broadcast-notice is-error" role="alert">{t('admin.broadcast.emptyError')}</p>}
        {completed && <p className="admin-broadcast-notice is-success" role="status">{t('admin.broadcast.locked')}</p>}
      </section>

      <section className="admin-broadcast-panel" aria-labelledby="admin-broadcast-dry-run-title">
        <header><div><span>{t('admin.broadcast.stepDryRun')}</span><h2 id="admin-broadcast-dry-run-title">{t('admin.broadcast.dryRun')}</h2></div></header>
        <p>{t('admin.broadcast.dryRunDescription')}</p>
        <button type="button" onClick={() => void runDryRun()} disabled={busy !== null || completed}>{busy === 'dry-run' ? t('admin.broadcast.dryRunLoading') : t('admin.broadcast.dryRunAction')}</button>
        {dryRunResult && <div className="admin-broadcast-result is-preview"><span>{t('admin.broadcast.recipients')}</span><strong>{dryRunResult.recipients}</strong><small>{t('admin.broadcast.dryRunSafe')}</small></div>}
        {requestError?.kind === 'dry-run' && <p className="admin-broadcast-notice is-error" role="alert">{t('admin.broadcast.dryRunError')}{requestError.detail ? ` · ${requestError.detail}` : ''}</p>}
      </section>

      <section className="admin-broadcast-panel" aria-labelledby="admin-broadcast-send-title">
        <header><div><span>{t('admin.broadcast.stepSend')}</span><h2 id="admin-broadcast-send-title">{t('admin.broadcast.send')}</h2></div></header>
        <p>{sendReady ? t('admin.broadcast.sendReady') : t('admin.broadcast.sendRequiresDryRun')}</p>
        <button type="button" className="admin-broadcast-send" onClick={() => setConfirmationOpen(true)} disabled={!sendReady || busy !== null}>{busy === 'send' ? t('admin.broadcast.sending') : t('admin.broadcast.sendAction')}</button>
        {requestError?.kind === 'send' && <p className="admin-broadcast-notice is-error" role="alert">{t('admin.broadcast.sendError')}{requestError.detail ? ` · ${requestError.detail}` : ''}</p>}
        {sendResult && <div className="admin-broadcast-result-grid" role="status"><article><span>{t('admin.broadcast.recipients')}</span><strong>{sendResult.recipients}</strong></article><article><span>{t('admin.broadcast.sent')}</span><strong>{sendResult.sent}</strong></article><article><span>{t('admin.broadcast.failed')}</span><strong>{sendResult.failed}</strong></article></div>}
      </section>

      <ConfirmAdminAction
        language={language}
        open={confirmationOpen}
        title={t('admin.broadcast.confirmTitle')}
        description={t('admin.broadcast.confirmDescription', { recipients: dryRunResult?.recipients ?? 0 })}
        confirmLabel={t('admin.broadcast.confirmSend')}
        busy={busy === 'send'}
        onConfirm={() => void sendBroadcast()}
        onCancel={() => setConfirmationOpen(false)}
      />
    </section>
  );
}
