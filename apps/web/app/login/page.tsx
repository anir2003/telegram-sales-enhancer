'use client';

import { useState } from 'react';
import Image from 'next/image';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';

const STEPS = [
  { n: 1, title: 'Sign in', desc: 'Personal account' },
  { n: 2, title: 'Organisation', desc: 'Create or join a workspace' },
  { n: 3, title: 'Start closing', desc: 'Launch campaigns' },
];

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'neutral' | 'success' | 'danger'>('neutral');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getBrowserSupabaseClient();
    setIsSubmitting(true);
    setMessage('');

    if (!supabase) {
      setMessageTone('danger');
      setMessage('Supabase is not configured.');
      setIsSubmitting(false);
      return;
    }
    if (mode === 'signup' && password !== confirmPassword) {
      setMessageTone('danger');
      setMessage('Passwords do not match.');
      setIsSubmitting(false);
      return;
    }
    if (password.length < 8) {
      setMessageTone('danger');
      setMessage('Password must be at least 8 characters.');
      setIsSubmitting(false);
      return;
    }

    const result = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName.trim() || undefined } } });

    if (result.error) {
      setMessageTone('danger');
      setMessage(result.error.message);
    } else {
      setMessageTone('success');
      setMessage(mode === 'signin' ? 'Signed in. Redirecting...' : 'Account created. Redirecting...');
      window.location.assign('/');
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
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#fff', lineHeight: 1.2, marginBottom: 8, letterSpacing: '-0.025em' }}>
              Close deals<br />on Telegram.
            </h1>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.65, marginBottom: 36 }}>
              Sequence your outreach, track replies, and close more — all from one place.
            </p>

            {/* Step list — no boxes, just a clean vertical timeline */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {STEPS.map((step, idx) => {
                const isActive = step.n === 1;
                const isDone = step.n < 1;
                return (
                  <div key={step.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingBottom: idx < STEPS.length - 1 ? 22 : 0, position: 'relative' }}>
                    {/* Connector */}
                    {idx < STEPS.length - 1 && (
                      <div style={{
                        position: 'absolute', left: 10, top: 22, bottom: 0, width: 1,
                        background: 'rgba(255,255,255,0.08)',
                      }} />
                    )}
                    {/* Dot */}
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 700,
                      background: isActive ? '#22c55e' : 'rgba(255,255,255,0.07)',
                      color: isActive ? '#fff' : 'rgba(255,255,255,0.25)',
                      border: `1px solid ${isActive ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
                    }}>
                      {isDone ? '✓' : step.n}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? '#fff' : 'rgba(255,255,255,0.35)', marginBottom: 2 }}>{step.title}</div>
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
            {(['signin', 'signup'] as const).map((m) => (
              <button key={m} type="button"
                onClick={() => { setMode(m); setMessage(''); }}
                style={{
                  flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 500,
                  border: 'none', cursor: 'pointer', borderRadius: 4,
                  background: mode === m ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: mode === m ? '#fff' : 'rgba(255,255,255,0.3)',
                  fontFamily: 'inherit', transition: 'all 0.15s',
                }}>
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4, letterSpacing: '-0.01em' }}>
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 24 }}>
            {mode === 'signin' ? 'Sign in to continue.' : 'Organisation setup comes next.'}
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mode === 'signup' && (
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, letterSpacing: '0.03em' }}>FULL NAME</label>
                <input className="auth-input" type="text" placeholder="Your name"
                  value={fullName} onChange={e => setFullName(e.target.value)} />
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, letterSpacing: '0.03em' }}>EMAIL</label>
              <input className="auth-input" type="email" placeholder="you@example.com" required
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, letterSpacing: '0.03em' }}>PASSWORD</label>
              <input className="auth-input" type="password" placeholder="Min 8 characters" required
                value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            {mode === 'signup' && (
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4, letterSpacing: '0.03em' }}>CONFIRM PASSWORD</label>
                <input className="auth-input" type="password" placeholder="Re-enter password" required
                  value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
              </div>
            )}

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
              {isSubmitting
                ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
                : (mode === 'signin' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          <p style={{ marginTop: 18, fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
            {mode === 'signin' ? "No account? " : 'Already have one? '}
            <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 10, fontFamily: 'inherit', textDecoration: 'underline', padding: 0 }}>
              {mode === 'signin' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
