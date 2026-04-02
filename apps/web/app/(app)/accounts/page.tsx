'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';
import { buildAccountInsights, type Campaign, type CampaignDetail } from '@/lib/web/insights';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [details, setDetails] = useState<CampaignDetail[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    label: '',
    telegram_username: '',
    daily_limit: 20,
    is_active: true,
  });

  const load = async () => {
    const [accountResponse, campaignResponse] = await Promise.all([
      fetchJson('/api/accounts'),
      fetchJson('/api/campaigns'),
    ]);
    const nextAccounts = accountResponse.accounts ?? [];
    setAccounts(nextAccounts);
    const campaigns: Campaign[] = campaignResponse.campaigns ?? [];
    const nextDetails = await Promise.all(
      campaigns.map((campaign) => fetchJson(`/api/campaigns/${campaign.id}`)),
    );
    setDetails(nextDetails);
    setSelectedAccountId((current) => current ?? nextAccounts[0]?.id ?? null);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!form.label.trim() || !form.telegram_username.trim()) {
      setFormError('Label and Telegram username are required.');
      return;
    }
    try {
      await fetchJson('/api/accounts', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm({ label: '', telegram_username: '', daily_limit: 20, is_active: true });
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add account.');
    }
  };

  const accountInsights = useMemo(() => buildAccountInsights(accounts, details), [accounts, details]);
  const selectedAccount = accountInsights.find((account) => account.id === selectedAccountId) ?? null;

  return (
    <div className="page-content">
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Telegram Sender Accounts</div>
            <div className="card-subtitle" style={{ marginTop: 8 }}>
              Manage the Telegram accounts your team uses to send outreach messages. Each account can be assigned to multiple campaigns and has a configurable daily message limit.
            </div>
          </div>
          <button className="btn" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ Add Account'}
          </button>
        </div>
      </div>

      {showForm && (
        <form className="card form-grid" onSubmit={handleCreate} style={{ marginTop: 16 }}>
          <div className="card-title">Connect New Telegram Account</div>
          <div className="card-subtitle">Register a sender account so campaigns can assign outreach to it. This is the Telegram account your team member will use to send messages.</div>
          <div className="form-grid columns-3" style={{ marginTop: 8 }}>
            <div className="form-grid">
              <label className="dim" style={{ fontSize: 11 }}>Account Label</label>
              <input className="input" placeholder="e.g. My Business Account" value={form.label} onChange={(e) => setForm((c) => ({ ...c, label: e.target.value }))} />
            </div>
            <div className="form-grid">
              <label className="dim" style={{ fontSize: 11 }}>Telegram Username</label>
              <input className="input" placeholder="e.g. johndoe" value={form.telegram_username} onChange={(e) => setForm((c) => ({ ...c, telegram_username: e.target.value }))} />
            </div>
            <div className="form-grid">
              <label className="dim" style={{ fontSize: 11 }}>Daily Message Limit</label>
              <input className="input" type="number" min={1} max={500} value={form.daily_limit} onChange={(e) => setForm((c) => ({ ...c, daily_limit: Number(e.target.value) }))} />
            </div>
          </div>
          {formError && <div className="status-callout danger">{formError}</div>}
          <div className="btn-row">
            <button className="btn" type="submit">Save Account</button>
          </div>
        </form>
      )}

      <div className="grid grid-4" style={{ marginTop: 16 }}>
        <div className="card"><div className="card-title">Accounts</div><div className="card-value">{accountInsights.length}</div><div className="card-subtitle">Total sender accounts registered.</div></div>
        <div className="card"><div className="card-title">Active</div><div className="card-value">{accountInsights.filter((a) => a.is_active).length}</div><div className="card-subtitle">Ready for campaign assignment.</div></div>
        <div className="card"><div className="card-title">Messages Today</div><div className="card-value">{accountInsights.reduce((s, a) => s + a.sentToday, 0)}</div><div className="card-subtitle">Across all campaigns.</div></div>
        <div className="card"><div className="card-title">Messages Yesterday</div><div className="card-value">{accountInsights.reduce((s, a) => s + a.sentYesterday, 0)}</div><div className="card-subtitle">Previous day baseline.</div></div>
      </div>

      {selectedAccount && (
        <>
          <div className="section-label">Account Detail</div>
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">{selectedAccount.label}</div>
                <div className="card-subtitle" style={{ marginTop: 4 }}>@{selectedAccount.telegram_username}</div>
              </div>
              <span className="badge">{selectedAccount.is_active ? 'active' : 'paused'}</span>
            </div>
            <div className="grid grid-4" style={{ marginTop: 12 }}>
              <div className="mini-stat"><div className="mini-stat-label">Campaigns</div><div className="mini-stat-value">{selectedAccount.campaignCount}</div></div>
              <div className="mini-stat"><div className="mini-stat-label">Assigned Leads</div><div className="mini-stat-value">{selectedAccount.assignedLeadCount}</div></div>
              <div className="mini-stat"><div className="mini-stat-label">Sent Today</div><div className="mini-stat-value">{selectedAccount.sentToday}/{selectedAccount.daily_limit}</div></div>
              <div className="mini-stat"><div className="mini-stat-label">Utilization</div><div className="mini-stat-value">{selectedAccount.utilization}%</div></div>
            </div>
            <div className="utilization-bar" style={{ marginTop: 12 }}>
              <div className="utilization-bar-fill" style={{ width: `${selectedAccount.utilization}%` }} />
            </div>
            {selectedAccount.campaignNames.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="dim" style={{ fontSize: 11, marginBottom: 6 }}>Campaign Assignments</div>
                <div className="btn-row">
                  {selectedAccount.campaignNames.map((name) => (
                    <span key={name} className="badge">{name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div className="section-label">Account Pool</div>
      <div className="account-card-grid">
        {accountInsights.length ? accountInsights.map((account) => (
          <button key={account.id} className={`account-card ${selectedAccountId === account.id ? 'active' : ''}`} onClick={() => setSelectedAccountId(account.id)}>
            <div className="card-header">
              <div>
                <div className="card-title">{account.label}</div>
                <div className="card-subtitle" style={{ marginTop: 8 }}>@{account.telegram_username}</div>
              </div>
              <span className="badge">{account.is_active ? 'active' : 'paused'}</span>
            </div>
            <div className="account-card-stats">
              <div><span>Campaigns</span><strong>{account.campaignCount}</strong></div>
              <div><span>Today</span><strong>{account.sentToday}</strong></div>
              <div><span>Yesterday</span><strong>{account.sentYesterday}</strong></div>
            </div>
            <div className="utilization-bar">
              <div className="utilization-bar-fill" style={{ width: `${account.utilization}%` }} />
            </div>
            <div className="card-subtitle" style={{ marginTop: 10 }}>{account.activeLeads} active leads tied to this account.</div>
          </button>
        )) : <div className="empty-state">No Telegram accounts yet. Click "+ Add Account" above to connect your first sender account.</div>}
      </div>
    </div>
  );
}
