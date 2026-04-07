'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { fetchJson } from '@/lib/web/fetch-json';
import { buildAccountInsights, type Campaign, type CampaignDetail } from '@/lib/web/insights';
import { CustomSelect } from '@/components/ui/select';
import { AvatarCircle } from '@/components/ui/avatar';
import { SkeletonPageContent } from '@/components/ui/skeleton';

type Account = {
  id: string;
  label: string;
  telegram_username: string;
  daily_limit: number;
  is_active: boolean;
  created_at: string;
  profile_picture_url?: string | null;
};

export default function AccountsPage() {
  const { data: accountsData, isLoading: loadingAccounts, mutate: mutateAccounts } = useSWR<{ accounts: Account[] }>('/api/accounts');
  const { data: campaignsData } = useSWR<{ campaigns: Campaign[] }>('/api/campaigns');

  const rawAccounts = accountsData?.accounts ?? [];
  const campaigns = campaignsData?.campaigns ?? [];

  const detailsKey = campaigns.length > 0 ? `campaign-details:${campaigns.map(c => c.id).sort().join(',')}` : null;
  const { data: details = [] } = useSWR<CampaignDetail[]>(detailsKey, async () =>
    Promise.all(campaigns.map(c => fetchJson<CampaignDetail>(`/api/campaigns/${c.id}`)))
  );

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [connectLabel, setConnectLabel] = useState('');
  const [connectDailyLimit, setConnectDailyLimit] = useState(20);
  const [connectCode, setConnectCode] = useState('');
  const [connectError, setConnectError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editForm, setEditForm] = useState({ label: '', daily_limit: 20, is_active: true });
  const [saving, setSaving] = useState(false);
  const [fetchingAvatar, setFetchingAvatar] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState<string | null>(null);

  // Auto-select first account once data loads
  if (!selectedAccountId && rawAccounts.length > 0) {
    setSelectedAccountId(rawAccounts[0].id);
  }

  const generateConnectCode = async () => {
    setConnectError('');
    if (!connectLabel.trim()) { setConnectError('Give this account a label.'); return; }
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
    setShowConnect(false); setConnectLabel(''); setConnectDailyLimit(20);
    setConnectCode(''); setConnectError('');
  };

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setEditForm({ label: account.label, daily_limit: account.daily_limit, is_active: account.is_active });
    setAvatarStatus(null);
  };

  const handleFetchAvatar = async () => {
    if (!editingAccount) return;
    setFetchingAvatar(true);
    setAvatarStatus(null);
    try {
      const res = await fetchJson<{ ok: boolean; avatarUrl: string | null; message?: string }>(
        `/api/accounts/${editingAccount.id}/fetch-avatar`,
        { method: 'POST' },
      );
      if (res.ok && res.avatarUrl) {
        setEditingAccount((prev) => prev ? { ...prev, profile_picture_url: res.avatarUrl } : prev);
        await mutateAccounts();
        setAvatarStatus('✓ Profile picture saved');
      } else {
        setAvatarStatus(res.message ?? 'No picture found for this username');
      }
    } catch {
      setAvatarStatus('Failed to fetch — check the username');
    }
    setFetchingAvatar(false);
  };

  const handleSaveEdit = async () => {
    if (!editingAccount) return;
    setSaving(true);
    try {
      await fetchJson(`/api/accounts/${editingAccount.id}`, { method: 'PATCH', body: JSON.stringify(editForm) });
      setEditingAccount(null);
      await mutateAccounts();
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed to save'); }
    setSaving(false);
  };

  const handleDeleteAccount = async () => {
    if (!editingAccount) return;
    if (!confirm(`Delete ${editingAccount.label}?`)) return;
    setSaving(true);
    try {
      await fetchJson(`/api/accounts/${editingAccount.id}`, { method: 'DELETE' });
      setEditingAccount(null);
      if (selectedAccountId === editingAccount.id) setSelectedAccountId(null);
      await mutateAccounts();
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed to delete'); }
    setSaving(false);
  };

  const accountInsights = useMemo(() => buildAccountInsights(rawAccounts, details), [rawAccounts, details]);
  const selectedAccount = accountInsights.find((a) => a.id === selectedAccountId) ?? null;
  const stats = useMemo(() => ({
    total: accountInsights.length,
    active: accountInsights.filter((a) => a.is_active).length,
    sentToday: accountInsights.reduce((s, a) => s + a.sentToday, 0),
    sentYesterday: accountInsights.reduce((s, a) => s + a.sentYesterday, 0),
  }), [accountInsights]);

  if (loadingAccounts) return <SkeletonPageContent cards={4} tableRows={4} tableCols={4} />;

  return (
    <div className="page-content">

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Accounts</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>Telegram sender accounts and daily limits</div>
        </div>
        <button className="btn" onClick={() => { setShowConnect(!showConnect); if (showConnect) resetConnect(); }}>
          {showConnect ? 'Cancel' : '+ Connect Account'}
        </button>
      </div>

      {/* Connect modal */}
      {showConnect && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>Connect via Bot</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 16 }}>
            Name the account, generate a code, then send <code>/connect CODE</code> to the bot from the Telegram account you want to connect.
          </div>
          {!connectCode ? (
            <div className="form-grid">
              <div className="form-grid columns-2">
                <div className="form-grid">
                  <label className="dim" style={{ fontSize: 11 }}>Label</label>
                  <input className="input" placeholder="e.g. Sales Account 1" value={connectLabel} onChange={e => setConnectLabel(e.target.value)} />
                </div>
                <div className="form-grid">
                  <label className="dim" style={{ fontSize: 11 }}>Daily Limit</label>
                  <input className="input" type="number" min={1} max={500} value={connectDailyLimit} onChange={e => setConnectDailyLimit(Number(e.target.value))} />
                </div>
              </div>
              {connectError && <div className="status-callout danger">{connectError}</div>}
              <div className="btn-row">
                <button className="btn" onClick={generateConnectCode} disabled={generating}>{generating ? 'Generating...' : 'Generate Code'}</button>
              </div>
            </div>
          ) : (
            <div className="form-grid">
              <div className="status-callout success" style={{ fontSize: 12, lineHeight: 1.8 }}>
                Code: <code style={{ fontSize: 15, letterSpacing: '0.15em', fontWeight: 700 }}>{connectCode}</code>
                <br />Send <code>/connect {connectCode}</code> to the bot · expires in 15 min
              </div>
              <div className="btn-row">
                <button className="btn-secondary" onClick={() => { resetConnect(); void mutateAccounts(); }}>Done</button>
                <button className="btn-secondary" onClick={() => setConnectCode('')}>New Code</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Accounts', value: stats.total, sub: 'Connected senders' },
          { label: 'Active', value: stats.active, sub: 'Ready for campaigns', color: stats.active > 0 ? '#22c55e' : undefined },
          { label: 'Sent Today', value: stats.sentToday, sub: 'Across all accounts' },
          { label: 'Sent Yesterday', value: stats.sentYesterday, sub: 'Previous day total' },
        ].map(s => (
          <div key={s.label} className="card">
            <div className="card-title">{s.label}</div>
            <div className="card-value" style={s.color ? { color: s.color } : undefined}>{s.value}</div>
            <div className="card-subtitle">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Account cards */}
      {accountInsights.length === 0 ? (
        <div className="empty-state">No accounts connected. Click "+ Connect Account" to get started.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: selectedAccount ? '1fr 280px' : '1fr', gap: 16, alignItems: 'start' }}>
          <div className="account-card-grid">
            {accountInsights.map(account => {
              const isSelected = selectedAccountId === account.id;
              const barColor = account.utilization > 80 ? '#ef4444' : account.utilization > 50 ? '#f97316' : '#22c55e';
              return (
                <button
                  key={account.id}
                  className={`account-card${isSelected ? ' active' : ''}`}
                  onClick={() => setSelectedAccountId(isSelected ? null : account.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <AvatarCircle url={account.profile_picture_url} name={account.label} size={32} style={{ flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{account.label}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>@{account.telegram_username}</div>
                      </div>
                    </div>
                    <span style={{
                      flexShrink: 0, marginLeft: 8,
                      fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                      background: account.is_active ? '#22c55e18' : 'var(--panel-strong)',
                      color: account.is_active ? '#22c55e' : 'var(--text-dim)',
                      border: `1px solid ${account.is_active ? '#22c55e35' : 'var(--border-soft)'}`,
                      letterSpacing: '0.04em',
                    }}>{account.is_active ? 'Active' : 'Paused'}</span>
                  </div>

                  <div className="account-card-stats">
                    <div><span>Campaigns</span><strong>{account.campaignCount}</strong></div>
                    <div><span>Today</span><strong>{account.sentToday}</strong></div>
                    <div><span>Limit</span><strong>{account.daily_limit}</strong></div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Utilization</span>
                      <span style={{ fontSize: 9, color: barColor, fontWeight: 600 }}>{account.utilization}%</span>
                    </div>
                    <div style={{ height: 2, background: 'var(--panel-strong)', borderRadius: 1, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${account.utilization}%`, background: barColor, borderRadius: 1 }} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail panel */}
          {selectedAccount && (
            <div className="card" style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AvatarCircle url={selectedAccount.profile_picture_url} name={selectedAccount.label} size={40} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{selectedAccount.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>@{selectedAccount.telegram_username}</div>
                  </div>
                </div>
                <button className="board-card-btn" onClick={() => handleEdit(rawAccounts.find(a => a.id === selectedAccount.id)!)} style={{ padding: '4px 8px' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              </div>

              {[
                { label: 'Campaigns', value: selectedAccount.campaignCount },
                { label: 'Assigned Leads', value: selectedAccount.assignedLeadCount },
                { label: 'Sent Today', value: `${selectedAccount.sentToday} / ${selectedAccount.daily_limit}` },
                { label: 'Sent Yesterday', value: selectedAccount.sentYesterday },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border-soft)' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{row.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{row.value}</span>
                </div>
              ))}

              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Utilization</span>
                  <span style={{ fontSize: 11, color: 'var(--text)' }}>{selectedAccount.utilization}%</span>
                </div>
                <div style={{ height: 3, background: 'var(--panel-strong)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 2, width: `${selectedAccount.utilization}%`, background: selectedAccount.utilization > 80 ? '#ef4444' : selectedAccount.utilization > 50 ? '#f97316' : '#22c55e' }} />
                </div>
              </div>

              {selectedAccount.campaignNames.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Campaigns</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {selectedAccount.campaignNames.map(name => (
                      <span key={name} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, background: 'var(--panel-alt)', color: 'var(--text-dim)', border: '1px solid var(--border-soft)' }}>{name}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit modal */}
      {editingAccount && (
        <div className="edit-lead-overlay" onClick={e => { if (e.target === e.currentTarget) setEditingAccount(null); }}>
          <div className="edit-lead-modal" style={{ maxWidth: 400 }}>
            {/* Avatar header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <AvatarCircle url={editingAccount.profile_picture_url} name={editForm.label || editingAccount.label} size={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{editForm.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>@{editingAccount.telegram_username}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <button
                  className="btn-secondary"
                  onClick={handleFetchAvatar}
                  disabled={fetchingAvatar}
                  style={{ fontSize: 11, padding: '5px 11px', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
                >
                  {fetchingAvatar ? (
                    <>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.25"/><path d="M21 12a9 9 0 00-9-9"/></svg>
                      Fetching…
                    </>
                  ) : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
                      Fetch Profile Pic
                    </>
                  )}
                </button>
                {avatarStatus && (
                  <div style={{ fontSize: 10, color: avatarStatus.startsWith('✓') ? '#10b981' : 'var(--text-dim)', textAlign: 'right' }}>
                    {avatarStatus}
                  </div>
                )}
              </div>
            </div>

            <div className="card-title" style={{ marginBottom: 16 }}>Edit Account</div>
            <div className="form-grid">
              <div className="form-grid">
                <label className="dim" style={{ fontSize: 11 }}>Label</label>
                <input className="input" value={editForm.label} onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))} />
              </div>
              <div className="form-grid">
                <label className="dim" style={{ fontSize: 11 }}>Daily Limit</label>
                <input className="input" type="number" min={1} max={500} value={editForm.daily_limit} onChange={e => setEditForm(f => ({ ...f, daily_limit: Number(e.target.value) }))} />
              </div>
              <div className="form-grid">
                <label className="dim" style={{ fontSize: 11 }}>Status</label>
                <CustomSelect
                  value={editForm.is_active ? 'active' : 'paused'}
                  onChange={v => setEditForm(f => ({ ...f, is_active: v === 'active' }))}
                  options={[{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }]}
                />
              </div>
            </div>
            <div className="btn-row" style={{ marginTop: 20 }}>
              <button className="btn" onClick={handleSaveEdit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
              <button className="btn-secondary" onClick={() => setEditingAccount(null)}>Cancel</button>
              <button className="btn-secondary" onClick={handleDeleteAccount} disabled={saving} style={{ marginLeft: 'auto', color: '#ef4444' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
