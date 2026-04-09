'use client';

import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';
import { Skeleton } from '@/components/ui/skeleton';

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
