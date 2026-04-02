import React, { useState } from 'react';
import Tabs from '../components/Tabs';
import BrandLogo from '../components/BrandLogo';

const settingsTabs = [
  { id: 'accounts', label: 'Accounts' },
  { id: 'domains', label: 'Domains' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'limits', label: 'Sending Limits' },
  { id: 'team', label: 'Team Settings' },
];

const domainData = [
  { domain: 'company.io', status: 'active', spf: true, dkim: true, dmarc: true, warmup: 100, dailyLimit: 500, health: 98 },
  { domain: 'outreach-co.com', status: 'active', spf: true, dkim: true, dmarc: true, warmup: 85, dailyLimit: 300, health: 94 },
  { domain: 'company-sales.io', status: 'warming', spf: true, dkim: true, dmarc: false, warmup: 42, dailyLimit: 50, health: 72 },
  { domain: 'backup-domain.com', status: 'inactive', spf: false, dkim: false, dmarc: false, warmup: 0, dailyLimit: 0, health: 0 },
];

const integrations = [
  { name: 'HubSpot CRM', status: 'connected', lastSync: '2 min ago', brand: 'hubspot', detail: 'Contacts and pipeline synced' },
  { name: 'Slack Notifications', status: 'connected', lastSync: '1 min ago', brand: 'slack', detail: 'Alerts sent to #sales-live' },
  { name: 'Google Workspace', status: 'connected', lastSync: '5 min ago', brand: 'google', detail: 'Inbox and calendar verified' },
  { name: 'Clearbit Enrichment', status: 'degraded', lastSync: '1h ago', brand: 'clearbit', detail: '2 enrichment jobs delayed' },
  { name: 'Calendly', status: 'connected', lastSync: '3 min ago', brand: 'calendly', detail: 'Meeting links attached to sequences' },
  { name: 'Zapier', status: 'disconnected', lastSync: 'Never', brand: 'zapier', detail: 'Webhook routing is offline' },
  { name: 'Salesforce', status: 'disconnected', lastSync: 'Never', brand: 'salesforce', detail: 'Lead sync paused pending auth' },
  { name: 'Stripe', status: 'connected', lastSync: '10 min ago', brand: 'stripe', detail: 'Billing events available for triggers' },
];

const statusColors = {
  connected: 'var(--status-strong)',
  degraded: 'var(--status-dim)',
  disconnected: 'var(--status-quiet)',
  active: 'var(--status-strong)',
  warming: 'var(--status-mid)',
  inactive: 'var(--status-quiet)',
};

function Settings({ theme = 'dark', onThemeChange }) {
  const [activeTab, setActiveTab] = useState('accounts');

  return (
    <div className="page-content">
      <Tabs tabs={settingsTabs} activeTab={activeTab} onChange={setActiveTab} />

      <div className="card theme-card">
        <div className="theme-toggle-row">
          <div>
            <div className="card-title">Appearance</div>
            <div className="card-subtitle" style={{ marginTop: 10, marginBottom: 0 }}>
              Switch between the original dark workspace and a warm light theme tuned for readability.
            </div>
          </div>
          <div className="theme-options" role="tablist" aria-label="Theme switcher">
            {[
              { id: 'dark', label: 'Dark Mode', swatch: 'dark' },
              { id: 'light', label: 'Light Mode', swatch: 'light' },
            ].map((option) => (
              <button
                key={option.id}
                className={`theme-option ${theme === option.id ? 'active' : ''}`}
                onClick={() => onThemeChange?.(option.id)}
              >
                <span className={`theme-swatch ${option.swatch}`} />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === 'accounts' && (
        <>
          <div className="section-label" style={{ marginTop: 20 }}>Email Accounts</div>
          <div className="card">
            {[
              { email: 'outreach@company.io', name: 'Primary Outreach', dailySent: 142, dailyLimit: 200, warmup: 100, owner: 'Arjun Kapoor' },
              { email: 'sales@company.io', name: 'Sales Team', dailySent: 98, dailyLimit: 150, warmup: 100, owner: 'Sofia Nakamura' },
              { email: 'partnerships@co.io', name: 'Partnerships', dailySent: 12, dailyLimit: 50, warmup: 65, owner: 'Lena Petrov' },
            ].map((acc, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr', gap: 16, alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{acc.email}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{acc.name}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{acc.owner}</div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text)' }}>{acc.dailySent} / {acc.dailyLimit}</div>
                  <div style={{ height: 3, background: 'var(--track)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(acc.dailySent / acc.dailyLimit) * 100}%`, height: '100%', background: acc.dailySent / acc.dailyLimit > 0.8 ? 'var(--fill-strong)' : 'var(--fill-dim)', borderRadius: 2 }} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Warmup: {acc.warmup}%</div>
                  <div style={{ height: 3, background: 'var(--track)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${acc.warmup}%`, height: '100%', background: acc.warmup === 100 ? 'var(--fill-strong)' : 'var(--fill-mid)', borderRadius: 2 }} />
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: acc.warmup === 100 ? 'var(--status-strong)' : 'var(--status-mid)' }} />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{acc.warmup === 100 ? 'Ready' : 'Warming'}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="section-label">Telegram Accounts</div>
          <div className="card">
            {[
              { handle: '@company_sales', type: 'Group', messages: 524, owner: 'Marcus Rivera', status: 'active' },
              { handle: '@outreach_bot', type: 'Bot', messages: 439, owner: 'Lena Petrov', status: 'active' },
            ].map((acc, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: 16, alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{acc.handle}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{acc.type}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{acc.owner}</div>
                <div style={{ fontSize: 12, color: 'var(--text)' }}>{acc.messages} sent</div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColors[acc.status] }} />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{acc.status}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'domains' && (
        <>
          <div className="section-label" style={{ marginTop: 20 }}>Domain Health</div>
          <div className="card" style={{ padding: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.8fr repeat(3, 0.6fr) 1fr 0.8fr', gap: 12, padding: '12px 24px', borderBottom: '1px solid var(--border-strong)' }}>
              {['Domain', 'Status', 'SPF', 'DKIM', 'DMARC', 'Warmup', 'Health'].map(h => (
                <span key={h} style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>{h}</span>
              ))}
            </div>
            {domainData.map(d => (
              <div key={d.domain} style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.8fr repeat(3, 0.6fr) 1fr 0.8fr', gap: 12, padding: '14px 24px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{d.domain}</div>
                <div><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColors[d.status] }} /><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.status}</span></span></div>
                {[d.spf, d.dkim, d.dmarc].map((v, i) => (
                  <div key={i} style={{ fontSize: 11, color: v ? 'var(--status-strong)' : 'var(--status-soft)' }}>{v ? 'Pass' : 'Fail'}</div>
                ))}
                <div>
                  <div style={{ height: 4, background: 'var(--track)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${d.warmup}%`, height: '100%', background: d.warmup === 100 ? 'var(--fill-strong)' : d.warmup > 50 ? 'var(--fill-mid)' : 'var(--fill-soft)', borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{d.warmup}%</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: d.health > 90 ? 'var(--status-strong)' : d.health > 60 ? 'var(--status-mid)' : 'var(--status-soft)' }}>{d.health}%</div>
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'integrations' && (
        <>
          <div className="section-label" style={{ marginTop: 20 }}>Connected Services</div>
          <div className="grid grid-4">
            {integrations.map(int => (
              <div key={int.name} className="card integration-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div className="integration-logo-wrap">
                    <BrandLogo brand={int.brand} size={18} dimmed={int.status === 'disconnected'} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{int.name}</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColors[int.status] }} />
                      <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{int.status}</span>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>{int.detail}</div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Last sync: {int.lastSync}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'limits' && (
        <>
          <div className="section-label" style={{ marginTop: 20 }}>Daily Sending Limits</div>
          <div className="card">
            {[
              { channel: 'Email (total)', current: 252, limit: 500, used: 50.4 },
              { channel: 'LinkedIn Messages', current: 87, limit: 100, used: 87 },
              { channel: 'LinkedIn Connections', current: 18, limit: 25, used: 72 },
              { channel: 'Telegram', current: 64, limit: 200, used: 32 },
              { channel: 'Cold Calls', current: 31, limit: 80, used: 38.75 },
            ].map(l => (
              <div key={l.channel} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 2fr', gap: 16, alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text)' }}>{l.channel}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.current} / {l.limit}</div>
                <div>
                  <div style={{ height: 8, background: 'var(--track)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${l.used}%`, height: '100%', background: l.used > 80 ? 'var(--fill-strong)' : l.used > 50 ? 'var(--fill-mid)' : 'var(--fill-soft)', borderRadius: 3, transition: 'width 0.3s' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'team' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--text-dim)', fontSize: 12 }}>
          Team settings — roles, permissions, and notifications
        </div>
      )}
    </div>
  );
}

export default Settings;
