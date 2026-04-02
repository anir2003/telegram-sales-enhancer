'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';

type Campaign = {
  id: string;
  name: string;
  status: string;
  timezone: string;
  send_window_start: string;
  send_window_end: string;
  description: string | null;
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [form, setForm] = useState({
    name: '',
    description: '',
    timezone: 'UTC',
    send_window_start: '09:00',
    send_window_end: '18:00',
  });

  const loadCampaigns = async () => {
    const response = await fetchJson('/api/campaigns');
    setCampaigns(response.campaigns ?? []);
  };

  useEffect(() => {
    void loadCampaigns();
  }, []);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    await fetchJson('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    setForm({
      name: '',
      description: '',
      timezone: 'UTC',
      send_window_start: '09:00',
      send_window_end: '18:00',
    });
    await loadCampaigns();
  };

  return (
    <div className="page-content">
      <div className="grid grid-4">
        <div className="card"><div className="card-title">Campaigns</div><div className="card-value">{campaigns.length}</div><div className="card-subtitle">Reusable sequences layered over shared leads.</div></div>
        <div className="card"><div className="card-title">Live</div><div className="card-value">{campaigns.filter((campaign) => campaign.status === 'active').length}</div><div className="card-subtitle">Manual send tasks being served to Telegram.</div></div>
        <div className="card"><div className="card-title">Drafts</div><div className="card-value">{campaigns.filter((campaign) => campaign.status === 'draft').length}</div><div className="card-subtitle">Build steps, assign accounts, then launch.</div></div>
        <div className="card"><div className="card-title">Paused</div><div className="card-value">{campaigns.filter((campaign) => campaign.status === 'paused').length}</div><div className="card-subtitle">Follow-ups stop generating while paused.</div></div>
      </div>

      <div className="section-label">Create Campaign</div>
      <form className="card form-grid" onSubmit={handleCreate}>
        <div className="form-grid columns-2">
          <input className="input" placeholder="Campaign name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          <input className="input" placeholder="Timezone" value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} />
          <input className="input" placeholder="Send window start" value={form.send_window_start} onChange={(event) => setForm((current) => ({ ...current, send_window_start: event.target.value }))} />
          <input className="input" placeholder="Send window end" value={form.send_window_end} onChange={(event) => setForm((current) => ({ ...current, send_window_end: event.target.value }))} />
        </div>
        <textarea className="textarea" placeholder="What is this campaign trying to achieve?" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
        <div className="btn-row">
          <button className="btn" type="submit">Create Campaign</button>
        </div>
      </form>

      <div className="section-label">Campaign Library</div>
      <div className="table campaign-table">
        <div className="table-header">
          <div>Campaign</div>
          <div>Status</div>
          <div>Timezone</div>
          <div>Window</div>
          <div>Open</div>
        </div>
        {campaigns.length ? campaigns.map((campaign) => (
          <div key={campaign.id} className="table-row">
            <div>
              <div>{campaign.name}</div>
              <div className="dim">{campaign.description ?? 'No description yet.'}</div>
            </div>
            <div><span className="badge">{campaign.status}</span></div>
            <div>{campaign.timezone}</div>
            <div>{campaign.send_window_start} → {campaign.send_window_end}</div>
            <div><Link className="btn-secondary" href={`/campaigns/${campaign.id}`}>Detail</Link></div>
          </div>
        )) : (
          <div className="empty-state">Create your first campaign to start layering sequences on top of the CRM.</div>
        )}
      </div>
    </div>
  );
}
