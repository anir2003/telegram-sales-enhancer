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
