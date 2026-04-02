'use client';

import { useEffect, useState } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';

type Lead = {
  id: string;
  first_name: string;
  last_name: string;
  company_name: string;
  telegram_username: string;
  tags: string[];
  source: string | null;
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
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
    const response = await fetchJson('/api/leads');
    setLeads(response.leads ?? []);
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
    await loadLeads();
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    await fetchJson('/api/leads/import', { method: 'POST', body: formData });
    setStatus(`Imported ${file.name}.`);
    await loadLeads();
  };

  return (
    <div className="page-content">
      <div className="grid grid-4">
        <div className="card"><div className="card-title">Reusable Leads</div><div className="card-value">{leads.length}</div><div className="card-subtitle">One CRM, shared across every campaign.</div></div>
        <div className="card"><div className="card-title">Companies</div><div className="card-value">{new Set(leads.map((lead) => lead.company_name)).size}</div><div className="card-subtitle">Company-first grouping for Telegram outreach.</div></div>
        <div className="card"><div className="card-title">Tagged Leads</div><div className="card-value">{leads.filter((lead) => lead.tags.length).length}</div><div className="card-subtitle">Filters stay reusable across campaigns.</div></div>
        <div className="card"><div className="card-title">Sync Status</div><div className="card-value small">Supabase</div><div className="card-subtitle">CSV imports upsert by Telegram username.</div></div>
      </div>

      <div className="section-label">Lead Intake</div>
      <div className="split-layout">
        <form className="card form-grid" onSubmit={handleCreate}>
          <div className="card-header">
            <div>
              <div className="card-title">Add Lead</div>
              <div className="card-subtitle" style={{ marginTop: 8 }}>Username-first Telegram targeting with reusable CRM records.</div>
            </div>
          </div>
          <div className="form-grid columns-2">
            <input className="input" placeholder="First Name" value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} />
            <input className="input" placeholder="Last Name" value={form.last_name} onChange={(event) => setForm((current) => ({ ...current, last_name: event.target.value }))} />
            <input className="input" placeholder="Company" value={form.company_name} onChange={(event) => setForm((current) => ({ ...current, company_name: event.target.value }))} />
            <input className="input" placeholder="Telegram username" value={form.telegram_username} onChange={(event) => setForm((current) => ({ ...current, telegram_username: event.target.value }))} />
          </div>
          <input className="input" placeholder="Tags (comma separated)" value={form.tags} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} />
          <div className="btn-row">
            <button className="btn" type="submit">Save Lead</button>
          </div>
        </form>

        <div className="card form-grid">
          <div className="card-header">
            <div>
              <div className="card-title">CSV Import</div>
              <div className="card-subtitle" style={{ marginTop: 8 }}>Accepted headers: First Name, Last Name, Company, Telegram Username, Tags, Notes, Source.</div>
            </div>
          </div>
          <label className="btn-secondary" style={{ width: 'fit-content' }}>
            <input type="file" accept=".csv" onChange={handleImport} style={{ display: 'none' }} />
            Upload CSV
          </label>
          <div className="empty-state">
            Import once, then reuse those leads across any campaign without duplicating records.
          </div>
          {status && <div className="card-subtitle">{status}</div>}
        </div>
      </div>

      <div className="section-label">Lead Database</div>
      <div className="table leads-table">
        <div className="table-header">
          <div>Lead</div>
          <div>Company</div>
          <div>Telegram</div>
          <div>Source</div>
          <div>Tags</div>
          <div>Status</div>
        </div>
        {loading ? (
          <div className="empty-state">Loading leads…</div>
        ) : leads.length ? (
          leads.map((lead) => (
            <div key={lead.id} className="table-row">
              <div>
                <div>{lead.first_name} {lead.last_name}</div>
                <div className="dim">@{lead.telegram_username}</div>
              </div>
              <div>{lead.company_name}</div>
              <div>@{lead.telegram_username}</div>
              <div>{lead.source ?? 'Manual'}</div>
              <div>{lead.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}</div>
              <div><span className="badge">reusable</span></div>
            </div>
          ))
        ) : (
          <div className="empty-state">No leads yet. Add one manually or import a CSV.</div>
        )}
      </div>
    </div>
  );
}
