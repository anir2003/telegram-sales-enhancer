'use client';

import { useEffect, useState } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';

export default function SettingsPage() {
  const [me, setMe] = useState<any>(null);
  const [linkCode, setLinkCode] = useState<string>('');
  const linkedTelegram = me?.profile?.telegram_username ? `@${me.profile.telegram_username}` : null;

  useEffect(() => {
    void fetchJson('/api/me').then(setMe);
  }, []);

  const generateCode = async () => {
    const response = await fetchJson('/api/bot/link-code', { method: 'POST' });
    setLinkCode(response.linkCode?.code ?? '');
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
          <div className="kv"><span className="muted">Telegram linked</span><span>{linkedTelegram ?? 'Not linked yet'}</span></div>
        </div>

        <div className="card">
          <div className="card-title">Telegram Bot Linking</div>
          <div className="card-subtitle" style={{ marginTop: 8 }}>
            This links your teammate identity to the task bot. Sender accounts for campaigns are managed separately on the Accounts page.
          </div>
          <div className="btn-row" style={{ marginTop: 14 }}>
            <button className="btn" onClick={generateCode}>Generate Link Code</button>
            {linkCode && <span className="badge">{linkCode}</span>}
          </div>
          {linkCode ? (
            <div className="status-callout success" style={{ marginTop: 14 }}>
              Send <code>/link {linkCode}</code> or just paste <code>{linkCode}</code> directly into Telegram.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
