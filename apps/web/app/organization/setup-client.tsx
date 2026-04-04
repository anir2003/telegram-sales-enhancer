'use client';

import { useState } from 'react';
import Image from 'next/image';
import { fetchJson } from '@/lib/web/fetch-json';

const timezones = ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York', 'Asia/Dubai', 'Asia/Singapore'];

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

  const greeting = fullName || (email ? email.split('@')[0] : '');

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
          padding: '36px 32px',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse 90% 65% at 20% 5%, rgba(34,197,94,0.18) 0%, transparent 65%)',
          }} />

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative', zIndex: 1 }}>
            <Image src="/logoteg.png" alt="Logo" width={28} height={28} style={{ borderRadius: 5, objectFit: 'contain' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.01em' }}>TG Sales Enhancer</span>
          </div>

          {/* Headline + steps */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative', zIndex: 1 }}>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Step 2 of 3</p>
            <h1 style={{ fontSize: 30, fontWeight: 700, color: '#fff', lineHeight: 1.18, marginBottom: 10, letterSpacing: '-0.025em' }}>
              Set up your<br />workspace.
            </h1>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', lineHeight: 1.65, marginBottom: 32 }}>
              {greeting ? `Hi ${greeting}.` : ''} Create a shared space for your team or join an existing one.
            </p>

            {/* Simple step list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              {[
                { n: '01', label: 'Sign in your account', done: true },
                { n: '02', label: 'Set up your workspace', active: true },
                { n: '03', label: 'Launch campaigns' },
              ].map((step, idx, arr) => (
                <div key={step.n} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '10px 0',
                  borderBottom: idx < arr.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                }}>
                  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', minWidth: 22,
                    color: step.active ? 'rgba(34,197,94,0.7)' : 'rgba(255,255,255,0.2)',
                  }}>{step.done ? '✓' : step.n}</span>
                  <span style={{ fontSize: 12,
                    color: step.active ? 'rgba(255,255,255,0.7)' : step.done ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.3)',
                    fontWeight: step.active ? 500 : 400,
                  }}>{step.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right panel ── */}
        <div style={{
          background: '#0a0d0b',
          padding: '40px 40px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>

          {/* Mode toggle */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: 3, marginBottom: 24 }}>
            {(['create', 'join'] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); setMessage(''); }}
                style={{
                  flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 500,
                  border: 'none', outline: 'none', cursor: 'pointer', borderRadius: 3,
                  background: mode === m ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: mode === m ? '#fff' : 'rgba(255,255,255,0.3)',
                  fontFamily: 'inherit', transition: 'all 0.15s',
                }}>
                {m === 'create' ? 'Create Organisation' : 'Join Existing'}
              </button>
            ))}
          </div>

          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4, letterSpacing: '-0.01em' }}>
            {mode === 'create' ? 'New workspace' : 'Join a workspace'}
          </h2>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginBottom: 22 }}>
            {mode === 'create' ? 'Set up a shared space for your team.' : "Enter your team's slug and password."}
          </p>

          {/* Create form */}
          <form onSubmit={handleCreate} style={{ display: mode === 'create' ? 'flex' : 'none', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 5, letterSpacing: '0.05em' }}>ORGANISATION NAME</label>
              <input className="auth-input" placeholder="Acme Inc." required value={createForm.name}
                onChange={e => setCreateForm(c => ({ ...c, name: e.target.value }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 5, letterSpacing: '0.05em' }}>SLUG</label>
                <input className="auth-input" placeholder="acme" value={createForm.slug}
                  onChange={e => setCreateForm(c => ({ ...c, slug: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 5, letterSpacing: '0.05em' }}>TIMEZONE</label>
                <select className="auth-input" value={createForm.timezone}
                  onChange={e => setCreateForm(c => ({ ...c, timezone: e.target.value }))}>
                  {timezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 5, letterSpacing: '0.05em' }}>PASSWORD</label>
                <input className="auth-input" type="password" placeholder="Team password" required value={createForm.password}
                  onChange={e => setCreateForm(c => ({ ...c, password: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 5, letterSpacing: '0.05em' }}>CONFIRM</label>
                <input className="auth-input" type="password" placeholder="Re-enter" required value={createForm.confirmPassword}
                  onChange={e => setCreateForm(c => ({ ...c, confirmPassword: e.target.value }))} />
              </div>
            </div>
            {message && (
              <div style={{
                padding: '8px 12px', borderRadius: 5, fontSize: 11,
                background: messageTone === 'danger' ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
                border: `1px solid ${messageTone === 'danger' ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
                color: messageTone === 'danger' ? '#fca5a5' : '#86efac',
              }}>{message}</div>
            )}
            <button type="submit" disabled={isSubmitting} style={{
              marginTop: 4, width: '100%', padding: '10px 0', fontSize: 12, fontWeight: 600,
              border: 'none', outline: 'none', borderRadius: 5, cursor: isSubmitting ? 'not-allowed' : 'pointer',
              background: isSubmitting ? 'rgba(255,255,255,0.12)' : '#fff',
              color: isSubmitting ? 'rgba(255,255,255,0.35)' : '#080808',
              fontFamily: 'inherit', transition: 'all 0.15s',
            }}>
              {isSubmitting ? 'Creating...' : 'Create Organisation'}
            </button>
          </form>

          {/* Join form */}
          <form onSubmit={handleJoin} style={{ display: mode === 'join' ? 'flex' : 'none', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 5, letterSpacing: '0.05em' }}>WORKSPACE SLUG</label>
              <input className="auth-input" placeholder="acme" required value={joinForm.slug}
                onChange={e => setJoinForm(c => ({ ...c, slug: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 5, letterSpacing: '0.05em' }}>PASSWORD</label>
              <input className="auth-input" type="password" placeholder="Team password" required value={joinForm.password}
                onChange={e => setJoinForm(c => ({ ...c, password: e.target.value }))} />
            </div>
            {message && (
              <div style={{
                padding: '8px 12px', borderRadius: 5, fontSize: 11,
                background: messageTone === 'danger' ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
                border: `1px solid ${messageTone === 'danger' ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
                color: messageTone === 'danger' ? '#fca5a5' : '#86efac',
              }}>{message}</div>
            )}
            <button type="submit" disabled={isSubmitting} style={{
              marginTop: 4, width: '100%', padding: '10px 0', fontSize: 12, fontWeight: 600,
              border: 'none', outline: 'none', borderRadius: 5, cursor: isSubmitting ? 'not-allowed' : 'pointer',
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
