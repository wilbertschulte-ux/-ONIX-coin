import { createTranslator, type AppLanguage } from '../../i18n';

type ConfirmAdminActionProps = {
  language: AppLanguage;
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmAdminAction({
  language,
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmAdminActionProps) {
  const t = createTranslator(language);
  if (!open) return null;

  return (
    <div className="admin-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-confirm-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="admin-confirm-title">{title}</h2>
        <p>{description}</p>
        <div className="admin-dialog-actions">
          <button type="button" onClick={onCancel} disabled={busy}>{t('admin.shell.cancel')}</button>
          <button type="button" className="is-danger" onClick={onConfirm} disabled={busy}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
