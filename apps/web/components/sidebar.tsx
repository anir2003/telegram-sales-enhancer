'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconAccounts, IconActivity, IconCampaigns, IconLeads, IconSettings } from '@/components/icons';

const items = [
  { href: '/leads', label: 'Leads', icon: IconLeads },
  { href: '/campaigns', label: 'Campaigns', icon: IconCampaigns },
  { href: '/accounts', label: 'Accounts', icon: IconAccounts },
  { href: '/activity', label: 'Activity', icon: IconActivity },
  { href: '/settings', label: 'Settings', icon: IconSettings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">T</div>
        <div>
          <div className="sidebar-logo-text">TG Sales Enhancer</div>
          <div className="sidebar-logo-sub">Manual-send CRM</div>
        </div>
      </div>
      <div className="sidebar-section-label">Workspace</div>
      <nav className="sidebar-nav">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={`sidebar-item ${active ? 'active' : ''}`}>
              <Icon size={16} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
