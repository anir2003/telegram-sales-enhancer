'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { IconAccounts, IconActivity, IconBusinessTracker, IconCampaigns, IconDashboard, IconKanban, IconLeads, IconSettings } from '@/components/icons';

const mainItems = [
  { href: '/dashboard', label: 'Dashboard', icon: IconDashboard, prefetch: true },
  { href: '/leads', label: 'Leads', icon: IconLeads, prefetch: true },
  { href: '/campaigns', label: 'Campaigns', icon: IconCampaigns, prefetch: true },
  { href: '/business-tracker', label: 'Business Tracker', icon: IconBusinessTracker, prefetch: true },
  { href: '/kanban', label: 'Kanban', icon: IconKanban, prefetch: true },
  { href: '/accounts', label: 'Accounts', icon: IconAccounts, prefetch: true },
  { href: '/activity', label: 'Activity', icon: IconActivity, prefetch: true },
  { href: '/settings', label: 'Settings', icon: IconSettings, prefetch: false },
];

function IconFlask({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6M9 3v7l-5 9a1 1 0 00.9 1.5h14.2A1 1 0 0020 19l-5-9V3" />
      <path d="M8 19s1-1 4-1 4 1 4 1" strokeOpacity="0.5" />
    </svg>
  );
}

function IconTgInbox({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16l-2 10H6L4 5z" />
      <path d="M6 15l2.3 4h7.4L18 15" />
      <path d="M9 11h6" />
      <path d="M12 8v6" />
    </svg>
  );
}

function IconTgSetup({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h10" />
      <path d="M18 7h2" />
      <path d="M16 5v4" />
      <path d="M4 17h2" />
      <path d="M10 17h10" />
      <path d="M8 15v4" />
      <path d="M4 12h5" />
      <path d="M13 12h7" />
      <path d="M11 10v4" />
    </svg>
  );
}

// ─── Warning Modal ────────────────────────────────────────────────────
function ExperimentalWarningModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--panel)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '28px 28px 24px', maxWidth: 400, width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Experimental Features</div>
            <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 500, letterSpacing: '0.04em' }}>USE WITH CAUTION</div>
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 12 }}>
          These features are experimental and may not work as expected. They use phone-session login to mirror Telegram data through the server connector.
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 20 }}>
          <strong style={{ color: '#f59e0b' }}>Important:</strong> Always use a backup Telegram account, not your primary one. Experimental usage may trigger rate limits or account restrictions.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onConfirm} style={{
            flex: 1, padding: '9px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: '#f59e0b', color: '#000', border: '1px solid #f59e0b', cursor: 'pointer',
          }}>
            I understand, continue
          </button>
          <button onClick={onCancel} style={{
            padding: '9px 16px', borderRadius: 6, fontSize: 12, fontWeight: 500,
            background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--border-soft)', cursor: 'pointer',
          }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────
export function Sidebar() {
  const pathname = usePathname();
  const [expEnabled, setExpEnabled] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('experimental_enabled');
    if (stored === 'true') setExpEnabled(true);
  }, []);

  const handleToggle = () => {
    if (!expEnabled) {
      setShowModal(true);
    } else {
      setExpEnabled(false);
      localStorage.setItem('experimental_enabled', 'false');
    }
  };

  const handleConfirm = () => {
    setExpEnabled(true);
    localStorage.setItem('experimental_enabled', 'true');
    setShowModal(false);
  };

  const handleCancel = () => setShowModal(false);

  const experimentalItems = [
    { href: '/experimental/telegram-inbox', label: 'TG Inbox', icon: IconTgInbox },
    { href: '/experimental/telegram-console', label: 'TG Setup', icon: IconTgSetup },
  ];

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Image src="/logoteg.png" alt="Logo" width={28} height={28} style={{ borderRadius: 4, objectFit: 'contain' }} />
          <div className="sidebar-logo-text">TG Sales Enhancer</div>
        </div>
        <div className="sidebar-section-label">Organization</div>
        <nav className="sidebar-nav">
          {mainItems.map((item) => {
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

          {expEnabled && experimentalItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-item ${active ? 'active' : ''}`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
                <span className="sidebar-exp-beta">β</span>
              </Link>
            );
          })}
        </nav>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Experimental toggle — always at the bottom */}
        <div className="sidebar-exp-section">
          <button type="button" className="sidebar-exp-toggle-row" onClick={handleToggle}>
            <span style={{ display: 'inline-flex', color: expEnabled ? '#f59e0b' : 'var(--text-dim)' }}>
              <IconFlask size={12} />
            </span>
            <span className="sidebar-exp-text">Experimental</span>
            <div className={`sidebar-exp-switch ${expEnabled ? 'on' : ''}`}>
              <div className="sidebar-exp-switch-knob" />
            </div>
          </button>
        </div>
      </aside>

      {showModal && <ExperimentalWarningModal onConfirm={handleConfirm} onCancel={handleCancel} />}
    </>
  );
}
