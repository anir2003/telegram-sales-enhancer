'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';
import { buildAccountInsights, type Campaign, type CampaignDetail } from '@/lib/web/insights';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [details, setDetails] = useState<CampaignDetail[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
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
    await fetchJson('/api/accounts', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    setForm({ label: '', telegram_username: '', daily_limit: 20, is_active: true });
    await load();
  };

  const accountInsights = useMemo(() => buildAccountInsights(accounts, details), [accounts, details]);
  const selectedAccount = accountInsights.find((account) => account.id === selectedAccountId) ?? accountInsights[0] ?? null;

  return (
    <div className="page-content">
      <div className="grid grid-4">
        <div className="card"><div className="card-title">Accounts</div><div className="card-value">{accountInsights.length}</div><div className="card-subtitle">Telegram sender identities in your outbound pool.</div></div>
        <div className="card"><div className="card-title">Active</div><div className="card-value">{accountInsights.filter((account) => account.is_active).length}</div><div className="card-subtitle">Accounts ready to be assigned right now.</div></div>
        <div className="card"><div className="card-title">Messages Today</div><div className="card-value">{accountInsights.reduce((sum, account) => sum + account.sentToday, 0)}</div><div className="card-subtitle">Daily send load across every assigned campaign.</div></div>
        <div className="card"><div className="card-title">Messages Yesterday</div><div className="card-value">{accountInsights.reduce((sum, account) => sum + account.sentYesterday, 0)}</div><div className="card-subtitle">Previous day baseline for comparison.</div></div>
      </div>

      <div className="split-layout">
        <form className="card form-grid" onSubmit={handleCreate}>
          <div className="card-header">
            <div>
              <div className="card-title">Add Telegram Account</div>
              <div className="card-subtitle" style={{ marginTop: 8 }}>These are your sender accounts, not the internal task bot identity.</div>
            </div>
          </div>
          <input className="input" placeholder="Label" value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} />
          <input className="input" placeholder="Telegram username" value={form.telegram_username} onChange={(event) => setForm((current) => ({ ...current, telegram_username: event.target.value }))} />
          <input className="input" type="number" placeholder="Daily limit" value={form.daily_limit} onChange={(event) => setForm((current) => ({ ...current, daily_limit: Number(event.target.value) }))} />
          <button className="btn" type="submit">Add Account</button>
        </form>

        <div className="card">
          <div className="card-title">Selected Account Detail</div>
          {selectedAccount ? (
            <div className="list-stack" style={{ marginTop: 12 }}>
              <div className="metric-row"><span>Label</span><span>{selectedAccount.label}</span></div>
              <div className="metric-row"><span>Username</span><span>@{selectedAccount.telegram_username}</span></div>
              <div className="metric-row"><span>Campaigns</span><span>{selectedAccount.campaignCount}</span></div>
              <div className="metric-row"><span>Assigned Leads</span><span>{selectedAccount.assignedLeadCount}</span></div>
              <div className="metric-row"><span>Today</span><span>{selectedAccount.sentToday}/{selectedAccount.daily_limit}</span></div>
              <div className="metric-row"><span>Yesterday</span><span>{selectedAccount.sentYesterday}</span></div>
              <div className="metric-row"><span>Availability</span><span>{selectedAccount.is_active ? 'Active' : 'Paused'}</span></div>
              <div className="setup-item">
                <div className="card-title">Campaign Membership</div>
                <div className="card-subtitle" style={{ marginTop: 8 }}>
                  {selectedAccount.campaignNames.length ? selectedAccount.campaignNames.join(', ') : 'Not assigned to any campaigns yet.'}
                </div>
              </div>
            </div>
          ) : <div className="empty-state" style={{ marginTop: 12 }}>Add an account to inspect campaign usage and daily send levels.</div>}
        </div>
      </div>

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
            <div className="card-subtitle" style={{ marginTop: 10 }}>{account.activeLeads} leads currently tied to this account across campaigns.</div>
          </button>
        )) : <div className="empty-state">No Telegram accounts yet. Add one to begin building an account pool.</div>}
      </div>
    </div>
  );
}
