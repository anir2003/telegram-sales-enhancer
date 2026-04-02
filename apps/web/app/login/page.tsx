'use client';

import { useState } from 'react';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('Use email magic links for internal team access.');
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

    const redirectBase = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${redirectBase}/auth/callback?next=/campaigns`,
      },
    });

    if (error) {
      setMessageTone('danger');
      setMessage(error.message);
    } else {
      setMessageTone('success');
      setMessage(`Magic link sent to ${email}. Open that email and continue in the same browser.`);
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
            <div className="card-subtitle" style={{ marginTop: 8 }}>Use Supabase email auth for your workspace members.</div>
          </div>
        </div>
        <div className="form-grid">
          <input
            className="input"
            type="email"
            placeholder="team@example.com"
            value={email}
            required
            onChange={(event) => setEmail(event.target.value)}
          />
          <button className="btn" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Sending...' : 'Send Magic Link'}
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
