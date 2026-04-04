'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';
import { CustomSelect } from '@/components/ui/select';

const STATUS_OPTIONS = [
  'Opportunity',
  'Qualified',
  'Urgent',
  'Call in Future',
  'Meeting Scheduled',
  'Proposal Sent',
  'Negotiation',
  'Closed Won',
  'Closed Lost',
  'Not Interested',
];

const FOLLOW_UP_STATUS_OPTIONS = [
  'Opportunity',
  'Qualified',
  'CIF',
  'Urgent',
  'Closed',
  'Lost',
  'No Response',
];

type TrackerEntry = {
  id: string;
  company_name: string;
  comments: string | null;
  campaign_id: string | null;
  lead_id: string | null;
  account_id: string | null;
  current_status: string;
  group_created: boolean;
  follow_up_1_date: string | null;
  follow_up_1_status: string | null;
  follow_up_2_date: string | null;
  follow_up_2_status: string | null;
  follow_up_3_date: string | null;
  follow_up_3_status: string | null;
  follow_up_4_date: string | null;
  follow_up_4_status: string | null;
  campaigns?: { name: string } | null;
  leads?: { first_name: string; last_name: string; telegram_username: string } | null;
  telegram_accounts?: { label: string; telegram_username: string } | null;
};

// Group entries by company_name, keep first as primary
type CompanyGroup = {
  primary: TrackerEntry;
  extras: TrackerEntry[];
};

const emptyEntry = (): Partial<TrackerEntry> => ({
  company_name: '',
  comments: '',
  current_status: 'Opportunity',
  group_created: false,
  follow_up_1_date: null,
  follow_up_1_status: null,
  follow_up_2_date: null,
  follow_up_2_status: null,
  follow_up_3_date: null,
  follow_up_3_status: null,
  follow_up_4_date: null,
  follow_up_4_status: null,
});

const STATUS_COLORS: Record<string, string> = {
  'Opportunity': '#f59e0b',
  'Qualified': '#10b981',
  'Urgent': '#ef4444',
  'Call in Future': '#6366f1',
  'Meeting Scheduled': '#8b5cf6',
  'Proposal Sent': '#3b82f6',
  'Negotiation': '#f97316',
  'Closed Won': '#22c55e',
  'Closed Lost': '#6b7280',
  'Not Interested': '#374151',
};

function StatusPill({ status, onClick }: { status: string; onClick?: () => void }) {
  const color = STATUS_COLORS[status] ?? '#888';
  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '3px 10px', borderRadius: 4,
        fontSize: 10, fontWeight: 600, letterSpacing: '0.03em',
        background: `${color}20`, color, border: `1px solid ${color}40`,
        cursor: onClick ? 'pointer' : 'default', userSelect: 'none',
      }}
    >
      {status}
      {onClick && <span style={{ marginLeft: 4, opacity: 0.5, fontSize: 8 }}>▾</span>}
    </span>
  );
}

function StatusPopover({ triggerRef, current, onSelect, onClose }: {
  triggerRef: React.RefObject<HTMLElement | null>;
  current: string;
  onSelect: (s: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, triggerRef]);

  if (!pos) return null;
  return (
    <div ref={ref} style={{
      position: 'fixed', zIndex: 9999, top: pos.top, left: pos.left,
      background: 'var(--panel-strong)', border: '1px solid var(--border-soft)',
      borderRadius: 6, padding: 4, minWidth: 170, boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    }}>
      {STATUS_OPTIONS.map(s => {
        const color = STATUS_COLORS[s] ?? '#888';
        return (
          <div
            key={s}
            onClick={() => { onSelect(s); onClose(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
              borderRadius: 4, cursor: 'pointer', fontSize: 12,
              background: s === current ? 'var(--panel-alt)' : 'transparent', color: 'var(--text)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--panel-alt)')}
            onMouseLeave={e => (e.currentTarget.style.background = s === current ? 'var(--panel-alt)' : 'transparent')}
          >
            <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
            {s}
          </div>
        );
      })}
    </div>
  );
}

function ExtraLeadsTooltip({ extras }: { extras: TrackerEntry[] }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  return (
    <span
      ref={ref}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
    >
      <span style={{
        fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
        background: 'var(--panel-strong)', color: 'var(--text-dim)',
        border: '1px solid var(--border-soft)', cursor: 'default', marginLeft: 6,
      }}>
        +{extras.length}
      </span>
      {visible && (
        <div style={{
          position: 'absolute', left: 0, top: '100%', marginTop: 4, zIndex: 50,
          background: 'var(--panel-strong)', border: '1px solid var(--border-soft)',
          borderRadius: 6, padding: '8px 12px', minWidth: 180,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)', display: 'grid', gap: 6,
        }}>
          {extras.map(e => (
            <div key={e.id} style={{ fontSize: 11, color: 'var(--text)' }}>
              <div>{e.leads ? `${e.leads.first_name} ${e.leads.last_name}` : '—'}</div>
              {e.leads?.telegram_username && (
                <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>@{e.leads.telegram_username}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

function StatusCell({ entry, isOpen, onOpen, onClose, onSelect }: {
  entry: TrackerEntry;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSelect: (s: string) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={wrapperRef} style={{ display: 'inline-block' }}>
      <StatusPill status={entry.current_status} onClick={onOpen} />
      {isOpen && (
        <StatusPopover
          triggerRef={wrapperRef}
          current={entry.current_status}
          onSelect={onSelect}
          onClose={onClose}
        />
      )}
    </div>
  );
}

export default function BusinessTrackerPage() {
  const [entries, setEntries] = useState<TrackerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TrackerEntry | null>(null);
  const [form, setForm] = useState<Partial<TrackerEntry>>(emptyEntry());
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [openStatusFor, setOpenStatusFor] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<CompanyGroup | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [allLeads, setAllLeads] = useState<any[]>([]);

  const copyUsername = (username: string) => {
    navigator.clipboard.writeText(username);
    setCopied(username);
    setTimeout(() => setCopied(null), 1500);
  };

  const patchEntry = async (id: string, patch: Partial<TrackerEntry>) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
    try {
      await fetchJson(`/api/business-tracker/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    } catch {
      await load();
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [data, leadsData] = await Promise.all([
      fetchJson<{ entries: TrackerEntry[] }>('/api/business-tracker'),
      fetchJson<{ leads: any[] }>('/api/leads'),
    ]);
    setEntries(data.entries ?? []);
    setAllLeads(leadsData.leads ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Group by company_name
  const groups: CompanyGroup[] = (() => {
    const map = new Map<string, TrackerEntry[]>();
    entries.forEach(e => {
      const key = e.company_name;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return Array.from(map.values()).map(ents => ({ primary: ents[0], extras: ents.slice(1) }));
  })();

  const filtered = groups.filter(g => {
    const e = g.primary;
    const matchSearch = !searchQuery || [
      e.company_name, e.comments, e.leads?.first_name, e.leads?.last_name,
      ...g.extras.map(x => [x.leads?.first_name, x.leads?.last_name].join(' ')),
    ].join(' ').toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === 'all' || e.current_status === statusFilter
      || g.extras.some(x => x.current_status === statusFilter);
    return matchSearch && matchStatus;
  });

  const openAdd = () => {
    setEditingEntry(null);
    setForm(emptyEntry());
    setStatusMsg('');
    setShowModal(true);
  };

  const openEdit = (entry: TrackerEntry) => {
    setEditingEntry(entry);
    setForm({ ...entry });
    setStatusMsg('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.company_name?.trim()) { setStatusMsg('Company name is required.'); return; }
    setSaving(true);
    setStatusMsg('');
    try {
      if (editingEntry) {
        await fetchJson(`/api/business-tracker/${editingEntry.id}`, { method: 'PATCH', body: JSON.stringify(form) });
      } else {
        await fetchJson('/api/business-tracker', { method: 'POST', body: JSON.stringify(form) });
      }
      setShowModal(false);
      await load();
    } catch (err: any) {
      setStatusMsg(`Error: ${err?.message ?? 'Failed to save'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this entry?')) return;
    await fetchJson(`/api/business-tracker/${id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Business Tracker</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>Track company-level sales progress and follow-ups</div>
        </div>
        <button className="btn" onClick={openAdd} style={{ padding: '10px 20px' }}>+ Add Company</button>
      </div>

      {/* Stats */}
      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Companies', value: groups.length },
          { label: 'Opportunities', value: entries.filter(e => e.current_status === 'Opportunity').length },
          { label: 'Qualified', value: entries.filter(e => e.current_status === 'Qualified').length },
          { label: 'Closed Won', value: entries.filter(e => e.current_status === 'Closed Won').length },
        ].map(s => (
          <div key={s.label} className="card">
            <div className="card-title">{s.label}</div>
            <div className="card-value">{loading ? '...' : s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="input" placeholder="Search companies..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ maxWidth: 280 }} />
        <CustomSelect value={statusFilter} onChange={setStatusFilter} style={{ maxWidth: 200 }} options={[{ value: 'all', label: 'All Statuses' }, ...STATUS_OPTIONS.map(s => ({ value: s, label: s }))]} />
      </div>

      {/* Table */}
      <div className="bt-table-wrapper">
        <table className="bt-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Lead</th>
              <th>Campaign</th>
              <th>Account</th>
              <th>Status</th>
              <th>Group</th>
              <th>FU 1</th>
              <th>FU 2</th>
              <th>FU 3</th>
              <th>FU 4</th>
              <th>Comments</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>Loading...</td></tr>
            ) : filtered.length ? filtered.map(({ primary: entry, extras }) => (
              <tr key={entry.id} className="bt-table-row">
                <td className="bt-company" onClick={() => setSelectedGroup({ primary: entry, extras })} style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textDecorationColor: 'var(--text-dim)' }}>{entry.company_name}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span>{entry.leads ? `${entry.leads.first_name} ${entry.leads.last_name}` : '—'}</span>
                    {extras.length > 0 && <ExtraLeadsTooltip extras={extras} />}
                  </div>
                </td>
                <td>{entry.campaigns?.name ?? '—'}</td>
                <td>{entry.telegram_accounts?.label ?? '—'}</td>
                <td>
                  <StatusCell
                    entry={entry}
                    isOpen={openStatusFor === entry.id}
                    onOpen={() => setOpenStatusFor(openStatusFor === entry.id ? null : entry.id)}
                    onClose={() => setOpenStatusFor(null)}
                    onSelect={s => patchEntry(entry.id, { current_status: s })}
                  />
                </td>
                <td>
                  <span
                    onClick={() => patchEntry(entry.id, { group_created: !entry.group_created })}
                    style={{
                      display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4,
                      fontSize: 10, background: entry.group_created ? '#10b98120' : 'var(--panel)',
                      color: entry.group_created ? '#10b981' : 'var(--text-dim)',
                      border: `1px solid ${entry.group_created ? '#10b98140' : 'var(--border-soft)'}`,
                      cursor: 'pointer', userSelect: 'none',
                    }}
                  >
                    {entry.group_created ? 'Yes' : 'No'}
                  </span>
                </td>
                <td>
                  {entry.follow_up_1_date ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 11 }}>{new Date(entry.follow_up_1_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                      {entry.follow_up_1_status && <StatusPill status={entry.follow_up_1_status} />}
                    </div>
                  ) : '—'}
                </td>
                <td>
                  {entry.follow_up_2_date ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 11 }}>{new Date(entry.follow_up_2_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                      {entry.follow_up_2_status && <StatusPill status={entry.follow_up_2_status} />}
                    </div>
                  ) : '—'}
                </td>
                <td>
                  {entry.follow_up_3_date ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 11 }}>{new Date(entry.follow_up_3_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                      {entry.follow_up_3_status && <StatusPill status={entry.follow_up_3_status} />}
                    </div>
                  ) : '—'}
                </td>
                <td>
                  {entry.follow_up_4_date ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 11 }}>{new Date(entry.follow_up_4_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                      {entry.follow_up_4_status && <StatusPill status={entry.follow_up_4_status} />}
                    </div>
                  ) : '—'}
                </td>
                <td style={{ maxWidth: 160 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {entry.comments || '—'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="board-card-btn" onClick={() => openEdit(entry)} title="Edit" style={{ padding: '4px 7px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button className="board-card-btn" onClick={() => handleDelete(entry.id)} title="Delete" style={{ padding: '4px 7px', color: '#e74c3c', borderColor: '#e74c3c40' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={12} style={{ textAlign: 'center', padding: 48, color: 'var(--text-dim)' }}>No entries yet. Add a company to get started.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="edit-lead-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="edit-lead-modal" style={{ maxWidth: 560, width: '100%' }}>
            <div className="card-title" style={{ marginBottom: 20, fontSize: 16 }}>
              {editingEntry ? 'Edit Company' : 'Add Company'}
            </div>
            <div className="form-grid">
              <div className="form-grid columns-2">
                <div className="form-grid">
                  <label className="dim" style={{ fontSize: 11 }}>Company Name *</label>
                  <input className="input" value={form.company_name ?? ''} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="Acme Inc." />
                </div>
                <div className="form-grid">
                  <label className="dim" style={{ fontSize: 11 }}>Current Status</label>
                  <CustomSelect value={form.current_status ?? 'Opportunity'} onChange={v => setForm(f => ({ ...f, current_status: v }))} options={STATUS_OPTIONS.map(s => ({ value: s, label: s }))} />
                </div>
              </div>

              <div className="form-grid">
                <label className="dim" style={{ fontSize: 11 }}>Comments</label>
                <textarea className="textarea" style={{ minHeight: 70 }} value={form.comments ?? ''} onChange={e => setForm(f => ({ ...f, comments: e.target.value }))} placeholder="Notes about this company..." />
              </div>

              <div className="form-grid columns-2">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label className="dim" style={{ fontSize: 11 }}>Group Created</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.group_created ?? false} onChange={e => setForm(f => ({ ...f, group_created: e.target.checked }))} />
                    <span style={{ fontSize: 12 }}>Yes</span>
                  </label>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16, marginTop: 4 }}>
                <div className="dim" style={{ fontSize: 11, marginBottom: 12 }}>Follow-Up Dates & Status</div>
                <div className="form-grid" style={{ gap: 10 }}>
                  {[1, 2, 3, 4].map(n => (
                    <div key={n} className="form-grid columns-2">
                      <div className="form-grid">
                        <label className="dim" style={{ fontSize: 10 }}>FU {n} Date</label>
                        <input className="input" type="date" value={(form as any)[`follow_up_${n}_date`] ?? ''} onChange={e => setForm(f => ({ ...f, [`follow_up_${n}_date`]: e.target.value || null }))} />
                      </div>
                      <div className="form-grid">
                        <label className="dim" style={{ fontSize: 10 }}>FU {n} Status</label>
                        <CustomSelect value={(form as any)[`follow_up_${n}_status`] ?? ''} onChange={v => setForm(f => ({ ...f, [`follow_up_${n}_status`]: v || null }))} options={[{ value: '', label: '— None —' }, ...FOLLOW_UP_STATUS_OPTIONS.map(s => ({ value: s, label: s }))]} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {statusMsg && <div className={`status-callout ${statusMsg.startsWith('Error') ? 'error' : 'success'}`}>{statusMsg}</div>}

              <div className="btn-row" style={{ marginTop: 8 }}>
                <button className="btn" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Company detail panel */}
      {selectedGroup && (() => {
        const allEntries = [selectedGroup.primary, ...selectedGroup.extras];
        const primaryStatus = selectedGroup.primary.current_status;
        const statusColor = STATUS_COLORS[primaryStatus] ?? '#888';
        const comment = allEntries.map(e => e.comments).filter(Boolean)[0];
        const accounts = [...new Set(allEntries.map(e => e.telegram_accounts?.label).filter(Boolean))] as string[];
        // All leads from the leads DB matching this company name
        const companyLeads = allLeads.filter(l =>
          (l.company_name ?? '').toLowerCase() === selectedGroup.primary.company_name.toLowerCase()
        );
        // Lead IDs that have a BT entry (the ones we actually spoke with)
        const btLeadIds = new Set(allEntries.map(e => e.lead_id).filter(Boolean));
        return (
          <div
            onClick={e => { if (e.target === e.currentTarget) setSelectedGroup(null); }}
            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          >
            <div style={{ width: '100%', maxWidth: 400, background: '#111113', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '28px 28px 24px', boxShadow: '0 20px 50px rgba(0,0,0,0.7)' }}>

              {/* Close */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>{selectedGroup.primary.company_name}</div>
                <button onClick={() => setSelectedGroup(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
              </div>

              {/* Status */}
              <div style={{ marginBottom: comment || accounts.length ? 16 : 20 }}>
                <span style={{ padding: '3px 9px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${statusColor}20`, color: statusColor, border: `1px solid ${statusColor}35` }}>{primaryStatus}</span>
              </div>

              {/* Comment */}
              {comment && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, marginBottom: 14 }}>{comment}</div>
              )}

              {/* Account that reached out */}
              {accounts.length > 0 && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>
                  Reached out via <span style={{ color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>{accounts.join(', ')}</span>
                </div>
              )}

              {/* Divider */}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 16 }} />

              {/* Leads from DB */}
              {companyLeads.length === 0 ? (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No leads found for this company.</div>
              ) : companyLeads.map((l, i) => {
                const isMain = btLeadIds.has(l.id);
                return (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : undefined }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: isMain ? '#fff' : 'rgba(255,255,255,0.6)' }}>
                          {l.first_name} {l.last_name}
                        </span>
                        {isMain && (
                          <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)', letterSpacing: '0.04em' }}>
                            CONTACTED
                          </span>
                        )}
                      </div>
                      {l.telegram_username && (
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>@{l.telegram_username}</div>
                      )}
                    </div>
                    {l.telegram_username && (
                      <button
                        onClick={() => copyUsername(l.telegram_username)}
                        title="Copy username"
                        style={{
                          flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                          color: copied === l.telegram_username ? '#10b981' : 'rgba(255,255,255,0.3)',
                          display: 'flex', alignItems: 'center',
                        }}
                      >
                        {copied === l.telegram_username
                          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                        }
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
