'use client';

import { usePathname } from 'next/navigation';
import { useTheme } from '@/components/theme-provider';

const labels: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Telegram outbound pulse across accounts, campaigns, and replies' },
  '/leads': { title: 'Leads', subtitle: 'Reusable Telegram CRM records' },
  '/campaigns': { title: 'Campaigns', subtitle: 'Sequence-driven outreach programs across pooled accounts' },
  '/accounts': { title: 'Accounts', subtitle: 'Telegram sender availability, workload, and campaign coverage' },
  '/activity': { title: 'Activity', subtitle: 'Audit trail for sends, skips, and replies' },
  '/settings': { title: 'Settings', subtitle: 'Organization and bot linking' },
  '/experimental/demo-guilds': { title: 'Demo Guilds', subtitle: 'Shared browser-demo traces with local-only video rendering' },
  '/experimental/telegram-checker': { title: 'Telegram Checker', subtitle: 'Look up any Telegram username using your personal API credentials' },
};

export function TopBar({
  profile,
  workspace,
}: {
  profile?: { email?: string | null } | null;
  workspace?: { name?: string | null } | null;
}) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const basePath = pathname.startsWith('/campaigns/') ? '/campaigns'
    : pathname.startsWith('/experimental/') ? pathname
    : pathname;
  const page = labels[basePath] ?? labels['/dashboard'];

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="topbar-title">{page.title}</h1>
        <span className="topbar-subtitle">{page.subtitle}</span>
      </div>
      <div className="topbar-right">
        <button
          className="theme-icon-btn"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          )}
        </button>
        <span className="topbar-user">
          {workspace?.name ? `${workspace.name} · ` : ''}
          {profile?.email ?? 'Demo workspace'}
        </span>
      </div>
    </header>
  );
}
