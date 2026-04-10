'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { AvatarCircle } from '@/components/ui/avatar';
import { CustomSelect } from '@/components/ui/select';
import { fetchJson } from '@/lib/web/fetch-json';
import type {
  TgConsoleAccountRecord,
  TgConsoleDialogRecord,
  TgConsoleMessageRecord,
  TgSendApprovalRecord,
  TgWarmedUsernameRecord,
} from '@telegram-enhancer/shared';

type ConsoleData = {
  serverConfigured: boolean;
  connectorMode?: 'live' | 'mock';
  accounts: TgConsoleAccountRecord[];
  dialogs: TgConsoleDialogRecord[];
  messages: TgConsoleMessageRecord[];
  warmedUsernames: TgWarmedUsernameRecord[];
  sendApprovals: TgSendApprovalRecord[];
};

type RailMode =
  | 'all'
  | 'my'
  | 'unread'
  | 'replied'
  | 'pending'
  | 'escalated'
  | `folder:${string}`
  | `crm:${string}`
  | `tag:${string}`;

function cleanTags(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function formatInboxTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  if (diffMs < oneDay) {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date).toLowerCase();
  }
  if (diffMs < oneDay * 7) return `${Math.max(1, Math.floor(diffMs / oneDay))}d`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function titleForRail(mode: RailMode) {
  if (mode === 'all') return 'All Inboxes';
  if (mode === 'my') return 'My Inbox';
  if (mode === 'unread') return 'Unread';
  if (mode === 'replied') return 'Replied';
  if (mode === 'pending') return 'Pending';
  if (mode === 'escalated') return 'Escalated';
  if (mode.startsWith('folder:')) return mode.slice('folder:'.length);
  if (mode.startsWith('crm:')) return mode.slice('crm:'.length);
  if (mode.startsWith('tag:')) return `#${mode.slice('tag:'.length)}`;
  return 'All Inboxes';
}

function railMatches(dialog: TgConsoleDialogRecord, mode: RailMode) {
  if (mode === 'all') return true;
  if (mode === 'my') return dialog.crm_folder === 'My Inbox';
  if (mode === 'unread') return dialog.is_unread;
  if (mode === 'replied') return dialog.is_replied;
  if (mode === 'pending') return !dialog.is_replied;
  if (mode === 'escalated') return dialog.crm_folder === 'Escalated' || dialog.tags.includes('escalated');
  if (mode.startsWith('folder:')) return dialog.folder_name === mode.slice('folder:'.length);
  if (mode.startsWith('crm:')) return dialog.crm_folder === mode.slice('crm:'.length);
  if (mode.startsWith('tag:')) return dialog.tags.includes(mode.slice('tag:'.length));
  return true;
}

function RailButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  const compact = label
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <button className={`tg-inbox-rail-item ${active ? 'active' : ''}`} title={label} onClick={onClick}>
      <span className="tg-inbox-rail-compact">{compact}</span>
      <span className="tg-inbox-rail-text">{label}</span>
      <strong>{count}</strong>
    </button>
  );
}

function PaneToggle({
  collapsed,
  label,
  onClick,
}: {
  collapsed: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`tg-inbox-pane-toggle ${collapsed ? 'collapsed' : ''}`}
      title={`${collapsed ? 'Expand' : 'Minimize'} ${label}`}
      aria-label={`${collapsed ? 'Expand' : 'Minimize'} ${label}`}
      onClick={onClick}
    >
      <span>{collapsed ? '>' : '<'}</span>
    </button>
  );
}

export default function TelegramInboxPage() {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedDialogId, setSelectedDialogId] = useState<string | null>(null);
  const [railMode, setRailMode] = useState<RailMode>('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [foldersCollapsed, setFoldersCollapsed] = useState(false);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [replyDraft, setReplyDraft] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const key = `/api/experimental/tg-console?${new URLSearchParams({
    ...(selectedAccountId ? { accountId: selectedAccountId } : {}),
    ...(selectedDialogId ? { dialogId: selectedDialogId } : {}),
  }).toString()}`;
  const { data, isLoading, mutate } = useSWR<ConsoleData>(key);

  const accounts = data?.accounts ?? [];
  const dialogs = data?.dialogs ?? [];
  const messages = data?.messages ?? [];
  const selectedDialog = dialogs.find((dialog) => dialog.id === selectedDialogId) ?? null;
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;
  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);

  const telegramFolders = useMemo(() => [...new Set(dialogs.map((dialog) => dialog.folder_name).filter(Boolean))].sort() as string[], [dialogs]);
  const crmFolders = useMemo(() => [...new Set(dialogs.map((dialog) => dialog.crm_folder).filter(Boolean))].sort(), [dialogs]);
  const allTags = useMemo(() => [...new Set(dialogs.flatMap((dialog) => dialog.tags))].sort(), [dialogs]);

  const filteredDialogs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return dialogs.filter((dialog) => {
      const matchesRail = railMatches(dialog, railMode);
      const matchesState =
        stateFilter === 'all'
        || (stateFilter === 'unread' && dialog.is_unread)
        || (stateFilter === 'replied' && dialog.is_replied)
        || (stateFilter === 'needs-reply' && !dialog.is_replied);
      const matchesSearch = !query || [dialog.title, dialog.username, dialog.last_message_preview, dialog.crm_folder, ...dialog.tags]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);

      return matchesRail && matchesState && matchesSearch;
    });
  }, [dialogs, railMode, search, stateFilter]);

  useEffect(() => {
    if (!filteredDialogs.length) {
      if (selectedDialogId) setSelectedDialogId(null);
      return;
    }
    if (!selectedDialogId || !filteredDialogs.some((dialog) => dialog.id === selectedDialogId)) {
      setSelectedDialogId(filteredDialogs[0].id);
    }
  }, [filteredDialogs, selectedDialogId]);

  useEffect(() => {
    setFolder(selectedDialog?.crm_folder ?? '');
    setTags(selectedDialog?.tags.join(', ') ?? '');
    setNotes(selectedDialog?.notes ?? '');
    setReplyDraft('');
    setStatus('');
  }, [selectedDialog]);

  const countWhere = (mode: RailMode) => dialogs.filter((dialog) => railMatches(dialog, mode)).length;

  const saveDialog = async (extra?: Partial<TgConsoleDialogRecord>) => {
    if (!selectedDialog) return;
    setBusy(true);
    setStatus('');
    try {
      await fetchJson(`/api/experimental/tg-console/dialogs/${selectedDialog.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          crm_folder: folder.trim() || 'My Inbox',
          tags: cleanTags(tags),
          notes: notes.trim() || null,
          ...extra,
        }),
      });
      setStatus('Saved.');
      await mutate();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save this thread.');
    }
    setBusy(false);
  };

  const queueReply = async () => {
    if (!selectedDialog || !replyDraft.trim()) return;
    setBusy(true);
    setStatus('');
    try {
      await fetchJson('/api/experimental/tg-console/send-approvals', {
        method: 'POST',
        body: JSON.stringify({
          account_id: selectedDialog.account_id,
          dialog_ids: [selectedDialog.id],
          target_usernames: [],
          message_text: replyDraft,
          approve_now: false,
        }),
      });
      setReplyDraft('');
      setStatus('Reply queued for approval.');
      await mutate();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not queue reply.');
    }
    setBusy(false);
  };

  const accountOptions = [
    { value: 'all', label: 'All accounts' },
    ...accounts.map((account) => ({ value: account.id, label: account.display_name || account.phone })),
  ];

  return (
    <div className={`tg-inbox-page ${foldersCollapsed ? 'folders-collapsed' : ''} ${listCollapsed ? 'list-collapsed' : ''}`}>
      <aside className="tg-inbox-rail">
        <div className="tg-inbox-rail-title">
          <span>Inbox</span>
          <PaneToggle collapsed={foldersCollapsed} label="folders" onClick={() => setFoldersCollapsed((value) => !value)} />
        </div>
        <div className="tg-inbox-search">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" />
        </div>

        <RailButton active={railMode === 'all'} label="All Inboxes" count={dialogs.length} onClick={() => setRailMode('all')} />
        <RailButton active={railMode === 'my'} label="My Inbox" count={countWhere('my')} onClick={() => setRailMode('my')} />

        <div className="tg-inbox-rail-label">AI Agent</div>
        <RailButton active={railMode === 'pending'} label="All Conversations" count={dialogs.length} onClick={() => setRailMode('all')} />
        <RailButton active={railMode === 'replied'} label="Resolved" count={countWhere('replied')} onClick={() => setRailMode('replied')} />
        <RailButton active={railMode === 'escalated'} label="Escalated" count={countWhere('escalated')} onClick={() => setRailMode('escalated')} />
        <RailButton active={railMode === 'unread'} label="Pending" count={countWhere('unread')} onClick={() => setRailMode('unread')} />

        <div className="tg-inbox-rail-label">Telegram Folders</div>
        {telegramFolders.map((item) => (
          <RailButton key={item} active={railMode === `folder:${item}`} label={item} count={countWhere(`folder:${item}`)} onClick={() => setRailMode(`folder:${item}`)} />
        ))}

        <div className="tg-inbox-rail-label">CRM Folders</div>
        {crmFolders.map((item) => (
          <RailButton key={item} active={railMode === `crm:${item}`} label={item} count={countWhere(`crm:${item}`)} onClick={() => setRailMode(`crm:${item}`)} />
        ))}

        <div className="tg-inbox-rail-label">Accounts</div>
        {accounts.map((account) => (
          <button
            key={account.id}
            className={`tg-inbox-rail-person ${selectedAccountId === account.id ? 'active' : ''}`}
            title={account.display_name || account.phone}
            onClick={() => {
              setSelectedAccountId(account.id);
              setSelectedDialogId(null);
            }}
          >
            <AvatarCircle name={account.display_name || account.phone} size={18} />
            <span>{account.display_name || account.phone}</span>
            <strong>{dialogs.filter((dialog) => dialog.account_id === account.id).length}</strong>
          </button>
        ))}
      </aside>

      <section className="tg-inbox-list-pane">
        <div className="tg-inbox-list-head">
          <div>
            <strong>{selectedAccount ? selectedAccount.display_name || selectedAccount.phone : titleForRail(railMode)}</strong>
            <span>{filteredDialogs.length} conversations</span>
          </div>
          <div className="tg-inbox-list-head-actions">
            <a href="/experimental/telegram-console" className="tg-inbox-head-link">Setup</a>
            <PaneToggle collapsed={listCollapsed} label="conversation list" onClick={() => setListCollapsed((value) => !value)} />
          </div>
        </div>

        <div className="tg-inbox-filter-row">
          <CustomSelect
            value={selectedAccountId ?? 'all'}
            onChange={(value) => {
              setSelectedAccountId(value === 'all' ? null : value);
              setSelectedDialogId(null);
            }}
            options={accountOptions}
          />
          <CustomSelect
            value={stateFilter}
            onChange={setStateFilter}
            options={[
              { value: 'all', label: 'All states' },
              { value: 'unread', label: 'Unread' },
              { value: 'replied', label: 'Replied' },
              { value: 'needs-reply', label: 'Needs reply' },
            ]}
          />
        </div>

        <div className="tg-inbox-dialogs">
          {isLoading ? (
            <div className="tg-inbox-empty">Loading Telegram inbox...</div>
          ) : filteredDialogs.length ? filteredDialogs.map((dialog) => {
            const account = accountById.get(dialog.account_id);
            return (
              <button
                key={dialog.id}
                className={`tg-inbox-dialog ${selectedDialogId === dialog.id ? 'active' : ''}`}
                title={dialog.title}
                onClick={() => setSelectedDialogId(dialog.id)}
              >
                <AvatarCircle name={dialog.title} size={28} />
                <span className="tg-inbox-dialog-copy">
                  <span className="tg-inbox-dialog-line">
                    <strong>{dialog.title}</strong>
                    <small>{formatInboxTime(dialog.last_message_at)}</small>
                  </span>
                  <span className="tg-inbox-preview">{dialog.last_message_preview || 'No mirrored text yet'}</span>
                  <span className="tg-inbox-dialog-meta">
                    {dialog.username ? `@${dialog.username}` : dialog.kind}
                    {' - '}
                    {account?.display_name || account?.phone || 'Account'}
                  </span>
                </span>
                <span className={`tg-inbox-status-dot ${dialog.is_replied ? 'replied' : dialog.is_unread ? 'unread' : ''}`} />
              </button>
            );
          }) : (
            <div className="tg-inbox-empty">No conversations match these filters.</div>
          )}
        </div>
      </section>

      <main className="tg-inbox-chat-pane">
        {selectedDialog ? (
          <>
            <header className="tg-inbox-chat-head">
              <div className="tg-inbox-chat-title">
                <AvatarCircle name={selectedDialog.title} size={32} />
                <div>
                  <strong>{selectedDialog.title}</strong>
                  <span>{selectedDialog.username ? `@${selectedDialog.username}` : selectedDialog.kind}</span>
                </div>
              </div>
              <div className="tg-inbox-chat-actions">
                <button className="btn-secondary" onClick={() => setDetailsCollapsed((value) => !value)}>
                  {detailsCollapsed ? 'Show details' : 'Hide details'}
                </button>
                <button className="btn-secondary" disabled={busy} onClick={() => void saveDialog({ is_unread: !selectedDialog.is_unread })}>
                  {selectedDialog.is_unread ? 'Mark read' : 'Mark unread'}
                </button>
                <button className="btn-secondary" disabled={busy} onClick={() => void saveDialog({ is_replied: !selectedDialog.is_replied })}>
                  {selectedDialog.is_replied ? 'Undo replied' : 'Mark replied'}
                </button>
                <span className={`tg-inbox-state ${selectedDialog.is_replied ? 'done' : 'open'}`}>
                  {selectedDialog.is_replied ? 'Resolved' : 'In Progress'}
                </span>
              </div>
            </header>

            {!detailsCollapsed && (
              <div className="tg-inbox-activity">
                <div>
                  <span>Activity</span>
                  <p>{selectedDialog.title} is {selectedDialog.is_unread ? 'unread' : 'open'}</p>
                  <p>{selectedDialog.crm_folder} folder · {selectedDialog.folder_name || 'Telegram'}</p>
                </div>
                <details className="tg-inbox-details">
                  <summary>Tags, folder, notes</summary>
                  <div className="tg-inbox-meta-grid">
                    <input className="input" value={folder} onChange={(event) => setFolder(event.target.value)} placeholder="CRM folder" />
                    <input className="input" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Tags" />
                    <textarea className="input" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes" />
                    <button className="btn" disabled={busy} onClick={() => void saveDialog()}>Save</button>
                  </div>
                </details>
              </div>
            )}

            {!detailsCollapsed && (
              <div className="tg-inbox-tag-strip">
                {selectedDialog.tags.length ? selectedDialog.tags.map((item) => (
                  <button key={item} onClick={() => setRailMode(`tag:${item}`)}>#{item}</button>
                )) : <span>No tags yet</span>}
                {allTags.filter((item) => !selectedDialog.tags.includes(item)).slice(0, 3).map((item) => (
                  <button key={item} onClick={() => setRailMode(`tag:${item}`)}>#{item}</button>
                ))}
              </div>
            )}

            <div className="tg-inbox-message-flow">
              {messages.length ? messages.map((message) => (
                <div key={message.id} className={`tg-inbox-message ${message.is_outbound ? 'outbound' : 'inbound'}`}>
                  <div>{message.text || '[non-text message]'}</div>
                  <small>{message.sender_name || (message.is_outbound ? 'You' : selectedDialog.title)} · {formatInboxTime(message.sent_at)}</small>
                </div>
              )) : (
                <div className="tg-inbox-empty">Sync this account to mirror recent messages.</div>
              )}
            </div>

            <footer className="tg-inbox-composer">
              <textarea
                value={replyDraft}
                onChange={(event) => setReplyDraft(event.target.value)}
                placeholder={`Write to chat ${selectedDialog.title}...`}
              />
              <div className="tg-inbox-composer-foot">
                <span>{status || 'Replies are queued first, then approved from setup.'}</span>
                <button className="btn" disabled={busy || !replyDraft.trim()} onClick={() => void queueReply()}>
                  Queue reply
                </button>
              </div>
            </footer>
          </>
        ) : (
          <div className="tg-inbox-empty center">Choose a conversation.</div>
        )}
      </main>
    </div>
  );
}
