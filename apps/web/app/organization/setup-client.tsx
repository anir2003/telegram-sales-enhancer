'use client';

import { useState } from 'react';
import Image from 'next/image';
import { fetchJson } from '@/lib/web/fetch-json';

const timezones = ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York', 'Asia/Dubai', 'Asia/Singapore'];

const STEPS = [
  { n: 1, title: 'Sign in', desc: 'Personal account' },
  { n: 2, title: 'Organisation', desc: 'Create or join a workspace' },
  { n: 3, title: 'Start closing', desc: 'Launch campaigns' },
];

export function OrganizationSetupClient({ email, fullName }: { email: string; fullName: string }) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'neutral' | 'success' | 'danger'>('neutral');
  const [createForm, setCreateForm] = useState({ name: '', slug: '', timezone: 'UTC', password: '', confirmPassword: '' });
  const [joinForm, setJoinForm] = useState({ slug: '', password: '' });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createForm.password !== createForm.confirmPassword) {
      setMessageTone('danger'); setMessage('Passwords do not match.'); return;
    }
    setIsSubmitting(true);
    try {
      await fetchJson('/api/organization', { method: 'POST', body: JSON.stringify({ mode: 'create', name: createForm.name, slug: createForm.slug, timezone: createForm.timezone, password: createForm.password }) });
      setMessageTone('success'); setMessage('Organisation created. Redirecting…');
      window.location.assign('/dashboard');
    } catch (err) {
      setMessageTone('danger'); setMessage(err instanceof Error ? err.message : 'Could not create organisation.');
    }
    setIsSubmitting(false);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await fetchJson('/api/organization', { method: 'POST', body: JSON.stringify({ mode: 'join', slug: joinForm.slug, password: joinForm.password }) });
      setMessageTone('success'); setMessage('Organisation joined. Redirecting…');
      window.location.assign('/dashboard');
    } catch (err) {
      setMessageTone('danger'); setMessage(err instanceof Error ? err.message : 'Could not join organisation.');
    }
    setIsSubmitting(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#060908',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 20px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 800,
        display: 'grid',
        gridTemplateColumns: '5fr 7fr',
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
      }}>

        {/* ── Left panel ── */}
        <div style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(155deg, #0e2a1c 0%, #091a10 50%, #040c08 100%)',
          padding: '40px 32px',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Ambient glow */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse 90% 60% at 15% 5%, rgba(34,197,94,0.16) 0%, transparent 65%)',
          }} />

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1 }}>
            <Image src="/logoteg.png" alt="Logo" width={22} height={22} style={{ borderRadius: 4, objectFit: 'contain' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.02em' }}>TG Sales Enhancer</span>
          </div>

          {/* Headline */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', zIndex: 1, paddingTop: 32 }}>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Step 2 of 3</p>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', lineHeight: 1.2, marginBottom: 8, letterSpacing: '-0.025em' }}>
              Set up your<br />workspace.
            </h1>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.65, marginBottom: 36 }}>
              {fullName || email
                ? `Hi ${fullName || email.split('@')[0]}. Create a workspace or join your team.`
                : 'Create a workspace or join your team.'}
            </p>

            {/* Step list */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {STEPS.map((step, idx) => {
                const isActive = step.n === 2;
                const isDone = step.n < 2;
                return (
                  <div key={step.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingBottom: idx < STEPS.length - 1 ? 22 : 0, position: 'relative' }}>
                    {/* Connector */}
                    {idx < STEPS.length - 1 && (
                      <div style={{
                        position: 'absolute', left: 10, top: 22, bottom: 0, width: 1,
                        background: isDone ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)',
                      }} />
                    )}
                    {/* Dot */}
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 700,
                      background: isActive ? '#22c55e' : isDone ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.07)',
                      color: isActive ? '#fff' : isDone ? '#4ade80' : 'rgba(255,255,255,0.25)',
                      border: `1px solid ${isActive ? 'transparent' : isDone ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.1)'}`,
                    }}>
                      {isDone ? '✓' : step.n}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? '#fff' : isDone ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)', marginBottom: 2 }}>{step.title}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>{step.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Right panel ── */}
        <div style={{
          background: '#0a0d0b',
          padding: '40px 36px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}>

          {/* Mode toggle */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: 3, marginBottom: 24 }}>
            {(['create', 'join'] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); setMessage(''); }}
                style={{
                  flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 500,
                  border: 'none', cursor: 'pointer', borderRadius: 4,
                  background: mode === m ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: mode === m ? '#fff' : 'rgba(255,255,255,0.3)',
                  fontFamily: 'inherit', transition: 'all 0.15s',
                }}>
                {m === 'create' ? 'Create Organisation' : 'Join Existing'}
              </button>
            ))}
          </div>

          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4, letterSpacing: '-0.01em' }}>
            {mode === 'create' ? 'New workspace' : 'Join workspace'}
          </h2>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 24 }}>
            {mode === 'create'
              ? 'Set up a shared space for your team.'
              : "Enter your team's slug and password."}
          </p>

          {mode === 'create' ? (
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, letterSpacing: '0.03em' }}>ORGANISATION NAME</label>
                <input className="auth-input" placeholder="Acme Inc." required value={createForm.name}
                  onChange={e => setCreateForm(c => ({ ...c, name: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, letterSpacing: '0.03em' }}>SLUG</label>
                  <input className="auth-input" placeholder="acme" value={createForm.slug}
                    onChange={e => setCreateForm(c => ({ ...c, slug: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, letterSpacing: '0.03em' }}>TIMEZONE</label>
                  <select className="auth-input" value={createForm.timezone}
                    onChange={e => setCreateForm(c => ({ ...c, timezone: e.target.value }))}>
                    {timezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, letterSpacing: '0.03em' }}>PASSWORD</label>
                  <input className="auth-input" type="password" placeholder="Team password" required value={createForm.password}
                    onChange={e => setCreateForm(c => ({ ...c, password: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, letterSpacing: '0.03em' }}>CONFIRM</label>
                  <input className="auth-input" type="password" placeholder="Re-enter" required value={createForm.confirmPassword}
                    onChange={e => setCreateForm(c => ({ ...c, confirmPassword: e.target.value }))} />
                </div>
              </div>
              {message && (
                <div style={{
                  padding: '9px 12px', borderRadius: 6, fontSize: 11,
                  background: messageTone === 'danger' ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
                  border: `1px solid ${messageTone === 'danger' ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
                  color: messageTone === 'danger' ? '#fca5a5' : '#86efac',
                }}>{message}</div>
              )}
              <button type="submit" disabled={isSubmitting} style={{
                marginTop: 6, width: '100%', padding: '10px 0', fontSize: 12, fontWeight: 600,
                border: 'none', borderRadius: 6, cursor: isSubmitting ? 'not-allowed' : 'pointer',
                background: isSubmitting ? 'rgba(255,255,255,0.12)' : '#fff',
                color: isSubmitting ? 'rgba(255,255,255,0.35)' : '#080808',
                fontFamily: 'inherit', transition: 'all 0.15s',
              }}>
                {isSubmitting ? 'Creating…' : 'Create Organisation'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, letterSpacing: '0.03em' }}>WORKSPACE SLUG</label>
                <input className="auth-input" placeholder="acme" required value={joinForm.slug}
                  onChange={e => setJoinForm(c => ({ ...c, slug: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, letterSpacing: '0.03em' }}>PASSWORD</label>
                <input className="auth-input" type="password" placeholder="Team password" required value={joinForm.password}
                  onChange={e => setJoinForm(c => ({ ...c, password: e.target.value }))} />
              </div>
              {message && (
                <div style={{
                  padding: '9px 12px', borderRadius: 6, fontSize: 11,
                  background: messageTone === 'danger' ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
                  border: `1px solid ${messageTone === 'danger' ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
                  color: messageTone === 'danger' ? '#fca5a5' : '#86efac',
                }}>{message}</div>
              )}
              <button type="submit" disabled={isSubmitting} style={{
                marginTop: 6, width: '100%', padding: '10px 0', fontSize: 12, fontWeight: 600,
                border: 'none', borderRadius: 6, cursor: isSubmitting ? 'not-allowed' : 'pointer',
                background: isSubmitting ? 'rgba(255,255,255,0.12)' : '#fff',
                color: isSubmitting ? 'rgba(255,255,255,0.35)' : '#080808',
                fontFamily: 'inherit', transition: 'all 0.15s',
              }}>
                {isSubmitting ? 'Joining…' : 'Join Organisation'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
