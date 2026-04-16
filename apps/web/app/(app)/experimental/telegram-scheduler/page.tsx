'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { CustomSelect } from '@/components/ui/select';
import { fetchJson } from '@/lib/web/fetch-json';
import { swrFetcher } from '@/lib/web/swr-fetcher';
import type { TgConsoleAccountRecord, TgSendApprovalRecord } from '@telegram-enhancer/shared';

type SchedulerData = {
  accounts: TgConsoleAccountRecord[];
  sendApprovals: TgSendApprovalRecord[];
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function localDateValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function nextSlot() {
  const date = new Date(Date.now() + 15 * 60_000);
  date.setSeconds(0, 0);
  const nextMinute = Math.ceil(date.getMinutes() / 5) * 5;
  if (nextMinute === 60) {
    date.setHours(date.getHours() + 1, 0, 0, 0);
  } else {
    date.setMinutes(nextMinute);
  }
  return {
    date: localDateValue(date),
    hour: pad(date.getHours()),
    minute: pad(date.getMinutes()),
  };
}

function timezoneLabel() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local timezone';
  const offset = -new Date().getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  return `${zone} (UTC${sign}${pad(hours)}:${pad(minutes)})`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function statusTone(status: string) {
  if (status === 'sent') return 'sent';
  if (status === 'failed') return 'failed';
  if (status === 'sending') return 'sending';
  return 'scheduled';
}

function buildScheduledDate(dateValue: string, hour: string, minute: string) {
  const [year, month, day] = dateValue.split('-').map(Number);
  return new Date(year, month - 1, day, Number(hour), Number(minute), 0, 0);
}

function getDeliveryError(record: TgSendApprovalRecord) {
  const result = record.delivery_result;
  return typeof result?.error === 'string' ? result.error : null;
}

function IcoClose() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

export default function TelegramSchedulerPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const defaults = useMemo(nextSlot, []);
  const [accountId, setAccountId] = useState('');
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [dateValue, setDateValue] = useState(defaults.date);
  const [hour, setHour] = useState(defaults.hour);
  const [minute, setMinute] = useState(defaults.minute);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'success' | 'error' | 'neutral'>('neutral');
  const [busy, setBusy] = useState(false);

  const { data, mutate } = useSWR<SchedulerData>('/api/experimental/tg-console', swrFetcher, {
    refreshInterval: 5000,
  });

  const accounts = data?.accounts ?? [];
  const sends = data?.sendApprovals ?? [];

  useEffect(() => {
    if (!accountId && accounts[0]) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId]);

  const dateOptions = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() + index);
      const prefix = index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : formatter.format(date);
      return { value: localDateValue(date), label: prefix };
    });
  }, []);

  const hourOptions = useMemo(() => Array.from({ length: 24 }, (_, value) => {
    const date = new Date();
    date.setHours(value, 0, 0, 0);
    return {
      value: pad(value),
      label: new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(date),
    };
  }), []);

  const minuteOptions = useMemo(() => Array.from({ length: 12 }, (_, index) => {
    const value = pad(index * 5);
    return { value, label: value };
  }), []);

  const accountOptions = accounts.map((account) => ({
    value: account.id,
    label: account.display_name || account.phone,
  }));

  const selectedDate = buildScheduledDate(dateValue, hour, minute);
  const canSchedule = Boolean(accountId && username.trim() && message.trim() && selectedDate.getTime() > Date.now());

  const schedule = async () => {
    if (!canSchedule) {
      setStatusKind('error');
      setStatus('Choose a sender, username, message, and a future time.');
      return;
    }
    if (file && file.size > 10 * 1024 * 1024) {
      setStatusKind('error');
      setStatus('Media must be 10 MB or smaller for scheduled sends.');
      return;
    }

    setBusy(true);
    setStatus('');
    try {
      const cleanUsername = username.trim().replace(/^@/, '');
      const formData = new FormData();
      formData.append('account_id', accountId);
      formData.append('target_usernames', JSON.stringify([cleanUsername]));
      formData.append('dialog_ids', JSON.stringify([]));
      formData.append('message_text', message.trim());
      formData.append('scheduled_for', selectedDate.toISOString());
      if (file) formData.append('file', file);

      const response = await fetch('/api/experimental/tg-console/send-approvals', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not schedule message.');
      }

      setStatusKind('success');
      setStatus(`Scheduled @${cleanUsername} for ${formatDate(selectedDate.toISOString())}.`);
      setUsername('');
      setMessage('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await mutate();
    } catch (error) {
      setStatusKind('error');
      setStatus(error instanceof Error ? error.message : 'Could not schedule message.');
    }
    setBusy(false);
  };

  const retry = async (id: string) => {
    setBusy(true);
    setStatus('');
    try {
      await fetchJson('/api/experimental/tg-console/send-approvals', {
        method: 'PATCH',
        body: JSON.stringify({ id, action: 'retry' }),
      });
      setStatusKind('success');
      setStatus('Retry requested. Check the delivery log in a few seconds.');
      await mutate();
    } catch (error) {
      setStatusKind('error');
      setStatus(error instanceof Error ? error.message : 'Retry failed.');
    }
    setBusy(false);
  };

  const recentSends = sends
    .filter((item) => item.target_username || item.scheduled_for || ['scheduled', 'sending', 'failed'].includes(item.status))
    .slice(0, 16);

  return (
    <div className="page-content tgs-page">
      <div className="tgs-hero">
        <div>
          <div className="exp-badge-label">Beta Experimental</div>
          <h2>Telegram Scheduler</h2>
          <p>Queue a username, message, media, and send time. The Railway worker sends it from our platform at the selected time.</p>
        </div>
        <div className="tgs-timezone-pill">
          <span>Timezone</span>
          <strong>{timezoneLabel()}</strong>
        </div>
      </div>

      {status && (
        <div className={`status-callout tgs-status ${statusKind}`} style={{ marginBottom: 16 }}>
          {status}
        </div>
      )}

      <div className="tgs-layout">
        <section className="card tgs-card">
          <div className="tgs-card-head">
            <div>
              <div className="card-title">New Scheduled Send</div>
              <div className="card-subtitle">Separate from chats. Use this for any Telegram username.</div>
            </div>
          </div>

          <div className="tgs-form">
            <label>
              <span>Sender account</span>
              <CustomSelect value={accountId} onChange={setAccountId} options={accountOptions.length ? accountOptions : [{ value: '', label: 'No accounts connected' }]} />
            </label>

            <label>
              <span>Telegram username</span>
              <input className="input tgs-input" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="@lightwaslost" />
            </label>

            <div className="tgs-time-grid">
              <label>
                <span>Date</span>
                <CustomSelect value={dateValue} onChange={setDateValue} options={dateOptions} />
              </label>
              <label>
                <span>Hour</span>
                <CustomSelect value={hour} onChange={setHour} options={hourOptions} />
              </label>
              <label>
                <span>Minute</span>
                <CustomSelect value={minute} onChange={setMinute} options={minuteOptions} />
              </label>
            </div>

            <label>
              <span>Message</span>
              <textarea className="input tgs-message" rows={5} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write the message that should be sent later" />
            </label>

            <div className="tgs-actions">
              <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              <button className="btn-secondary tgs-small-btn" type="button" onClick={() => fileInputRef.current?.click()}>
                {file ? file.name : 'Attach media'}
              </button>
              {file && (
                <button
                  className="btn-ghost tgs-icon-action"
                  type="button"
                  title="Remove media"
                  onClick={() => {
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  <IcoClose />
                </button>
              )}
              <button className="btn tgs-small-btn" disabled={busy || !canSchedule} onClick={() => void schedule()}>
                {busy ? 'Scheduling...' : 'Schedule'}
              </button>
            </div>

            <div className="card-subtitle">
              The worker shows Telegram typing activity with randomized pauses before sending. This is not Telegram-native scheduling.
            </div>
          </div>
        </section>

        <section className="card tgs-card">
          <div className="tgs-card-head">
            <div>
              <div className="card-title">Delivery Log</div>
              <div className="card-subtitle">Recent scheduled sends, failures, and retries.</div>
            </div>
          </div>

          <div className="tgs-log">
            {recentSends.map((item) => {
              const error = getDeliveryError(item);
              return (
                <div key={item.id} className="tgs-log-row">
                  <div>
                    <div className="tgs-log-title">{item.target_username ? `@${item.target_username}` : item.dialog_id ? 'Dialog send' : 'Send'}</div>
                    <div className="tgs-log-meta">
                      {item.scheduled_for ? `Scheduled ${formatDate(item.scheduled_for)}` : `Created ${formatDate(item.created_at)}`}
                      {item.media_name ? ` - ${item.media_name}` : ''}
                    </div>
                    {error && <div className="tgs-log-error">{error}</div>}
                  </div>
                  <div className="tgs-log-side">
                    <span className={`tgs-status-pill ${statusTone(item.status)}`}>{item.status.replace('_', ' ')}</span>
                    {item.status === 'failed' && (
                      <button className="btn-secondary tgs-mini-btn" disabled={busy} onClick={() => void retry(item.id)}>Retry</button>
                    )}
                  </div>
                </div>
              );
            })}
            {!recentSends.length && (
              <div className="empty-state" style={{ minHeight: 140 }}>No scheduled sends yet.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
