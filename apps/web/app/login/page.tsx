'use client';

import { useState } from 'react';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [message, setMessage] = useState('Use your personal email and password, then join or create your organization.');
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
        setMessage('Signed in successfully. Redirecting to organization setup...');
        window.location.assign('/');
      } else if (result.data.session) {
        setMessageTone('success');
        setMessage('Account created and signed in. Redirecting to organization setup...');
        window.location.assign('/');
      } else {
        setMessageTone('success');
        setMessage('Account created. Sign in with your new password to continue into organization setup.');
      }
    }
    setIsSubmitting(false);
  };

  return (
    <main className="hero-copy">
      <h1>Telegram Sales Enhancer</h1>
      <p>
        Personal sign-in for a shared Telegram sales CRM. Every teammate gets their own login, then joins the same organization.
      </p>
      <form onSubmit={handleLogin} className="card login-card" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'left' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Team Login</div>
            <div className="card-subtitle" style={{ marginTop: 8 }}>
              {mode === 'signin'
                ? 'Use your own email and password, then the app will place you into your organization.'
                : 'Create your personal account first. Organization setup comes right after.'}
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
              setMessage('Use your personal email and password, then continue into organization setup.');
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
              setMessage('Create your personal account first, then create or join an organization.');
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
