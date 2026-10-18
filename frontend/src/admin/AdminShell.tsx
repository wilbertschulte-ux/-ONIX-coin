import { useEffect, useState } from 'react';
import { createTranslator, type AppLanguage } from '../i18n';
import { adminNavigation, getAdminNavigationItem } from './adminNavigation';
import type { AdminSectionId } from './adminTypes';
import { AdminHeader } from './components/AdminHeader';
import { AdminMobileNav } from './components/AdminMobileNav';
import { AdminSidebar } from './components/AdminSidebar';
import { AdminStateView } from './components/AdminStateView';
import { AnalyticsSection } from './sections/AnalyticsSection';
import { BroadcastSection } from './sections/BroadcastSection';
import { LaunchChecklistSection } from './sections/LaunchChecklistSection';
import { OverviewSection } from './sections/OverviewSection';
import { SecuritySection } from './sections/SecuritySection';
import { SettingsSection } from './sections/SettingsSection';
import { EconomySection } from './sections/EconomySection';
import { WeeklyPrizesSection } from './sections/WeeklyPrizesSection';
import { UsersSection } from './sections/UsersSection';
import { WithdrawalsSection } from './sections/WithdrawalsSection';
import './admin.css';

type AdminShellProps = {
  apiBaseUrl: string;
  adminTelegramId: string;
  language: AppLanguage;
  onExit: () => void;
  onOpenLegacy: () => void;
};

export function AdminShell({ apiBaseUrl, adminTelegramId, language, onExit, onOpenLegacy }: AdminShellProps) {
  const t = createTranslator(language);
  const [activeSection, setActiveSection] = useState<AdminSectionId>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const activeItem = getAdminNavigationItem(activeSection);

  useEffect(() => {
    document.documentElement.classList.add('onix-admin-mode');
    document.body.classList.add('onix-admin-mode');
    return () => {
      document.documentElement.classList.remove('onix-admin-mode');
      document.body.classList.remove('onix-admin-mode');
    };
  }, []);

  const selectSection = (section: AdminSectionId) => {
    setActiveSection(section);
    setMenuOpen(false);
  };

  const renderSection = () => {
    if (activeSection === 'overview') {
      return <OverviewSection language={language} onSelect={selectSection} />;
    }

    if (activeSection === 'launch') {
      return <LaunchChecklistSection apiBaseUrl={apiBaseUrl} language={language} />;
    }

    if (activeSection === 'users') {
      return <UsersSection apiBaseUrl={apiBaseUrl} adminTelegramId={adminTelegramId} language={language} />;
    }

    if (activeSection === 'withdrawals') {
      return <WithdrawalsSection apiBaseUrl={apiBaseUrl} adminTelegramId={adminTelegramId} language={language} />;
    }

    if (activeSection === 'prizes') {
      return <WeeklyPrizesSection apiBaseUrl={apiBaseUrl} adminTelegramId={adminTelegramId} language={language} />;
    }

    if (activeSection === 'security') {
      return <SecuritySection apiBaseUrl={apiBaseUrl} adminTelegramId={adminTelegramId} language={language} />;
    }

    if (activeSection === 'economy') {
      return <EconomySection apiBaseUrl={apiBaseUrl} adminTelegramId={adminTelegramId} language={language} />;
    }

    if (activeSection === 'settings') {
      return <SettingsSection apiBaseUrl={apiBaseUrl} adminTelegramId={adminTelegramId} language={language} />;
    }

    if (activeSection === 'broadcast') {
      return <BroadcastSection apiBaseUrl={apiBaseUrl} adminTelegramId={adminTelegramId} language={language} />;
    }

    if (activeSection === 'analytics') {
      return <AnalyticsSection apiBaseUrl={apiBaseUrl} adminTelegramId={adminTelegramId} language={language} />;
    }

    return (
      <AdminStateView
        icon={activeItem.icon}
        title={t('admin.shell.placeholderTitle', { section: t(activeItem.labelKey) })}
        description={t('admin.shell.placeholderText')}
      />
    );
  };

  return (
    <div className="admin-shell">
      <AdminSidebar language={language} activeSection={activeSection} onSelect={selectSection} />
      <div className="admin-shell-body">
        <AdminHeader
          language={language}
          sectionTitle={t(activeItem.labelKey)}
          onExit={onExit}
          onOpenMenu={() => setMenuOpen(true)}
        />
        <main className="admin-shell-main" id="admin-main-content">
          {renderSection()}
        </main>
        <AdminMobileNav language={language} activeSection={activeSection} onSelect={selectSection} onMore={() => setMenuOpen(true)} />
      </div>

      {menuOpen && (
        <div className="admin-menu-backdrop" role="presentation" onMouseDown={() => setMenuOpen(false)}>
          <section className="admin-menu-sheet" role="dialog" aria-modal="true" aria-label={t('admin.shell.more')} onMouseDown={(event) => event.stopPropagation()}>
            <div className="admin-menu-sheet-header">
              <strong>{t('admin.shell.navigation')}</strong>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label={t('admin.shell.closeMenu')}>×</button>
            </div>
            <nav>
              {adminNavigation.map((item) => (
                <button key={item.id} type="button" className={activeSection === item.id ? 'is-active' : ''} onClick={() => selectSection(item.id)}>
                  <span aria-hidden="true">{item.icon}</span>
                  <div><strong>{t(item.labelKey)}</strong><small>{t(item.hintKey)}</small></div>
                  {!item.available && <em>{t('admin.shell.planned')}</em>}
                </button>
              ))}
            </nav>
            <button type="button" className="admin-menu-legacy" onClick={onOpenLegacy}>{t('admin.shell.openLegacy')}</button>
          </section>
        </div>
      )}
    </div>
  );
}
