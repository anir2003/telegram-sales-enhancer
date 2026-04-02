'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';
import { buildAccountInsights, summariseCampaign, type Account, type Campaign, type CampaignDetail, type Lead } from '@/lib/web/insights';

type SequenceDraft = {
  step_order: number;
  delay_days: number;
  message_template: string;
};

const emptyStep = (stepOrder: number): SequenceDraft => ({
  step_order: stepOrder,
  delay_days: stepOrder === 1 ? 0 : 2,
  message_template: '',
});

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [details, setDetails] = useState<CampaignDetail[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [builderMessage, setBuilderMessage] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [leadSearch, setLeadSearch] = useState('');
  const [form, setForm] = useState({
    name: '',
    description: '',
    timezone: 'UTC',
    send_window_start: '09:00',
    send_window_end: '18:00',
  });
  const [steps, setSteps] = useState<SequenceDraft[]>([
    emptyStep(1),
    emptyStep(2),
    emptyStep(3),
  ]);

  const load = async () => {
    const [campaignResponse, leadResponse, accountResponse] = await Promise.all([
      fetchJson('/api/campaigns'),
      fetchJson('/api/leads'),
      fetchJson('/api/accounts'),
    ]);

    const nextCampaigns = campaignResponse.campaigns ?? [];
    setCampaigns(nextCampaigns);
    setLeads(leadResponse.leads ?? []);
    setAccounts(accountResponse.accounts ?? []);

    const nextDetails = await Promise.all(
      nextCampaigns.map((campaign: Campaign) => fetchJson(`/api/campaigns/${campaign.id}`)),
    );
    setDetails(nextDetails);
  };

  useEffect(() => {
    void load();
  }, []);

  const accountInsights = useMemo(
    () => buildAccountInsights(accounts, details),
    [accounts, details],
  );

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (!leadSearch.trim()) return true;
      return [lead.first_name, lead.last_name, lead.company_name, lead.telegram_username]
        .join(' ')
        .toLowerCase()
        .includes(leadSearch.trim().toLowerCase());
    });
  }, [leadSearch, leads]);

  const campaignRows = useMemo(() => {
    return details.map((detail) => ({
      detail,
      stats: summariseCampaign(detail),
    }));
  }, [details]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setBuilderMessage('');

    try {
      const { campaign } = await fetchJson('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify(form),
      });

      const activeSteps = steps
        .filter((step) => step.message_template.trim())
        .map((step, index) => ({ ...step, step_order: index + 1 }));

      await Promise.all([
        ...activeSteps.map((step) =>
          fetchJson(`/api/campaigns/${campaign.id}/steps`, {
            method: 'POST',
            body: JSON.stringify(step),
          }),
        ),
        ...selectedLeadIds.map((leadId) =>
          fetchJson(`/api/campaigns/${campaign.id}/leads`, {
            method: 'POST',
            body: JSON.stringify({ leadId }),
          }),
        ),
      ]);

      if (selectedAccountIds.length) {
        await fetchJson(`/api/campaigns/${campaign.id}/accounts`, {
          method: 'POST',
          body: JSON.stringify({ accountIds: selectedAccountIds }),
        });
      }

      setForm({
        name: '',
        description: '',
        timezone: 'UTC',
        send_window_start: '09:00',
        send_window_end: '18:00',
      });
      setSelectedLeadIds([]);
      setSelectedAccountIds([]);
      setLeadSearch('');
      setSteps([emptyStep(1), emptyStep(2), emptyStep(3)]);
      setBuilderMessage('Campaign created. Open it from the library to review metrics, edit details, or launch.');
      await load();
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleLead = (leadId: string) => {
    setSelectedLeadIds((current) =>
      current.includes(leadId) ? current.filter((id) => id !== leadId) : [...current, leadId],
    );
  };

  const toggleAccount = (accountId: string) => {
    setSelectedAccountIds((current) =>
      current.includes(accountId) ? current.filter((id) => id !== accountId) : [...current, accountId],
    );
  };

  const updateStep = (index: number, patch: Partial<SequenceDraft>) => {
    setSteps((current) => current.map((step, stepIndex) => (stepIndex === index ? { ...step, ...patch } : step)));
  };

  const addStep = () => {
    setSteps((current) => [...current, emptyStep(current.length + 1)]);
  };

  return (
    <div className="page-content">
      <div className="grid grid-4">
        <div className="card"><div className="card-title">Campaigns</div><div className="card-value">{campaigns.length}</div><div className="card-subtitle">Reusable sequences layered over shared leads.</div></div>
        <div className="card"><div className="card-title">Live</div><div className="card-value">{campaigns.filter((campaign) => campaign.status === 'active').length}</div><div className="card-subtitle">Manual send tasks currently running.</div></div>
        <div className="card"><div className="card-title">Drafts</div><div className="card-value">{campaigns.filter((campaign) => campaign.status === 'draft').length}</div><div className="card-subtitle">Ready for builder completion and launch.</div></div>
        <div className="card"><div className="card-title">Paused</div><div className="card-value">{campaigns.filter((campaign) => campaign.status === 'paused').length}</div><div className="card-subtitle">Stopped while preserving all campaign state.</div></div>
      </div>

      <div className="section-label">Create</div>
      <form className="campaign-builder" onSubmit={handleCreate}>
        <div className="card form-grid">
          <div className="card-header">
            <div>
              <div className="card-title">Campaign Setup</div>
              <div className="card-subtitle" style={{ marginTop: 8 }}>Define the name, timezone, and delivery window before you assign anything else.</div>
            </div>
          </div>
          <input className="input" placeholder="Campaign name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
          <textarea className="textarea" placeholder="What is this campaign trying to achieve?" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
          <div className="form-grid columns-3">
            <input className="input" placeholder="Timezone (e.g. UTC)" value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} />
            <input className="input" placeholder="Window start" value={form.send_window_start} onChange={(event) => setForm((current) => ({ ...current, send_window_start: event.target.value }))} />
            <input className="input" placeholder="Window end" value={form.send_window_end} onChange={(event) => setForm((current) => ({ ...current, send_window_end: event.target.value }))} />
          </div>
        </div>

        <div className="card form-grid">
          <div className="card-header">
            <div>
              <div className="card-title">Leads In Campaign</div>
              <div className="card-subtitle" style={{ marginTop: 8 }}>{selectedLeadIds.length} selected. Search the CRM and attach only the leads you want in this sequence.</div>
            </div>
          </div>
          <input className="input" placeholder="Search leads by company, name, or Telegram username" value={leadSearch} onChange={(event) => setLeadSearch(event.target.value)} />
          <div className="selection-list">
            {filteredLeads.map((lead) => (
              <label key={lead.id} className={`selection-row ${selectedLeadIds.includes(lead.id) ? 'active' : ''}`}>
                <div>
                  <div>{lead.first_name} {lead.last_name}</div>
                  <div className="dim">{lead.company_name} · @{lead.telegram_username}</div>
                </div>
                <input type="checkbox" checked={selectedLeadIds.includes(lead.id)} onChange={() => toggleLead(lead.id)} />
              </label>
            ))}
          </div>
        </div>

        <div className="card form-grid">
          <div className="card-header">
            <div>
              <div className="card-title">Telegram Accounts</div>
              <div className="card-subtitle" style={{ marginTop: 8 }}>See which sender accounts are already busy before you allocate them to this campaign.</div>
            </div>
          </div>
          <div className="selection-list">
            {accountInsights.map((account) => (
              <label key={account.id} className={`selection-row ${selectedAccountIds.includes(account.id) ? 'active' : ''}`}>
                <div>
                  <div>{account.label}</div>
                  <div className="dim">
                    @{account.telegram_username} · {account.campaignCount} campaigns · {account.sentToday}/{account.daily_limit} today
                  </div>
                </div>
                <div className="metric-row-side">
                  <span className="badge">{account.is_active ? 'active' : 'paused'}</span>
                  <input type="checkbox" checked={selectedAccountIds.includes(account.id)} onChange={() => toggleAccount(account.id)} />
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="card form-grid">
          <div className="card-header">
            <div>
              <div className="card-title">Sequence Builder</div>
              <div className="card-subtitle" style={{ marginTop: 8 }}>Draft the intro, follow-up, and later touches before you launch.</div>
            </div>
          </div>
          <div className="sequence-stack">
            {steps.map((step, index) => (
              <div key={index} className="sequence-card">
                <div className="sequence-card-head">
                  <div>Step {index + 1}</div>
                  <div className="dim">Delay {step.delay_days} day(s)</div>
                </div>
                <div className="form-grid columns-2">
                  <input className="input" type="number" min={index === 0 ? 0 : 1} value={step.delay_days} onChange={(event) => updateStep(index, { delay_days: Number(event.target.value) })} />
                  <input className="input" value={step.step_order} disabled />
                </div>
                <textarea className="textarea" placeholder="Use {First Name}, {Last Name}, {Company}, {Telegram Username}" value={step.message_template} onChange={(event) => updateStep(index, { message_template: event.target.value })} />
              </div>
            ))}
          </div>
          <div className="btn-row">
            <button className="btn-secondary" type="button" onClick={addStep}>Add Another Step</button>
            <button className="btn" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating...' : 'Create Campaign'}</button>
          </div>
          {builderMessage ? <div className="status-callout success">{builderMessage}</div> : null}
        </div>
      </form>

      <div className="section-label">Campaign Library</div>
      <div className="library-grid">
        {campaignRows.length ? campaignRows.map(({ detail, stats }) => (
          <Link key={detail.campaign?.id} href={`/campaigns/${detail.campaign?.id}`} className="card library-card">
            <div className="card-header">
              <div>
                <div className="card-title">{detail.campaign?.name}</div>
                <div className="card-subtitle" style={{ marginTop: 8 }}>{detail.campaign?.description ?? 'No description yet.'}</div>
              </div>
              <span className="badge">{detail.campaign?.status ?? 'draft'}</span>
            </div>
            <div className="mini-stat-grid">
              <div className="mini-stat"><div className="mini-stat-label">Leads</div><div className="mini-stat-value">{stats.totalLeads}</div></div>
              <div className="mini-stat"><div className="mini-stat-label">Accounts</div><div className="mini-stat-value">{stats.assignedAccounts.length}</div></div>
              <div className="mini-stat"><div className="mini-stat-label">Sent</div><div className="mini-stat-value">{stats.sent}</div></div>
              <div className="mini-stat"><div className="mini-stat-label">Reply</div><div className="mini-stat-value">{stats.replyRate}%</div></div>
            </div>
            <div className="library-card-footer">
              <span className="dim">{detail.campaign?.timezone ?? 'UTC'} · {detail.campaign ? `${detail.campaign.send_window_start} -> ${detail.campaign.send_window_end}` : ''}</span>
              <span className="btn-secondary">Open</span>
            </div>
          </Link>
        )) : (
          <div className="empty-state">No campaigns yet. Use the builder above to create your first outreach program.</div>
        )}
      </div>
    </div>
  );
}
