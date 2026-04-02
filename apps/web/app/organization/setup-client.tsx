'use client';

import { useState } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';

const timezones = ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York', 'Asia/Dubai', 'Asia/Singapore'];

export function OrganizationSetupClient({
  email,
  fullName,
}: {
  email: string;
  fullName: string;
}) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('Create an organization for your team or join an existing one with its shared access password.');
  const [messageTone, setMessageTone] = useState<'neutral' | 'success' | 'danger'>('neutral');
  const [createForm, setCreateForm] = useState({
    name: '',
    slug: '',
    timezone: 'UTC',
    password: '',
    confirmPassword: '',
  });
  const [joinForm, setJoinForm] = useState({
    slug: '',
    password: '',
  });

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (createForm.password !== createForm.confirmPassword) {
      setMessageTone('danger');
      setMessage('Organization passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await fetchJson('/api/organization', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'create',
          name: createForm.name,
          slug: createForm.slug,
          timezone: createForm.timezone,
          password: createForm.password,
        }),
      });
      setMessageTone('success');
      setMessage('Organization created. Redirecting to the dashboard...');
      window.location.assign('/dashboard');
    } catch (error) {
      setMessageTone('danger');
      setMessage(error instanceof Error ? error.message : 'Could not create organization.');
    }
    setIsSubmitting(false);
  };

  const handleJoin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await fetchJson('/api/organization', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'join',
          slug: joinForm.slug,
          password: joinForm.password,
        }),
      });
      setMessageTone('success');
      setMessage('Organization joined. Redirecting to the dashboard...');
      window.location.assign('/dashboard');
    } catch (error) {
      setMessageTone('danger');
      setMessage(error instanceof Error ? error.message : 'Could not join organization.');
    }
    setIsSubmitting(false);
  };

  return (
    <main className="hero-copy">
      <h1>Organization Setup</h1>
      <p>
        {fullName || email
          ? `${fullName || email}, finish your setup by attaching this account to a shared organization.`
          : 'Finish setup by attaching this account to a shared organization.'}
      </p>

      <div className="card login-card" style={{ maxWidth: 720, margin: '0 auto', textAlign: 'left' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Join Or Create Organization</div>
            <div className="card-subtitle" style={{ marginTop: 8 }}>
              Every teammate signs in personally. The organization decides which campaigns, leads, Telegram accounts, and bot tasks they share.
            </div>
          </div>
        </div>

        <div className="theme-options" style={{ width: 'fit-content' }}>
          <button
            className={`theme-option ${mode === 'create' ? 'active' : ''}`}
            type="button"
            onClick={() => setMode('create')}
          >
            Create Organization
          </button>
          <button
            className={`theme-option ${mode === 'join' ? 'active' : ''}`}
            type="button"
            onClick={() => setMode('join')}
          >
            Join Existing
          </button>
        </div>

        {mode === 'create' ? (
          <form className="form-grid" onSubmit={handleCreate}>
            <div className="form-grid columns-2">
              <input
                className="input"
                placeholder="Organization name"
                value={createForm.name}
                required
                onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
              />
              <input
                className="input"
                placeholder="Organization slug (optional)"
                value={createForm.slug}
                onChange={(event) => setCreateForm((current) => ({ ...current, slug: event.target.value }))}
              />
              <select
                className="input"
                value={createForm.timezone}
                onChange={(event) => setCreateForm((current) => ({ ...current, timezone: event.target.value }))}
              >
                {timezones.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
              </select>
              <input
                className="input"
                type="password"
                placeholder="Organization password"
                value={createForm.password}
                required
                onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
              />
              <input
                className="input"
                type="password"
                placeholder="Confirm organization password"
                value={createForm.confirmPassword}
                required
                onChange={(event) => setCreateForm((current) => ({ ...current, confirmPassword: event.target.value }))}
              />
            </div>
            <button className="btn" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating Organization...' : 'Create Organization'}
            </button>
          </form>
        ) : (
          <form className="form-grid" onSubmit={handleJoin}>
            <div className="form-grid columns-2">
              <input
                className="input"
                placeholder="Organization slug"
                value={joinForm.slug}
                required
                onChange={(event) => setJoinForm((current) => ({ ...current, slug: event.target.value }))}
              />
              <input
                className="input"
                type="password"
                placeholder="Organization password"
                value={joinForm.password}
                required
                onChange={(event) => setJoinForm((current) => ({ ...current, password: event.target.value }))}
              />
            </div>
            <button className="btn" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Joining Organization...' : 'Join Organization'}
            </button>
          </form>
        )}

        <div
          className={`status-callout ${messageTone === 'success' ? 'success' : messageTone === 'danger' ? 'danger' : ''}`}
          style={{ marginTop: 14 }}
        >
          {message}
        </div>
      </div>
    </main>
  );
}
