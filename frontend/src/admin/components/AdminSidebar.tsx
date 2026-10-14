import { createTranslator, type AppLanguage } from '../../i18n';
import { adminNavigation } from '../adminNavigation';
import type { AdminSectionId } from '../adminTypes';

type AdminSidebarProps = {
  language: AppLanguage;
  activeSection: AdminSectionId;
  onSelect: (section: AdminSectionId) => void;
};

export function AdminSidebar({ language, activeSection, onSelect }: AdminSidebarProps) {
  const t = createTranslator(language);

  return (
    <aside className="admin-sidebar" aria-label={t('admin.shell.navigation')}>
      <div className="admin-sidebar-brand">
        <span>ONIX</span>
        <strong>CONTROL</strong>
        <small>{t('admin.shell.subtitle')}</small>
      </div>
      <nav className="admin-sidebar-nav">
        {adminNavigation.map((item) => (
          <button
            key={item.id}
            type="button"
            className={activeSection === item.id ? 'is-active' : ''}
            aria-current={activeSection === item.id ? 'page' : undefined}
            onClick={() => onSelect(item.id)}
          >
            <span aria-hidden="true">{item.icon}</span>
            <strong>{t(item.labelKey)}</strong>
            {!item.available && <small>{t('admin.shell.planned')}</small>}
          </button>
        ))}
      </nav>
    </aside>
  );
}
