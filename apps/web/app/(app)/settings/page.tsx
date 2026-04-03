'use client';

import { useEffect, useState } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';

export default function SettingsPage() {
  const [me, setMe] = useState<any>(null);
  useEffect(() => {
    void fetchJson<any>('/api/me').then(setMe);
  }, []);

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
    </div>
  );
}
