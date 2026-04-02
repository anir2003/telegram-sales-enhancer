import React from 'react';

/* ── Minimal monochrome SVG icons ── */
const icons = {
  email: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 4L12 13L2 4" />
    </svg>
  ),
  telegram: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 3L1 11l7 2.5" />
      <path d="M8 13.5L21 3" />
      <path d="M8 13.5v5.5l3.5-3.5" />
      <path d="M8 13.5l7 5L21 3" />
    </svg>
  ),
  linkedin: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  ),
  phone: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  ),
};

const accounts = [
  { iconKey: 'email', name: 'outreach@company.io', handle: 'Primary Email', owner: 'Arjun Kapoor', channel: 'Email', sent: '1,248', status: 'active' },
  { iconKey: 'email', name: 'sales@company.io', handle: 'Secondary Email', owner: 'Sofia Nakamura', channel: 'Email', sent: '986', status: 'active' },
  { iconKey: 'telegram', name: '@company_sales', handle: 'Telegram Group', owner: 'Marcus Rivera', channel: 'Telegram', sent: '524', status: 'active' },
  { iconKey: 'telegram', name: '@outreach_bot', handle: 'Telegram Bot', owner: 'Lena Petrov', channel: 'Telegram', sent: '439', status: 'active' },
  { iconKey: 'linkedin', name: 'Company Sales Page', handle: 'LinkedIn', owner: 'Arjun Kapoor', channel: 'LinkedIn', sent: '1,024', status: 'active' },
  { iconKey: 'linkedin', name: 'Sofia Nakamura', handle: 'LinkedIn Personal', owner: 'Sofia Nakamura', channel: 'LinkedIn', sent: '823', status: 'active' },
  { iconKey: 'phone', name: '+1 (555) 012-3456', handle: 'Primary Phone', owner: 'David Jansen', channel: 'Cold Call', sent: '521', status: 'warning' },
  { iconKey: 'email', name: 'partnerships@co.io', handle: 'Partnership Email', owner: 'Lena Petrov', channel: 'Email', sent: '214', status: 'inactive' },
];

function StatusPip({ status }) {
  const colors = {
    active: 'var(--status-strong)',
    warning: 'var(--status-dim)',
    inactive: 'var(--status-quiet)',
  };
  return (
    <span className="status-pip" style={{ background: colors[status] }} />
  );
}

function AccountRegistry() {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Account Registry</span>
        <span className="menu-dots">&middot;&middot;&middot;</span>
      </div>
      <div className="card-subtitle">Which accounts are being used &middot; who owns them &middot; current status</div>

      <div className="account-header">
        <span></span>
        <span>Account</span>
        <span>Owner</span>
        <span>Channel</span>
        <span>Sent / Mo</span>
        <span style={{ textAlign: 'center' }}>Status</span>
      </div>

      {accounts.map((a, i) => (
        <div key={i} className="account-row">
          <span className="account-icon">{icons[a.iconKey]}</span>
          <div>
            <div className="account-name">{a.name}</div>
            <div className="account-handle">{a.handle}</div>
          </div>
          <span className="account-owner">{a.owner}</span>
          <span className="account-owner">{a.channel}</span>
          <span className="account-metric">{a.sent}</span>
          <div style={{ textAlign: 'center' }}>
            <StatusPip status={a.status} />
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{a.status}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default AccountRegistry;
