'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { AvatarCircle } from '@/components/ui/avatar';
import { fetchJson } from '@/lib/web/fetch-json';
import { swrFetcher } from '@/lib/web/swr-fetcher';
import type {
  TgConsoleAccountRecord,
  TgConsoleDialogRecord,
  TgConsoleMessageRecord,
} from '@telegram-enhancer/shared';

type ConsoleData = {
  serverConfigured: boolean;
  connectorMode?: 'live' | 'mock';
  accounts: TgConsoleAccountRecord[];
  dialogs: TgConsoleDialogRecord[];
  messages: TgConsoleMessageRecord[];
};

type RailMode =
  | 'all' | 'my' | 'unread' | 'replied' | 'escalated'
  | `folder:${string}` | `crm:${string}`;

const REACTIONS = ['👍', '❤️', '🔥', '😂', '✅', '👀'];

function fmt(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const oneDay = 86_400_000;
  if (diffMs < oneDay) return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date).toLowerCase();
  if (diffMs < oneDay * 6) return `${Math.floor(diffMs / oneDay)}d`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function railMatches(d: TgConsoleDialogRecord, mode: RailMode) {
  if (mode === 'all') return true;
  if (mode === 'my') return d.crm_folder === 'My Inbox';
  if (mode === 'unread') return d.is_unread;
  if (mode === 'replied') return d.is_replied;
  if (mode === 'escalated') return d.crm_folder === 'Escalated' || d.tags.includes('escalated');
  if (mode.startsWith('folder:')) return d.folder_name === mode.slice(7);
  if (mode.startsWith('crm:')) return d.crm_folder === mode.slice(4);
  return true;
}

function titleForMode(mode: RailMode) {
  if (mode === 'all') return 'All Inboxes';
  if (mode === 'my') return 'My Inbox';
  if (mode === 'unread') return 'Unread';
  if (mode === 'replied') return 'Resolved';
  if (mode === 'escalated') return 'Escalated';
  if (mode.startsWith('folder:')) return mode.slice(7);
  if (mode.startsWith('crm:')) return mode.slice(4);
  return 'Inbox';
}

function getMessageMetadata(message: TgConsoleMessageRecord) {
  return (message.metadata && typeof message.metadata === 'object')
    ? message.metadata as Record<string, unknown>
    : {};
}

function getMessageMediaName(message: TgConsoleMessageRecord) {
  const metadata = getMessageMetadata(message);
  return typeof metadata.file_name === 'string' && metadata.file_name.trim()
    ? metadata.file_name
    : (Boolean(metadata.media) ? 'Media attachment' : null);
}

function getMessagePreviewUrl(message: TgConsoleMessageRecord) {
  const metadata = getMessageMetadata(message);
  return typeof metadata.preview_data_url === 'string'
    ? metadata.preview_data_url
    : (typeof metadata.local_preview_url === 'string' ? metadata.local_preview_url : null);
}

function getMessageMimeType(message: TgConsoleMessageRecord) {
  const metadata = getMessageMetadata(message);
  return typeof metadata.mime_type === 'string' ? metadata.mime_type : '';
}

function getMessageDeliveryState(message: TgConsoleMessageRecord) {
  const metadata = getMessageMetadata(message);
  if (!message.is_outbound) return 'none';
  if (metadata.pending) return 'pending';
  if (metadata.unread === false) return 'read';
  return 'sent';
}

function getMessageCaption(message: TgConsoleMessageRecord) {
  const text = (message.text ?? '').trim();
  if (!text || text.startsWith('[media]')) return '';
  return text;
}

function MessageMedia({ message }: { message: TgConsoleMessageRecord }) {
  const previewUrl = getMessagePreviewUrl(message);
  const mimeType = getMessageMimeType(message);
  const mediaName = getMessageMediaName(message);

  if (!mediaName) return null;

  if (previewUrl && mimeType.startsWith('image/')) {
    return <img className="tgi-msg-media-preview" src={previewUrl} alt={mediaName} />;
  }

  if (previewUrl && mimeType.startsWith('video/')) {
    return (
      <video className="tgi-msg-media-preview" src={previewUrl} controls playsInline muted />
    );
  }

  return <div className="tgi-msg-media-chip">{mediaName}</div>;
}

/* ── Icons ─────────────────────────────────────────────── */
const ico = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function IcoSend() {
  return <svg width="14" height="14" viewBox="0 0 24 24" {...ico}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
}
function IcoSync({ spin }: { spin: boolean }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" {...ico} style={spin ? { animation: 'spin 0.8s linear infinite' } : undefined}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>;
}
function IcoChevRight() {
  return <svg width="13" height="13" viewBox="0 0 24 24" {...ico}><polyline points="9 18 15 12 9 6"/></svg>;
}
function IcoChevLeft() {
  return <svg width="13" height="13" viewBox="0 0 24 24" {...ico}><polyline points="15 18 9 12 15 6"/></svg>;
}
function IcoSmile() {
  return <svg width="14" height="14" viewBox="0 0 24 24" {...ico}><circle cx="12" cy="12" r="10"/><path d="M8 13s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2.5" strokeLinecap="round"/><line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2.5" strokeLinecap="round"/></svg>;
}
function IcoPaperclip() {
  return <svg width="14" height="14" viewBox="0 0 24 24" {...ico}><path d="M21.44 11.05l-8.49 8.49a6 6 0 01-8.49-8.49l8.49-8.48a4 4 0 015.66 5.65l-8.48 8.49a2 2 0 01-2.83-2.83l7.78-7.78"/></svg>;
}
function IcoTicks({ state }: { state: 'pending' | 'sent' | 'read' | 'none' }) {
  if (state === 'none') return null;
  if (state === 'pending') {
    return <span className="tgi-ticks pending">○</span>;
  }
  if (state === 'read') {
    return <span className="tgi-ticks read">✓✓</span>;
  }
  return <span className="tgi-ticks sent">✓</span>;
}
function IcoAllInboxes() {
  return <svg width="14" height="14" viewBox="0 0 24 24" {...ico}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>;
}
function IcoMyInbox() {
  return <svg width="14" height="14" viewBox="0 0 24 24" {...ico}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
}
function IcoUnread() {
  return <svg width="14" height="14" viewBox="0 0 24 24" {...ico}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="2.5"/></svg>;
}
function IcoResolved() {
  return <svg width="14" height="14" viewBox="0 0 24 24" {...ico}><polyline points="20 6 9 17 4 12"/></svg>;
}
function IcoFolder() {
  return <svg width="14" height="14" viewBox="0 0 24 24" {...ico}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>;
}
function IcoSetup() {
  return <svg width="14" height="14" viewBox="0 0 24 24" {...ico}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
}
function IcoMore() {
  return <svg width="14" height="14" viewBox="0 0 24 24" {...ico}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>;
}

/* ── Nav item ───────────────────────────────────────────── */
function NavItem({ icon, label, count, active, collapsed, onClick }: {
  icon: React.ReactNode; label: string; count: number; active: boolean; collapsed: boolean; onClick: () => void;
}) {
  return (
    <button className={`tgi-nav-item ${active ? 'active' : ''}`} title={label} onClick={onClick}>
      <span className="tgi-nav-icon">{icon}</span>
      {!collapsed && <span className="tgi-nav-label">{label}</span>}
      {count > 0 && <span className="tgi-nav-count">{count}</span>}
    </button>
  );
}

/* ── Main page ──────────────────────────────────────────── */
export default function TelegramInboxPage() {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedDialogId, setSelectedDialogId] = useState<string | null>(null);
  const [railMode, setRailMode] = useState<RailMode>('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [replyDraft, setReplyDraft] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedPreviewUrl, setAttachedPreviewUrl] = useState<string | null>(null);
  const [reactionFor, setReactionFor] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<TgConsoleMessageRecord[]>([]);
  const [localReactions, setLocalReactions] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState('');
  const [statusTone, setStatusTone] = useState<'success' | 'error'>('success');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [folder, setFolder] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const key = `/api/experimental/tg-console?${new URLSearchParams({
    ...(selectedAccountId ? { accountId: selectedAccountId } : {}),
    ...(selectedDialogId ? { dialogId: selectedDialogId } : {}),
  })}`;

  const { data, isLoading, mutate } = useSWR<ConsoleData>(key, swrFetcher, {
    refreshInterval: 2500,
    revalidateOnFocus: true,
  });

  const accounts = data?.accounts ?? [];
  const dialogs = data?.dialogs ?? [];
  const remoteMessages = data?.messages ?? [];
  const remoteIds = useMemo(() => new Set(remoteMessages.map((m) => m.id)), [remoteMessages]);
  const messages = useMemo(
    () => [...remoteMessages, ...optimistic.filter((m) => !remoteIds.has(m.id))],
    [remoteMessages, optimistic, remoteIds],
  );

  const selectedDialog = dialogs.find((d) => d.id === selectedDialogId) ?? null;
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const telegramFolders = useMemo(() => [...new Set(dialogs.map((d) => d.folder_name).filter(Boolean))].sort() as string[], [dialogs]);
  const crmFolders = useMemo(() => [...new Set(dialogs.map((d) => d.crm_folder).filter(Boolean))].sort(), [dialogs]);

  const filteredDialogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dialogs.filter((d) => {
      if (!railMatches(d, railMode)) return false;
      if (stateFilter === 'unread' && !d.is_unread) return false;
      if (stateFilter === 'replied' && !d.is_replied) return false;
      if (stateFilter === 'needs-reply' && d.is_replied) return false;
      if (q) {
        const hay = [d.title, d.username, d.last_message_preview, ...(d.tags ?? [])].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [dialogs, railMode, stateFilter, search]);

  // Auto-select first dialog
  useEffect(() => {
    if (!filteredDialogs.length) { setSelectedDialogId(null); return; }
    if (!selectedDialogId || !filteredDialogs.some((d) => d.id === selectedDialogId)) {
      setSelectedDialogId(filteredDialogs[0].id);
    }
  }, [filteredDialogs, selectedDialogId]);

  // Sync detail fields on dialog change
  useEffect(() => {
    setFolder(selectedDialog?.crm_folder ?? '');
    setTags((selectedDialog?.tags ?? []).join(', '));
    setNotes(selectedDialog?.notes ?? '');
    setReplyDraft('');
    setAttachedFile(null);
    setStatus('');
    setLocalReactions({});
    setOptimistic([]);
  }, [selectedDialog?.id]);

  useEffect(() => {
    if (!attachedFile) {
      setAttachedPreviewUrl(null);
      return;
    }
    if (!/^(image|video)\//.test(attachedFile.type)) {
      setAttachedPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(attachedFile);
    setAttachedPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [attachedFile]);

  // Auto-scroll to bottom when messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedDialogId]);

  // Periodic sync
  const activeSyncAccountId = selectedDialog?.account_id ?? selectedAccountId ?? accounts[0]?.id ?? null;
  useEffect(() => {
    if (!activeSyncAccountId) return;
    let dead = false;
    const run = async () => {
      if (dead || document.visibilityState === 'hidden') return;
      setSyncing(true);
      try {
        await fetchJson('/api/experimental/tg-console/sync', { method: 'POST', body: JSON.stringify({ accountId: activeSyncAccountId }) });
        await mutate();
      } catch { /* silent */ }
      setSyncing(false);
    };
    void run();
    const id = window.setInterval(run, 12_000);
    return () => { dead = true; clearInterval(id); };
  }, [activeSyncAccountId]);

  const countOf = (mode: RailMode) => dialogs.filter((d) => railMatches(d, mode)).length;

  const sendReply = async () => {
    const text = replyDraft.trim();
    const file = attachedFile;
    if (!selectedDialog || (!text && !file)) return;
    const tempId = `opt-${Date.now()}`;
    const previewText = text || `[media] ${file?.name ?? 'Media attachment'}`;
    const localPreviewUrl = attachedPreviewUrl;
    const tempMsg: TgConsoleMessageRecord = {
      id: tempId,
      dialog_id: selectedDialog.id,
      account_id: selectedDialog.account_id,
      telegram_message_id: null,
      sender_name: 'You',
      sender_telegram_id: null,
      text: previewText,
      is_outbound: true,
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      metadata: file
        ? {
          media: true,
          file_name: file.name,
          mime_type: file.type || null,
          file_size: file.size,
          local_preview_url: localPreviewUrl,
          pending: true,
        }
        : {
          pending: true,
        },
    } as any;
    setOptimistic((prev) => [...prev, tempMsg]);
    setReplyDraft('');
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setBusy(true);
    setStatus('');
    try {
      if (file) {
        const formData = new FormData();
        if (text) formData.append('text', text);
        formData.append('file', file);
        const response = await fetch(`/api/experimental/tg-console/dialogs/${selectedDialog.id}/messages`, {
          method: 'POST',
          body: formData,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error ?? 'Send failed.');
        }
      } else {
        await fetchJson(`/api/experimental/tg-console/dialogs/${selectedDialog.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({ text }),
        });
      }
      setStatusTone('success');
      setStatus(file ? 'Media sent.' : 'Message sent.');
      await mutate();
    } catch (err) {
      setStatusTone('error');
      setStatus(err instanceof Error ? err.message : 'Send failed.');
      setOptimistic((prev) => prev.filter((m) => m.id !== tempId));
      setReplyDraft(text);
      setAttachedFile(file);
    }
    setBusy(false);
  };

  const sendReaction = async (emoji: string, msgId: string) => {
    if (!selectedDialog) return;
    const msg = messages.find((m) => m.id === msgId);
    if (!msg) return;
    if (!msg.telegram_message_id) {
      setStatusTone('error');
      setStatus('That message is not ready for reactions yet.');
      setReactionFor(null);
      return;
    }
    setReactionFor(null);
    try {
      await fetchJson(`/api/experimental/tg-console/dialogs/${selectedDialog.id}/reaction`, {
        method: 'POST',
        body: JSON.stringify({ emoji, telegram_message_id: msg.telegram_message_id }),
      });
      setLocalReactions((prev) => ({ ...prev, [msgId]: emoji }));
      setStatusTone('success');
      setStatus(`Reaction sent: ${emoji}`);
    } catch (error) {
      setStatusTone('error');
      setStatus(error instanceof Error ? error.message : 'Reaction failed.');
    }
  };

  const saveDialog = async (extra?: Partial<TgConsoleDialogRecord>) => {
    if (!selectedDialog) return;
    try {
      await fetchJson(`/api/experimental/tg-console/dialogs/${selectedDialog.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          crm_folder: folder.trim() || 'My Inbox',
          tags: [...new Set(tags.split(',').map((t) => t.trim()).filter(Boolean))],
          notes: notes.trim() || null,
          ...extra,
        }),
      });
      setStatusTone('success');
      setStatus(extra ? 'Conversation updated.' : 'Tags, folder, and notes saved.');
      await mutate();
    } catch (error) {
      setStatusTone('error');
      setStatus(error instanceof Error ? error.message : 'Save failed.');
    }
  };

  const handleTextareaKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendReply();
    }
  };

  return (
    <div className={`tgi-page ${navCollapsed ? 'nav-collapsed' : ''}`} onClick={() => setReactionFor(null)}>

      {/* ── Left nav rail ── */}
      <nav className="tgi-nav">
        <div className="tgi-nav-top">
          <button className="tgi-collapse-btn" onClick={(e) => { e.stopPropagation(); setNavCollapsed((v) => !v); }} title={navCollapsed ? 'Expand' : 'Collapse'}>
            {navCollapsed ? <IcoChevRight /> : <IcoChevLeft />}
          </button>
          {!navCollapsed && <span className="tgi-nav-heading">Inbox</span>}
        </div>

        {!navCollapsed && (
          <div className="tgi-nav-search">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" />
          </div>
        )}

        <NavItem icon={<IcoAllInboxes />} label="All Inboxes" count={dialogs.length} active={railMode === 'all'} collapsed={navCollapsed} onClick={() => setRailMode('all')} />
        <NavItem icon={<IcoMyInbox />} label="My Inbox" count={countOf('my')} active={railMode === 'my'} collapsed={navCollapsed} onClick={() => setRailMode('my')} />
        <NavItem icon={<IcoUnread />} label="Unread" count={countOf('unread')} active={railMode === 'unread'} collapsed={navCollapsed} onClick={() => setRailMode('unread')} />
        <NavItem icon={<IcoResolved />} label="Resolved" count={countOf('replied')} active={railMode === 'replied'} collapsed={navCollapsed} onClick={() => setRailMode('replied')} />

        {(telegramFolders.length > 0 || crmFolders.length > 0) && !navCollapsed && (
          <div className="tgi-nav-divider" />
        )}

        {telegramFolders.map((f) => (
          <NavItem key={f} icon={<IcoFolder />} label={f} count={countOf(`folder:${f}`)} active={railMode === `folder:${f}`} collapsed={navCollapsed} onClick={() => setRailMode(`folder:${f}`)} />
        ))}
        {crmFolders.map((f) => (
          <NavItem key={f} icon={<IcoFolder />} label={f} count={countOf(`crm:${f}`)} active={railMode === `crm:${f}`} collapsed={navCollapsed} onClick={() => setRailMode(`crm:${f}`)} />
        ))}

        {accounts.length > 0 && !navCollapsed && <div className="tgi-nav-divider" />}
        {accounts.map((a) => (
          <button key={a.id} className={`tgi-nav-account ${selectedAccountId === a.id ? 'active' : ''}`} title={a.display_name || a.phone} onClick={() => { setSelectedAccountId(a.id); setSelectedDialogId(null); }}>
            <AvatarCircle name={a.display_name || a.phone} url={a.avatar_url} size={18} />
            {!navCollapsed && <span>{a.display_name || a.phone}</span>}
            {!navCollapsed && <strong>{dialogs.filter((d) => d.account_id === a.id).length}</strong>}
          </button>
        ))}

        <div className="tgi-nav-bottom">
          <a href="/experimental/telegram-console" className="tgi-setup-link" title="Setup">
            <IcoSetup />
            {!navCollapsed && <span>Setup</span>}
          </a>
        </div>
      </nav>

      {/* ── Conversation list ── */}
      <section className="tgi-list">
        <div className="tgi-list-head">
          <span>{titleForMode(railMode)}</span>
          <div className="tgi-list-head-right">
            <select className="tgi-mini-select" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="unread">Unread</option>
              <option value="replied">Replied</option>
              <option value="needs-reply">Needs reply</option>
            </select>
          </div>
        </div>

        <div className="tgi-list-items">
          {isLoading ? (
            <div className="tgi-empty">Loading…</div>
          ) : filteredDialogs.length ? filteredDialogs.map((dialog) => {
            const acc = accountById.get(dialog.account_id);
            return (
              <button key={dialog.id} className={`tgi-conv ${selectedDialogId === dialog.id ? 'active' : ''}`} onClick={() => setSelectedDialogId(dialog.id)}>
                <div className="tgi-conv-avatar">
                  <AvatarCircle name={dialog.title} url={dialog.avatar_url} size={36} />
                  {dialog.is_unread && <span className="tgi-unread-dot" />}
                </div>
                <div className="tgi-conv-body">
                  <div className="tgi-conv-row">
                    <strong>{dialog.title}</strong>
                    <small>{fmt(dialog.last_message_at)}</small>
                  </div>
                  <div className="tgi-conv-preview">{dialog.last_message_preview || '—'}</div>
                  <div className="tgi-conv-meta">{acc?.display_name || acc?.phone || ''}</div>
                </div>
              </button>
            );
          }) : (
            <div className="tgi-empty">No conversations.</div>
          )}
        </div>
      </section>

      {/* ── Chat pane ── */}
      <main className="tgi-chat">
        {selectedDialog ? (
          <>
            {/* Header */}
            <header className="tgi-chat-head">
              <div className="tgi-chat-head-left">
                <AvatarCircle name={selectedDialog.title} url={selectedDialog.avatar_url} size={34} />
                <div className="tgi-chat-head-info">
                  <strong>{selectedDialog.title}</strong>
                  <span>{selectedDialog.username ? `@${selectedDialog.username}` : selectedDialog.kind}</span>
                </div>
              </div>
              <div className="tgi-chat-head-actions">
                <button className="tgi-icon-btn" title="Sync now" disabled={syncing} onClick={() => {
                  if (!activeSyncAccountId) return;
                  setSyncing(true);
                  fetchJson('/api/experimental/tg-console/sync', { method: 'POST', body: JSON.stringify({ accountId: activeSyncAccountId }) })
                    .then(() => mutate())
                    .finally(() => setSyncing(false));
                }}>
                  <IcoSync spin={syncing} />
                </button>
                <button className="tgi-icon-btn" title="Details" onClick={() => setDetailsOpen((v) => !v)}>
                  <IcoMore />
                </button>
                <button
                  className={`tgi-status-pill ${selectedDialog.is_replied ? 'resolved' : 'open'}`}
                  onClick={() => void saveDialog({ is_replied: !selectedDialog.is_replied })}
                >
                  {selectedDialog.is_replied ? 'Resolved' : 'In Progress'}
                </button>
              </div>
            </header>

            {/* Details drawer */}
            {detailsOpen && (
              <div className="tgi-details-drawer" onClick={(e) => e.stopPropagation()}>
                <div className="tgi-details-row">
                  <input className="input" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="CRM folder" />
                  <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, comma separated" />
                </div>
                <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={() => void saveDialog()}>Save</button>
                  <button className="btn-secondary" onClick={() => void saveDialog({ is_unread: !selectedDialog.is_unread })}>
                    {selectedDialog.is_unread ? 'Mark read' : 'Mark unread'}
                  </button>
                  {(selectedDialog.tags ?? []).map((t) => <span key={t} className="tgi-tag">#{t}</span>)}
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="tgi-messages" onClick={() => setReactionFor(null)}>
              {messages.length ? messages.map((msg) => (
                <div key={msg.id} className={`tgi-msg ${msg.is_outbound ? 'out' : 'in'}`}>
                  {!msg.is_outbound && (
                    <div className="tgi-msg-avatar">
                      <AvatarCircle name={selectedDialog.title} url={selectedDialog.avatar_url} size={26} />
                    </div>
                  )}
                  <div className="tgi-msg-wrap">
                    <div className="tgi-msg-bubble">
                      <MessageMedia message={msg} />
                      {getMessageCaption(msg) ? (
                        <span>{getMessageCaption(msg)}</span>
                      ) : !getMessageMediaName(msg) ? (
                        <span>{msg.text || '[media]'}</span>
                      ) : null}
                    </div>
                    <div
                      className="tgi-msg-meta"
                      onMouseEnter={() => { if (msg.telegram_message_id) setReactionFor(msg.id); }}
                      onMouseLeave={() => setReactionFor((current) => current === msg.id ? null : current)}
                    >
                      {localReactions[msg.id] && (
                        <div className="tgi-msg-reaction-chip">{localReactions[msg.id]}</div>
                      )}
                      {msg.is_outbound && (
                        <span className="tgi-msg-status">
                          <IcoTicks state={getMessageDeliveryState(msg)} />
                        </span>
                      )}
                      <small className="tgi-msg-time">{fmt(msg.sent_at)}</small>
                      {reactionFor === msg.id && (
                        <div className="tgi-reaction-picker" onClick={(e) => e.stopPropagation()}>
                          {REACTIONS.map((emoji) => (
                            <button key={emoji} onClick={() => void sendReaction(emoji, msg.id)}>{emoji}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {msg.is_outbound && (
                    <div className="tgi-msg-avatar out">
                      <AvatarCircle
                        name={accountById.get(selectedDialog.account_id)?.display_name || 'Me'}
                        url={accountById.get(selectedDialog.account_id)?.avatar_url}
                        size={26}
                      />
                    </div>
                  )}
                </div>
              )) : (
                <div className="tgi-empty center">Sync to mirror messages.</div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Composer */}
            <footer className="tgi-composer" onClick={(e) => e.stopPropagation()}>
              {status && <div className={`tgi-composer-status ${statusTone}`}>{status}</div>}
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: 'none' }}
                onChange={(event) => setAttachedFile(event.target.files?.[0] ?? null)}
              />
              <div className="tgi-composer-inner">
                {attachedFile && (
                  <div className="tgi-composer-attachment-preview">
                    {attachedPreviewUrl && attachedFile.type.startsWith('image/') ? (
                      <img src={attachedPreviewUrl} alt={attachedFile.name} className="tgi-composer-preview-media" />
                    ) : attachedPreviewUrl && attachedFile.type.startsWith('video/') ? (
                      <video src={attachedPreviewUrl} className="tgi-composer-preview-media" muted playsInline controls />
                    ) : (
                      <div className="tgi-attachment-chip">
                        {attachedFile.name}
                        <span>{Math.max(1, Math.round(attachedFile.size / 1024))} KB</span>
                      </div>
                    )}
                    <button
                      type="button"
                      className="tgi-attachment-remove"
                      onClick={() => {
                        setAttachedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                    >
                      Remove
                    </button>
                  </div>
                )}
                <div className="tgi-composer-row">
                  <button className="tgi-attach-btn" type="button" title="Attach media" onClick={() => fileInputRef.current?.click()}>
                    <IcoPaperclip />
                  </button>
                  <textarea
                    ref={textareaRef}
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    onKeyDown={handleTextareaKey}
                    placeholder={`Write to ${selectedDialog.title}…`}
                    rows={1}
                  />
                  <button
                    className="tgi-send-btn"
                    disabled={busy || (!replyDraft.trim() && !attachedFile)}
                    onClick={() => void sendReply()}
                    title="Send (Enter)"
                  >
                    <IcoSend />
                  </button>
                </div>
              </div>
              <div className="tgi-composer-hint">Enter to send · Shift+Enter for new line · Attach images, video, or files</div>
            </footer>
          </>
        ) : (
          <div className="tgi-empty center">Select a conversation</div>
        )}
      </main>
    </div>
  );
}
