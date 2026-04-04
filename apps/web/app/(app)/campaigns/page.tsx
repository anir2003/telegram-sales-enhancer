'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';
import { buildAccountInsights, formatPercent, summariseCampaign, type Account, type Campaign, type CampaignDetail, type Lead } from '@/lib/web/insights';
import { CustomSelect } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Kolkata',      label: 'IST — India Standard Time (UTC+5:30)' },
  { value: 'UTC',               label: 'UTC — Coordinated Universal Time' },
  { value: 'America/New_York',  label: 'EST/EDT — New York (UTC−5/−4)' },
  { value: 'America/Chicago',   label: 'CST/CDT — Chicago (UTC−6/−5)' },
  { value: 'America/Denver',    label: 'MST/MDT — Denver (UTC−7/−6)' },
  { value: 'America/Los_Angeles', label: 'PST/PDT — Los Angeles (UTC−8/−7)' },
  { value: 'America/Sao_Paulo', label: 'BRT — São Paulo (UTC−3)' },
  { value: 'Europe/London',     label: 'GMT/BST — London (UTC+0/+1)' },
  { value: 'Europe/Paris',      label: 'CET/CEST — Paris (UTC+1/+2)' },
  { value: 'Europe/Berlin',     label: 'CET/CEST — Berlin (UTC+1/+2)' },
  { value: 'Asia/Dubai',        label: 'GST — Dubai (UTC+4)' },
  { value: 'Asia/Singapore',    label: 'SGT — Singapore (UTC+8)' },
  { value: 'Asia/Shanghai',     label: 'CST — Shanghai (UTC+8)' },
  { value: 'Asia/Tokyo',        label: 'JST — Tokyo (UTC+9)' },
  { value: 'Australia/Sydney',  label: 'AEST/AEDT — Sydney (UTC+10/+11)' },
];

type SequenceDraft = {
  step_order: number;
  step_name: string;
  delay_days: number;
  message_template: string;
};

const defaultStepName = (index: number): string => {
  if (index === 0) return 'Reachout';
  return `Follow Up ${index}`;
};

const emptyStep = (stepOrder: number): SequenceDraft => ({
  step_order: stepOrder,
  step_name: defaultStepName(stepOrder - 1),
  delay_days: stepOrder === 1 ? 0 : 2,
  message_template: '',
});

const placeholders = [
  { label: 'First Name', token: '{First Name}', color: '#6366f1' },
  { label: 'Last Name', token: '{Last Name}', color: '#ec4899' },
  { label: 'Company', token: '{Company}', color: '#f59e0b' },
  { label: 'Telegram Username', token: '{Telegram Username}', color: '#14b8a6' },
] as const;

function renderPreview(template: string) {
  return template
    .replaceAll('{First Name}', 'Ava')
    .replaceAll('{Last Name}', 'Patel')
    .replaceAll('{Company}', 'Acme Inc')
    .replaceAll('{Telegram Username}', 'avapatel');
}

type WizardStep = 'setup' | 'accounts' | 'timing' | 'leads' | 'sequence' | 'review';

// Messages per account option type
type AccountMessageLimit = {
  accountId: string;
  limit: number;
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [details, setDetails] = useState<CampaignDetail[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [builderMessage, setBuilderMessage] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [accountMessageLimits, setAccountMessageLimits] = useState<AccountMessageLimit[]>([]);
  const [messagesPerAccount, setMessagesPerAccount] = useState<number | null>(null);
  const [leadSearch, setLeadSearch] = useState('');
  const [leadTagFilter, setLeadTagFilter] = useState('all');
  const [leadCompanyFilter, setLeadCompanyFilter] = useState('all');
  const [leadSelectMode, setLeadSelectMode] = useState<'leads' | 'companies'>('leads');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>('setup');
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const [form, setForm] = useState({
    name: '',
    description: '',
    timezone: 'Asia/Kolkata',
    send_window_start: '09:00',
    send_window_end: '18:00',
    start_date: '',
    end_date: '',
  });
  const [steps, setSteps] = useState<SequenceDraft[]>([
    emptyStep(1),
    emptyStep(2),
  ]);

  // Use useCallback to prevent recreating the load function on every render
  const load = useCallback(async () => {
    const [campaignResponse, leadResponse, accountResponse] = await Promise.all([
      fetchJson<{ campaigns: Campaign[] }>('/api/campaigns'),
      fetchJson<{ leads: Lead[] }>('/api/leads'),
      fetchJson<{ accounts: Account[] }>('/api/accounts'),
    ]);

    const nextCampaigns = campaignResponse.campaigns ?? [];
    setCampaigns(nextCampaigns);
    setLeads(leadResponse.leads ?? []);
    setAccounts(accountResponse.accounts ?? []);

    // Only fetch campaign details if there are campaigns
    if (nextCampaigns.length > 0) {
      const nextDetails = await Promise.all(
        nextCampaigns.map((campaign: Campaign) => fetchJson<CampaignDetail>(`/api/campaigns/${campaign.id}`)),
      );
      setDetails(nextDetails);
    } else {
      setDetails([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Initialize account message limits when accounts are selected
  useEffect(() => {
    setAccountMessageLimits(prev => {
      const existing = new Map(prev.map(p => [p.accountId, p.limit]));
      return selectedAccountIds.map(id => ({
        accountId: id,
        limit: existing.get(id) ?? 0,
      }));
    });
  }, [selectedAccountIds]);

  const accountInsights = useMemo(
    () => buildAccountInsights(accounts, details),
    [accounts, details],
  );

  const allLeadTags = useMemo(() => [...new Set(leads.flatMap((l) => l.tags))], [leads]);
  const allCompanies = useMemo(() => [...new Set(leads.map((l) => l.company_name).filter(Boolean))], [leads]);
  const companyLeadCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of leads) if (l.company_name) map[l.company_name] = (map[l.company_name] ?? 0) + 1;
    return map;
  }, [leads]);

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesSearch = !leadSearch.trim() || [lead.first_name, lead.last_name, lead.company_name, lead.telegram_username]
        .join(' ')
        .toLowerCase()
        .includes(leadSearch.trim().toLowerCase());
      const matchesTag = leadTagFilter === 'all' || lead.tags.includes(leadTagFilter);
      const matchesCompany = leadCompanyFilter === 'all' || lead.company_name === leadCompanyFilter;
      return matchesSearch && matchesTag && matchesCompany;
    });
  }, [leadSearch, leadTagFilter, leadCompanyFilter, leads]);

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
      const { campaign } = await fetchJson<{ campaign: Campaign }>('/api/campaigns', {
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
          body: JSON.stringify({ 
            accountIds: selectedAccountIds,
            messageLimits: messagesPerAccount ? null : accountMessageLimits,
            messagesPerAccount: messagesPerAccount,
          }),
        });
      }

      setForm({ name: '', description: '', timezone: 'UTC', send_window_start: '09:00', send_window_end: '18:00', start_date: '', end_date: '' });
      setSelectedLeadIds([]);
      setSelectedAccountIds([]);
      setAccountMessageLimits([]);
      setMessagesPerAccount(null);
      setLeadSearch('');
      setLeadTagFilter('all');
      setLeadCompanyFilter('all');
      setSteps([emptyStep(1), emptyStep(2)]);
      setShowWizard(false);
      setWizardStep('setup');
      setBuilderMessage('Campaign created successfully.');
      await load();
    } catch (err: any) {
      console.error('Campaign creation failed:', err);
      setBuilderMessage(`Error: ${err?.message ?? 'Failed to create campaign'}`);
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

  const updateAccountLimit = (accountId: string, limit: number) => {
    setAccountMessageLimits(current =>
      current.map(item =>
        item.accountId === accountId ? { ...item, limit } : item
      )
    );
  };

  const updateStep = (index: number, patch: Partial<SequenceDraft>) => {
    setSteps((current) => current.map((step, stepIndex) => (stepIndex === index ? { ...step, ...patch } : step)));
  };

  const addStep = () => {
    setSteps((current) => [...current, emptyStep(current.length + 1)]);
  };

  const removeStep = (index: number) => {
    if (steps.length <= 2) return; // minimum 2
    setSteps((current) => {
      const next = current.filter((_, i) => i !== index);
      // Re-order and re-name
      return next.map((step, i) => ({
        ...step,
        step_order: i + 1,
        step_name: step.step_name === defaultStepName(index) ? defaultStepName(i) : step.step_name,
      }));
    });
    if (activeStepIdx >= steps.length - 1) {
      setActiveStepIdx(Math.max(0, steps.length - 2));
    }
  };

  const insertPlaceholder = (token: string) => {
    const ta = textareaRefs.current[activeStepIdx];
    if (!ta) {
      updateStep(activeStepIdx, { message_template: steps[activeStepIdx].message_template + token });
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const current = steps[activeStepIdx].message_template;
    const next = current.substring(0, start) + token + current.substring(end);
    updateStep(activeStepIdx, { message_template: next });
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const selectAllFiltered = () => {
    const ids = filteredLeads.map((l) => l.id);
    setSelectedLeadIds((current) => [...new Set([...current, ...ids])]);
  };

  const deselectAllFiltered = () => {
    const ids = new Set(filteredLeads.map((l) => l.id));
    setSelectedLeadIds((current) => current.filter((id) => !ids.has(id)));
  };

  const wizardSteps: { key: WizardStep; label: string }[] = [
    { key: 'setup', label: 'Details' },
    { key: 'accounts', label: 'Accounts' },
    { key: 'timing', label: 'Timing' },
    { key: 'leads', label: 'Leads' },
    { key: 'sequence', label: 'Sequence' },
    { key: 'review', label: 'Review' },
  ];

  const wizardStepIndex = wizardSteps.findIndex((s) => s.key === wizardStep);
  const canGoNext = wizardStepIndex < wizardSteps.length - 1;
  const canGoBack = wizardStepIndex > 0;

  const completionRate = (stats: ReturnType<typeof summariseCampaign>) => {
    if (!stats.totalLeads) return 0;
    return Math.round(((stats.completed + stats.replies) / stats.totalLeads) * 100);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#26a641';
      case 'paused': return '#f39c12';
      case 'completed': return '#3498db';
      case 'draft': return '#888888';
      default: return '#888888';
    }
  };

  return (
    <div className="page-content">
      <div className="grid grid-4">
        <div className="card"><div className="card-title">Campaigns</div><div className="card-value">{campaigns.length}</div><div className="card-subtitle">Total campaigns created.</div></div>
        <div className="card"><div className="card-title">Live</div><div className="card-value" style={{ color: '#26a641' }}>{campaigns.filter((c) => c.status === 'active').length}</div><div className="card-subtitle">Currently sending tasks to the team.</div></div>
        <div className="card"><div className="card-title">Drafts</div><div className="card-value">{campaigns.filter((c) => c.status === 'draft').length}</div><div className="card-subtitle">Ready for completion and launch.</div></div>
        <div className="card"><div className="card-title">Paused / Completed</div><div className="card-value">{campaigns.filter((c) => c.status === 'paused' || c.status === 'completed').length}</div><div className="card-subtitle">Stopped or finished campaigns.</div></div>
      </div>

      {!showWizard ? (
        <div style={{ marginTop: 24 }}>
          <button className="btn" onClick={() => setShowWizard(true)} style={{ padding: '12px 24px', fontSize: 13 }}>
            + Create New Campaign
          </button>
          {builderMessage ? <div className={`status-callout ${builderMessage.startsWith('Error') ? 'error' : 'success'}`} style={{ marginTop: 12 }}>{builderMessage}</div> : null}
        </div>
      ) : (
        <>
          <div className="section-label">New Campaign</div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Stepper */}
            <div className="wizard-stepper">
              {wizardSteps.map((s, i) => (
                <React.Fragment key={s.key}>
                  <div
                    className={`wizard-stepper-step ${wizardStep === s.key ? 'active' : ''} ${i < wizardStepIndex ? 'done' : ''}`}
                    onClick={() => setWizardStep(s.key)}
                  >
                    <div className="wizard-stepper-circle">
                      {i < wizardStepIndex
                        ? <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,6 5,9 10,3"/></svg>
                        : i + 1}
                    </div>
                    <span className="wizard-stepper-label">{s.label}</span>
                  </div>
                  {i < wizardSteps.length - 1 && (
                    <div className={`wizard-stepper-line ${i < wizardStepIndex ? 'done' : ''}`} />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Body */}
            <div className="wizard-body">
              {wizardStep === 'setup' && (
                <div className="form-grid">
                  <div className="wizard-section-title">Campaign Details</div>
                  <div className="wizard-section-subtitle">Give your campaign a name and describe its goal.</div>
                  <input className="input" placeholder="Campaign name" value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} required />
                  <textarea className="textarea" placeholder="What is this campaign trying to achieve?" value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} style={{ minHeight: 80 }} />
                </div>
              )}

              {wizardStep === 'accounts' && (
                <div className="form-grid">
                  <div className="wizard-section-title">Telegram Accounts</div>
                  <div className="wizard-section-subtitle">{selectedAccountIds.length} accounts selected — these will be used to send messages.</div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                    <label className="dim" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>Messages per account</label>
                    <input 
                      className="input" 
                      type="number" 
                      min={1}
                      placeholder="Auto (daily limits)"
                      value={messagesPerAccount ?? ''}
                      onChange={(e) => setMessagesPerAccount(e.target.value ? Number(e.target.value) : null)}
                      style={{ maxWidth: 180 }}
                    />
                  </div>

                  <div className="selection-list">
                    {accountInsights.length ? accountInsights.map((account) => {
                      const limitEntry = accountMessageLimits.find(l => l.accountId === account.id);
                      const isSelected = selectedAccountIds.includes(account.id);
                      return (
                        <div key={account.id} className={`selection-row ${isSelected ? 'active' : ''}`}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                            <input type="checkbox" checked={isSelected} onChange={() => toggleAccount(account.id)} style={{ flexShrink: 0 }} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 500 }}>{account.label}</div>
                              <div className="dim" style={{ fontSize: 11 }}>@{account.telegram_username} · {account.campaignCount} campaigns · {account.sentToday}/{account.daily_limit} today</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            {isSelected && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontSize: 10, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>msg limit</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={limitEntry?.limit ?? account.daily_limit}
                                  onChange={(e) => updateAccountLimit(account.id, Number(e.target.value))}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    width: 52, padding: '2px 6px', fontSize: 11,
                                    background: 'var(--panel-strong)', border: '1px solid var(--border-soft)',
                                    borderRadius: 3, color: 'var(--text)', fontFamily: 'inherit',
                                  }}
                                />
                              </div>
                            )}
                            <span className="badge">{account.is_active ? 'active' : 'paused'}</span>
                          </div>
                        </div>
                      );
                    }) : <div className="empty-state">No Telegram accounts. Add them in the Accounts page first.</div>}
                  </div>
                </div>
              )}

              {wizardStep === 'timing' && (
                <div className="form-grid">
                  <div className="wizard-section-title">Timing & Send Window</div>
                  <div className="wizard-section-subtitle">Control when messages are sent.</div>
                  <div className="form-grid columns-3">
                    <div className="form-grid">
                      <label className="dim" style={{ fontSize: 11 }}>Timezone</label>
                      <CustomSelect value={form.timezone} onChange={(v) => setForm((c) => ({ ...c, timezone: v }))} options={TIMEZONE_OPTIONS} />
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
                  <div className="form-grid columns-2" style={{ marginTop: 8 }}>
                    <div className="form-grid">
                      <label className="dim" style={{ fontSize: 11 }}>Campaign Start Date</label>
                      <DatePicker value={form.start_date} onChange={(v) => setForm((c) => ({ ...c, start_date: v }))} placeholder="Start date" />
                    </div>
                    <div className="form-grid">
                      <label className="dim" style={{ fontSize: 11 }}>Campaign End Date</label>
                      <DatePicker value={form.end_date} onChange={(v) => setForm((c) => ({ ...c, end_date: v }))} placeholder="End date" />
                    </div>
                  </div>
                </div>
              )}

              {wizardStep === 'leads' && (
                <div className="form-grid">
                  {/* Header row: title + mode toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div className="wizard-section-title" style={{ marginBottom: 2 }}>Attach Leads</div>
                      <div className="wizard-section-subtitle">{selectedLeadIds.length} of {leads.length} leads selected</div>
                    </div>
                    <div className="view-toggle">
                      <button className={`view-toggle-btn ${leadSelectMode === 'leads' ? 'active' : ''}`} type="button" onClick={() => setLeadSelectMode('leads')}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                        By Lead
                      </button>
                      <button className={`view-toggle-btn ${leadSelectMode === 'companies' ? 'active' : ''}`} type="button" onClick={() => setLeadSelectMode('companies')}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
                        By Company
                      </button>
                    </div>
                  </div>

                  {/* Search bar — always visible, filters leads or companies depending on mode */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="input"
                      style={{ flex: 1 }}
                      placeholder={leadSelectMode === 'leads' ? 'Search leads...' : 'Search companies...'}
                      value={leadSearch}
                      onChange={(e) => setLeadSearch(e.target.value)}
                    />
                    {leadSelectMode === 'leads' && (<>
                      <CustomSelect
                        value={leadCompanyFilter}
                        onChange={(v) => {
                          setLeadCompanyFilter(v);
                          if (v !== 'all') {
                            const ids = leads.filter(l => l.company_name === v).map(l => l.id);
                            setSelectedLeadIds(prev => [...new Set([...prev, ...ids])]);
                          }
                        }}
                        options={[{ value: 'all', label: 'All Companies' }, ...allCompanies.map(c => ({ value: c, label: `${c} (${companyLeadCounts[c] ?? 0})` }))]}
                        style={{ width: 170, flexShrink: 0 }}
                      />
                      <CustomSelect value={leadTagFilter} onChange={setLeadTagFilter} options={[{ value: 'all', label: 'All Tags' }, ...allLeadTags.map(t => ({ value: t, label: t }))]} style={{ width: 130, flexShrink: 0 }} />
                    </>)}
                  </div>

                  {leadSelectMode === 'leads' ? (<>
                    <div className="btn-row" style={{ fontSize: 12 }}>
                      <button className="chip" type="button" onClick={selectAllFiltered}>Select all {filteredLeads.length} shown</button>
                      <button className="chip" type="button" onClick={deselectAllFiltered}>Deselect shown</button>
                      <button className="chip" type="button" onClick={() => setSelectedLeadIds([])}>Clear selection</button>
                    </div>
                    <div className="selection-list">
                      {filteredLeads.length ? filteredLeads.map((lead) => (
                        <label key={lead.id} className={`selection-row ${selectedLeadIds.includes(lead.id) ? 'active' : ''}`}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                            <input type="checkbox" checked={selectedLeadIds.includes(lead.id)} onChange={() => toggleLead(lead.id)} style={{ flexShrink: 0 }} />
                            <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>{lead.first_name} {lead.last_name}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{lead.company_name} · @{lead.telegram_username}</span>
                            {lead.tags.length > 0 && (
                              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                {lead.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                              </div>
                            )}
                          </div>
                        </label>
                      )) : <div style={{ padding: 16, fontSize: 12, color: 'var(--text-dim)', textAlign: 'center' }}>No leads match filters.</div>}
                    </div>
                  </>) : (<>
                    {/* Company selection mode */}
                    <div className="selection-list">
                      {allCompanies.filter(c => !leadSearch.trim() || c.toLowerCase().includes(leadSearch.trim().toLowerCase())).length
                        ? allCompanies.filter(c => !leadSearch.trim() || c.toLowerCase().includes(leadSearch.trim().toLowerCase())).map((company) => {
                        const total = companyLeadCounts[company] ?? 0;
                        const companyLeadIds = leads.filter(l => l.company_name === company).map(l => l.id);
                        const selectedCount = companyLeadIds.filter(id => selectedLeadIds.includes(id)).length;
                        const allSelected = selectedCount === total;
                        const someSelected = selectedCount > 0 && !allSelected;
                        const toggle = () => {
                          if (allSelected) {
                            setSelectedLeadIds(prev => prev.filter(id => !companyLeadIds.includes(id)));
                          } else {
                            setSelectedLeadIds(prev => [...new Set([...prev, ...companyLeadIds])]);
                          }
                        };
                        return (
                          <label key={company} className={`selection-row ${selectedCount > 0 ? 'active' : ''}`} style={{ cursor: 'pointer' }} onClick={toggle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                              <input
                                type="checkbox"
                                checked={allSelected}
                                ref={el => { if (el) el.indeterminate = someSelected; }}
                                onChange={toggle}
                                onClick={e => e.stopPropagation()}
                                style={{ flexShrink: 0 }}
                              />
                              <span style={{ fontSize: 12, fontWeight: 500 }}>{company}</span>
                              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{total} lead{total !== 1 ? 's' : ''}</span>
                            </div>
                            {selectedCount > 0 && (
                              <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>
                                {selectedCount}/{total} selected
                              </span>
                            )}
                          </label>
                        );
                      }) : <div style={{ padding: 16, fontSize: 12, color: 'var(--text-dim)', textAlign: 'center' }}>No companies found.</div>}

                    </div>
                    <div className="btn-row" style={{ fontSize: 12 }}>
                      <button className="chip" type="button" onClick={() => setSelectedLeadIds(leads.map(l => l.id))}>Select all companies</button>
                      <button className="chip" type="button" onClick={() => setSelectedLeadIds([])}>Clear selection</button>
                    </div>
                  </>)}
                </div>
              )}

              {wizardStep === 'sequence' && (
                <div className="form-grid">
                  <div className="wizard-section-title">Message Sequence</div>
                  <div className="wizard-section-subtitle">
                    Build your outreach messages. Minimum 2 messages required.
                    <span style={{ marginLeft: 8 }}>
                      {placeholders.map((p) => (
                        <button key={p.token} type="button" className="placeholder-pill" onClick={() => insertPlaceholder(p.token)}
                          style={{ marginLeft: 4, background: `${p.color}18`, color: p.color, borderColor: `${p.color}50`, borderRadius: 4 }}>
                          {p.label}
                        </button>
                      ))}
                    </span>
                  </div>

                  <div className="sequence-stack">
                    {steps.map((step, index) => (
                      <div key={index} className={`sequence-step-card ${activeStepIdx === index ? 'active' : ''}`}>
                        <div className="sequence-step-header" onClick={() => setActiveStepIdx(index)}>
                          <div className="sequence-step-header-left">
                            <div className="sequence-step-number">{index + 1}</div>
                            <input
                              className="sequence-step-name-input"
                              value={step.step_name}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => updateStep(index, { step_name: e.target.value })}
                              placeholder={defaultStepName(index)}
                            />
                          </div>
                          <div className="sequence-step-meta">
                            <div className="sequence-step-delay">
                              <span>Delay</span>
                              <input
                                type="number"
                                min={index === 0 ? 0 : 1}
                                value={step.delay_days}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => updateStep(index, { delay_days: Number(e.target.value) })}
                              />
                              <span>days</span>
                            </div>
                            <button
                              type="button"
                              className="sequence-step-delete"
                              disabled={steps.length <= 2}
                              onClick={(e) => { e.stopPropagation(); removeStep(index); }}
                              title={steps.length <= 2 ? 'Minimum 2 messages required' : 'Remove this step'}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        {/* Always show the body - no accordion */}
                        <div className="sequence-step-body">
                          <div className="editor-wrapper">
                            <div className="editor-pane">
                              <textarea
                                className="message-input"
                                ref={(el) => { textareaRefs.current[index] = el; }}
                                placeholder="Write your message here..."
                                value={step.message_template}
                                onFocus={() => setActiveStepIdx(index)}
                                onChange={(e) => updateStep(index, { message_template: e.target.value })}
                              />
                            </div>
                            <div className="preview-pane">
                              <div className="preview-header">
                                <div className="preview-avatar">A</div>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Ava Patel</div>
                                  <div className="dim" style={{ fontSize: 11 }}>@avapatel</div>
                                </div>
                              </div>
                              <div className="preview-bubble">
                                {step.message_template.trim() ? renderPreview(step.message_template) : 'Preview will appear here...'}
                              </div>
                              <div className="preview-time">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} ✓</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button className="btn-secondary" type="button" onClick={addStep} style={{ marginTop: 8 }}>+ Add Another Step</button>
                </div>
              )}

              {wizardStep === 'review' && (
                <div className="form-grid">
                  <div className="wizard-section-title">Review & Create</div>
                  <div className="wizard-section-subtitle">Everything looks good? Create the campaign.</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ background: 'var(--panel)', borderRadius: 8, padding: 16 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Campaign</div>
                      <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{form.name || '(no name)'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{form.timezone} · {form.send_window_start}–{form.send_window_end}</div>
                      {(form.start_date || form.end_date) && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{form.start_date} → {form.end_date}</div>}
                    </div>

                    <div style={{ background: 'var(--panel)', borderRadius: 8, padding: 16 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Reach</div>
                      <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{selectedLeadIds.length} leads</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{selectedAccountIds.length} accounts selected</div>
                      {messagesPerAccount && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{messagesPerAccount} msg/account</div>}
                    </div>

                    <div style={{ background: 'var(--panel)', borderRadius: 8, padding: 16, gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                        Sequence — {steps.filter(s => s.message_template.trim()).length} steps with messages
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {steps.filter(s => s.message_template.trim()).map((s, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                            <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--panel-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{i + 1}</span>
                            <span style={{ color: 'var(--text)' }}>{s.step_name || defaultStepName(i)}</span>
                            <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>delay {s.delay_days}d</span>
                            <span style={{ flex: 1, color: 'var(--text-dim)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.message_template.slice(0, 60)}{s.message_template.length > 60 ? '...' : ''}</span>
                          </div>
                        ))}
                        {steps.filter(s => s.message_template.trim()).length === 0 && (
                          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No messages written yet. Go back to Sequence to add messages.</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {builderMessage ? <div className={`status-callout ${builderMessage.startsWith('Error') ? 'error' : 'success'}`} style={{ marginTop: 12 }}>{builderMessage}</div> : null}
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

              <div className="btn-row" style={{ marginTop: 20, justifyContent: 'space-between' }}>
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
        <CustomSelect value={statusFilter} onChange={setStatusFilter} options={[
          { value: 'all', label: 'All Statuses' },
          { value: 'active', label: 'Active' },
          { value: 'draft', label: 'Draft' },
          { value: 'paused', label: 'Paused' },
          { value: 'completed', label: 'Completed' },
        ]} />
      </div>
      
      {/* Campaign Cards Grid */}
      <div className="library-grid">
        {campaignRows.length ? campaignRows.map(({ detail, stats }) => (
          <Link key={detail.campaign?.id} href={`/campaigns/${detail.campaign?.id}`} className="campaign-card">
            <div className="campaign-card-header">
              <div className="campaign-card-title">{detail.campaign?.name}</div>
              <span 
                className="campaign-status-badge"
                style={{ 
                  background: `${getStatusColor(detail.campaign?.status ?? 'draft')}20`,
                  color: getStatusColor(detail.campaign?.status ?? 'draft'),
                  borderColor: getStatusColor(detail.campaign?.status ?? 'draft'),
                }}
              >
                {detail.campaign?.status ?? 'draft'}
              </span>
            </div>
            
            <div className="campaign-card-description">
              {detail.campaign?.description || 'No description yet.'}
            </div>
            
            <div className="campaign-card-stats">
              <div className="campaign-stat">
                <span className="campaign-stat-value">{stats.totalLeads}</span>
                <span className="campaign-stat-label">Leads</span>
              </div>
              <div className="campaign-stat">
                <span className="campaign-stat-value">{stats.assignedAccounts.length}</span>
                <span className="campaign-stat-label">Accounts</span>
              </div>
              <div className="campaign-stat">
                <span className="campaign-stat-value">{stats.sent}</span>
                <span className="campaign-stat-label">Sent</span>
              </div>
              <div className="campaign-stat">
                <span className="campaign-stat-value">{completionRate(stats)}%</span>
                <span className="campaign-stat-label">Complete</span>
              </div>
            </div>
            
            <div className="campaign-progress-bar">
              <div 
                className="campaign-progress-fill" 
                style={{ 
                  width: `${completionRate(stats)}%`,
                  background: completionRate(stats) === 100 ? '#26a641' : completionRate(stats) > 50 ? '#3498db' : '#f39c12'
                }} 
              />
            </div>
            
            <div className="campaign-card-footer">
              <div className="campaign-meta">
                <span className="dim">{detail.campaign?.timezone ?? 'UTC'}</span>
                <span className="dim">•</span>
                <span className="dim">{detail.campaign ? `${detail.campaign.send_window_start}-${detail.campaign.send_window_end}` : ''}</span>
              </div>
              <div className="campaign-reply-rate">
                <span style={{ color: stats.replyRate > 0 ? '#26a641' : 'var(--text-dim)' }}>
                  {formatPercent(stats.replyRate)} reply
                </span>
              </div>
            </div>
          </Link>
        )) : (
          <div className="empty-state" style={{ gridColumn: '1 / -1' }}>No campaigns match the current filter. Create one to get started.</div>
        )}
      </div>
    </div>
  );
}

// Need React for Fragment usage in the stepper
import React from 'react';
