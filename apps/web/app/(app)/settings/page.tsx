'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchJson } from '@/lib/web/fetch-json';

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    void fetchJson<any>('/api/me').then(setMe);
  }, []);

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
          <div className="kv"><span className="muted">Configured</span><span>{me?.configured ? 'Yes' : 'Demo mode'}</span></div>
          <div className="kv"><span className="muted">Organization</span><span>{me?.workspace?.name ?? 'Not joined yet'}</span></div>
          <div className="kv"><span className="muted">Slug</span><span>{me?.workspace?.slug ?? 'Set during organization onboarding'}</span></div>
          <div className="kv"><span className="muted">User</span><span>{me?.profile?.email ?? 'demo@workspace.local'}</span></div>
          <div className="kv"><span className="muted">Role</span><span>{me?.profile?.role ?? 'admin'}</span></div>
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
