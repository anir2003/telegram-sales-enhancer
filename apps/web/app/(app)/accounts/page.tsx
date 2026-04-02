'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';
import { buildAccountInsights, type Campaign, type CampaignDetail } from '@/lib/web/insights';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [details, setDetails] = useState<CampaignDetail[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const [showConnect, setShowConnect] = useState(false);
  const [connectLabel, setConnectLabel] = useState('');
  const [connectDailyLimit, setConnectDailyLimit] = useState(20);
  const [connectCode, setConnectCode] = useState('');
  const [connectError, setConnectError] = useState('');
  const [generating, setGenerating] = useState(false);

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

  const generateConnectCode = async () => {
    setConnectError('');
    if (!connectLabel.trim()) {
      setConnectError('Give this account a label (e.g. "Sales Account 1").');
      return;
    }
    setGenerating(true);
    try {
      const response = await fetchJson('/api/accounts/link-code', {
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

  const accountInsights = useMemo(() => buildAccountInsights(accounts, details), [accounts, details]);
  const selectedAccount = accountInsights.find((account) => account.id === selectedAccountId) ?? null;

  return (
    <div className="page-content">
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Telegram Sender Accounts</div>
            <div className="card-subtitle" style={{ marginTop: 8 }}>
              Connect your Telegram accounts through the bot. Each account you want to send messages from needs to be registered here. Generate a code, then send <code>/connect CODE</code> from that Telegram account in the bot.
            </div>
          </div>
          <button className="btn" onClick={() => { setShowConnect(!showConnect); if (showConnect) resetConnect(); }}>
            {showConnect ? 'Cancel' : '+ Connect Account'}
          </button>
        </div>
      </div>

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
                <br />
                <br />
                Now open Telegram with the account you want to connect and send this to the bot:
                <br />
                <code>/connect {connectCode}</code>
                <br />
                <br />
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

      <div className="grid grid-4" style={{ marginTop: 16 }}>
        <div className="card"><div className="card-title">Accounts</div><div className="card-value">{accountInsights.length}</div><div className="card-subtitle">Connected sender accounts.</div></div>
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
        )) : <div className="empty-state">No Telegram accounts connected yet. Click "+ Connect Account" above and follow the bot linking flow to register your first sender account.</div>}
      </div>
    </div>
  );
}
