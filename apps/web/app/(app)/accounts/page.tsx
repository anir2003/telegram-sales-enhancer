'use client';

import { useEffect, useState } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [form, setForm] = useState({
    label: '',
    telegram_username: '',
    daily_limit: 20,
    is_active: true,
  });

  const load = async () => {
    const response = await fetchJson('/api/accounts');
    setAccounts(response.accounts ?? []);
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

  return (
    <div className="page-content">
      <div className="split-layout">
        <form className="card form-grid" onSubmit={handleCreate}>
          <div className="card-header">
            <div>
              <div className="card-title">Add Telegram Account</div>
              <div className="card-subtitle" style={{ marginTop: 8 }}>Accounts are pooled globally, then assigned per campaign.</div>
            </div>
          </div>
          <input className="input" placeholder="Label" value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} />
          <input className="input" placeholder="Telegram username" value={form.telegram_username} onChange={(event) => setForm((current) => ({ ...current, telegram_username: event.target.value }))} />
          <input className="input" type="number" placeholder="Daily limit" value={form.daily_limit} onChange={(event) => setForm((current) => ({ ...current, daily_limit: Number(event.target.value) }))} />
          <button className="btn" type="submit">Add Account</button>
        </form>

        <div className="card">
          <div className="card-title">Rotation Rules</div>
          <div className="setup-list" style={{ marginTop: 12 }}>
            <div className="setup-item">Initial step uses round-robin across active accounts under their daily caps.</div>
            <div className="setup-item">Follow-ups stay pinned to the same assigned account.</div>
            <div className="setup-item">Paused or capped accounts block future steps instead of silently reassigning.</div>
          </div>
        </div>
      </div>

      <div className="section-label">Account Pool</div>
      <div className="table account-table">
        <div className="table-header">
          <div>Account</div>
          <div>Username</div>
          <div>Daily Cap</div>
          <div>Active</div>
          <div>State</div>
        </div>
        {accounts.length ? accounts.map((account) => (
          <div key={account.id} className="table-row">
            <div>{account.label}</div>
            <div>@{account.telegram_username}</div>
            <div>{account.daily_limit}</div>
            <div>{account.is_active ? 'Yes' : 'No'}</div>
            <div><span className="badge">{account.is_active ? 'ready' : 'paused'}</span></div>
          </div>
        )) : <div className="empty-state">No Telegram accounts yet. Add one to begin building an account pool.</div>}
      </div>
    </div>
  );
}
