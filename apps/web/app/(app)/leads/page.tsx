'use client';

import { useMemo, useState, useRef, useId, useEffect } from 'react';
import useSWR from 'swr';
import { fetchJson } from '@/lib/web/fetch-json';
import { buildLeadMemberships, type Campaign, type CampaignDetail, type Lead } from '@/lib/web/insights';
import { CustomSelect } from '@/components/ui/select';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { AvatarCircle } from '@/components/ui/avatar';
import { SkeletonPageContent } from '@/components/ui/skeleton';

export default function LeadsPage() {
  const { data: leadsData, isLoading: loadingLeads, mutate: mutateLeads } = useSWR<{ leads: Lead[] }>('/api/leads');
  const { data: campaignsData } = useSWR<{ campaigns: Campaign[] }>('/api/campaigns');

  const leads = leadsData?.leads ?? [];
  const campaigns = campaignsData?.campaigns ?? [];

  const detailsKey = campaigns.length > 0 ? `campaign-details:${campaigns.map(c => c.id).sort().join(',')}` : null;
  const { data: details = [] } = useSWR<CampaignDetail[]>(detailsKey, async () =>
    Promise.all(campaigns.map(c => fetchJson<CampaignDetail>(`/api/campaigns/${c.id}`)))
  );

  const [status, setStatus] = useState('');
  const [statusTone, setStatusTone] = useState<'success' | 'danger' | 'neutral'>('neutral');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [importing, setImporting] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importTags, setImportTags] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', company_name: '', telegram_username: '', tags: '', source: '' });
  const [fetchingAvatar, setFetchingAvatar] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState<string | null>(null);

  // Bulk select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTagAction, setBulkTagAction] = useState<'add' | 'remove' | null>(null);
  const [bulkTagValue, setBulkTagValue] = useState('');
  const [bulkApplying, setBulkApplying] = useState(false);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const [tagPickerOpen, setTagPickerOpen] = useState<'add' | 'import' | null>(null);
  const tagPickerRef = useRef<HTMLDivElement>(null);
  const tagBtnRef = useRef<HTMLButtonElement>(null);
  const importTagBtnRef = useRef<HTMLButtonElement>(null);
  const [tagPickerPos, setTagPickerPos] = useState<{ top: number; left: number } | null>(null);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    company_name: '',
    telegram_username: '',
    tags: '',
    source: 'Manual',
  });


  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node)
        && e.target !== tagBtnRef.current && e.target !== importTagBtnRef.current) {
        setTagPickerOpen(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allTags = useMemo(() => [...new Set(leads.flatMap((lead) => lead.tags))], [leads]);

  const openTagPicker = (which: 'add' | 'import', btnRef: React.RefObject<HTMLButtonElement | null>) => {
    if (tagPickerOpen === which) { setTagPickerOpen(null); return; }
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setTagPickerPos({ top: rect.bottom + 4, left: rect.left });
    }
    setTagPickerOpen(which);
  };

  const addTag = (tag: string, which: 'add' | 'import') => {
    if (which === 'add') {
      const current = form.tags.split(',').map(t => t.trim()).filter(Boolean);
      if (!current.includes(tag)) setForm(c => ({ ...c, tags: [...current, tag].join(', ') }));
    } else {
      const current = importTags.split(',').map(t => t.trim()).filter(Boolean);
      if (!current.includes(tag)) setImportTags([...current, tag].join(', '));
    }
    setTagPickerOpen(null);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    await fetchJson('/api/leads', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        tags: form.tags.split(',').map((item) => item.trim()).filter(Boolean),
      }),
    });
    setForm({ first_name: '', last_name: '', company_name: '', telegram_username: '', tags: '', source: 'Manual' });
    setStatus('Lead added.');
    setStatusTone('success');
    await mutateLeads();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setStatus(`File "${file.name}" selected. Click "Import Now" to upload.`);
    setStatusTone('neutral');
    event.target.value = '';
  };

  const handleImport = async () => {
    if (!pendingFile) return;
    setImporting(true);
    setStatus(`Importing ${pendingFile.name}...`);
    setStatusTone('neutral');
    try {
      const formData = new FormData();
      formData.append('file', pendingFile);
      if (importTags.trim()) formData.append('tags', importTags.trim());
      const result = await fetchJson<{ leads?: unknown[] }>('/api/leads/import', { method: 'POST', body: formData });
      const count = result.leads?.length ?? 0;
      setStatus(`Imported ${count} leads. Duplicates merged automatically.`);
      setStatusTone('success');
      setPendingFile(null);
      setImportTags('');
      await mutateLeads();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Import failed.');
      setStatusTone('danger');
    }
    setImporting(false);
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!confirm('Delete this lead? This cannot be undone.')) return;
    try {
      await fetchJson(`/api/leads/${leadId}`, { method: 'DELETE' });
      setOpenMenu(null);
      await mutateLeads();
    } catch {
      setStatus('Failed to delete lead.');
      setStatusTone('danger');
    }
  };

  const startEdit = (lead: Lead) => {
    setEditingLead(lead);
    setEditForm({
      first_name: lead.first_name,
      last_name: lead.last_name,
      company_name: lead.company_name,
      telegram_username: lead.telegram_username,
      tags: lead.tags.join(', '),
      source: lead.source ?? 'Manual',
    });
    setAvatarStatus(null);
    setOpenMenu(null);
  };

  const handleFetchAvatar = async () => {
    if (!editingLead) return;
    setFetchingAvatar(true);
    setAvatarStatus(null);
    try {
      const res = await fetchJson<{ ok: boolean; avatarUrl: string | null; message?: string }>(
        `/api/leads/${editingLead.id}/fetch-avatar`,
        { method: 'POST' },
      );
      if (res.ok && res.avatarUrl) {
        setEditingLead((prev) => prev ? { ...prev, profile_picture_url: res.avatarUrl } : prev);
        void mutateLeads();
        setAvatarStatus('✓ Profile picture saved');
      } else {
        setAvatarStatus(res.message ?? 'No picture found for this username');
      }
    } catch {
      setAvatarStatus('Failed to fetch — check the username');
    }
    setFetchingAvatar(false);
  };

  const handleEditSave = async () => {
    if (!editingLead) return;
    try {
      await fetchJson(`/api/leads/${editingLead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...editForm,
          tags: editForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      setEditingLead(null);
      await mutateLeads();
    } catch {
      setStatus('Failed to update lead.');
      setStatusTone('danger');
    }
  };

  const leadRows = useMemo(() => buildLeadMemberships(leads, details), [details, leads]);
  const allSources = useMemo(() => [...new Set(leads.map((lead) => lead.source ?? 'Manual'))], [leads]);
  const filteredLeads = useMemo(() => {
    return leadRows.filter((lead) => {
      const matchesSearch = !search.trim() || [lead.first_name, lead.last_name, lead.company_name, lead.telegram_username]
        .join(' ').toLowerCase().includes(search.trim().toLowerCase());
      const matchesSource = sourceFilter === 'all' || (lead.source ?? 'Manual') === sourceFilter;
      const matchesTag = tagFilter === 'all' || lead.tags.includes(tagFilter);
      return matchesSearch && matchesSource && matchesTag;
    });
  }, [leadRows, search, sourceFilter, tagFilter]);

  // Keep header checkbox indeterminate state in sync
  useEffect(() => {
    const el = headerCheckboxRef.current;
    if (!el) return;
    const total = filteredLeads.length;
    const numSelected = filteredLeads.filter((l) => selectedIds.has(l.id)).length;
    el.checked = total > 0 && numSelected === total;
    el.indeterminate = numSelected > 0 && numSelected < total;
  }, [selectedIds, filteredLeads]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allFilteredIds = filteredLeads.map((l) => l.id);
    const allSelected = allFilteredIds.every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(allFilteredIds));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBulkTagAction(null);
    setBulkTagValue('');
  };

  const handleBulkAddTag = async (tag: string) => {
    if (!tag.trim() || bulkApplying) return;
    const trimmed = tag.trim();
    setBulkApplying(true);
    const ids = [...selectedIds];
    for (const id of ids) {
      const lead = leads.find((l) => l.id === id);
      if (!lead) continue;
      if (lead.tags.includes(trimmed)) continue;
      const updatedTags = [...lead.tags, trimmed];
      try {
        await fetchJson(`/api/leads/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ tags: updatedTags }),
        });
      } catch { /* skip per-lead errors */ }
    }
    await mutateLeads();
    setBulkApplying(false);
    setBulkTagAction(null);
    setBulkTagValue('');
  };

  const handleBulkRemoveTag = async (tag: string) => {
    if (!tag || bulkApplying) return;
    setBulkApplying(true);
    const ids = [...selectedIds];
    for (const id of ids) {
      const lead = leads.find((l) => l.id === id);
      if (!lead || !lead.tags.includes(tag)) continue;
      const updatedTags = lead.tags.filter((t) => t !== tag);
      try {
        await fetchJson(`/api/leads/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ tags: updatedTags }),
        });
      } catch { /* skip per-lead errors */ }
    }
    await mutateLeads();
    setBulkApplying(false);
    setBulkTagAction(null);
    setBulkTagValue('');
  };

  // Tags present across selected leads (for remove picker)
  const selectedLeadTags = useMemo(() => {
    const tagSet = new Set<string>();
    leads.filter((l) => selectedIds.has(l.id)).forEach((l) => l.tags.forEach((t) => tagSet.add(t)));
    return [...tagSet].sort();
  }, [leads, selectedIds]);

  return (
    <div className="page-content">
      <div className="grid grid-4">
        <div className="card"><div className="card-title">Reusable Leads</div><div className="card-value">{leads.length}</div><div className="card-subtitle">Shared across every campaign.</div></div>
        <div className="card"><div className="card-title">Companies</div><div className="card-value">{new Set(leads.map((lead) => lead.company_name)).size}</div><div className="card-subtitle">Company-first grouping.</div></div>
        <div className="card"><div className="card-title">Tagged Leads</div><div className="card-value">{leads.filter((lead) => lead.tags.length).length}</div><div className="card-subtitle">Filter by persona or stage.</div></div>
        <div className="card"><div className="card-title">In Campaigns</div><div className="card-value">{leadRows.filter((lead) => lead.campaignCount > 0).length}</div><div className="card-subtitle">Attached to a campaign.</div></div>
      </div>

      <div className="section-label">Lead Intake</div>
      <div className="split-layout">
        {/* Add Lead */}
        <form className="card form-grid" onSubmit={handleCreate}>
          <div className="card-title-row">
            <div className="card-title">Add Lead</div>
            <InfoTooltip text="Manually add a single lead. Do not include the @ symbol in the Telegram username." />
          </div>
          <div className="form-grid columns-2">
            <input className="input" placeholder="First Name" value={form.first_name} onChange={(e) => setForm((c) => ({ ...c, first_name: e.target.value }))} />
            <input className="input" placeholder="Last Name" value={form.last_name} onChange={(e) => setForm((c) => ({ ...c, last_name: e.target.value }))} />
            <input className="input" placeholder="Company" value={form.company_name} onChange={(e) => setForm((c) => ({ ...c, company_name: e.target.value }))} />
            <input className="input" placeholder="Telegram username (no @)" value={form.telegram_username} onChange={(e) => setForm((c) => ({ ...c, telegram_username: e.target.value }))} />
          </div>
          <div className="form-grid columns-2">
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                placeholder="Tags (comma separated)"
                value={form.tags}
                onChange={(e) => setForm((c) => ({ ...c, tags: e.target.value }))}
                style={{ paddingRight: 32 }}
              />
              <button
                type="button"
                ref={tagBtnRef}
                onClick={() => openTagPicker('add', tagBtnRef)}
                title="Pick existing tag"
                style={{
                  position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-dim)', fontSize: 16, lineHeight: 1, padding: '2px 4px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}
              >+</button>
            </div>
            <input className="input" placeholder="Source" value={form.source} onChange={(e) => setForm((c) => ({ ...c, source: e.target.value }))} />
          </div>
          <div>
            <button className="btn" type="submit" style={{ fontSize: 12, padding: '6px 14px' }}>Save Lead</button>
          </div>
        </form>

        {/* Import CSV */}
        <div className="card form-grid">
          <div className="card-title">Import CSV</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px', background: 'var(--panel-alt)', border: '1px solid var(--border-soft)', borderRadius: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', minWidth: 54 }}>Required</span>
              {[
                { label: 'First Name',         color: '#6366f1' },
                { label: 'Telegram Username',  color: '#14b8a6' },
                { label: 'Company',            color: '#f59e0b' },
              ].map(({ label, color }) => (
                <span key={label} style={{ padding: '3px 9px', border: `1px solid ${color}50`, borderRadius: 4, fontSize: 11, color, background: `${color}18`, fontWeight: 500 }}>{label}</span>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.05em', textTransform: 'uppercase', minWidth: 54 }}>Optional</span>
              {['Last Name', 'Tags', 'Notes', 'Source'].map(col => (
                <span key={col} style={{ padding: '3px 9px', border: '1px solid var(--border-soft)', borderRadius: 4, fontSize: 11, color: 'var(--text-dim)', background: 'transparent' }}>{col}</span>
              ))}
            </div>
            <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 8, color: 'var(--text-dim)', fontSize: 10, lineHeight: 1.5 }}>
              Duplicates auto-merged · No @ in username
            </div>
          </div>

          <div>
            <label className="btn-secondary" style={{ width: 'fit-content', cursor: 'pointer', fontSize: 12, padding: '6px 14px' }}>
              <input type="file" accept=".csv" onChange={handleFileSelect} style={{ display: 'none' }} />
              Choose CSV File
            </label>
          </div>
          {pendingFile && (
            <>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  placeholder="Add tags to all imported leads (comma separated)"
                  value={importTags}
                  onChange={(e) => setImportTags(e.target.value)}
                  style={{ paddingRight: 32 }}
                />
                <button
                  type="button"
                  ref={importTagBtnRef}
                  onClick={() => openTagPicker('import', importTagBtnRef)}
                  title="Pick existing tag"
                  style={{
                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-dim)', fontSize: 16, lineHeight: 1, padding: '2px 4px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}
                >+</button>
              </div>
              {importTags.trim() && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {importTags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                    <span key={t} className="tag">{t}</span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="dim" style={{ fontSize: 11 }}>{pendingFile.name}</span>
                <button className="btn" type="button" onClick={handleImport} disabled={importing} style={{ fontSize: 12, padding: '6px 14px' }}>
                  {importing ? 'Importing...' : 'Import Now'}
                </button>
                <button className="btn-secondary" type="button" onClick={() => { setPendingFile(null); setStatus(''); setImportTags(''); }} style={{ fontSize: 12, padding: '6px 14px' }}>
                  Cancel
                </button>
              </div>
            </>
          )}
          {status ? <div className={`status-callout ${statusTone === 'success' ? 'success' : statusTone === 'danger' ? 'danger' : ''}`}>{status}</div> : null}
        </div>
      </div>

      {/* Tag picker popover */}
      {tagPickerOpen && tagPickerPos && (
        <div
          ref={tagPickerRef}
          style={{
            position: 'fixed', zIndex: 9999,
            top: tagPickerPos.top, left: tagPickerPos.left,
            background: 'var(--panel-strong)', border: '1px solid var(--border-soft)',
            borderRadius: 6, padding: 4, minWidth: 160,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {allTags.length === 0 ? (
            <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-dim)' }}>No tags yet</div>
          ) : allTags.map(tag => (
            <div
              key={tag}
              onClick={() => addTag(tag, tagPickerOpen)}
              style={{
                padding: '6px 10px', borderRadius: 4, cursor: 'pointer',
                fontSize: 12, color: 'var(--text-dim)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--panel-alt)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-dim)'; }}
            >{tag}</div>
          ))}
        </div>
      )}

      <div className="section-label">Lead Database</div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <input className="input" placeholder="Search by name, company, or Telegram username" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="filter-row">
            <CustomSelect value={sourceFilter} onChange={setSourceFilter} options={[{ value: 'all', label: 'All Sources' }, ...allSources.map(s => ({ value: s, label: s }))]} />
            <CustomSelect value={tagFilter} onChange={setTagFilter} options={[{ value: 'all', label: 'All Tags' }, ...allTags.map(t => ({ value: t, label: t }))]} />
          </div>
        </div>
      </div>

      <div className="table lead-crm-table">
        <div className="table-header">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <input
              ref={headerCheckboxRef}
              type="checkbox"
              className="lead-checkbox"
              onChange={toggleSelectAll}
              title={filteredLeads.every((l) => selectedIds.has(l.id)) ? 'Deselect all' : 'Select all'}
            />
          </div>
          <div>Lead</div>
          <div>Company</div>
          <div>Source</div>
          <div>Tags</div>
          <div></div>
        </div>
        {loadingLeads ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="table-row" style={{ display: 'grid', gridTemplateColumns: '32px 1.2fr 0.9fr 0.8fr 1.1fr 40px', gap: 16, padding: '10px 16px', alignItems: 'center' }}>
              <div /><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0 }} className="skeleton" /><div style={{ flex: 1 }}><div className="skeleton" style={{ height: 12, width: '70%', marginBottom: 5 }} /><div className="skeleton" style={{ height: 10, width: '50%' }} /></div></div>
              {[0, 1, 2].map(j => <div key={j} className="skeleton" style={{ height: 12, width: `${55 + j * 12}%` }} />)}
              <div />
            </div>
          ))
        ) : filteredLeads.length ? (
          filteredLeads.map((lead) => (
            <div
              key={lead.id}
              className="table-row"
              style={selectedIds.has(lead.id) ? { background: 'rgba(99,102,241,0.06)' } : undefined}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  className="lead-checkbox"
                  checked={selectedIds.has(lead.id)}
                  onChange={() => toggleSelect(lead.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <AvatarCircle url={lead.profile_picture_url} name={`${lead.first_name} ${lead.last_name}`} size={30} style={{ flexShrink: 0 }} />
                <div>
                  <div>{lead.first_name} {lead.last_name}</div>
                  <div className="dim">@{lead.telegram_username}</div>
                </div>
              </div>
              <div>{lead.company_name}</div>
              <div>{lead.source ?? 'Manual'}</div>
              <div>{lead.tags.length ? lead.tags.map((tag) => <span key={tag} className="tag">{tag}</span>) : <span className="dim">No tags</span>}</div>
              <div className="dots-menu-wrapper" ref={openMenu === lead.id ? menuRef : undefined}>
                <button className="dots-btn" onClick={() => setOpenMenu(openMenu === lead.id ? null : lead.id)}>&#8942;</button>
                {openMenu === lead.id && (
                  <div className="dots-menu">
                    <button onClick={() => startEdit(lead)}>Edit</button>
                    <button className="danger-item" onClick={() => handleDeleteLead(lead.id)}>Delete</button>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">No leads match the current search and filter settings.</div>
        )}
      </div>

      {/* Floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="bulk-action-bar">
          <span className="bulk-action-bar-count">{selectedIds.size} selected</span>

          {filteredLeads.some((l) => !selectedIds.has(l.id)) && (
            <button className="bulk-action-bar-link" onClick={toggleSelectAll}>
              Select all {filteredLeads.length}
            </button>
          )}

          <button className="bulk-action-bar-link" onClick={clearSelection} disabled={bulkApplying}>
            Clear
          </button>

          <div className="bulk-action-bar-divider" />

          {bulkApplying ? (
            <span className="bulk-action-bar-progress">Applying…</span>
          ) : bulkTagAction === 'add' ? (
            /* Inline add-tag input */
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                className="input bulk-tag-input"
                placeholder="Tag name…"
                value={bulkTagValue}
                onChange={(e) => setBulkTagValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleBulkAddTag(bulkTagValue); if (e.key === 'Escape') { setBulkTagAction(null); setBulkTagValue(''); } }}
                autoFocus
                style={{ width: 120, fontSize: 11, padding: '4px 8px', height: 26 }}
              />
              <button
                className="btn"
                onClick={() => void handleBulkAddTag(bulkTagValue)}
                disabled={!bulkTagValue.trim()}
                style={{ fontSize: 11, padding: '4px 10px', height: 26 }}
              >Apply</button>
              <button
                className="bulk-action-bar-link"
                onClick={() => { setBulkTagAction(null); setBulkTagValue(''); }}
                style={{ fontSize: 11 }}
              >Cancel</button>
            </div>
          ) : bulkTagAction === 'remove' ? (
            /* Remove-tag picker */
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Remove:</span>
              {selectedLeadTags.length === 0 ? (
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>No tags</span>
              ) : (
                selectedLeadTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => void handleBulkRemoveTag(tag)}
                    style={{
                      fontSize: 11, padding: '3px 9px',
                      background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                      borderRadius: 4, color: '#f87171', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.22)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.12)'; }}
                  >{tag}</button>
                ))
              )}
              <button
                className="bulk-action-bar-link"
                onClick={() => setBulkTagAction(null)}
                style={{ fontSize: 11 }}
              >Cancel</button>
            </div>
          ) : (
            /* Default action buttons */
            <>
              <button
                className="btn"
                onClick={() => { setBulkTagAction('add'); setBulkTagValue(''); }}
                style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                Add Tag
              </button>
              <button
                className="btn-secondary"
                onClick={() => setBulkTagAction('remove')}
                style={{ fontSize: 11, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14"/></svg>
                Remove Tag
              </button>
            </>
          )}
        </div>
      )}

      {editingLead && (
        <div className="edit-lead-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditingLead(null); }}>
          <div className="edit-lead-modal">
            {/* Avatar header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <AvatarCircle
                url={editingLead.profile_picture_url}
                name={`${editForm.first_name || editingLead.first_name} ${editForm.last_name || editingLead.last_name}`}
                size={48}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  {editForm.first_name} {editForm.last_name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>@{editForm.telegram_username}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <button
                  className="btn-secondary"
                  onClick={handleFetchAvatar}
                  disabled={fetchingAvatar}
                  style={{ fontSize: 11, padding: '5px 11px', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
                >
                  {fetchingAvatar ? (
                    <>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.25"/><path d="M21 12a9 9 0 00-9-9"/></svg>
                      Fetching…
                    </>
                  ) : (
                    <>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
                      Fetch Profile Pic
                    </>
                  )}
                </button>
                {avatarStatus && (
                  <div style={{ fontSize: 10, color: avatarStatus.startsWith('✓') ? '#10b981' : 'var(--text-dim)', textAlign: 'right' }}>
                    {avatarStatus}
                  </div>
                )}
              </div>
            </div>

            <div className="card-title" style={{ marginBottom: 12 }}>Edit Lead</div>
            <div className="form-grid columns-2">
              <input className="input" placeholder="First Name" value={editForm.first_name} onChange={(e) => setEditForm((c) => ({ ...c, first_name: e.target.value }))} />
              <input className="input" placeholder="Last Name" value={editForm.last_name} onChange={(e) => setEditForm((c) => ({ ...c, last_name: e.target.value }))} />
              <input className="input" placeholder="Company" value={editForm.company_name} onChange={(e) => setEditForm((c) => ({ ...c, company_name: e.target.value }))} />
              <input className="input" placeholder="Telegram username (no @)" value={editForm.telegram_username} onChange={(e) => setEditForm((c) => ({ ...c, telegram_username: e.target.value }))} />
            </div>
            <input className="input" placeholder="Tags (comma separated)" value={editForm.tags} onChange={(e) => setEditForm((c) => ({ ...c, tags: e.target.value }))} />
            <input className="input" placeholder="Source" value={editForm.source} onChange={(e) => setEditForm((c) => ({ ...c, source: e.target.value }))} />
            <div className="btn-row">
              <button className="btn" onClick={handleEditSave} style={{ fontSize: 12, padding: '6px 14px' }}>Save Changes</button>
              <button className="btn-secondary" onClick={() => setEditingLead(null)} style={{ fontSize: 12, padding: '6px 14px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
