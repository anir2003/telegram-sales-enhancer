'use client';

import { useState } from 'react';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('Use email magic links for internal team access.');

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    const supabase = getBrowserSupabaseClient();

    if (!supabase) {
      setMessage('Supabase is not configured yet. Add the env vars from .env.example to enable login.');
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/campaigns`,
      },
    });

    setMessage(error ? error.message : 'Magic link sent. Open it from your email to continue.');
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
            onChange={(event) => setEmail(event.target.value)}
          />
          <button className="btn" type="submit">Send Magic Link</button>
        </div>
        <div className="card-subtitle" style={{ marginTop: 14 }}>{message}</div>
      </form>
    </main>
  );
}
