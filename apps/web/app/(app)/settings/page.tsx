'use client';

import { useEffect, useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
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
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Appearance</div>
            <div className="card-subtitle" style={{ marginTop: 8 }}>Keep the same command-center visual language in dark or light mode.</div>
          </div>
        </div>
        <ThemeToggle />
      </div>

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

      <div className="section-label">Supabase & Railway Checklist</div>
      <div className="grid grid-2">
        <div className="card setup-list">
          <div className="setup-item">Create one Supabase project and enable email auth.</div>
          <div className="setup-item">Run the SQL in <code>supabase/migrations</code>, then create your first organization inside the app.</div>
          <div className="setup-item">Set the env vars from <code>.env.example</code> in Railway for both services.</div>
          <div className="setup-item">Deploy <code>apps/web</code> and <code>apps/bot</code> as separate Railway services.</div>
        </div>
        <div className="card setup-list">
          <div className="setup-item">Create the Telegram bot in BotFather and paste the token into Railway.</div>
          <div className="setup-item">Set the bot webhook to the bot service public URL.</div>
          <div className="setup-item">Open the bot as a teammate, run <code>/link CODE</code>, and then use <code>/next</code> to pull tasks.</div>
          <div className="setup-item">Use the web app to manage leads, campaigns, accounts, and campaign launch state.</div>
        </div>
      </div>
    </div>
  );
}
