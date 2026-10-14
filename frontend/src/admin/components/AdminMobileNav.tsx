import { createTranslator, type AppLanguage } from '../../i18n';
import { adminNavigation } from '../adminNavigation';
import type { AdminSectionId } from '../adminTypes';

type AdminMobileNavProps = {
  language: AppLanguage;
  activeSection: AdminSectionId;
  onSelect: (section: AdminSectionId) => void;
  onMore: () => void;
};

export function AdminMobileNav({ language, activeSection, onSelect, onMore }: AdminMobileNavProps) {
  const t = createTranslator(language);
  const primaryItems = adminNavigation.filter((item) => 'mobilePrimary' in item && item.mobilePrimary).slice(0, 4);

  return (
    <nav className="admin-mobile-nav" aria-label={t('admin.shell.navigation')}>
      {primaryItems.map((item) => (
        <button
          key={item.id}
          type="button"
          className={activeSection === item.id ? 'is-active' : ''}
          aria-current={activeSection === item.id ? 'page' : undefined}
          onClick={() => onSelect(item.id)}
        >
          <span aria-hidden="true">{item.icon}</span>
          <strong>{t(item.labelKey)}</strong>
        </button>
      ))}
      <button type="button" onClick={onMore}>
        <span aria-hidden="true">•••</span>
        <strong>{t('admin.shell.more')}</strong>
      </button>
    </nav>
  );
}
