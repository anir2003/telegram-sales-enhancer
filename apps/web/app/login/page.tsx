'use client';

import { useState } from 'react';
import Image from 'next/image';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';

const STEPS = [
  { n: 1, title: 'Sign in', desc: 'Personal account' },
  { n: 2, title: 'Organisation', desc: 'Create or join' },
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
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', lineHeight: 1.18, marginBottom: 10, letterSpacing: '-0.025em' }}>
              Get started<br />with us.
            </h1>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, marginBottom: 24 }}>
              Three simple steps to launch your outreach.
            </p>

            {/* Step cards — horizontal, bottom of panel */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {STEPS.map((step) => {
                const isActive = step.n === 1;
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
                      background: isActive ? '#111' : 'rgba(255,255,255,0.12)',
                      color: isActive ? '#fff' : 'rgba(255,255,255,0.35)',
                    }}>{step.n}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: isActive ? '#111' : 'rgba(255,255,255,0.55)', marginBottom: 2, lineHeight: 1.3 }}>{step.title}</div>
                    <div style={{ fontSize: 9, color: isActive ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.25)', lineHeight: 1.4 }}>{step.desc}</div>
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
            {(['signin', 'signup'] as const).map((m) => (
              <button key={m} type="button"
                onClick={() => { setMode(m); setMessage(''); }}
                style={{
                  flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 500,
                  border: 'none', cursor: 'pointer', borderRadius: 3,
                  background: mode === m ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: mode === m ? '#fff' : 'rgba(255,255,255,0.3)',
                  fontFamily: 'inherit', transition: 'all 0.15s',
                }}>
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 3, letterSpacing: '-0.01em' }}>
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginBottom: 20 }}>
            {mode === 'signin' ? 'Sign in to your workspace.' : 'Organisation setup comes next.'}
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {/* Full Name — always rendered to prevent layout shift */}
            <div style={{ display: mode === 'signup' ? 'block' : 'none' }}>
              <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.38)', marginBottom: 4, letterSpacing: '0.04em' }}>FULL NAME</label>
              <input className="auth-input" type="text" placeholder="Your name"
                value={fullName} onChange={e => setFullName(e.target.value)} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.38)', marginBottom: 4, letterSpacing: '0.04em' }}>EMAIL</label>
              <input className="auth-input" type="email" placeholder="you@example.com" required
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.38)', marginBottom: 4, letterSpacing: '0.04em' }}>PASSWORD</label>
              <input className="auth-input" type="password" placeholder="Min 8 characters" required
                value={password} onChange={e => setPassword(e.target.value)} />
            </div>

            {/* Confirm Password — always rendered to prevent layout shift */}
            <div style={{ display: mode === 'signup' ? 'block' : 'none' }}>
              <label style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.38)', marginBottom: 4, letterSpacing: '0.04em' }}>CONFIRM PASSWORD</label>
              <input className="auth-input" type="password" placeholder="Re-enter password"
                value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
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
              {isSubmitting
                ? (mode === 'signin' ? 'Signing in...' : 'Creating account...')
                : (mode === 'signin' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          <p style={{ marginTop: 16, fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
            {mode === 'signin' ? 'No account? ' : 'Already have one? '}
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
