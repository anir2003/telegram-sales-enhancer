'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';

type CredStatus = {
  api_id: string;
  phone: string;
  is_authenticated: boolean;
  has_code_pending: boolean;
} | null;

type TgUser = {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  premium: boolean;
  verified: boolean;
  fake: boolean;
  bot: boolean;
  restricted: boolean;
  bio: string | null;
  commonChats: number;
  lastSeen: string;
};

type LookupResult =
  | { found: true; user: TgUser }
  | { found: false; message: string }
  | null;

// ─── Step indicator ─────────────────────────────────────────────────
function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="tgc-step">
      <div className={`tgc-step-circle ${active ? 'active' : done ? 'done' : ''}`}>
        {done ? (
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="3 8 6.5 12 13 4" /></svg>
        ) : n}
      </div>
      <span className={`tgc-step-label ${active ? 'active' : done ? 'done' : ''}`}>{label}</span>
    </div>
  );
}

// ─── Badge ──────────────────────────────────────────────────────────
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
      background: `${color}18`, border: `1px solid ${color}50`, color,
    }}>{label}</span>
  );
}

// ─── User Result Card ────────────────────────────────────────────────
function UserCard({ user, onAddLead }: { user: TgUser; onAddLead: (u: TgUser) => void }) {
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Unknown';
  return (
    <div className="tgc-result-card">
      {/* Name + username + badges */}
      <div className="tgc-result-header">
        {/* Avatar */}
        <div className="tgc-avatar">
          <span>{displayName.charAt(0).toUpperCase()}</span>
        </div>
        <div>
          <div className="tgc-result-name">{displayName}</div>
          {user.username && <div className="tgc-result-username">@{user.username}</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
            {user.premium && <Badge label="⭐ Premium" color="#f59e0b" />}
            {user.verified && <Badge label="✓ Verified" color="#6366f1" />}
            {user.bot && <Badge label="🤖 Bot" color="#14b8a6" />}
            {user.fake && <Badge label="⚠ Fake" color="#ef4444" />}
            {user.restricted && <Badge label="Restricted" color="#f97316" />}
          </div>
        </div>
      </div>

      {/* Details grid */}
      <div className="tgc-result-grid">
        {user.bio && (
          <div className="tgc-result-kv full">
            <span className="tgc-kv-label">Bio</span>
            <span className="tgc-kv-value">{user.bio}</span>
          </div>
        )}
        <div className="tgc-result-kv">
          <span className="tgc-kv-label">Telegram ID</span>
          <span className="tgc-kv-value mono">{user.id}</span>
        </div>
        <div className="tgc-result-kv">
          <span className="tgc-kv-label">Last Seen</span>
          <span className="tgc-kv-value">{user.lastSeen}</span>
        </div>
        {user.phone && (
          <div className="tgc-result-kv">
            <span className="tgc-kv-label">Phone</span>
            <span className="tgc-kv-value mono">{user.phone}</span>
          </div>
        )}
        {user.commonChats > 0 && (
          <div className="tgc-result-kv">
            <span className="tgc-kv-label">Common Chats</span>
            <span className="tgc-kv-value">{user.commonChats}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="tgc-result-actions">
        <button className="btn" onClick={() => onAddLead(user)} style={{ fontSize: 12, padding: '7px 16px' }}>
          + Add to Leads
        </button>
        {user.username && (
          <a
            href={`https://t.me/${user.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
            style={{ fontSize: 12, padding: '7px 14px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
            Open in Telegram
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────
export default function TelegramCheckerPage() {
  const [cred, setCred] = useState<CredStatus>(undefined as unknown as CredStatus);
  const [loading, setLoading] = useState(true);

  // Setup form
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phone, setPhone] = useState('');
  const [savingCred, setSavingCred] = useState(false);

  // Auth
  const [authStep, setAuthStep] = useState<'idle' | 'sending' | 'code' | 'verifying' | '2fa' | 'done'>('idle');
  const [code, setCode] = useState('');
  const [twoFaPass, setTwoFaPass] = useState('');
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Lookup
  const [username, setUsername] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [result, setResult] = useState<LookupResult>(null);
  const [error, setError] = useState<string | null>(null);

  // Add-lead toast
  const [addLeadState, setAddLeadState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [addLeadMsg, setAddLeadMsg] = useState('');

  const loadCred = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchJson<{ credential: CredStatus }>('/api/experimental/tg-credentials');
      setCred(res.credential);
      if (res.credential?.is_authenticated) setAuthStep('done');
      else if (res.credential?.has_code_pending) setAuthStep('code');
      else if (res.credential) setAuthStep('idle');
    } catch { setCred(null); }
    setLoading(false);
  }, []);

  useEffect(() => { void loadCred(); }, [loadCred]);
  useEffect(() => { if (authStep === 'code') setTimeout(() => codeInputRef.current?.focus(), 100); }, [authStep]);

  const saveCred = async () => {
    if (!apiId || !apiHash || !phone) { setError('All fields are required.'); return; }
    setSavingCred(true); setError(null);
    try {
      await fetchJson('/api/experimental/tg-credentials', {
        method: 'POST',
        body: JSON.stringify({ api_id: apiId, api_hash: apiHash, phone }),
      });
      await loadCred();
    } catch (e) { setError(String(e)); }
    setSavingCred(false);
  };

  const sendCode = async () => {
    setAuthStep('sending'); setError(null);
    try {
      const res = await fetchJson<{ ok: boolean; error?: string }>('/api/experimental/tg-auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'send-code' }),
      });
      if (res.error) { setError(res.error); setAuthStep('idle'); return; }
      setAuthStep('code');
      await loadCred();
    } catch (e) { setError(String(e)); setAuthStep('idle'); }
  };

  const verifyCode = async () => {
    if (!code.trim()) { setError('Enter the code.'); return; }
    setAuthStep('verifying'); setError(null);
    try {
      const res = await fetchJson<{ ok: boolean; step?: string; error?: string }>('/api/experimental/tg-auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'verify', code: code.trim(), password: twoFaPass || undefined }),
      });
      if (res.error) { setError(res.error); setAuthStep('code'); return; }
      if (res.step === '2fa') { setAuthStep('2fa'); return; }
      setAuthStep('done');
      await loadCred();
    } catch (e) { setError(String(e)); setAuthStep('code'); }
  };

  const disconnect = async () => {
    setError(null);
    try {
      await fetchJson('/api/experimental/tg-credentials', { method: 'DELETE' });
      setCred(null); setAuthStep('idle'); setResult(null);
      setApiId(''); setApiHash(''); setPhone('');
    } catch (e) { setError(String(e)); }
  };

  const lookupUser = async () => {
    if (!username.trim()) return;
    setLookupLoading(true); setResult(null); setError(null);
    try {
      const res = await fetchJson<LookupResult & { error?: string; message?: string }>('/api/experimental/tg-lookup', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim() }),
      });
      if (res?.error) { setError(res.error); }
      else { setResult(res as LookupResult); }
    } catch (e) { setError(String(e)); }
    setLookupLoading(false);
  };

  const addToLeads = async (user: TgUser) => {
    setAddLeadState('loading'); setAddLeadMsg('');
    try {
      await fetchJson('/api/leads', {
        method: 'POST',
        body: JSON.stringify({
          first_name: user.firstName ?? '',
          last_name: user.lastName ?? '',
          telegram_username: user.username ?? '',
          company_name: '',
          tags: ['tg-checker'],
          source: 'Telegram Checker',
        }),
      });
      setAddLeadState('done'); setAddLeadMsg(`@${user.username ?? user.firstName} added to leads.`);
    } catch (e) { setAddLeadState('error'); setAddLeadMsg(String(e)); }
    setTimeout(() => setAddLeadState('idle'), 3000);
  };

  const isAuthenticated = authStep === 'done' || cred?.is_authenticated;
  const hasCredentials = Boolean(cred);
  const currentStep = !hasCredentials ? 1 : !isAuthenticated ? 2 : 3;

  if (loading) {
    return (
      <div className="page-content">
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="page-content">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="tgc-page-header">
        <div>
          <div className="tgc-page-title">
            <span className="exp-badge-label">β Experimental</span>
            Telegram Username Checker
          </div>
          <div className="tgc-page-subtitle">
            Look up any Telegram username using your personal API credentials.
          </div>
        </div>
        {isAuthenticated && cred && (
          <div className="tgc-connected-pill">
            <span className="tgc-online-dot" />
            Connected · {cred.phone}
            <button className="tgc-disconnect-btn" onClick={disconnect}>Disconnect</button>
          </div>
        )}
      </div>

      {/* ── Steps indicator ─────────────────────────────────────────── */}
      <div className="tgc-steps">
        <Step n={1} label="Add API Credentials" active={currentStep === 1} done={currentStep > 1} />
        <div className="tgc-step-line" />
        <Step n={2} label="Connect Account" active={currentStep === 2} done={currentStep > 2} />
        <div className="tgc-step-line" />
        <Step n={3} label="Look Up Users" active={currentStep === 3} done={false} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="tgc-error-banner">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0 4px' }}>✕</button>
        </div>
      )}

      <div className="tgc-layout">

        {/* ── Left: Setup / Auth ────────────────────────────────────── */}
        <div className="tgc-left">

          {/* Step 1: API Credentials */}
          {!hasCredentials && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 4 }}>Add your Telegram API</div>
              <div className="card-subtitle" style={{ marginBottom: 20 }}>
                Get your <code style={{ color: 'var(--accent)' }}>api_id</code> and <code style={{ color: 'var(--accent)' }}>api_hash</code> from{' '}
                <a href="https://my.telegram.org/apps" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>my.telegram.org/apps</a>.
                These are linked to your profile only.
              </div>

              <div className="tgc-form">
                <div className="tgc-field">
                  <label className="tgc-label">API ID</label>
                  <input
                    className="auth-input"
                    placeholder="12345678"
                    value={apiId}
                    onChange={e => setApiId(e.target.value)}
                    type="text"
                  />
                </div>
                <div className="tgc-field">
                  <label className="tgc-label">API Hash</label>
                  <input
                    className="auth-input"
                    placeholder="abcdef1234567890abcdef"
                    value={apiHash}
                    onChange={e => setApiHash(e.target.value)}
                    type="password"
                  />
                </div>
                <div className="tgc-field">
                  <label className="tgc-label">Phone Number</label>
                  <input
                    className="auth-input"
                    placeholder="+1 234 567 8900"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    type="tel"
                  />
                </div>
                <button className="btn" onClick={saveCred} disabled={savingCred} style={{ marginTop: 4 }}>
                  {savingCred ? 'Saving…' : 'Save & Continue →'}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Connect (send code) */}
          {hasCredentials && !isAuthenticated && (
            <div className="card">
              <div className="tgc-auth-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.7a19.79 19.79 0 01-3.07-8.67A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
              </div>
              <div className="card-title" style={{ marginBottom: 4, textAlign: 'center' }}>Connect your Account</div>
              <div className="card-subtitle" style={{ marginBottom: 20, textAlign: 'center' }}>
                Sending to <strong style={{ color: 'var(--text-muted)' }}>{cred?.phone}</strong>
              </div>

              {(authStep === 'idle' || authStep === 'sending') && (
                <button className="btn" onClick={sendCode} disabled={authStep === 'sending'} style={{ width: '100%' }}>
                  {authStep === 'sending' ? 'Sending code…' : 'Send Telegram Code'}
                </button>
              )}

              {(authStep === 'code' || authStep === 'verifying' || authStep === '2fa') && (
                <div className="tgc-form">
                  <div className="tgc-field">
                    <label className="tgc-label">Verification Code</label>
                    <input
                      ref={codeInputRef}
                      className="auth-input"
                      placeholder="12345"
                      value={code}
                      onChange={e => setCode(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && verifyCode()}
                      type="text"
                      maxLength={8}
                    />
                  </div>
                  {authStep === '2fa' && (
                    <div className="tgc-field">
                      <label className="tgc-label">2FA Password</label>
                      <input
                        className="auth-input"
                        placeholder="Your two-factor password"
                        value={twoFaPass}
                        onChange={e => setTwoFaPass(e.target.value)}
                        type="password"
                      />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={verifyCode} disabled={authStep === 'verifying'} style={{ flex: 1 }}>
                      {authStep === 'verifying' ? 'Verifying…' : 'Verify →'}
                    </button>
                    <button className="btn-secondary" onClick={sendCode} style={{ fontSize: 11 }}>Resend</button>
                  </div>
                </div>
              )}

              <button
                onClick={disconnect}
                style={{ marginTop: 16, background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 11, cursor: 'pointer', width: '100%', textAlign: 'center' }}
              >
                Use a different account
              </button>
            </div>
          )}

          {/* Step 3: Username Lookup */}
          {isAuthenticated && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 4 }}>Check a Username</div>
              <div className="card-subtitle" style={{ marginBottom: 16 }}>Enter any Telegram username to look up their profile.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', fontSize: 13, fontWeight: 500 }}>@</span>
                  <input
                    className="auth-input"
                    style={{ paddingLeft: 22 }}
                    placeholder="username"
                    value={username}
                    onChange={e => setUsername(e.target.value.replace(/^@/, ''))}
                    onKeyDown={e => e.key === 'Enter' && lookupUser()}
                    type="text"
                  />
                </div>
                <button className="btn" onClick={lookupUser} disabled={lookupLoading || !username.trim()} style={{ flexShrink: 0, padding: '0 18px' }}>
                  {lookupLoading ? (
                    <span className="tgc-spinner" />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  )}
                </button>
              </div>

              {/* Add lead toast */}
              {addLeadState !== 'idle' && (
                <div className={`tgc-toast ${addLeadState}`}>
                  {addLeadState === 'loading' && 'Adding to leads…'}
                  {addLeadState === 'done' && `✓ ${addLeadMsg}`}
                  {addLeadState === 'error' && `✕ ${addLeadMsg}`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right: Results ────────────────────────────────────────── */}
        <div className="tgc-right">
          {lookupLoading && (
            <div className="tgc-empty-state">
              <div className="tgc-pulse-dot" />
              <span>Querying Telegram…</span>
            </div>
          )}

          {!lookupLoading && result === null && isAuthenticated && (
            <div className="tgc-empty-state">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" style={{ opacity: 0.2 }}>
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <span>Results appear here</span>
            </div>
          )}

          {!lookupLoading && result !== null && !result.found && (
            <div className="tgc-empty-state">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ opacity: 0.3 }}>
                <circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>
              </svg>
              <span style={{ color: 'var(--text-muted)' }}>{result.message}</span>
            </div>
          )}

          {!lookupLoading && result?.found && (
            <UserCard user={result.user} onAddLead={addToLeads} />
          )}

          {/* Placeholder when not yet authenticated */}
          {!isAuthenticated && (
            <div className="tgc-placeholder-card">
              <div className="tgc-placeholder-avatar" />
              <div style={{ flex: 1 }}>
                <div className="tgc-placeholder-line wide" />
                <div className="tgc-placeholder-line medium" style={{ marginTop: 8 }} />
                <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                  <div className="tgc-placeholder-pill" />
                  <div className="tgc-placeholder-pill" />
                </div>
                <div className="tgc-placeholder-line wide" style={{ marginTop: 16 }} />
                <div className="tgc-placeholder-line medium" style={{ marginTop: 6 }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
