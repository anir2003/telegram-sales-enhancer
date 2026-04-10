'use client';

import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';
import { Skeleton } from '@/components/ui/skeleton';

type OrgSecretRecord = {
  id: string;
  label: string;
  key_prefix: string;
  value: string | null;
  created_at: string;
};

function ApiKeysPanel() {
  const { data, error, mutate } = useSWR<{ keys: OrgSecretRecord[] }>('/api/organization/api-keys');
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const save = async () => {
    if (!label.trim() || !value.trim()) return;
    setBusy(true);
    setStatus('');
    try {
      await fetchJson('/api/organization/api-keys', {
        method: 'POST',
        body: JSON.stringify({ label, value }),
      });
      setLabel('');
      setValue('');
      mutate();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not save secret.');
    }
    setBusy(false);
  };

  const update = async (id: string) => {
    if (!editValue.trim()) return;
    setBusy(true);
    try {
      await fetchJson('/api/organization/api-keys', {
        method: 'PATCH',
        body: JSON.stringify({ id, value: editValue }),
      });
      setEditingId(null);
      setEditValue('');
      mutate();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not update secret.');
    }
    setBusy(false);
  };

  const remove = async (id: string) => {
    try {
      await fetchJson('/api/organization/api-keys', { method: 'DELETE', body: JSON.stringify({ id }) });
      mutate();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not delete secret.');
    }
  };

  const toggleReveal = (id: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const keys = data?.keys ?? [];

  return (
    <div className="card">
      <div className="card-title">Organization Secrets</div>
      <div className="card-subtitle" style={{ marginBottom: 16 }}>
        Store API keys and credentials shared across the organization — e.g. Telegram api_id, OpenAI keys, webhook secrets. Values are encrypted at rest.
      </div>

      {error && (
        <div className="status-callout danger" style={{ marginBottom: 12 }}>
          {error instanceof Error ? error.message : 'Could not load organization secrets.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            placeholder="Name (e.g. TELEGRAM_API_ID)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            style={{ flex: '0 0 220px' }}
          />
          <input
            className="input"
            placeholder="Value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
            style={{ flex: 1 }}
          />
          <button className="btn" disabled={busy || !label.trim() || !value.trim()} onClick={save}>
            {busy ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>

      {status && <div className="status-callout danger" style={{ marginBottom: 12 }}>{status}</div>}

      {keys.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {keys.map((key) => (
            <div key={key.id}>
              <div className="kv" style={{ alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <strong style={{ fontSize: 12, fontFamily: 'monospace', flexShrink: 0 }}>{key.label}</strong>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {revealed.has(key.id) ? (key.value ?? '—') : `${key.key_prefix}••••••`}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => toggleReveal(key.id)}>
                    {revealed.has(key.id) ? 'Hide' : 'Reveal'}
                  </button>
                  <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => { setEditingId(key.id); setEditValue(key.value ?? ''); }}>
                    Edit
                  </button>
                  <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 10px', color: '#e74c3c', borderColor: '#e74c3c' }} onClick={() => void remove(key.id)}>
                    Delete
                  </button>
                </span>
              </div>
              {editingId === key.id && (
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <input
                    className="input"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void update(key.id); if (e.key === 'Escape') setEditingId(null); }}
                    style={{ flex: 1 }}
                    autoFocus
                  />
                  <button className="btn" disabled={busy || !editValue.trim()} onClick={() => void update(key.id)}>Save</button>
                  <button className="btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {keys.length === 0 && (
        <div className="muted" style={{ fontSize: 12 }}>No secrets stored yet.</div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { data: me, isLoading } = useSWR<any>('/api/me');
  const [loggingOut, setLoggingOut] = useState(false);
  const [refreshingProfiles, setRefreshingProfiles] = useState(false);
  const [profileRefreshStatus, setProfileRefreshStatus] = useState('');
  const [profileRefreshTone, setProfileRefreshTone] = useState<'success' | 'danger' | 'neutral'>('neutral');

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetchJson('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (err) {
      console.error('Logout failed:', err);
      setLoggingOut(false);
    }
  };

  const handleRefreshProfiles = async () => {
    setRefreshingProfiles(true);
    setProfileRefreshStatus('');
    try {
      const result = await fetchJson<{
        ok: boolean;
        leads: {
          processed: number;
          refreshed: number;
          invalid: number;
          noAvatar: number;
          unavailable: number;
        };
        accounts: {
          processed: number;
          refreshed: number;
          invalid: number;
          noAvatar: number;
          unavailable: number;
        };
      }>('/api/leads/refresh-profiles', { method: 'POST' });

      const parts = [
        `${result.leads.refreshed} lead pictures updated`,
        `${result.accounts.refreshed} account pictures updated`,
        `${result.leads.invalid} invalid leads`,
      ];
      if (result.accounts.invalid) parts.push(`${result.accounts.invalid} invalid accounts`);
      if (result.leads.noAvatar || result.accounts.noAvatar) {
        parts.push(`${result.leads.noAvatar + result.accounts.noAvatar} without public photos`);
      }
      const unavailable = result.leads.unavailable + result.accounts.unavailable;
      if (unavailable) parts.push(`${unavailable} could not be checked`);

      setProfileRefreshStatus(`Checked ${result.leads.processed} leads and ${result.accounts.processed} accounts: ${parts.join(' · ')}.`);
      setProfileRefreshTone(result.leads.invalid || result.accounts.invalid ? 'neutral' : 'success');
    } catch (err) {
      console.error('Lead profile refresh failed:', err);
      setProfileRefreshStatus('Could not refresh lead and account profiles right now.');
      setProfileRefreshTone('danger');
    }
    setRefreshingProfiles(false);
  };

  return (
    <div className="page-content">
      <div className="section-label">Secrets</div>
      <div className="grid grid-2">
        <ApiKeysPanel />
      </div>

      <div className="section-label">Organization</div>
      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">Current Session</div>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Skeleton height={11} width={80} />
                  <Skeleton height={11} width={140} />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="kv"><span className="muted">Configured</span><span>{me?.configured ? 'Yes' : 'Demo mode'}</span></div>
              <div className="kv"><span className="muted">Organization</span><span>{me?.workspace?.name ?? 'Not joined yet'}</span></div>
              <div className="kv"><span className="muted">Slug</span><span>{me?.workspace?.slug ?? 'Set during organization onboarding'}</span></div>
              <div className="kv"><span className="muted">User</span><span>{me?.profile?.email ?? 'demo@workspace.local'}</span></div>
              <div className="kv"><span className="muted">Role</span><span>{me?.profile?.role ?? 'admin'}</span></div>
            </>
          )}
        </div>
      </div>

      <div className="section-label">Account</div>
      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">Telegram Profiles</div>
          <div className="card-subtitle" style={{ marginBottom: 16 }}>
            Re-check lead and connected account profile pictures, and mark lead usernames that no longer exist on Telegram.
          </div>
          <button
            className="btn-secondary"
            onClick={handleRefreshProfiles}
            disabled={refreshingProfiles}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={refreshingProfiles ? { animation: 'spin 1s linear infinite' } : undefined}>
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
            {refreshingProfiles ? 'Refreshing…' : 'Refresh Telegram Profiles'}
          </button>
          {profileRefreshStatus ? (
            <div className={`status-callout ${profileRefreshTone === 'success' ? 'success' : profileRefreshTone === 'danger' ? 'danger' : ''}`} style={{ marginTop: 14 }}>
              {profileRefreshStatus}
            </div>
          ) : null}
        </div>

        <div className="card">
          <div className="card-title">Sign Out</div>
          <div className="card-subtitle" style={{ marginBottom: 16 }}>
            End your current session and return to the login screen.
          </div>
          <button
            className="btn"
            onClick={handleLogout}
            disabled={loggingOut}
            style={{
              background: 'transparent',
              color: '#e74c3c',
              border: '1px solid #e74c3c',
            }}
          >
            {loggingOut ? 'Signing out…' : 'Sign Out'}
          </button>
        </div>
      </div>
    </div>
  );
}
