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
  scam: boolean;
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
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 9px', borderRadius: 4, fontSize: 10, fontWeight: 600,
      background: `${color}15`, border: `1px solid ${color}40`, color,
      letterSpacing: '0.02em',
    }}>{label}</span>
  );
}

// ─── Stat item ───────────────────────────────────────────────────────
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="tgc-stat">
      <div className="tgc-stat-value">{value}</div>
      <div className="tgc-stat-label">{label}</div>
    </div>
  );
}

// ─── Inline icon with hover tooltip ─────────────────────────────────
function InlineIcon({ tooltip, children }: { tooltip: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  const show = () => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ top: r.top - 6, left: r.left + r.width / 2 });
    }
    setVisible(true);
  };

  return (
    <span
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={() => setVisible(false)}
      style={{ display: 'inline-flex', alignItems: 'center', cursor: 'default' }}
    >
      {children}
      {visible && pos && (
        <div style={{
          position: 'fixed', zIndex: 9999,
          top: pos.top, left: pos.left,
          transform: 'translate(-50%, -100%)',
          background: '#1c1c1c', border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 5, padding: '4px 8px',
          fontSize: 11, color: 'rgba(255,255,255,0.55)',
          whiteSpace: 'nowrap', pointerEvents: 'none',
          boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
        }}>
          {tooltip}
          <span style={{
            position: 'absolute', top: '100%', left: '50%',
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderTop: '4px solid #1c1c1c',
          }} />
        </div>
      )}
    </span>
  );
}

// ─── User Result Card ────────────────────────────────────────────────
function UserCard({ user, onAddLead, addLeadState, addLeadMsg }: {
  user: TgUser;
  onAddLead: (u: TgUser) => void;
  addLeadState: 'idle' | 'loading' | 'done' | 'error';
  addLeadMsg: string;
}) {
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Unknown';
  const hasFlagBadges = user.verified || user.bot || user.fake || user.restricted || user.scam;

  return (
    <div className="tgc-result-card">

      {/* ── Identity ────────────────────────────────────────────────── */}
      <div className="tgc-result-identity">
        <div>
          <div className="tgc-result-name">
            {displayName}
            {/* Premium: small star inline, tooltip on hover */}
            {user.premium && (
              <InlineIcon tooltip="Telegram Premium">
                <svg
                  width="14" height="14" viewBox="0 0 24 24"
                  fill="#f59e0b" stroke="#f59e0b" strokeWidth="0"
                  style={{ marginLeft: 6, marginBottom: -1, flexShrink: 0 }}
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </InlineIcon>
            )}
            {/* Verified: blue tick inline */}
            {user.verified && (
              <InlineIcon tooltip="Verified account">
                <svg
                  width="14" height="14" viewBox="0 0 24 24"
                  fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round"
                  style={{ marginLeft: 5, marginBottom: -1, flexShrink: 0 }}
                >
                  <circle cx="12" cy="12" r="10" fill="#6366f1" stroke="none" opacity="0.15" />
                  <polyline points="7 12 10.5 15.5 17 9" stroke="#6366f1" />
                </svg>
              </InlineIcon>
            )}
          </div>
          {user.username && (
            <div className="tgc-result-handle">@{user.username}</div>
          )}
        </div>
        {hasFlagBadges && (
          <div className="tgc-result-badges">
            {user.bot && <Badge label="Bot" color="#14b8a6" />}
            {user.scam && <Badge label="⚠ Scam" color="#ef4444" />}
            {user.fake && <Badge label="⚠ Fake" color="#ef4444" />}
            {user.restricted && <Badge label="Restricted" color="#f97316" />}
          </div>
        )}
      </div>

      {/* ── Bio ─────────────────────────────────────────────────────── */}
      {user.bio ? (
        <div className="tgc-result-bio">
          <div className="tgc-section-label">Bio</div>
          <div className="tgc-bio-text">{user.bio}</div>
        </div>
      ) : (
        <div className="tgc-result-bio tgc-no-bio">
          <div className="tgc-section-label">Bio</div>
          <div className="tgc-bio-empty">No bio set</div>
        </div>
      )}

      {/* ── Stats row ───────────────────────────────────────────────── */}
      <div className="tgc-result-stats">
        <Stat label="Last seen" value={user.lastSeen} />
        <div className="tgc-stat-divider" />
        <Stat label="Telegram ID" value={user.id} />
        {user.commonChats > 0 && (
          <>
            <div className="tgc-stat-divider" />
            <Stat label="Common chats" value={String(user.commonChats)} />
          </>
        )}
        {user.phone && (
          <>
            <div className="tgc-stat-divider" />
            <Stat label="Phone" value={user.phone} />
          </>
        )}
      </div>

      {/* ── Actions ─────────────────────────────────────────────────── */}
      <div className="tgc-result-footer">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn"
            onClick={() => onAddLead(user)}
            disabled={addLeadState === 'loading' || addLeadState === 'done'}
            style={{ fontSize: 12, padding: '7px 16px' }}
          >
            {addLeadState === 'loading' ? 'Adding…' : addLeadState === 'done' ? '✓ Added' : '+ Add to Leads'}
          </button>
          {user.username && (
            <a
              href={`https://t.me/${user.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
              style={{ fontSize: 12, padding: '7px 14px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
              Open in Telegram
            </a>
          )}
        </div>
        {addLeadState === 'error' && (
          <div className="tgc-toast error">{addLeadMsg}</div>
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

  // Add-lead
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
    setLookupLoading(true); setResult(null); setError(null); setAddLeadState('idle');
    try {
      const res = await fetchJson<LookupResult & { error?: string }>('/api/experimental/tg-lookup', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim() }),
      });
      if ((res as { error?: string })?.error) { setError((res as { error: string }).error); }
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
      setAddLeadState('done');
    } catch (e) { setAddLeadState('error'); setAddLeadMsg(String(e)); }
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
            Look up any Telegram username — bio, status, account flags, and more.
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

      {/* ── Steps ───────────────────────────────────────────────────── */}
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
          <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0 4px', fontSize: 14 }}>✕</button>
        </div>
      )}

      <div className="tgc-layout">

        {/* ── Left panel ───────────────────────────────────────────── */}
        <div className="tgc-left">

          {/* Step 1: API Credentials */}
          {!hasCredentials && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 4 }}>Add your Telegram API</div>
              <div className="card-subtitle" style={{ marginBottom: 20 }}>
                Get <code style={{ color: 'var(--accent)', fontSize: 11 }}>api_id</code> &amp; <code style={{ color: 'var(--accent)', fontSize: 11 }}>api_hash</code> from{' '}
                <a href="https://my.telegram.org/apps" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>my.telegram.org/apps</a>.
                Stored per profile, not shared.
              </div>
              <div className="tgc-form">
                <div className="tgc-field">
                  <label className="tgc-label">API ID</label>
                  <input className="auth-input" placeholder="12345678" value={apiId} onChange={e => setApiId(e.target.value)} type="text" />
                </div>
                <div className="tgc-field">
                  <label className="tgc-label">API Hash</label>
                  <input className="auth-input" placeholder="abcdef1234…" value={apiHash} onChange={e => setApiHash(e.target.value)} type="password" />
                </div>
                <div className="tgc-field">
                  <label className="tgc-label">Phone Number</label>
                  <input className="auth-input" placeholder="+1 234 567 8900" value={phone} onChange={e => setPhone(e.target.value)} type="tel" />
                </div>
                <button className="btn" onClick={saveCred} disabled={savingCred} style={{ marginTop: 4 }}>
                  {savingCred ? 'Saving…' : 'Save & Continue →'}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Connect */}
          {hasCredentials && !isAuthenticated && (
            <div className="card">
              <div className="tgc-auth-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.7a19.79 19.79 0 01-3.07-8.67A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
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
                      <input className="auth-input" placeholder="Two-factor password" value={twoFaPass} onChange={e => setTwoFaPass(e.target.value)} type="password" />
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

              <button onClick={disconnect} style={{ marginTop: 14, background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 11, cursor: 'pointer', width: '100%', textAlign: 'center' }}>
                Use a different account
              </button>
            </div>
          )}

          {/* Step 3: Lookup */}
          {isAuthenticated && (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 4 }}>Check a Username</div>
              <div className="card-subtitle" style={{ marginBottom: 16 }}>Enter any Telegram handle to look up their profile.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', fontSize: 13, fontWeight: 500, pointerEvents: 'none' }}>@</span>
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
                <button className="btn" onClick={lookupUser} disabled={lookupLoading || !username.trim()} style={{ flexShrink: 0, padding: '0 16px', minWidth: 44 }}>
                  {lookupLoading
                    ? <span className="tgc-spinner" />
                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  }
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right panel: Result ───────────────────────────────────── */}
        <div className="tgc-right">
          {lookupLoading && (
            <div className="tgc-empty-state">
              <div className="tgc-pulse-dot" />
              <span>Querying Telegram…</span>
            </div>
          )}

          {!lookupLoading && result === null && isAuthenticated && (
            <div className="tgc-empty-state">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" style={{ opacity: 0.15 }}>
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <span>Enter a username and press search</span>
            </div>
          )}

          {!lookupLoading && result !== null && !result.found && (
            <div className="tgc-empty-state">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ opacity: 0.25 }}>
                <circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>
              </svg>
              <span style={{ color: 'var(--text-muted)' }}>{result.message}</span>
            </div>
          )}

          {!lookupLoading && result?.found && (
            <UserCard
              user={result.user}
              onAddLead={addToLeads}
              addLeadState={addLeadState}
              addLeadMsg={addLeadMsg}
            />
          )}

          {!isAuthenticated && !lookupLoading && (
            <div className="tgc-placeholder-card">
              <div style={{ flex: 1 }}>
                <div className="tgc-placeholder-line wide" />
                <div className="tgc-placeholder-line medium" style={{ marginTop: 8 }} />
                <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
                  <div className="tgc-placeholder-pill" />
                  <div className="tgc-placeholder-pill" style={{ width: 48 }} />
                </div>
                <div style={{ height: 1, background: 'var(--border-soft)', margin: '18px 0' }} />
                <div className="tgc-placeholder-line" style={{ width: '85%' }} />
                <div className="tgc-placeholder-line wide" style={{ marginTop: 6 }} />
                <div className="tgc-placeholder-line medium" style={{ marginTop: 6 }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
