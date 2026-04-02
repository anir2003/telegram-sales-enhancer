'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';
import { buildLeadMemberships, type Campaign, type CampaignDetail, type Lead } from '@/lib/web/insights';

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
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    company_name: '',
    telegram_username: '',
    tags: '',
    source: 'Manual',
  });

  const loadLeads = async () => {
    setLoading(true);
    const [leadResponse, campaignResponse] = await Promise.all([
      fetchJson('/api/leads'),
      fetchJson('/api/campaigns'),
    ]);
    const nextLeads = leadResponse.leads ?? [];
    const campaigns: Campaign[] = campaignResponse.campaigns ?? [];
    const nextDetails = await Promise.all(
      campaigns.map((campaign) => fetchJson(`/api/campaigns/${campaign.id}`)),
    );

    setLeads(nextLeads);
    setDetails(nextDetails);
    setLoading(false);
  };

  useEffect(() => {
    void loadLeads();
  }, []);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    await fetchJson('/api/leads', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        tags: form.tags.split(',').map((item) => item.trim()).filter(Boolean),
      }),
    });
    setForm({
      first_name: '',
      last_name: '',
      company_name: '',
      telegram_username: '',
      tags: '',
      source: 'Manual',
    });
    setStatus('Lead added.');
    setStatusTone('success');
    await loadLeads();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setStatus(`File "${file.name}" selected. Click "Import Now" to upload. Duplicates (same Telegram username) will be auto-merged.`);
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
      const result = await fetchJson('/api/leads/import', { method: 'POST', body: formData });
      const count = result.leads?.length ?? 0;
      setStatus(`Imported ${count} leads from ${pendingFile.name}. Duplicates were merged automatically.`);
      setStatusTone('success');
      setPendingFile(null);
      await loadLeads();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Import failed.');
      setStatusTone('danger');
    }
    setImporting(false);
  };

  const leadRows = useMemo(() => buildLeadMemberships(leads, details), [details, leads]);
  const allTags = useMemo(() => [...new Set(leads.flatMap((lead) => lead.tags))], [leads]);
  const allSources = useMemo(() => [...new Set(leads.map((lead) => lead.source ?? 'Manual'))], [leads]);
  const filteredLeads = useMemo(() => {
    return leadRows.filter((lead) => {
      const matchesSearch = !search.trim() || [lead.first_name, lead.last_name, lead.company_name, lead.telegram_username]
        .join(' ')
        .toLowerCase()
        .includes(search.trim().toLowerCase());
      const matchesSource = sourceFilter === 'all' || (lead.source ?? 'Manual') === sourceFilter;
      const matchesTag = tagFilter === 'all' || lead.tags.includes(tagFilter);
      return matchesSearch && matchesSource && matchesTag;
    });
  }, [leadRows, search, sourceFilter, tagFilter]);

  return (
    <div className="page-content">
      <div className="grid grid-4">
        <div className="card"><div className="card-title">Reusable Leads</div><div className="card-value">{leads.length}</div><div className="card-subtitle">One CRM, shared across every campaign.</div></div>
        <div className="card"><div className="card-title">Companies</div><div className="card-value">{new Set(leads.map((lead) => lead.company_name)).size}</div><div className="card-subtitle">Company-first grouping for outreach.</div></div>
        <div className="card"><div className="card-title">Tagged Leads</div><div className="card-value">{leads.filter((lead) => lead.tags.length).length}</div><div className="card-subtitle">Filter by persona, source, or stage.</div></div>
        <div className="card"><div className="card-title">In Campaigns</div><div className="card-value">{leadRows.filter((lead) => lead.campaignCount > 0).length}</div><div className="card-subtitle">Attached to at least one campaign.</div></div>
      </div>

      <div className="section-label">Lead Intake</div>
      <div className="split-layout">
        <form className="card form-grid" onSubmit={handleCreate}>
          <div className="card-header">
            <div>
              <div className="card-title">Add Lead</div>
              <div className="card-subtitle" style={{ marginTop: 8 }}>Manually add a single lead to the CRM.</div>
            </div>
          </div>
          <div className="form-grid columns-2">
            <input className="input" placeholder="First Name" value={form.first_name} onChange={(e) => setForm((c) => ({ ...c, first_name: e.target.value }))} />
            <input className="input" placeholder="Last Name" value={form.last_name} onChange={(e) => setForm((c) => ({ ...c, last_name: e.target.value }))} />
            <input className="input" placeholder="Company" value={form.company_name} onChange={(e) => setForm((c) => ({ ...c, company_name: e.target.value }))} />
            <input className="input" placeholder="Telegram username" value={form.telegram_username} onChange={(e) => setForm((c) => ({ ...c, telegram_username: e.target.value }))} />
          </div>
          <div className="form-grid columns-2">
            <input className="input" placeholder="Tags (comma separated)" value={form.tags} onChange={(e) => setForm((c) => ({ ...c, tags: e.target.value }))} />
            <input className="input" placeholder="Source" value={form.source} onChange={(e) => setForm((c) => ({ ...c, source: e.target.value }))} />
          </div>
          <div className="btn-row">
            <button className="btn" type="submit">Save Lead</button>
          </div>
        </form>

        <div className="card form-grid">
          <div className="card-header">
            <div>
              <div className="card-title">Import CSV</div>
              <div className="card-subtitle" style={{ marginTop: 8 }}>Upload a CSV file. Duplicates (same Telegram username) are automatically merged.</div>
              <div className="dim" style={{ fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>
                <strong>Required columns:</strong> First Name, Telegram Username.<br />
                <strong>Optional columns:</strong> Last Name, Company, Tags (comma separated), Notes, Source.
              </div>
            </div>
          </div>
          <label className="btn-secondary" style={{ width: 'fit-content', cursor: 'pointer' }}>
            <input type="file" accept=".csv" onChange={handleFileSelect} style={{ display: 'none' }} />
            Choose CSV File
          </label>
          {pendingFile && (
            <div className="btn-row" style={{ alignItems: 'center' }}>
              <span className="dim" style={{ fontSize: 12 }}>{pendingFile.name}</span>
              <button className="btn" type="button" onClick={handleImport} disabled={importing}>
                {importing ? 'Importing...' : 'Import Now'}
              </button>
              <button className="btn-secondary" type="button" onClick={() => { setPendingFile(null); setStatus(''); }}>
                Cancel
              </button>
            </div>
          )}
          {status ? <div className={`status-callout ${statusTone === 'success' ? 'success' : statusTone === 'danger' ? 'danger' : ''}`}>{status}</div> : null}
        </div>
      </div>

      <div className="section-label">Lead Database</div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <input className="input" placeholder="Search by name, company, or Telegram username" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="filter-row">
            <select className="select" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="all">All Sources</option>
              {allSources.map((source) => <option key={source} value={source}>{source}</option>)}
            </select>
            <select className="select" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
              <option value="all">All Tags</option>
              {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="table lead-crm-table">
        <div className="table-header">
          <div>Lead</div>
          <div>Company</div>
          <div>Source</div>
          <div>Tags</div>
          <div>Campaigns</div>
          <div>Status</div>
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
              <div>
                {lead.memberships.length ? lead.memberships.slice(0, 2).map((item) => (
                  <div key={`${lead.id}-${item.campaignId}`} className="dim">{item.campaignName}</div>
                )) : <span className="dim">Unassigned</span>}
                {lead.memberships.length > 2 ? <div className="dim">+{lead.memberships.length - 2} more</div> : null}
              </div>
              <div><span className="badge">{lead.memberships[0]?.status ?? 'reusable'}</span></div>
            </div>
          ))
        ) : (
          <div className="empty-state">No leads match the current search and filter settings.</div>
        )}
      </div>
    </div>
  );
}
