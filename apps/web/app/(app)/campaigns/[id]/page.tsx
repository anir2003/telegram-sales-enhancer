'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { fetchJson } from '@/lib/web/fetch-json';
import { type Account, type CampaignDetail, type Lead, formatWindow, summariseCampaign } from '@/lib/web/insights';

const stageOrder = ['queued', 'due', 'sent_waiting_followup', 'replied', 'completed', 'blocked', 'skipped'] as const;

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const campaignId = params.id;
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    timezone: 'UTC',
    send_window_start: '09:00',
    send_window_end: '18:00',
  });

  const load = async () => {
    const response = await fetchJson(`/api/campaigns/${campaignId}`);
    setDetail(response);
    if (response.campaign) {
      setEditForm({
        name: response.campaign.name ?? '',
        description: response.campaign.description ?? '',
        timezone: response.campaign.timezone ?? 'UTC',
        send_window_start: response.campaign.send_window_start ?? '09:00',
        send_window_end: response.campaign.send_window_end ?? '18:00',
      });
    }
  };

  useEffect(() => {
    if (campaignId) {
      void load();
    }
  }, [campaignId]);

  const metrics = useMemo(() => (detail ? summariseCampaign(detail) : null), [detail]);
  const leadById = useMemo(
    () => new Map<string, Lead>((detail?.leads ?? []).map((lead) => [lead.id, lead])),
    [detail?.leads],
  );
  const accountById = useMemo(
    () => new Map<string, Account>((detail?.accounts ?? []).map((account) => [account.id, account])),
    [detail?.accounts],
  );
  const leadsByStage = useMemo(() => {
    return stageOrder.map((status) => ({
      status,
      items: (detail?.attachedLeads ?? []).filter((lead: any) => lead.status === status),
    }));
  }, [detail?.attachedLeads]);

  if (!detail?.campaign || !metrics) {
    return <div className="page-content"><div className="empty-state">Loading campaign…</div></div>;
  }

  const launchCampaign = async () => {
    await fetchJson(`/api/campaigns/${campaignId}/launch`, { method: 'POST' });
    await load();
  };

  const pauseCampaign = async () => {
    await fetchJson(`/api/campaigns/${campaignId}/pause`, { method: 'POST' });
    await load();
  };

  const saveChanges = async () => {
    await fetchJson(`/api/campaigns/${campaignId}`, {
      method: 'PATCH',
      body: JSON.stringify(editForm),
    });
    setIsEditing(false);
    await load();
  };

  return (
    <div className="page-content">
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">{detail.campaign.name}</div>
            <div className="campaign-hero-copy">{detail.campaign.description ?? 'No campaign objective written yet.'}</div>
          </div>
          <div className="btn-row">
            <span className="badge">{detail.campaign.status}</span>
            <button className="btn-secondary" onClick={() => setIsEditing((value) => !value)}>{isEditing ? 'Cancel Edit' : 'Edit'}</button>
            <button className="btn" onClick={launchCampaign}>Launch</button>
            <button className="btn-secondary" onClick={pauseCampaign}>Pause</button>
          </div>
        </div>
        <div className="mini-stat-grid">
          <div className="mini-stat"><div className="mini-stat-label">Leads</div><div className="mini-stat-value">{metrics.totalLeads}</div></div>
          <div className="mini-stat"><div className="mini-stat-label">Sent</div><div className="mini-stat-value">{metrics.sent}</div></div>
          <div className="mini-stat"><div className="mini-stat-label">Reply Rate</div><div className="mini-stat-value">{metrics.replyRate}%</div></div>
          <div className="mini-stat"><div className="mini-stat-label">Accounts</div><div className="mini-stat-value">{metrics.assignedAccounts.length}</div></div>
        </div>
      </div>

      {isEditing ? (
        <div className="section-label">Edit Campaign</div>
      ) : null}
      {isEditing ? (
        <div className="card form-grid">
          <div className="form-grid columns-2">
            <input className="input" value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} />
            <input className="input" value={editForm.timezone} onChange={(event) => setEditForm((current) => ({ ...current, timezone: event.target.value }))} />
            <input className="input" value={editForm.send_window_start} onChange={(event) => setEditForm((current) => ({ ...current, send_window_start: event.target.value }))} />
            <input className="input" value={editForm.send_window_end} onChange={(event) => setEditForm((current) => ({ ...current, send_window_end: event.target.value }))} />
          </div>
          <textarea className="textarea" value={editForm.description} onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))} />
          <div className="btn-row">
            <button className="btn" type="button" onClick={saveChanges}>Save Campaign</button>
          </div>
        </div>
      ) : null}

      <div className="section-label">Campaign Overview</div>
      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">Program Metrics</div>
          <div className="list-stack" style={{ marginTop: 12 }}>
            <div className="metric-row"><span>Total leads</span><span>{metrics.totalLeads}</span></div>
            <div className="metric-row"><span>Leads in motion</span><span>{metrics.active}</span></div>
            <div className="metric-row"><span>Replies</span><span>{metrics.replies}</span></div>
            <div className="metric-row"><span>Completed</span><span>{metrics.completed}</span></div>
            <div className="metric-row"><span>Blocked</span><span>{metrics.blocked}</span></div>
            <div className="metric-row"><span>Window</span><span>{formatWindow(detail.campaign)}</span></div>
          </div>
        </div>
        <div className="card">
          <div className="card-title">Telegram Accounts In Use</div>
          <div className="list-stack" style={{ marginTop: 12 }}>
            {metrics.assignedAccounts.length ? metrics.assignedAccounts.map((account: any) => (
              <div key={account.id} className="metric-row">
                <div>
                  <div>{account.label}</div>
                  <div className="dim">@{account.telegram_username} · cap {account.daily_limit}/day</div>
                </div>
                <div className="metric-row-side">
                  <span className="badge">{account.is_active ? 'active' : 'paused'}</span>
                </div>
              </div>
            )) : <div className="empty-state">No accounts assigned yet.</div>}
          </div>
        </div>
      </div>

      <div className="section-label">Lead Stages</div>
      <div className="stage-board">
        {leadsByStage.map((column) => (
          <div key={column.status} className="stage-column">
            <div className="stage-column-head">
              <span>{column.status.replaceAll('_', ' ')}</span>
              <span className="badge">{column.items.length}</span>
            </div>
            <div className="stage-column-body">
              {column.items.length ? column.items.map((item: any) => {
                const lead = leadById.get(item.lead_id);
                const account = item.assigned_account_id ? accountById.get(item.assigned_account_id) : null;
                return (
                  <div key={item.id} className="board-card">
                    <div>{lead ? `${lead.first_name} ${lead.last_name}` : 'Lead'}</div>
                    <div className="dim">{lead?.company_name ?? 'Company'} · @{lead?.telegram_username ?? 'unknown'}</div>
                    <div className="dim">Account: {account?.label ?? 'unassigned'}</div>
                    <div className="dim">Next step: {item.next_step_order ?? 'done'}</div>
                  </div>
                );
              }) : <div className="board-card empty">No leads in this stage.</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="section-label">Sequence</div>
      <div className="sequence-stack">
        {detail.steps.length ? detail.steps.map((step: any) => (
          <div key={step.id} className="sequence-card">
            <div className="sequence-card-head">
              <div>Step {step.step_order}</div>
              <div className="dim">Delay {step.delay_days} day(s)</div>
            </div>
            <div>{step.message_template}</div>
          </div>
        )) : <div className="empty-state">No sequence steps have been created for this campaign yet.</div>}
      </div>

      <div className="section-label">Lead List</div>
      <div className="table campaign-detail-table">
        <div className="table-header">
          <div>Lead</div>
          <div>Company</div>
          <div>Stage</div>
          <div>Account</div>
          <div>Last Sent</div>
          <div>Next Step</div>
        </div>
        {detail.attachedLeads.length ? detail.attachedLeads.map((item: any) => {
          const lead = leadById.get(item.lead_id);
          const account = item.assigned_account_id ? accountById.get(item.assigned_account_id) : null;
          return (
            <div key={item.id} className="table-row">
              <div>{lead ? `${lead.first_name} ${lead.last_name}` : 'Lead'}</div>
              <div>{lead?.company_name ?? 'Company'}</div>
              <div><span className="badge">{item.status}</span></div>
              <div>{account?.label ?? 'Unassigned'}</div>
              <div>{item.last_sent_at ? new Date(item.last_sent_at).toLocaleString() : 'Not yet'}</div>
              <div>{item.next_step_order ?? 'Done'}</div>
            </div>
          );
        }) : <div className="empty-state">Attach leads from the campaign builder to populate the CRM-style detail page.</div>}
      </div>
    </div>
  );
}
