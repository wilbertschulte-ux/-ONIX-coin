import { ArrowLeft, Menu } from 'lucide-react';
import { createTranslator, type AppLanguage } from '../../i18n';

type AdminHeaderProps = {
  language: AppLanguage;
  sectionTitle: string;
  onExit: () => void;
  onOpenMenu: () => void;
};

export function AdminHeader({ language, sectionTitle, onExit, onOpenMenu }: AdminHeaderProps) {
  const t = createTranslator(language);

  return (
    <header className="admin-shell-header">
      <button type="button" className="admin-icon-button" onClick={onExit} aria-label={t('admin.shell.exit')}>
        <ArrowLeft aria-hidden="true" size={20} />
      </button>
      <div className="admin-shell-heading">
        <span>ONIX CONTROL</span>
        <strong>{sectionTitle}</strong>
      </div>
      <button type="button" className="admin-icon-button admin-mobile-menu-button" onClick={onOpenMenu} aria-label={t('admin.shell.more')}>
        <Menu aria-hidden="true" size={20} />
      </button>
      <span className="admin-shell-badge">ADMIN</span>
    </header>
  );
}
