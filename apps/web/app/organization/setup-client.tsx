'use client';

import { useState } from 'react';
import Image from 'next/image';
import { fetchJson } from '@/lib/web/fetch-json';

const timezones = ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York', 'Asia/Dubai', 'Asia/Singapore'];

const STEPS = [
  { n: 1, title: 'Sign in', desc: 'Personal account' },
  { n: 2, title: 'Organisation', desc: 'Create or join' },
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
      setMessageTone('success'); setMessage('Organisation created. Redirecting...');
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
      setMessageTone('success'); setMessage('Organisation joined. Redirecting...');
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
        maxWidth: 820,
        height: 540,
        display: 'grid',
        gridTemplateColumns: '5fr 7fr',
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.09)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.65)',
      }}>

        {/* ── Left panel ── */}
        <div style={{
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(155deg, #0e2a1c 0%, #091a10 50%, #040c08 100%)',
          padding: '36px 28px',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse 90% 65% at 20% 5%, rgba(34,197,94,0.18) 0%, transparent 65%)',
          }} />

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1 }}>
            <Image src="/logoteg.png" alt="Logo" width={20} height={20} style={{ borderRadius: 3, objectFit: 'contain' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.02em' }}>TG Sales Enhancer</span>
          </div>

          {/* Headline */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative', zIndex: 1 }}>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Step 2 of 3</p>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', lineHeight: 1.18, marginBottom: 10, letterSpacing: '-0.025em' }}>
              Set up your<br />workspace.
            </h1>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, marginBottom: 24 }}>
              {fullName || email
                ? `Hi ${fullName || email.split('@')[0]}. One step closer.`
                : 'Create a workspace or join your team.'}
            </p>

            {/* Step cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {STEPS.map((step) => {
                const isActive = step.n === 2;
                const isDone = step.n < 2;
                return (
                  <div key={step.n} style={{
                    padding: '10px 10px 12px',
                    borderRadius: 6,
                    background: isActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${isActive ? 'transparent' : 'rgba(255,255,255,0.08)'}`,
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', marginBottom: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 700,
                      background: isActive ? '#111' : isDone ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.12)',
                      color: isActive ? '#fff' : isDone ? '#4ade80' : 'rgba(255,255,255,0.35)',
                    }}>{isDone ? '✓' : step.n}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: isActive ? '#111' : isDone ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.4)', marginBottom: 2, lineHeight: 1.3 }}>{step.title}</div>
                    <div style={{ fontSize: 9, color: isActive ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.22)', lineHeight: 1.4 }}>{step.desc}</div>
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
          overflow: 'hidden',
        }}>

          {/* Mode toggle */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: 3, marginBottom: 22 }}>
            {(['create', 'join'] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); setMessage(''); }}
                style={{
                  flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 500,
                  border: 'none', cursor: 'pointer', borderRadius: 3,
                  background: mode === m ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: mode === m ? '#fff' : 'rgba(255,255,255,0.3)',
                  fontFamily: 'inherit', transition: 'all 0.15s',
                }}>
                {m === 'create' ? 'Create Organisation' : 'Join Existing'}
              </button>
            ))}
          </div>

          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 3, letterSpacing: '-0.01em' }}>
            {mode === 'create' ? 'New workspace' : 'Join a workspace'}
          </h2>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginBottom: 20 }}>
            {mode === 'create' ? 'Set up a shared space for your team.' : "Enter your team's slug and password."}
          </p>

          {/* Create form */}
          <form onSubmit={handleCreate} style={{ display: mode === 'create' ? 'flex' : 'none', flexDirection: 'column', gap: 9 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.38)', marginBottom: 4, letterSpacing: '0.04em' }}>ORGANISATION NAME</label>
              <input className="auth-input" placeholder="Acme Inc." required value={createForm.name}
                onChange={e => setCreateForm(c => ({ ...c, name: e.target.value }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.38)', marginBottom: 4, letterSpacing: '0.04em' }}>SLUG</label>
                <input className="auth-input" placeholder="acme" value={createForm.slug}
                  onChange={e => setCreateForm(c => ({ ...c, slug: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.38)', marginBottom: 4, letterSpacing: '0.04em' }}>TIMEZONE</label>
                <select className="auth-input" value={createForm.timezone}
                  onChange={e => setCreateForm(c => ({ ...c, timezone: e.target.value }))}>
                  {timezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.38)', marginBottom: 4, letterSpacing: '0.04em' }}>PASSWORD</label>
                <input className="auth-input" type="password" placeholder="Team password" required value={createForm.password}
                  onChange={e => setCreateForm(c => ({ ...c, password: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.38)', marginBottom: 4, letterSpacing: '0.04em' }}>CONFIRM</label>
                <input className="auth-input" type="password" placeholder="Re-enter" required value={createForm.confirmPassword}
                  onChange={e => setCreateForm(c => ({ ...c, confirmPassword: e.target.value }))} />
              </div>
            </div>
            {message && (
              <div style={{
                padding: '8px 11px', borderRadius: 5, fontSize: 11,
                background: messageTone === 'danger' ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
                border: `1px solid ${messageTone === 'danger' ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
                color: messageTone === 'danger' ? '#fca5a5' : '#86efac',
              }}>{message}</div>
            )}
            <button type="submit" disabled={isSubmitting} style={{
              marginTop: 4, width: '100%', padding: '10px 0', fontSize: 12, fontWeight: 600,
              border: 'none', borderRadius: 5, cursor: isSubmitting ? 'not-allowed' : 'pointer',
              background: isSubmitting ? 'rgba(255,255,255,0.12)' : '#fff',
              color: isSubmitting ? 'rgba(255,255,255,0.35)' : '#080808',
              fontFamily: 'inherit', transition: 'all 0.15s',
            }}>
              {isSubmitting ? 'Creating...' : 'Create Organisation'}
            </button>
          </form>

          {/* Join form */}
          <form onSubmit={handleJoin} style={{ display: mode === 'join' ? 'flex' : 'none', flexDirection: 'column', gap: 9 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.38)', marginBottom: 4, letterSpacing: '0.04em' }}>WORKSPACE SLUG</label>
              <input className="auth-input" placeholder="acme" required value={joinForm.slug}
                onChange={e => setJoinForm(c => ({ ...c, slug: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.38)', marginBottom: 4, letterSpacing: '0.04em' }}>PASSWORD</label>
              <input className="auth-input" type="password" placeholder="Team password" required value={joinForm.password}
                onChange={e => setJoinForm(c => ({ ...c, password: e.target.value }))} />
            </div>
            {message && (
              <div style={{
                padding: '8px 11px', borderRadius: 5, fontSize: 11,
                background: messageTone === 'danger' ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
                border: `1px solid ${messageTone === 'danger' ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
                color: messageTone === 'danger' ? '#fca5a5' : '#86efac',
              }}>{message}</div>
            )}
            <button type="submit" disabled={isSubmitting} style={{
              marginTop: 4, width: '100%', padding: '10px 0', fontSize: 12, fontWeight: 600,
              border: 'none', borderRadius: 5, cursor: isSubmitting ? 'not-allowed' : 'pointer',
              background: isSubmitting ? 'rgba(255,255,255,0.12)' : '#fff',
              color: isSubmitting ? 'rgba(255,255,255,0.35)' : '#080808',
              fontFamily: 'inherit', transition: 'all 0.15s',
            }}>
              {isSubmitting ? 'Joining...' : 'Join Organisation'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
