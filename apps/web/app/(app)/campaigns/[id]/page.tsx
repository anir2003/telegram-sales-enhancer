'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { fetchJson } from '@/lib/web/fetch-json';

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const campaignId = params.id;
  const [detail, setDetail] = useState<any>(null);
  const [stepForm, setStepForm] = useState({ step_order: 1, delay_days: 0, message_template: '' });

  const load = async () => {
    const response = await fetchJson(`/api/campaigns/${campaignId}`);
    setDetail(response);
    setStepForm((current) => ({
      ...current,
      step_order: (response.steps?.length ?? 0) + 1,
    }));
  };

  useEffect(() => {
    if (campaignId) {
      void load();
    }
  }, [campaignId]);

  const attachedLeadIds = useMemo(() => new Set((detail?.attachedLeads ?? []).map((lead: any) => lead.lead_id)), [detail]);
  const availableLeads = (detail?.leads ?? []).filter((lead: any) => !attachedLeadIds.has(lead.id));

  const assignedAccountIds = new Set(detail?.assignedAccountIds ?? []);

  if (!detail?.campaign) {
    return <div className="page-content"><div className="empty-state">Loading campaign…</div></div>;
  }

  const attachLead = async (leadId: string) => {
    await fetchJson(`/api/campaigns/${campaignId}/leads`, {
      method: 'POST',
      body: JSON.stringify({ leadId }),
    });
    await load();
  };

  const addStep = async (event: React.FormEvent) => {
    event.preventDefault();
    await fetchJson(`/api/campaigns/${campaignId}/steps`, {
      method: 'POST',
      body: JSON.stringify(stepForm),
    });
    setStepForm({
      step_order: (detail.steps?.length ?? 0) + 2,
      delay_days: 0,
      message_template: '',
    });
    await load();
  };

  const saveAccounts = async (accountId: string) => {
    const nextIds = new Set(detail.assignedAccountIds ?? []);
    if (nextIds.has(accountId)) {
      nextIds.delete(accountId);
    } else {
      nextIds.add(accountId);
    }
    await fetchJson(`/api/campaigns/${campaignId}/accounts`, {
      method: 'POST',
      body: JSON.stringify({ accountIds: [...nextIds] }),
    });
    await load();
  };

  const launchCampaign = async () => {
    await fetchJson(`/api/campaigns/${campaignId}/launch`, { method: 'POST' });
    await load();
  };

  const pauseCampaign = async () => {
    await fetchJson(`/api/campaigns/${campaignId}/pause`, { method: 'POST' });
    await load();
  };

  return (
    <div className="page-content">
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Campaign Detail</div>
            <div className="card-value small">{detail.campaign.name}</div>
            <div className="card-subtitle">{detail.campaign.description ?? 'No description yet.'}</div>
          </div>
          <div className="btn-row">
            <span className="badge">{detail.campaign.status}</span>
            <button className="btn" onClick={launchCampaign}>Launch</button>
            <button className="btn-secondary" onClick={pauseCampaign}>Pause</button>
          </div>
        </div>
        <div className="mini-stat-grid">
          <div className="mini-stat"><div className="mini-stat-label">Timezone</div><div className="mini-stat-value">{detail.campaign.timezone}</div></div>
          <div className="mini-stat"><div className="mini-stat-label">Window</div><div className="mini-stat-value">{detail.campaign.send_window_start} → {detail.campaign.send_window_end}</div></div>
          <div className="mini-stat"><div className="mini-stat-label">Sequence Steps</div><div className="mini-stat-value">{detail.steps.length}</div></div>
          <div className="mini-stat"><div className="mini-stat-label">Attached Leads</div><div className="mini-stat-value">{detail.attachedLeads.length}</div></div>
        </div>
      </div>

      <div className="section-label">Sequence Builder</div>
      <div className="split-layout">
        <div className="card">
          <div className="list-stack">
            {detail.steps.length ? detail.steps.map((step: any) => (
              <div key={step.id} className="setup-item">
                <div className="card-title">Step {step.step_order} · Delay {step.delay_days} day(s)</div>
                <div style={{ marginTop: 8 }}>{step.message_template}</div>
              </div>
            )) : <div className="empty-state">Add the first intro message to unlock launch.</div>}
          </div>
        </div>
        <form className="card form-grid" onSubmit={addStep}>
          <div className="card-title">Add Step</div>
          <div className="form-grid columns-2">
            <input className="input" type="number" value={stepForm.step_order} onChange={(event) => setStepForm((current) => ({ ...current, step_order: Number(event.target.value) }))} />
            <input className="input" type="number" value={stepForm.delay_days} onChange={(event) => setStepForm((current) => ({ ...current, delay_days: Number(event.target.value) }))} />
          </div>
          <textarea className="textarea" placeholder="Use {First Name}, {Last Name}, {Company}, {Telegram Username}" value={stepForm.message_template} onChange={(event) => setStepForm((current) => ({ ...current, message_template: event.target.value }))} />
          <button className="btn" type="submit">Add Sequence Step</button>
        </form>
      </div>

      <div className="section-label">Assigned Accounts</div>
      <div className="card list-stack">
        {detail.accounts.map((account: any) => (
          <label key={account.id} className="setup-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div>{account.label}</div>
              <div className="dim">@{account.telegram_username} · cap {account.daily_limit}/day</div>
            </div>
            <input type="checkbox" checked={assignedAccountIds.has(account.id)} onChange={() => saveAccounts(account.id)} />
          </label>
        ))}
      </div>

      <div className="section-label">Attach Leads</div>
      <div className="split-layout">
        <div className="card list-stack">
          <div className="card-title">Available Leads</div>
          {availableLeads.length ? availableLeads.map((lead: any) => (
            <div key={lead.id} className="setup-item" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div>{lead.first_name} {lead.last_name}</div>
                <div className="dim">{lead.company_name} · @{lead.telegram_username}</div>
              </div>
              <button className="btn-secondary" onClick={() => attachLead(lead.id)}>Attach</button>
            </div>
          )) : <div className="empty-state">Every available lead is already attached.</div>}
        </div>
        <div className="card list-stack">
          <div className="card-title">Campaign Leads</div>
          {detail.attachedLeads.length ? detail.attachedLeads.map((item: any) => {
            const lead = detail.leads.find((candidate: any) => candidate.id === item.lead_id);
            const account = detail.accounts.find((candidate: any) => candidate.id === item.assigned_account_id);
            return (
              <div key={item.id} className="setup-item">
                <div>{lead?.first_name} {lead?.last_name} · {lead?.company_name}</div>
                <div className="dim">status {item.status} · account {account?.label ?? 'unassigned'} · next step {item.next_step_order ?? 'done'}</div>
              </div>
            );
          }) : <div className="empty-state">Attach leads to turn reusable CRM records into campaign-specific progress rows.</div>}
        </div>
      </div>
    </div>
  );
}
