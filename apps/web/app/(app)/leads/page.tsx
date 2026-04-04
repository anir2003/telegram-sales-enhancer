'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';
import { buildLeadMemberships, type Campaign, type CampaignDetail, type Lead } from '@/lib/web/insights';
import { CustomSelect } from '@/components/ui/select';
import { InfoTooltip } from '@/components/ui/info-tooltip';

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [details, setDetails] = useState<CampaignDetail[]>([]);
  const [loading, setLoading] = useState(true);
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

  const loadLeads = useCallback(async () => {
    setLoading(true);
    const [leadResponse, campaignResponse] = await Promise.all([
      fetchJson<{ leads: Lead[] }>('/api/leads'),
      fetchJson<{ campaigns: Campaign[] }>('/api/campaigns'),
    ]);
    const nextLeads = leadResponse.leads ?? [];
    const campaigns = campaignResponse.campaigns ?? [];
    if (campaigns.length > 0) {
      const nextDetails = await Promise.all(
        campaigns.map((campaign) => fetchJson<CampaignDetail>(`/api/campaigns/${campaign.id}`)),
      );
      setDetails(nextDetails);
    } else {
      setDetails([]);
    }
    setLeads(nextLeads);
    setLoading(false);
  }, []);

  useEffect(() => { void loadLeads(); }, [loadLeads]);

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
    await loadLeads();
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
      await loadLeads();
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
      await loadLeads();
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
    setOpenMenu(null);
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
      await loadLeads();
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
              {['First Name', 'Telegram Username', 'Company'].map(col => (
                <span key={col} style={{ padding: '3px 9px', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 4, fontSize: 11, color: 'var(--text)', background: 'rgba(255,255,255,0.06)', fontWeight: 500 }}>{col}</span>
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
          <div>Lead</div>
          <div>Company</div>
          <div>Source</div>
          <div>Tags</div>
          <div></div>
        </div>
        {loading ? (
          <div className="empty-state">Loading leads...</div>
        ) : filteredLeads.length ? (
          filteredLeads.map((lead) => (
            <div key={lead.id} className="table-row">
              <div>
                <div>{lead.first_name} {lead.last_name}</div>
                <div className="dim">@{lead.telegram_username}</div>
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

      {editingLead && (
        <div className="edit-lead-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditingLead(null); }}>
          <div className="edit-lead-modal">
            <div className="card-title">Edit Lead</div>
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
