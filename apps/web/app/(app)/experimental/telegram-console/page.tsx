'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetchJson } from '@/lib/web/fetch-json';
import { CustomSelect } from '@/components/ui/select';
import { AvatarCircle } from '@/components/ui/avatar';
import type {
  TgConsoleAccountRecord,
  TgSendApprovalRecord,
  TgWarmedUsernameRecord,
} from '@telegram-enhancer/shared';

type ConsoleData = {
  serverConfigured: boolean;
  connectorMode?: 'live' | 'mock';
  accounts: TgConsoleAccountRecord[];
  warmedUsernames: TgWarmedUsernameRecord[];
  sendApprovals: TgSendApprovalRecord[];
};

type ProxyForm = {
  scheme: 'socks5' | 'http' | 'https';
  ip: string;
  host: string;
  port: string;
  username: string;
  password: string;
};

const emptyProxy: ProxyForm = {
  scheme: 'socks5',
  ip: '',
  host: '',
  port: '',
  username: '',
  password: '',
};

const messageTemplates = [
  'Hey, quick check-in. Did my last note come through on your side?',
  'Thanks for getting back to me. I can share the short version here if useful.',
  'Appreciate the reply. What would be the best context to send over first?',
  'Got it. I will keep this concise. The main idea is to help with cleaner Telegram follow-up workflows.',
  'Makes sense. Are you looking at this for your own inbox or for a team workflow?',
  'Happy to tailor this. What are you currently using to track replies and next steps?',
  'Thanks, that helps. I can send a quick summary and you can tell me if it is relevant.',
  'No rush at all. I wanted to keep the thread easy to find when you are back online.',
  'Understood. I will not flood you here. One short note is enough for now.',
  'If Telegram is easier than email, I can keep the next steps in this thread.',
  'Good question. The simple version is that it keeps replies, tags, and notes in one place.',
  'That sounds aligned. Should I send a two-line overview or a more detailed breakdown?',
];

const quickBroadcastEmoji = ['🙂', '👍', '🔥', '🚀', '✅', '👀'];

function formatDate(value: string | null | undefined) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function cleanTags(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function proxyPayload(proxy: ProxyForm) {
  const endpoint = proxy.host.trim() || proxy.ip.trim();
  if (!endpoint || !proxy.port.trim()) return null;
  return {
    scheme: proxy.scheme,
    ip: proxy.ip.trim() || null,
    host: endpoint,
    port: Number(proxy.port),
    username: proxy.username.trim() || null,
    password: proxy.password || null,
  };
}

function statusTone(status: string | null | undefined) {
  if (status === 'authenticated' || status === 'validated' || status === 'sent') return '#22c55e';
  if (status === 'failed' || status === 'unreachable' || status === 'needs_reauth') return '#ef4444';
  if (status === 'approved' || status === 'sending' || status === 'pending_code') return '#f59e0b';
  return 'var(--text-dim)';
}

export default function TelegramConsolePage() {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const key = `/api/experimental/tg-console?${new URLSearchParams({
    ...(selectedAccountId ? { accountId: selectedAccountId } : {}),
  }).toString()}`;
  const { data, mutate } = useSWR<ConsoleData>(key, fetchJson, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
  });

  const accounts = data?.accounts ?? [];
  const warmedUsernames = data?.warmedUsernames ?? [];
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;

  return (
    <div className="page-content tg-console-page tg-setup-page">
      <div className="tgc-page-header">
        <div>
          <div className="tgc-page-title">
            <span className="exp-badge-label">Beta Experimental</span>
            Telegram Setup
          </div>
          <div className="tgc-page-subtitle">Connect phone sessions, attach sticky proxies, and manage reply accounts.</div>
        </div>
        <div className="btn-row">
          <a className="btn-secondary" href="/experimental/telegram-inbox">Open inbox</a>
          <div className="tgc-connected-pill">
            <span className="tgc-online-dot" />
            {selectedAccount ? `Selected ${selectedAccount.phone}` : `${accounts.length} phone sessions`}
          </div>
        </div>
      </div>

      {data?.connectorMode === 'mock' && (
        <div className="status-callout" style={{ marginBottom: 16 }}>
          Local demo connector is active. Use OTP <strong>12345</strong>, or <strong>222222</strong> to preview the 2FA step.
        </div>
      )}

      {data && !data.serverConfigured && (
        <div className="status-callout danger" style={{ marginBottom: 16 }}>
          Telegram phone sign-in is not ready on this server yet. Ask the system owner to finish the hidden connector setup.
        </div>
      )}

      <div className="tg-console-top-grid">
        <ConnectAccountPanel serverConfigured={Boolean(data?.serverConfigured)} onDone={mutate} />
        <AccountsPanel
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onSelect={setSelectedAccountId}
          onMutate={mutate}
        />
        <RegistryPanel warmedUsernames={warmedUsernames} onMutate={mutate} />
      </div>

      <div style={{ display: 'none' }}>{/* legacy panels removed */}
        </section>
      </div>
    </div>
  );
}

function ConnectAccountPanel({ serverConfigured, onDone }: { serverConfigured: boolean; onDone: () => void }) {
  const [phone, setPhone] = useState('');
  const [proxy, setProxy] = useState<ProxyForm>(emptyProxy);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [step, setStep] = useState<'phone' | 'code' | '2fa'>('phone');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    setBusy(true); setStatus('');
    try {
      const result = await fetchJson<{ account: TgConsoleAccountRecord; step: string }>('/api/experimental/tg-console/auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'send-code', phone, proxy: proxyPayload(proxy) }),
      });
      setAccountId(result.account.id);
      setStep('code');
      setStatus('Code sent.');
      onDone();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to send code.');
    }
    setBusy(false);
  };

  const verify = async () => {
    if (!accountId) return;
    setBusy(true); setStatus('');
    try {
      const result = await fetchJson<{ step: string }>('/api/experimental/tg-console/auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'verify', accountId, code, password: password || undefined }),
      });
      if (result.step === '2fa') {
        setStep('2fa');
      } else {
        setStep('phone');
        setPhone(''); setCode(''); setPassword(''); setAccountId(null);
        setStatus('Telegram account connected.');
        onDone();
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to verify.');
    }
    setBusy(false);
  };

  return (
    <section className="tg-console-panel">
      <div className="card-title">Add Telegram Account</div>
      <div className="card-subtitle" style={{ marginBottom: 12 }}>Sign in with phone number, OTP, and 2FA password only when Telegram asks.</div>
      <div className="form-grid">
        <input className="input" placeholder="+1 555 010 0001" value={phone} onChange={(event) => setPhone(event.target.value)} disabled={step !== 'phone'} />
        {step === 'phone' && (
          <details>
            <summary className="tg-console-summary">Proxy before login</summary>
            <ProxyFields proxy={proxy} setProxy={setProxy} />
          </details>
        )}
        {step !== 'phone' && (
          <input className="input" placeholder="Telegram code" value={code} onChange={(event) => setCode(event.target.value)} />
        )}
        {step === '2fa' && (
          <input className="input" placeholder="2FA password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        )}
        <button className="btn" disabled={busy || !serverConfigured || (step === 'phone' ? !phone.trim() : !code.trim())} onClick={step === 'phone' ? sendCode : verify}>
          {busy ? 'Working...' : step === 'phone' ? 'Send OTP' : 'Verify OTP'}
        </button>
        {status && <div className="card-subtitle">{status}</div>}
      </div>
    </section>
  );
}

function ProxyFields({ proxy, setProxy }: { proxy: ProxyForm; setProxy: (proxy: ProxyForm) => void }) {
  return (
    <div className="form-grid" style={{ marginTop: 10 }}>
      <CustomSelect value={proxy.scheme} onChange={(scheme) => setProxy({ ...proxy, scheme: scheme as ProxyForm['scheme'] })} options={[
        { value: 'socks5', label: 'SOCKS5' },
        { value: 'http', label: 'HTTP' },
        { value: 'https', label: 'HTTPS' },
      ]} />
      <div className="form-grid columns-2">
        <input className="input" placeholder="Proxy IP" value={proxy.ip} onChange={(event) => setProxy({ ...proxy, ip: event.target.value })} />
        <input className="input" placeholder="Host name / endpoint" value={proxy.host} onChange={(event) => setProxy({ ...proxy, host: event.target.value })} />
      </div>
      <div className="form-grid columns-2">
        <input className="input" placeholder="Port" value={proxy.port} onChange={(event) => setProxy({ ...proxy, port: event.target.value })} />
        <input className="input" placeholder="Username" value={proxy.username} onChange={(event) => setProxy({ ...proxy, username: event.target.value })} />
      </div>
      <div className="form-grid">
        <input className="input" placeholder="Password" type="password" value={proxy.password} onChange={(event) => setProxy({ ...proxy, password: event.target.value })} />
      </div>
    </div>
  );
}

function AccountsPanel({
  accounts,
  selectedAccountId,
  onSelect,
  onMutate,
}: {
  accounts: TgConsoleAccountRecord[];
  selectedAccountId: string | null;
  onSelect: (accountId: string | null) => void;
  onMutate: () => void;
}) {
  const [proxyAccountId, setProxyAccountId] = useState<string | null>(null);
  const [proxy, setProxy] = useState<ProxyForm>(emptyProxy);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const saveProxy = async () => {
    if (!proxyAccountId) return;
    const payload = proxyPayload(proxy);
    if (!payload) { setStatus('Add proxy host and port.'); return; }
    setBusy(true); setStatus('');
    try {
      const result = await fetchJson<{ proxyStatus: string }>(`/api/experimental/tg-console/accounts/${proxyAccountId}/proxy`, {
        method: 'POST',
        body: JSON.stringify({ proxy: payload }),
      });
      setStatus(`Proxy ${result.proxyStatus}.`);
      setProxyAccountId(null);
      setProxy(emptyProxy);
      onMutate();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Proxy save failed.');
    }
    setBusy(false);
  };

  const syncNow = async (accountId: string) => {
    setBusy(true); setStatus('');
    try {
      await fetchJson('/api/experimental/tg-console/sync', { method: 'POST', body: JSON.stringify({ accountId }) });
      setStatus('Sync completed.');
      onMutate();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Sync failed.');
    }
    setBusy(false);
  };

  return (
    <section className="tg-console-panel">
      <div className="card-title">Connected Accounts</div>
      <div className="tg-console-account-list">
        <button className={`tg-console-account ${selectedAccountId === null ? 'active' : ''}`} onClick={() => onSelect(null)}>
          <AvatarCircle name="All" size={30} />
          <span>
            <strong>All accounts</strong>
            <small>Combined inbox across connected sessions</small>
          </span>
          <i>{accounts.length}</i>
        </button>
        {accounts.map((account) => (
          <button key={account.id} className={`tg-console-account ${selectedAccountId === account.id ? 'active' : ''}`} onClick={() => onSelect(account.id)}>
            <AvatarCircle name={account.display_name || account.phone} size={30} />
            <span>
              <strong>{account.display_name || account.phone}</strong>
              <small>@{account.telegram_username || 'pending'} - {account.proxy_redacted || 'no proxy'}</small>
            </span>
            <i style={{ color: statusTone(account.proxy_status || account.status) }}>{account.proxy_status || account.status}</i>
          </button>
        ))}
      </div>
      {accounts.length === 0 && <div className="empty-state" style={{ minHeight: 90 }}>No phone sessions connected.</div>}
      {accounts.length > 0 && (
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => {
              const ids = selectedAccountId ? [selectedAccountId] : accounts.map((account) => account.id);
              void Promise.all(ids.map(syncNow));
            }}
          >
            {selectedAccountId ? 'Sync account' : 'Sync all'}
          </button>
          <button className="btn-secondary" disabled={!selectedAccountId} onClick={() => setProxyAccountId(selectedAccountId)}>
            {selectedAccountId ? 'Proxy' : 'Select account for proxy'}
          </button>
        </div>
      )}
      {proxyAccountId && (
        <div className="tg-console-inline-editor">
          <ProxyFields proxy={proxy} setProxy={setProxy} />
          <div className="btn-row">
            <button className="btn" disabled={busy} onClick={saveProxy}>Save proxy</button>
            <button className="btn-secondary" onClick={() => setProxyAccountId(null)}>Cancel</button>
          </div>
        </div>
      )}
      {status && <div className="card-subtitle" style={{ marginTop: 8 }}>{status}</div>}
    </section>
  );
}

function RegistryPanel({ warmedUsernames, onMutate }: { warmedUsernames: TgWarmedUsernameRecord[]; onMutate: () => void }) {
  const [username, setUsername] = useState('');
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState('');

  const add = async () => {
    setStatus('');
    try {
      await fetchJson('/api/experimental/tg-console/registry', {
        method: 'POST',
        body: JSON.stringify({ username, tags: cleanTags(tags) }),
      });
      setUsername(''); setTags('');
      onMutate();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not add username.');
    }
  };

  const remove = async (id: string) => {
    await fetchJson('/api/experimental/tg-console/registry', { method: 'DELETE', body: JSON.stringify({ id }) });
    onMutate();
  };

  return (
    <section className="tg-console-panel">
      <div className="card-title">Warmed Accounts</div>
      <div className="form-grid" style={{ marginTop: 12 }}>
        <input className="input" placeholder="@username" value={username} onChange={(event) => setUsername(event.target.value)} />
        <input className="input" placeholder="Tags, comma separated" value={tags} onChange={(event) => setTags(event.target.value)} />
        <button className="btn" disabled={!username.trim()} onClick={add}>Add username</button>
      </div>
      <div className="tg-console-pill-list">
        {warmedUsernames.map((item) => (
          <button key={item.id} className="tg-console-pill" onClick={() => void remove(item.id)}>
            @{item.username}
          </button>
        ))}
      </div>
      {status && <div className="card-subtitle">{status}</div>}
    </section>
  );
}

function DialogHeader({ dialog, onMutate }: { dialog: TgConsoleDialogRecord; onMutate: () => void }) {
  const [folder, setFolder] = useState(dialog.crm_folder);
  const [tags, setTags] = useState(dialog.tags.join(', '));
  const [notes, setNotes] = useState(dialog.notes ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFolder(dialog.crm_folder);
    setTags(dialog.tags.join(', '));
    setNotes(dialog.notes ?? '');
  }, [dialog]);

  const save = async (extra?: Partial<TgConsoleDialogRecord>) => {
    setBusy(true);
    await fetchJson(`/api/experimental/tg-console/dialogs/${dialog.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        crm_folder: folder,
        tags: cleanTags(tags),
        notes: notes.trim() || null,
        ...extra,
      }),
    });
    setBusy(false);
    onMutate();
  };

  return (
    <div className="tg-console-chat-head">
      <AvatarCircle name={dialog.title} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>{dialog.title}</strong>
        <span>{dialog.username ? `@${dialog.username}` : dialog.kind} - {dialog.folder_name || 'All Inboxes'}</span>
      </div>
      <button className="btn-secondary" disabled={busy} onClick={() => void save({ is_unread: !dialog.is_unread })}>{dialog.is_unread ? 'Mark read' : 'Mark unread'}</button>
      <button className="btn-secondary" disabled={busy} onClick={() => void save({ is_replied: !dialog.is_replied })}>{dialog.is_replied ? 'Undo replied' : 'Mark replied'}</button>
      <div className="tg-console-meta-editor">
        <input className="input" placeholder="CRM folder" value={folder} onChange={(event) => setFolder(event.target.value)} />
        <input className="input" placeholder="Tags" value={tags} onChange={(event) => setTags(event.target.value)} />
        <textarea className="input" placeholder="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
        <button className="btn" disabled={busy} onClick={() => void save()}>Save</button>
      </div>
    </div>
  );
}

function GroupBuilderPanel({ dialogs, onMutate }: { dialogs: TgConsoleDialogRecord[]; onMutate: () => void }) {
  const [mode, setMode] = useState<'folder' | 'tag'>('folder');
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const applyGroup = async () => {
    const groupName = name.trim();
    if (!groupName || dialogs.length === 0) return;
    setBusy(true);
    setStatus('');
    try {
      await Promise.all(dialogs.map((dialog) => fetchJson(`/api/experimental/tg-console/dialogs/${dialog.id}`, {
        method: 'PATCH',
        body: JSON.stringify(mode === 'folder'
          ? { crm_folder: groupName }
          : { tags: [...new Set([...dialog.tags, groupName])] }),
      })));
      setStatus(`${mode === 'folder' ? 'Folder' : 'Tag'} applied to ${dialogs.length} people.`);
      setName('');
      onMutate();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not apply group.');
    }
    setBusy(false);
  };

  return (
    <section className="tg-console-panel">
      <div className="card-title">Groups</div>
      <div className="card-subtitle" style={{ marginTop: 4 }}>
        Create a CRM folder or tag from the current filtered list.
      </div>
      <div className="form-grid" style={{ marginTop: 12 }}>
        <CustomSelect
          value={mode}
          onChange={(value) => setMode(value as 'folder' | 'tag')}
          options={[{ value: 'folder', label: 'CRM folder' }, { value: 'tag', label: 'Tag' }]}
        />
        <input className="input" placeholder="Group name" value={name} onChange={(event) => setName(event.target.value)} />
        <button className="btn" disabled={busy || !name.trim() || dialogs.length === 0} onClick={applyGroup}>
          Apply to {dialogs.length}
        </button>
        {status && <div className="card-subtitle">{status}</div>}
      </div>
    </section>
  );
}

function BroadcastPanel({
  accounts,
  selectedAccountId,
  dialogs,
  warmedUsernames,
  onMutate,
}: {
  accounts: TgConsoleAccountRecord[];
  selectedAccountId: string | null;
  dialogs: TgConsoleDialogRecord[];
  warmedUsernames: TgWarmedUsernameRecord[];
  onMutate: () => void;
}) {
  const [accountId, setAccountId] = useState(selectedAccountId ?? '');
  const [selectedDialogs, setSelectedDialogs] = useState<Set<string>>(new Set());
  const [selectedWarmed, setSelectedWarmed] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [template, setTemplate] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (selectedAccountId) setAccountId(selectedAccountId);
  }, [selectedAccountId]);

  const create = async () => {
    setStatus('');
    try {
      const res = await fetchJson<{ sendApprovals: TgSendApprovalRecord[] }>('/api/experimental/tg-console/send-approvals', {
        method: 'POST',
        body: JSON.stringify({
          account_id: accountId,
          dialog_ids: [...selectedDialogs],
          target_usernames: [...selectedWarmed],
          message_text: message,
          approve_now: true,
        }),
      });
      setMessage('');
      setSelectedDialogs(new Set());
      setSelectedWarmed(new Set());
      const failed = res.sendApprovals.filter((item) => item.status === 'failed').length;
      setStatus(failed ? `${res.sendApprovals.length - failed} sent, ${failed} failed.` : `${res.sendApprovals.length} sent.`);
      onMutate();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not send messages.');
    }
  };

  return (
    <section className="tg-console-panel">
      <div className="card-title">Broadcast</div>
      <div className="form-grid" style={{ marginTop: 12 }}>
        <CustomSelect value={accountId} onChange={setAccountId} options={accounts.map((account) => ({ value: account.id, label: account.display_name || account.phone }))} />
        <CustomSelect
          value={template}
          onChange={(value) => {
            setTemplate(value);
            const selected = messageTemplates[Number(value)];
            if (selected) setMessage(selected);
          }}
          options={[{ value: '', label: 'Message drafts' }, ...messageTemplates.map((item, index) => ({ value: String(index), label: item }))]}
        />
        <textarea className="input" style={{ minHeight: 92, resize: 'vertical' }} placeholder="Message text" value={message} onChange={(event) => setMessage(event.target.value)} />
        <div className="tg-console-checkbox-list tg-console-emoji-row">
          {quickBroadcastEmoji.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="btn-secondary"
              onClick={() => setMessage((value) => `${value}${value ? ' ' : ''}${emoji}`)}
            >
              {emoji}
            </button>
          ))}
        </div>
        <div className="tg-console-checkbox-list">
          {dialogs.slice(0, 8).map((dialog) => (
            <label key={dialog.id}>
              <input type="checkbox" checked={selectedDialogs.has(dialog.id)} onChange={() => {
                setSelectedDialogs((prev) => {
                  const next = new Set(prev);
                  next.has(dialog.id) ? next.delete(dialog.id) : next.add(dialog.id);
                  return next;
                });
              }} />
              {dialog.title}
            </label>
          ))}
          {warmedUsernames.map((item) => (
            <label key={item.id}>
              <input type="checkbox" checked={selectedWarmed.has(item.username)} onChange={() => {
                setSelectedWarmed((prev) => {
                  const next = new Set(prev);
                  next.has(item.username) ? next.delete(item.username) : next.add(item.username);
                  return next;
                });
              }} />
              @{item.username}
            </label>
          ))}
        </div>
        <button className="btn" disabled={!accountId || !message.trim() || (!selectedDialogs.size && !selectedWarmed.size)} onClick={create}>
          Send now
        </button>
        {status && <div className="card-subtitle">{status}</div>}
      </div>
    </section>
  );
}

function SendApprovalsPanel({ sendApprovals, onMutate }: { sendApprovals: TgSendApprovalRecord[]; onMutate: () => void }) {
  const approve = async (id: string) => {
    await fetchJson('/api/experimental/tg-console/send-approvals', {
      method: 'PATCH',
      body: JSON.stringify({ id, action: 'approve' }),
    });
    onMutate();
  };

  return (
    <section className="tg-console-panel">
      <div className="card-title">Delivery Log</div>
      <div className="tg-console-queue">
        {sendApprovals.slice(0, 8).map((item) => (
          <div key={item.id} className="tg-console-queue-row">
            <span>{item.message_text}</span>
            <strong style={{ color: statusTone(item.status) }}>{item.status.replace('_', ' ')}</strong>
            {item.status === 'pending_approval' && <button className="btn-secondary" onClick={() => void approve(item.id)}>Send now</button>}
          </div>
        ))}
        {sendApprovals.length === 0 && <div className="empty-state" style={{ minHeight: 80 }}>No send records yet.</div>}
      </div>
    </section>
  );
}

function ManualActionsPanel({
  selectedDialog,
  warmedUsernames,
}: {
  selectedDialog: TgConsoleDialogRecord | null;
  warmedUsernames: TgWarmedUsernameRecord[];
}) {
  const items = [
    selectedDialog?.username ? `Review @${selectedDialog.username} and reply from the native client.` : 'Pick a dialog to review a live thread.',
    warmedUsernames.length ? `Check the warmed-account replies for @${warmedUsernames[0].username}.` : 'Add warmed usernames for reply checks.',
    'Review unread Telegram folders before sending the next batch.',
  ];

  return (
    <section className="tg-console-panel">
      <div className="card-title">Manual Actions</div>
      <div className="tg-console-manual-list">
        {items.map((item) => <div key={item}>{item}</div>)}
      </div>
    </section>
  );
}
