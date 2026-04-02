'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';
import { buildAccountInsights, formatPercent, summariseCampaign, type Account, type Campaign, type CampaignDetail, type Lead } from '@/lib/web/insights';

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

type WizardStep = 'setup' | 'accounts' | 'timing' | 'leads' | 'sequence' | 'review';

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
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>('setup');
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
    return details
      .map((detail) => ({
        detail,
        stats: summariseCampaign(detail),
      }))
      .filter(({ detail }) => {
        if (statusFilter === 'all') return true;
        return detail.campaign?.status === statusFilter;
      });
  }, [details, statusFilter]);

  const handleCreate = async () => {
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

      setForm({ name: '', description: '', timezone: 'UTC', send_window_start: '09:00', send_window_end: '18:00' });
      setSelectedLeadIds([]);
      setSelectedAccountIds([]);
      setLeadSearch('');
      setSteps([emptyStep(1), emptyStep(2), emptyStep(3)]);
      setShowWizard(false);
      setWizardStep('setup');
      setBuilderMessage('Campaign created successfully.');
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

  const wizardSteps: { key: WizardStep; label: string }[] = [
    { key: 'setup', label: '1. Name & Details' },
    { key: 'accounts', label: '2. Telegram Accounts' },
    { key: 'timing', label: '3. Timing' },
    { key: 'leads', label: '4. Leads' },
    { key: 'sequence', label: '5. Message Sequence' },
    { key: 'review', label: '6. Review & Create' },
  ];

  const wizardStepIndex = wizardSteps.findIndex((s) => s.key === wizardStep);
  const canGoNext = wizardStepIndex < wizardSteps.length - 1;
  const canGoBack = wizardStepIndex > 0;

  const completionRate = (stats: ReturnType<typeof summariseCampaign>) => {
    if (!stats.totalLeads) return 0;
    return Math.round(((stats.completed + stats.replies) / stats.totalLeads) * 100);
  };

  return (
    <div className="page-content">
      <div className="grid grid-4">
        <div className="card"><div className="card-title">Campaigns</div><div className="card-value">{campaigns.length}</div><div className="card-subtitle">Total campaigns created.</div></div>
        <div className="card"><div className="card-title">Live</div><div className="card-value">{campaigns.filter((c) => c.status === 'active').length}</div><div className="card-subtitle">Currently sending tasks to the team.</div></div>
        <div className="card"><div className="card-title">Drafts</div><div className="card-value">{campaigns.filter((c) => c.status === 'draft').length}</div><div className="card-subtitle">Ready for completion and launch.</div></div>
        <div className="card"><div className="card-title">Paused / Completed</div><div className="card-value">{campaigns.filter((c) => c.status === 'paused' || c.status === 'completed').length}</div><div className="card-subtitle">Stopped or finished campaigns.</div></div>
      </div>

      {!showWizard ? (
        <div style={{ marginTop: 24 }}>
          <button className="btn" onClick={() => setShowWizard(true)} style={{ padding: '12px 24px', fontSize: 13 }}>
            + Create New Campaign
          </button>
          {builderMessage ? <div className="status-callout success" style={{ marginTop: 12 }}>{builderMessage}</div> : null}
        </div>
      ) : (
        <>
          <div className="section-label">New Campaign Wizard</div>
          <div className="card" style={{ padding: 0 }}>
            <div className="wizard-steps">
              {wizardSteps.map((s, i) => (
                <button
                  key={s.key}
                  className={`wizard-step-btn ${wizardStep === s.key ? 'active' : ''} ${i < wizardStepIndex ? 'done' : ''}`}
                  onClick={() => setWizardStep(s.key)}
                  type="button"
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div style={{ padding: 20 }}>
              {wizardStep === 'setup' && (
                <div className="form-grid">
                  <div className="card-title" style={{ marginBottom: 4 }}>Campaign Details</div>
                  <input className="input" placeholder="Campaign name" value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} required />
                  <textarea className="textarea" placeholder="What is this campaign trying to achieve?" value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} />
                </div>
              )}

              {wizardStep === 'accounts' && (
                <div className="form-grid">
                  <div className="card-title" style={{ marginBottom: 4 }}>Select Telegram Accounts</div>
                  <div className="card-subtitle">{selectedAccountIds.length} accounts selected. These sender accounts will be used for this campaign.</div>
                  <div className="selection-list">
                    {accountInsights.length ? accountInsights.map((account) => (
                      <label key={account.id} className={`selection-row ${selectedAccountIds.includes(account.id) ? 'active' : ''}`}>
                        <div>
                          <div>{account.label}</div>
                          <div className="dim">@{account.telegram_username} · {account.campaignCount} campaigns · {account.sentToday}/{account.daily_limit} today</div>
                        </div>
                        <div className="metric-row-side">
                          <span className="badge">{account.is_active ? 'active' : 'paused'}</span>
                          <input type="checkbox" checked={selectedAccountIds.includes(account.id)} onChange={() => toggleAccount(account.id)} />
                        </div>
                      </label>
                    )) : <div className="empty-state">No Telegram accounts. Add them in the Accounts page first.</div>}
                  </div>
                </div>
              )}

              {wizardStep === 'timing' && (
                <div className="form-grid">
                  <div className="card-title" style={{ marginBottom: 4 }}>Timing & Send Window</div>
                  <div className="form-grid columns-3">
                    <div className="form-grid">
                      <label className="dim" style={{ fontSize: 11 }}>Timezone</label>
                      <input className="input" placeholder="e.g. UTC" value={form.timezone} onChange={(e) => setForm((c) => ({ ...c, timezone: e.target.value }))} />
                    </div>
                    <div className="form-grid">
                      <label className="dim" style={{ fontSize: 11 }}>Window Start</label>
                      <input className="input" type="time" value={form.send_window_start} onChange={(e) => setForm((c) => ({ ...c, send_window_start: e.target.value }))} />
                    </div>
                    <div className="form-grid">
                      <label className="dim" style={{ fontSize: 11 }}>Window End</label>
                      <input className="input" type="time" value={form.send_window_end} onChange={(e) => setForm((c) => ({ ...c, send_window_end: e.target.value }))} />
                    </div>
                  </div>
                </div>
              )}

              {wizardStep === 'leads' && (
                <div className="form-grid">
                  <div className="card-title" style={{ marginBottom: 4 }}>Attach Leads</div>
                  <div className="card-subtitle">{selectedLeadIds.length} leads selected from {leads.length} available.</div>
                  <input className="input" placeholder="Search leads by company, name, or Telegram username" value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)} />
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
              )}

              {wizardStep === 'sequence' && (
                <div className="form-grid">
                  <div className="card-title" style={{ marginBottom: 4 }}>Message Sequence</div>
                  <div className="card-subtitle">Draft the messages for each step. Use {'{'}{`First Name`}{'}'}, {'{'}{`Last Name`}{'}'}, {'{'}{`Company`}{'}'}, {'{'}{`Telegram Username`}{'}'} as placeholders.</div>
                  <div className="sequence-stack">
                    {steps.map((step, index) => (
                      <div key={index} className="sequence-card">
                        <div className="sequence-card-head">
                          <div>Step {index + 1}</div>
                          <div className="form-grid columns-2" style={{ width: 200 }}>
                            <div>
                              <label className="dim" style={{ fontSize: 10 }}>Delay (days)</label>
                              <input className="input" type="number" min={index === 0 ? 0 : 1} value={step.delay_days} onChange={(e) => updateStep(index, { delay_days: Number(e.target.value) })} />
                            </div>
                          </div>
                        </div>
                        <textarea className="textarea" placeholder="Write your message..." value={step.message_template} onChange={(e) => updateStep(index, { message_template: e.target.value })} />
                      </div>
                    ))}
                  </div>
                  <button className="btn-secondary" type="button" onClick={addStep}>+ Add Another Step</button>
                </div>
              )}

              {wizardStep === 'review' && (
                <div className="form-grid">
                  <div className="card-title" style={{ marginBottom: 4 }}>Review Campaign</div>
                  <div className="list-stack">
                    <div className="metric-row"><span>Name</span><span>{form.name || '(not set)'}</span></div>
                    <div className="metric-row"><span>Timezone</span><span>{form.timezone}</span></div>
                    <div className="metric-row"><span>Send Window</span><span>{form.send_window_start} - {form.send_window_end}</span></div>
                    <div className="metric-row"><span>Accounts</span><span>{selectedAccountIds.length} selected</span></div>
                    <div className="metric-row"><span>Leads</span><span>{selectedLeadIds.length} selected</span></div>
                    <div className="metric-row"><span>Sequence Steps</span><span>{steps.filter((s) => s.message_template.trim()).length} with messages</span></div>
                  </div>
                  <div className="btn-row" style={{ marginTop: 8 }}>
                    <button className="btn" onClick={handleCreate} disabled={isSubmitting || !form.name.trim()}>
                      {isSubmitting ? 'Creating...' : 'Create Campaign'}
                    </button>
                    <button className="btn-secondary" type="button" onClick={() => { setShowWizard(false); setWizardStep('setup'); }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="btn-row" style={{ marginTop: 16, justifyContent: 'space-between' }}>
                {canGoBack ? (
                  <button className="btn-secondary" type="button" onClick={() => setWizardStep(wizardSteps[wizardStepIndex - 1].key)}>
                    Back
                  </button>
                ) : <div />}
                {canGoNext ? (
                  <button className="btn" type="button" onClick={() => setWizardStep(wizardSteps[wizardStepIndex + 1].key)}>
                    Next
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="section-label">Campaign Status</div>
      <div className="filter-row" style={{ marginBottom: 16, maxWidth: 400 }}>
        <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
        </select>
      </div>
      <div className="library-grid">
        {campaignRows.length ? campaignRows.map(({ detail, stats }) => (
          <Link key={detail.campaign?.id} href={`/campaigns/${detail.campaign?.id}`} className="card library-card">
            <div className="card-header">
              <div>
                <div className="card-title">{detail.campaign?.name}</div>
                <div className="card-subtitle" style={{ marginTop: 8 }}>{detail.campaign?.description ?? 'No description yet.'}</div>
              </div>
              <span className={`badge ${detail.campaign?.status === 'active' ? 'badge-active' : ''}`}>{detail.campaign?.status ?? 'draft'}</span>
            </div>
            <div className="mini-stat-grid">
              <div className="mini-stat"><div className="mini-stat-label">Leads</div><div className="mini-stat-value">{stats.totalLeads}</div></div>
              <div className="mini-stat"><div className="mini-stat-label">Accounts</div><div className="mini-stat-value">{stats.assignedAccounts.length}</div></div>
              <div className="mini-stat"><div className="mini-stat-label">Sent</div><div className="mini-stat-value">{stats.sent}</div></div>
              <div className="mini-stat"><div className="mini-stat-label">Completion</div><div className="mini-stat-value">{completionRate(stats)}%</div></div>
            </div>
            <div className="campaign-progress-bar">
              <div className="campaign-progress-fill" style={{ width: `${completionRate(stats)}%` }} />
            </div>
            <div className="library-card-footer">
              <span className="dim">{detail.campaign?.timezone ?? 'UTC'} · {detail.campaign ? `${detail.campaign.send_window_start} - ${detail.campaign.send_window_end}` : ''}</span>
              <span className="dim">{formatPercent(stats.replyRate)} reply rate</span>
              <span className="btn-secondary">Open</span>
            </div>
          </Link>
        )) : (
          <div className="empty-state">No campaigns match the current filter. Create one to get started.</div>
        )}
      </div>
    </div>
  );
}
