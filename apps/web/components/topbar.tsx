'use client';

import { usePathname } from 'next/navigation';

const labels: Record<string, { title: string; subtitle: string }> = {
  '/leads': { title: 'Leads', subtitle: 'Reusable Telegram CRM records' },
  '/campaigns': { title: 'Campaigns', subtitle: 'Composable sequences layered on the CRM' },
  '/accounts': { title: 'Accounts', subtitle: 'Telegram account pool and rotation limits' },
  '/activity': { title: 'Activity', subtitle: 'Audit trail for sends, skips, and replies' },
  '/settings': { title: 'Settings', subtitle: 'Appearance, bot linking, and setup checklist' },
};

export function TopBar({ profile }: { profile?: { email?: string | null } | null }) {
  const pathname = usePathname();
  const basePath = pathname.startsWith('/campaigns/') ? '/campaigns' : pathname;
  const page = labels[basePath] ?? labels['/campaigns'];

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="topbar-title">{page.title}</h1>
        <span className="topbar-subtitle">{page.subtitle}</span>
      </div>
      <div className="topbar-right">
        <span className="topbar-user">{profile?.email ?? 'Demo workspace'}</span>
      </div>
    </header>
  );
}
