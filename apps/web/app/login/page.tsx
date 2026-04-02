'use client';

import { useState } from 'react';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [message, setMessage] = useState('Sign in with your workspace email and password.');
  const [messageTone, setMessageTone] = useState<'neutral' | 'success' | 'danger'>('neutral');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    const supabase = getBrowserSupabaseClient();
    setIsSubmitting(true);

    if (!supabase) {
      setMessageTone('danger');
      setMessage('Supabase is not configured yet. Add the env vars from .env.example to enable login.');
      setIsSubmitting(false);
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setMessageTone('danger');
      setMessage('Passwords do not match. Please re-enter them.');
      setIsSubmitting(false);
      return;
    }

    if (password.length < 8) {
      setMessageTone('danger');
      setMessage('Use a password with at least 8 characters.');
      setIsSubmitting(false);
      return;
    }

    const redirectBase = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;

    const result =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({
            email,
            password,
          })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${redirectBase}/auth/callback?next=/campaigns`,
              data: {
                full_name: fullName.trim() || undefined,
              },
            },
          });

    const error = result.error;

    if (error) {
      setMessageTone('danger');
      setMessage(error.message);
    } else {
      if (mode === 'signin') {
        setMessageTone('success');
        setMessage('Signed in successfully. Redirecting to campaigns...');
        window.location.assign('/campaigns');
      } else if (result.data.session) {
        setMessageTone('success');
        setMessage('Account created and signed in. Redirecting to campaigns...');
        window.location.assign('/campaigns');
      } else {
        setMessageTone('success');
        setMessage('Account created. Check your email once to confirm the account, then sign in with your password.');
      }
    }
    setIsSubmitting(false);
  };

  return (
    <main className="hero-copy">
      <h1>Telegram Sales Enhancer</h1>
      <p>
        Internal workspace for reusable leads, modular campaigns, Telegram account pools, and bot-assisted manual sending.
      </p>
      <form onSubmit={handleLogin} className="card" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'left' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Team Login</div>
            <div className="card-subtitle" style={{ marginTop: 8 }}>
              {mode === 'signin'
                ? 'Use your email and password to access the workspace.'
                : 'Create a workspace account with email and password.'}
            </div>
          </div>
        </div>
        <div className="theme-options" style={{ width: 'fit-content' }}>
          <button
            className={`theme-option ${mode === 'signin' ? 'active' : ''}`}
            type="button"
            onClick={() => {
              setMode('signin');
              setMessageTone('neutral');
              setMessage('Sign in with your workspace email and password.');
            }}
          >
            Sign In
          </button>
          <button
            className={`theme-option ${mode === 'signup' ? 'active' : ''}`}
            type="button"
            onClick={() => {
              setMode('signup');
              setMessageTone('neutral');
              setMessage('Create an account for your internal workspace.');
            }}
          >
            Create Account
          </button>
        </div>
        <div className="form-grid">
          {mode === 'signup' ? (
            <input
              className="input"
              type="text"
              placeholder="Full name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          ) : null}
          <input
            className="input"
            type="email"
            placeholder="team@example.com"
            value={email}
            required
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={password}
            required
            onChange={(event) => setPassword(event.target.value)}
          />
          {mode === 'signup' ? (
            <input
              className="input"
              type="password"
              placeholder="Confirm password"
              value={confirmPassword}
              required
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          ) : null}
          <button className="btn" type="submit" disabled={isSubmitting}>
            {isSubmitting ? (mode === 'signin' ? 'Signing In...' : 'Creating Account...') : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </div>
        <div
          className={`status-callout ${messageTone === 'success' ? 'success' : messageTone === 'danger' ? 'danger' : ''}`}
          style={{ marginTop: 14 }}
        >
          {message}
        </div>
      </form>
    </main>
  );
}
