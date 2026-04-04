'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { IconAccounts, IconActivity, IconBusinessTracker, IconCampaigns, IconDashboard, IconLeads, IconSettings } from '@/components/icons';

const items = [
  { href: '/dashboard', label: 'Dashboard', icon: IconDashboard, prefetch: true },
  { href: '/leads', label: 'Leads', icon: IconLeads, prefetch: true },
  { href: '/campaigns', label: 'Campaigns', icon: IconCampaigns, prefetch: true },
  { href: '/business-tracker', label: 'Business Tracker', icon: IconBusinessTracker, prefetch: true },
  { href: '/accounts', label: 'Accounts', icon: IconAccounts, prefetch: true },
  { href: '/activity', label: 'Activity', icon: IconActivity, prefetch: true },
  { href: '/settings', label: 'Settings', icon: IconSettings, prefetch: false }, // Settings doesn't need prefetch
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <Image src="/logoteg.png" alt="Logo" width={28} height={28} style={{ borderRadius: 4, objectFit: 'contain' }} />
        <div className="sidebar-logo-text">TG Sales Enhancer</div>
      </div>
      <div className="sidebar-section-label">Organization</div>
      <nav className="sidebar-nav">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link 
              key={item.href} 
              href={item.href} 
              className={`sidebar-item ${active ? 'active' : ''}`}
              prefetch={item.prefetch}
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
