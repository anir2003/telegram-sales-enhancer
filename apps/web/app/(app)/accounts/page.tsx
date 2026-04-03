'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';
import { buildAccountInsights, type Campaign, type CampaignDetail } from '@/lib/web/insights';

type Account = {
  id: string;
  label: string;
  telegram_username: string;
  daily_limit: number;
  is_active: boolean;
  created_at: string;
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [details, setDetails] = useState<CampaignDetail[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Connect account modal state
  const [showConnect, setShowConnect] = useState(false);
  const [connectLabel, setConnectLabel] = useState('');
  const [connectDailyLimit, setConnectDailyLimit] = useState(20);
  const [connectCode, setConnectCode] = useState('');
  const [connectError, setConnectError] = useState('');
  const [generating, setGenerating] = useState(false);

  // Edit modal state
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editForm, setEditForm] = useState({ label: '', daily_limit: 20, is_active: true });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [accountResponse, campaignResponse] = await Promise.all([
      fetchJson<{ accounts: Account[] }>('/api/accounts'),
      fetchJson<{ campaigns: Campaign[] }>('/api/campaigns'),
    ]);
    const nextAccounts = accountResponse.accounts ?? [];
    setAccounts(nextAccounts);
    const campaigns = campaignResponse.campaigns ?? [];
    const nextDetails = await Promise.all(
      campaigns.map((campaign) => fetchJson<CampaignDetail>(`/api/campaigns/${campaign.id}`)),
    );
    setDetails(nextDetails);
    setSelectedAccountId((current) => current ?? nextAccounts[0]?.id ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const generateConnectCode = async () => {
    setConnectError('');
    if (!connectLabel.trim()) {
      setConnectError('Give this account a label (e.g. "Sales Account 1").');
      return;
    }
    setGenerating(true);
    try {
      const response = await fetchJson<{ linkCode?: { code: string } }>('/api/accounts/link-code', {
        method: 'POST',
        body: JSON.stringify({ label: connectLabel.trim(), dailyLimit: connectDailyLimit }),
      });
      setConnectCode(response.linkCode?.code ?? '');
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Failed to generate code.');
    }
    setGenerating(false);
  };

  const resetConnect = () => {
    setShowConnect(false);
    setConnectLabel('');
    setConnectDailyLimit(20);
    setConnectCode('');
    setConnectError('');
  };

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setEditForm({
      label: account.label,
      daily_limit: account.daily_limit,
      is_active: account.is_active,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingAccount) return;
    setSaving(true);
    try {
      await fetchJson(`/api/accounts/${editingAccount.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      setEditingAccount(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save changes');
    }
    setSaving(false);
  };

  const handleToggleActive = async (account: Account) => {
    try {
      await fetchJson(`/api/accounts/${account.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !account.is_active }),
      });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const accountInsights = useMemo(() => buildAccountInsights(accounts, details), [accounts, details]);
  const selectedAccount = accountInsights.find((account) => account.id === selectedAccountId) ?? null;

  const stats = useMemo(() => ({
    total: accountInsights.length,
    active: accountInsights.filter((a) => a.is_active).length,
    sentToday: accountInsights.reduce((s, a) => s + a.sentToday, 0),
    sentYesterday: accountInsights.reduce((s, a) => s + a.sentYesterday, 0),
  }), [accountInsights]);

  if (loading) {
    return <div className="page-content"><div className="empty-state">Loading accounts...</div></div>;
  }

  return (
    <div className="page-content">
      {/* Header Card */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Telegram Sender Accounts</div>
            <div className="card-subtitle" style={{ marginTop: 8 }}>
              Connect and manage your Telegram sending accounts. Each account can be assigned to campaigns with daily limits.
            </div>
          </div>
          <button className="btn" onClick={() => { setShowConnect(!showConnect); if (showConnect) resetConnect(); }}>
            {showConnect ? 'Cancel' : '+ Connect Account'}
          </button>
        </div>
      </div>

      {/* Connect Account Modal */}
      {showConnect && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">Connect a Telegram Account via Bot</div>
          <div className="card-subtitle" style={{ marginTop: 8, marginBottom: 16 }}>
            Step 1: Name this account and set its daily limit. Step 2: Generate a code. Step 3: Open Telegram with the account you want to connect, message the bot, and send <code>/connect CODE</code>.
          </div>

          {!connectCode ? (
            <div className="form-grid">
              <div className="form-grid columns-2">
                <div className="form-grid">
                  <label className="dim" style={{ fontSize: 11 }}>Account Label</label>
                  <input
                    className="input"
                    placeholder="e.g. Sales Account 1"
                    value={connectLabel}
                    onChange={(e) => setConnectLabel(e.target.value)}
                  />
                </div>
                <div className="form-grid">
                  <label className="dim" style={{ fontSize: 11 }}>Daily Message Limit</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={500}
                    value={connectDailyLimit}
                    onChange={(e) => setConnectDailyLimit(Number(e.target.value))}
                  />
                </div>
              </div>
              {connectError && <div className="status-callout danger">{connectError}</div>}
              <div className="btn-row">
                <button className="btn" onClick={generateConnectCode} disabled={generating}>
                  {generating ? 'Generating...' : 'Generate Connect Code'}
                </button>
              </div>
            </div>
          ) : (
            <div className="form-grid">
              <div className="status-callout success" style={{ fontSize: 13, lineHeight: 1.8 }}>
                <strong>Code generated: <code style={{ fontSize: 16, letterSpacing: '0.15em' }}>{connectCode}</code></strong>
                <br /><br />
                Now open Telegram with the account you want to connect and send this to the bot:
                <br />
                <code>/connect {connectCode}</code>
                <br /><br />
                The code expires in 15 minutes.
              </div>
              <div className="btn-row">
                <button className="btn-secondary" onClick={() => { resetConnect(); void load(); }}>
                  Done
                </button>
                <button className="btn-secondary" onClick={() => setConnectCode('')}>
                  Generate Another
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-4" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-title">Total Accounts</div>
          <div className="card-value">{stats.total}</div>
          <div className="card-subtitle">Connected sender accounts</div>
        </div>
        <div className="card">
          <div className="card-title">Active</div>
          <div className="card-value" style={{ color: stats.active > 0 ? '#26a641' : undefined }}>{stats.active}</div>
          <div className="card-subtitle">Ready for campaigns</div>
        </div>
        <div className="card">
          <div className="card-title">Messages Today</div>
          <div className="card-value">{stats.sentToday}</div>
          <div className="card-subtitle">Across all accounts</div>
        </div>
        <div className="card">
          <div className="card-title">Messages Yesterday</div>
          <div className="card-value">{stats.sentYesterday}</div>
          <div className="card-subtitle">Previous day total</div>
        </div>
      </div>

      {/* Selected Account Detail Card */}
      {selectedAccount && (
        <>
          <div className="section-label">Selected Account Details</div>
          <div className="card" style={{ borderColor: 'var(--border-strong)', background: 'var(--panel)' }}>
            <div className="card-header">
              <div>
                <div className="card-title" style={{ fontSize: 16, fontWeight: 600 }}>{selectedAccount.label}</div>
                <div className="card-subtitle" style={{ marginTop: 4 }}>@{selectedAccount.telegram_username}</div>
              </div>
              <div className="btn-row">
                <span className={`badge ${selectedAccount.is_active ? 'badge-active' : ''}`}>
                  {selectedAccount.is_active ? 'Active' : 'Paused'}
                </span>
                <button className="btn-secondary" onClick={() => handleEdit(accounts.find(a => a.id === selectedAccount.id)!)}>
                  Edit
                </button>
              </div>
            </div>
            <div className="grid grid-4" style={{ marginTop: 16 }}>
              <div className="mini-stat">
                <div className="mini-stat-label">Campaigns</div>
                <div className="mini-stat-value">{selectedAccount.campaignCount}</div>
              </div>
              <div className="mini-stat">
                <div className="mini-stat-label">Assigned Leads</div>
                <div className="mini-stat-value">{selectedAccount.assignedLeadCount}</div>
              </div>
              <div className="mini-stat">
                <div className="mini-stat-label">Sent Today</div>
                <div className="mini-stat-value">{selectedAccount.sentToday}/{selectedAccount.daily_limit}</div>
              </div>
              <div className="mini-stat">
                <div className="mini-stat-label">Utilization</div>
                <div className="mini-stat-value" style={{ color: selectedAccount.utilization > 80 ? '#e74c3c' : selectedAccount.utilization > 50 ? '#f39c12' : '#26a641' }}>
                  {selectedAccount.utilization}%
                </div>
              </div>
            </div>
            <div className="utilization-bar" style={{ marginTop: 16, height: 10 }}>
              <div 
                className="utilization-bar-fill" 
                style={{ 
                  width: `${selectedAccount.utilization}%`,
                  background: selectedAccount.utilization > 80 ? '#e74c3c' : selectedAccount.utilization > 50 ? '#f39c12' : '#26a641'
                }} 
              />
            </div>
            {selectedAccount.campaignNames.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="dim" style={{ fontSize: 11, marginBottom: 8 }}>Campaign Assignments</div>
                <div className="btn-row">
                  {selectedAccount.campaignNames.map((name) => (
                    <span key={name} className="badge" style={{ fontSize: 11 }}>{name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Account Pool Grid */}
      <div className="section-label">Account Pool</div>
      <div className="account-card-grid">
        {accountInsights.length ? accountInsights.map((account) => (
          <div 
            key={account.id} 
            className={`account-card ${selectedAccountId === account.id ? 'active' : ''}`}
            onClick={() => setSelectedAccountId(account.id)}
          >
            <div className="card-header">
              <div>
                <div className="card-title">{account.label}</div>
                <div className="card-subtitle" style={{ marginTop: 4 }}>@{account.telegram_username}</div>
              </div>
              <div className="btn-row">
                <span className={`badge ${account.is_active ? 'badge-active' : ''}`}>
                  {account.is_active ? 'Active' : 'Paused'}
                </span>
              </div>
            </div>
            <div className="account-card-stats">
              <div><span>Campaigns</span><strong>{account.campaignCount}</strong></div>
              <div><span>Today</span><strong>{account.sentToday}</strong></div>
              <div><span>Limit</span><strong>{account.daily_limit}</strong></div>
            </div>
            <div className="utilization-bar" style={{ height: 6 }}>
              <div 
                className="utilization-bar-fill" 
                style={{ 
                  width: `${account.utilization}%`,
                  background: account.utilization > 80 ? '#e74c3c' : account.utilization > 50 ? '#f39c12' : '#26a641'
                }} 
              />
            </div>
            <div className="card-subtitle" style={{ marginTop: 10, fontSize: 11 }}>
              {account.activeLeads} active leads • {account.sentYesterday} sent yesterday
            </div>
          </div>
        )) : (
          <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
            No Telegram accounts connected yet. Click "+ Connect Account" above and follow the bot linking flow to register your first sender account.
          </div>
        )}
      </div>

      {/* Edit Account Modal */}
      {editingAccount && (
        <div className="edit-lead-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditingAccount(null); }}>
          <div className="edit-lead-modal">
            <div className="card-title" style={{ marginBottom: 16 }}>Edit Account</div>
            <div className="form-grid">
              <div className="form-grid">
                <label className="dim" style={{ fontSize: 11 }}>Account Label</label>
                <input 
                  className="input" 
                  value={editForm.label} 
                  onChange={(e) => setEditForm(f => ({ ...f, label: e.target.value }))} 
                />
              </div>
              <div className="form-grid">
                <label className="dim" style={{ fontSize: 11 }}>Daily Message Limit</label>
                <input 
                  className="input" 
                  type="number" 
                  min={1} 
                  max={500} 
                  value={editForm.daily_limit} 
                  onChange={(e) => setEditForm(f => ({ ...f, daily_limit: Number(e.target.value) }))} 
                />
              </div>
              <div className="form-grid">
                <label className="dim" style={{ fontSize: 11 }}>Status</label>
                <select 
                  className="select" 
                  value={editForm.is_active ? 'active' : 'paused'} 
                  onChange={(e) => setEditForm(f => ({ ...f, is_active: e.target.value === 'active' }))}
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                </select>
              </div>
            </div>
            <div className="btn-row" style={{ marginTop: 20 }}>
              <button className="btn" onClick={handleSaveEdit} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button className="btn-secondary" onClick={() => setEditingAccount(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
