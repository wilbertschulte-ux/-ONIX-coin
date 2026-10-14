import { createTranslator, type AppLanguage } from '../../i18n';
import { adminNavigation } from '../adminNavigation';
import type { AdminSectionId } from '../adminTypes';

type OverviewSectionProps = {
  language: AppLanguage;
  onSelect: (section: AdminSectionId) => void;
};

const overviewSectionIds: AdminSectionId[] = [
  'prizes',
  'withdrawals',
  'economy',
  'analytics',
  'users',
  'security',
  'broadcast',
  'settings',
];

export function OverviewSection({ language, onSelect }: OverviewSectionProps) {
  const t = createTranslator(language);
  const cards = overviewSectionIds.map((id) => adminNavigation.find((item) => item.id === id)!).filter(Boolean);

  return (
    <section className="admin-overview-section">
      <div className="admin-overview-intro">
        <div>
          <span>{t('admin.shell.workspace')}</span>
          <h1>{t('admin.shell.overview')}</h1>
          <p>{t('admin.shell.overviewIntro')}</p>
        </div>
        <button type="button" onClick={() => onSelect('launch')}>{t('admin.shell.launchAction')}</button>
      </div>

      <div className="admin-overview-grid">
        {cards.map((item) => (
          <button key={item.id} type="button" className="admin-overview-card" onClick={() => onSelect(item.id)}>
            <span className="admin-overview-card-icon" aria-hidden="true">{item.icon}</span>
            <span className="admin-overview-card-copy">
              <strong>{t(item.labelKey)}</strong>
              <small>{t(item.hintKey)}</small>
            </span>
            <em>{item.available ? t('admin.shell.available') : t('admin.shell.planned')}</em>
          </button>
        ))}
      </div>
    </section>
  );
}
