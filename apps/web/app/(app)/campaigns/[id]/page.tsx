'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchJson } from '@/lib/web/fetch-json';
import { type Account, type CampaignDetail, type Lead, summariseCampaign } from '@/lib/web/insights';

const stageOrder = [
  'queued', 'due', 'sent_waiting_followup', 'first_followup_done',
  'replied', 'meeting_scheduled', 'blocked', 'call_in_future', 'skipped', 'completed',
] as const;

const stageLabels: Record<string, string> = {
  queued: 'Queued',
  due: 'Due',
  sent_waiting_followup: 'Sent — Waiting Follow Up',
  first_followup_done: 'Follow Up Done',
  replied: 'Replied',
  meeting_scheduled: 'Meeting Scheduled',
  blocked: 'Blocked',
  call_in_future: 'Call In Future',
  skipped: 'Skipped',
  completed: 'Completed',
};

const templatePlaceholders = [
  { label: 'First Name', token: '{First Name}' },
  { label: 'Last Name', token: '{Last Name}' },
  { label: 'Company', token: '{Company}' },
  { label: 'Telegram Username', token: '{Telegram Username}' },
] as const;

function normalizeTelegramUsername(value: string) {
  return value.replace(/^@/, '').trim();
}

function renderMessageTemplate(template: string, lead: any) {
  if (!lead) return template;
  return template
    .replaceAll('{First Name}', lead.first_name || 'Prospect')
    .replaceAll('{Last Name}', lead.last_name || '')
    .replaceAll('{Company}', lead.company_name || 'Company')
    .replaceAll('{Telegram Username}', normalizeTelegramUsername(lead.telegram_username || 'unknown'));
}

function formatTimestamp(date: string | null | undefined) {
  if (!date) return null;
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function formatDate(date: string | null | undefined) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Account colors for the chart
const ACCOUNT_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const campaignId = params.id;
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [stepsForm, setStepsForm] = useState<any[]>([]);
  const [originalSteps, setOriginalSteps] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'stages' | 'leads' | 'settings'>('overview');
  const [stageFilterAccount, setStageFilterAccount] = useState('all');
  const [leadSearch, setLeadSearch] = useState('');
  const [leadStageFilter, setLeadStageFilter] = useState('all');
  const [activeEditorStep, setActiveEditorStep] = useState(0);
  const editorRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const [savingSteps, setSavingSteps] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [hoveredBar, setHoveredBar] = useState<{ dayIdx: number; x: number; y: number } | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    timezone: 'UTC',
    send_window_start: '09:00',
    send_window_end: '18:00',
    start_date: '',
    end_date: '',
  });

  // Lead edit modal state
  const [editingLead, setEditingLead] = useState<any>(null);
  const [leadEditForm, setLeadEditForm] = useState({
    status: '',
    notes: '',
    next_step_order: 1,
  });

  const load = useCallback(async () => {
    const response = await fetchJson<CampaignDetail>(`/api/campaigns/${campaignId}`);
    setDetail(response);
    setStepsForm(response.steps || []);
    setOriginalSteps(JSON.parse(JSON.stringify(response.steps || [])));
    setHasUnsavedChanges(false);
    if (response.campaign) {
      setEditForm({
        name: response.campaign.name ?? '',
        description: response.campaign.description ?? '',
        timezone: response.campaign.timezone ?? 'UTC',
        send_window_start: response.campaign.send_window_start ?? '09:00',
        send_window_end: response.campaign.send_window_end ?? '18:00',
        start_date: response.campaign.start_date ?? '',
        end_date: response.campaign.end_date ?? '',
      });
    }
  }, [campaignId]);

  useEffect(() => {
    if (campaignId) void load();
  }, [campaignId, load]);

  // Check for unsaved changes
  useEffect(() => {
    const current = JSON.stringify(stepsForm);
    const original = JSON.stringify(originalSteps);
    setHasUnsavedChanges(current !== original);
  }, [stepsForm, originalSteps]);

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
      items: (detail?.attachedLeads ?? []).filter((lead: any) => {
        if (lead.status !== status) return false;
        if (stageFilterAccount !== 'all' && lead.assigned_account_id !== stageFilterAccount) return false;
        return true;
      }),
    }));
  }, [detail?.attachedLeads, stageFilterAccount]);

  const filteredAttachedLeads = useMemo(() => {
    return (detail?.attachedLeads ?? []).filter((item: any) => {
      const lead = leadById.get(item.lead_id);
      const matchesStage = leadStageFilter === 'all' || item.status === leadStageFilter;
      const matchesSearch = !leadSearch.trim() || [
        lead?.first_name, lead?.last_name, lead?.company_name, lead?.telegram_username,
      ].join(' ').toLowerCase().includes(leadSearch.trim().toLowerCase());
      return matchesStage && matchesSearch;
    });
  }, [detail?.attachedLeads, leadById, leadStageFilter, leadSearch]);

  // Daily messages sent chart (last 7 days, grouped by account)
  const dailyChartData = useMemo(() => {
    const days: { label: string; iso: string; accounts: Record<string, number>; total: number }[] = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      days.push({
        label: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
        iso,
        accounts: {},
        total: 0,
      });
    }

    // Use step_events if available, otherwise fall back to last_sent_at
    detail?.attachedLeads?.forEach((lead: any) => {
      const accountId = lead.assigned_account_id;
      if (!accountId) return;

      // Check step_events first
      const events = lead.step_events || [];
      events.forEach((evt: any) => {
        if (evt.event === 'sent' || evt.event === 'followup_sent') {
          const eventIso = evt.at?.slice(0, 10);
          const day = days.find(d => d.iso === eventIso);
          if (day) {
            const accId = evt.account_id || accountId;
            day.accounts[accId] = (day.accounts[accId] || 0) + 1;
            day.total++;
          }
        }
      });

      // Fallback: count last_sent_at
      if (events.length === 0 && lead.last_sent_at) {
        const sentIso = lead.last_sent_at.slice(0, 10);
        const day = days.find(d => d.iso === sentIso);
        if (day) {
          day.accounts[accountId] = (day.accounts[accountId] || 0) + 1;
          day.total++;
        }
      }
    });

    return days;
  }, [detail?.attachedLeads]);

  const maxDailyValue = useMemo(() => Math.max(1, ...dailyChartData.map(d => d.total)), [dailyChartData]);
  const hasChartData = dailyChartData.some(d => d.total > 0);
  const chartAccountIds = useMemo(() => {
    const ids = new Set<string>();
    dailyChartData.forEach(d => Object.keys(d.accounts).forEach(id => ids.add(id)));
    return Array.from(ids);
  }, [dailyChartData]);

  if (!detail?.campaign || !metrics) {
    return <div className="page-content"><div className="empty-state">Loading campaign…</div></div>;
  }

  const handleStatusToggle = async () => {
    setTogglingStatus(true);
    setStatusMessage('');
    try {
      if (detail.campaign?.status === 'active') {
        await fetchJson(`/api/campaigns/${campaignId}/pause`, { method: 'POST' });
        setStatusMessage('Campaign paused.');
      } else {
        await fetchJson(`/api/campaigns/${campaignId}/launch`, { method: 'POST' });
        setStatusMessage('Campaign launched.');
      }
      await load();
    } catch (err: any) {
      console.error('Status toggle failed:', err);
      setStatusMessage(`Error: ${err?.message ?? 'Failed to change campaign status'}`);
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this campaign? This action cannot be undone.')) return;
    setIsDeleting(true);
    setStatusMessage('');
    try {
      await fetchJson(`/api/campaigns/${campaignId}`, { method: 'DELETE' });
      router.push('/campaigns');
    } catch (err: any) {
      console.error('Delete campaign failed:', err);
      setStatusMessage(`Error: ${err?.message ?? 'Failed to delete campaign'}`);
      setIsDeleting(false);
    }
  };

  const saveChanges = async () => {
    setStatusMessage('');
    try {
      await fetchJson(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      setIsEditing(false);
      setStatusMessage('Campaign settings saved.');
      await load();
    } catch (err: any) {
      console.error('Save changes failed:', err);
      setStatusMessage(`Error: ${err?.message ?? 'Failed to save changes'}`);
    }
  };

  const saveSequenceChanges = async () => {
    setSavingSteps(true);
    setStatusMessage('');
    try {
      for (const step of stepsForm) {
        await fetchJson(`/api/campaigns/${campaignId}/steps/${step.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ message_template: step.message_template }),
        });
      }
      setOriginalSteps(JSON.parse(JSON.stringify(stepsForm)));
      setHasUnsavedChanges(false);
      setStatusMessage('Sequence saved.');
    } catch (err: any) {
      console.error('Save sequence failed:', err);
      setStatusMessage(`Error: ${err?.message ?? 'Failed to save sequence changes'}`);
    }
    setSavingSteps(false);
  };

  const markReplied = async (leadId: string) => {
    try {
      await fetchJson(`/api/campaigns/${campaignId}/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify({ status: 'replied', last_reply_at: new Date().toISOString() }) });
      await load();
    } catch (err: any) {
      console.error('Mark replied failed:', err);
      setStatusMessage(`Error: ${err?.message ?? 'Failed to mark as replied'}`);
    }
  };

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    setDraggingLeadId(leadId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', leadId);
  };

  const handleDragOver = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stage);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = async (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    setDragOverStage(null);
    const leadId = e.dataTransfer.getData('text/plain');
    setDraggingLeadId(null);
    if (!leadId) return;

    const item = detail?.attachedLeads?.find((l: any) => l.id === leadId);
    if (!item || item.status === targetStage) return;

    const patch: Record<string, unknown> = { status: targetStage };
    if (targetStage === 'replied') {
      patch.last_reply_at = new Date().toISOString();
    }

    try {
      await fetchJson(`/api/campaigns/${campaignId}/leads/${leadId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await load();
    } catch (err: any) {
      console.error('Drag move failed:', err);
      setStatusMessage(`Error: ${err?.message ?? 'Failed to move lead'}`);
    }
  };

  const handleDragEnd = () => {
    setDraggingLeadId(null);
    setDragOverStage(null);
  };

  const openLeadEdit = (item: any) => {
    setEditingLead(item);
    setLeadEditForm({
      status: item.status,
      notes: item.notes || '',
      next_step_order: item.next_step_order || 1,
    });
  };

  const saveLeadChanges = async () => {
    if (!editingLead) return;
    try {
      await fetchJson(`/api/campaigns/${campaignId}/leads/${editingLead.id}`, {
        method: 'PATCH',
        body: JSON.stringify(leadEditForm),
      });
      setEditingLead(null);
      await load();
    } catch (err: any) {
      console.error('Save lead changes failed:', err);
      setStatusMessage(`Error: ${err?.message ?? 'Failed to save lead changes'}`);
    }
  };

  const insertPlaceholder = (token: string) => {
    const ta = editorRefs.current[activeEditorStep];
    if (!ta) {
      setStepsForm(current => {
        const next = [...current];
        if (next[activeEditorStep]) {
          next[activeEditorStep] = { ...next[activeEditorStep], message_template: next[activeEditorStep].message_template + token };
        }
        return next;
      });
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const current = stepsForm[activeEditorStep]?.message_template ?? '';
    const updated = current.substring(0, start) + token + current.substring(end);
    setStepsForm(prev => {
      const next = [...prev];
      next[activeEditorStep] = { ...next[activeEditorStep], message_template: updated };
      return next;
    });
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const getStatusButtonProps = () => {
    switch (detail.campaign?.status) {
      case 'active':
        return { text: 'Pause Campaign', className: 'status-toggle-btn pause' };
      case 'paused':
        return { text: 'Resume Campaign', className: 'status-toggle-btn launch' };
      case 'draft':
        return { text: 'Launch Campaign', className: 'status-toggle-btn launch' };
      case 'completed':
        return { text: 'Reactivate Campaign', className: 'status-toggle-btn launch' };
      default:
        return { text: 'Launch Campaign', className: 'status-toggle-btn launch' };
    }
  };

  const statusButton = getStatusButtonProps();

  return (
    <div className="page-content">
      {/* Header Card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div>
            <div className="card-title" style={{ fontSize: 18, fontWeight: 600 }}>{detail.campaign.name}</div>
            <div className="campaign-hero-copy">{detail.campaign.description ?? 'No campaign objective written yet.'}</div>
          </div>
          <div className="btn-row">
            <span className={`badge ${detail.campaign.status === 'active' ? 'badge-active' : ''}`} style={{ fontSize: 11, padding: '4px 12px' }}>
              {detail.campaign.status}
            </span>
            <button className="btn-secondary" onClick={() => setActiveTab('settings')}>
              {isEditing ? 'Cancel Edit' : 'Edit'}
            </button>
            <button
              className="btn"
              onClick={handleDelete}
              disabled={isDeleting || togglingStatus}
              style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-danger)', borderColor: 'var(--text-danger)' }}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
            <button 
              className={statusButton.className} 
              onClick={handleStatusToggle} 
              disabled={togglingStatus}
            >
              {togglingStatus ? 'Processing...' : statusButton.text}
            </button>
          </div>
        </div>
        {statusMessage && (
          <div className={`status-callout ${statusMessage.startsWith('Error') ? 'error' : 'success'}`} style={{ marginTop: 12 }}>
            {statusMessage}
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="nav-tabs">
        <button className={`nav-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
        <button className={`nav-tab ${activeTab === 'stages' ? 'active' : ''}`} onClick={() => setActiveTab('stages')}>Stages</button>
        <button className={`nav-tab ${activeTab === 'leads' ? 'active' : ''}`} onClick={() => setActiveTab('leads')}>Leads</button>
        <button className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>Settings</button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid">
          <div className="mini-stat-grid">
            <div className="mini-stat"><div className="mini-stat-label">Scope</div><div className="mini-stat-value">{metrics.totalLeads} <span style={{fontSize: 12, color: 'var(--text-dim)'}}>users</span></div></div>
            <div className="mini-stat"><div className="mini-stat-label">Contacted</div><div className="mini-stat-value">{metrics.sent}</div></div>
            <div className="mini-stat"><div className="mini-stat-label">Replies</div><div className="mini-stat-value">{metrics.replies}</div></div>
            <div className="mini-stat"><div className="mini-stat-label">Reply rate</div><div className="mini-stat-value">{metrics.replyRate}%</div></div>
          </div>

          {/* Daily Messages Sent Chart */}
          <div className="card">
            <div className="card-title">Daily Messages Sent</div>
            <div className="card-subtitle">Messages sent per day over the last 7 days, grouped by account</div>
            
            {hasChartData ? (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 180, marginTop: 24, paddingTop: 10, borderBottom: '1px solid var(--border-soft)', position: 'relative' }}>
                  {dailyChartData.map((day, dayIdx) => (
                    <div 
                      key={dayIdx} 
                      style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', height: '100%', position: 'relative', cursor: 'pointer' }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredBar({ dayIdx, x: rect.left + rect.width / 2, y: rect.top });
                      }}
                      onMouseLeave={() => setHoveredBar(null)}
                    >
                      {/* Stacked bars per account */}
                      {chartAccountIds.map((accId, accIdx) => {
                        const count = day.accounts[accId] || 0;
                        if (count === 0) return null;
                        return (
                          <div
                            key={accId}
                            style={{
                              width: '70%',
                              maxWidth: 32,
                              height: `${(count / maxDailyValue) * 100}%`,
                              minHeight: count > 0 ? 3 : 0,
                              background: ACCOUNT_COLORS[accIdx % ACCOUNT_COLORS.length],
                              borderRadius: accIdx === 0 ? '4px 4px 0 0' : '0',
                              transition: 'height 0.3s ease',
                            }}
                          />
                        );
                      })}
                      {day.total === 0 && (
                        <div style={{ width: '70%', maxWidth: 32, height: 3, background: 'var(--border-soft)', borderRadius: 2 }} />
                      )}
                    </div>
                  ))}

                  {/* Hover tooltip */}
                  {hoveredBar !== null && (
                    <div style={{
                      position: 'fixed',
                      left: hoveredBar.x,
                      top: hoveredBar.y - 10,
                      transform: 'translate(-50%, -100%)',
                      background: 'var(--card)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 8,
                      padding: '10px 14px',
                      fontSize: 11,
                      zIndex: 100,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                      minWidth: 140,
                      pointerEvents: 'none',
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
                        {dailyChartData[hoveredBar.dayIdx].label}
                      </div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>
                        Total: {dailyChartData[hoveredBar.dayIdx].total} messages
                      </div>
                      {chartAccountIds.map((accId, accIdx) => {
                        const count = dailyChartData[hoveredBar.dayIdx].accounts[accId] || 0;
                        if (count === 0) return null;
                        const acc = accountById.get(accId);
                        return (
                          <div key={accId} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                            <div style={{ width: 8, height: 8, borderRadius: 2, background: ACCOUNT_COLORS[accIdx % ACCOUNT_COLORS.length] }} />
                            <span style={{ color: 'var(--text-dim)' }}>{acc?.label || 'Account'}: {count}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  {dailyChartData.map((day, i) => (
                    <span key={i} className="dim" style={{ fontSize: 9, flex: 1, textAlign: 'center' }}>
                      {day.label.split(',')[0]}
                    </span>
                  ))}
                </div>

                {/* Legend */}
                {chartAccountIds.length > 0 && (
                  <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
                    {chartAccountIds.map((accId, idx) => {
                      const acc = accountById.get(accId);
                      return (
                        <div key={accId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-dim)' }}>
                          <div style={{ width: 10, height: 10, borderRadius: 2, background: ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length] }} />
                          {acc?.label || 'Account'}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state" style={{ marginTop: 16 }}>
                No messages sent in the last 7 days. Launch the campaign to start seeing data here.
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">Telegram Accounts In Use</div>
            <div className="list-stack" style={{ marginTop: 12 }}>
              {metrics.assignedAccounts.length ? metrics.assignedAccounts.map((account: any) => {
                const accountLeads = (detail?.attachedLeads ?? []).filter((l: any) => l.assigned_account_id === account.id);
                const sentFromAccount = accountLeads.filter((l: any) => l.last_sent_at).length;
                const repliesFromAccount = accountLeads.filter((l: any) => l.status === 'replied').length;
                return (
                  <div key={account.id} className="metric-row">
                    <div>
                      <div>{account.label}</div>
                      <div className="dim">@{account.telegram_username} · {sentFromAccount} sent · {repliesFromAccount} replies · cap {account.daily_limit}/day</div>
                    </div>
                    <div className="metric-row-side">
                      <span className="badge">{account.is_active ? 'active' : 'paused'}</span>
                    </div>
                  </div>
                );
              }) : <div className="empty-state">No accounts assigned yet.</div>}
            </div>
          </div>
        </div>
      )}

      {/* Stages Tab */}
      {activeTab === 'stages' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className="dim" style={{ fontSize: 13 }}>Filter by account:</span>
            <select className="input" style={{ width: 220 }} value={stageFilterAccount} onChange={(e) => setStageFilterAccount(e.target.value)}>
              <option value="all">All Accounts</option>
              {metrics.assignedAccounts.map((account: any) => (
                <option key={account.id} value={account.id}>{account.label} (@{account.telegram_username})</option>
              ))}
            </select>
          </div>
          <div className="stage-board">
            {leadsByStage.map((column) => (
              <div
                key={column.status}
                className={`stage-column ${dragOverStage === column.status ? 'drag-over' : ''}`}
                onDragOver={(e) => handleDragOver(e, column.status)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, column.status)}
              >
                <div className="stage-column-head">
                  <span>{stageLabels[column.status] || column.status.replaceAll('_', ' ')}</span>
                  <span className="badge">{column.items.length}</span>
                </div>
                <div className="stage-column-body">
                  {column.items.length ? column.items.map((item: any) => {
                    const lead = leadById.get(item.lead_id);
                    const account = item.assigned_account_id ? accountById.get(item.assigned_account_id) : null;
                    const lastAction = item.last_reply_at || item.last_sent_at;
                    return (
                      <div
                        key={item.id}
                        className={`board-card ${draggingLeadId === item.id ? 'dragging' : ''}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, item.id)}
                        onDragEnd={handleDragEnd}
                      >
                        <div className="board-card-header">
                          <span className="board-card-title">{lead ? `${lead.first_name} ${lead.last_name}` : 'Lead'}</span>
                          <span className="drag-handle" title="Drag to move">⠿</span>
                        </div>
                        <div className="board-card-meta">
                          <div className="dim">{lead?.company_name ?? 'Company'} · @{lead?.telegram_username ?? 'unknown'}</div>
                          <div className="dim">Account: {account?.label ?? 'unassigned'}</div>
                          <div className="dim">Next step: {item.next_step_order ?? 'done'}</div>
                          {item.last_sent_at && <div className="dim">Sent: {formatDate(item.last_sent_at)}</div>}
                          {item.last_reply_at && <div className="dim">Replied: {formatDate(item.last_reply_at)}</div>}
                          {item.notes && <div className="dim" style={{ fontStyle: 'italic' }}>Notes: {item.notes}</div>}
                        </div>
                        {lastAction && (
                          <div className="board-card-timestamp">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10"/>
                              <path d="M12 6v6l4 2"/>
                            </svg>
                            {formatTimestamp(lastAction)}
                          </div>
                        )}
                        <div className="board-card-actions">
                          <button className="board-card-btn" onClick={(e) => { e.stopPropagation(); openLeadEdit(item); }}>
                            Edit
                          </button>
                          {item.status !== 'replied' && (
                            <button className="board-card-btn" onClick={(e) => { e.stopPropagation(); markReplied(item.id); }}>
                              Mark Replied
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }) : <div className="board-card empty" style={{ border: 'none', background: 'transparent' }}>No leads in this stage.</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Leads Tab */}
      {activeTab === 'leads' && (
        <div className="grid">
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="form-grid">
              <div className="lead-select-toolbar">
                <input className="input" style={{ flex: 1 }} placeholder="Search leads by name, company, or username" value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)} />
                <select className="select" style={{ width: 'auto', minWidth: 150 }} value={leadStageFilter} onChange={(e) => setLeadStageFilter(e.target.value)}>
                  <option value="all">All Stages</option>
                  {stageOrder.map((s) => <option key={s} value={s}>{stageLabels[s] || s.replaceAll('_', ' ')}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="table campaign-detail-table">
            <div className="table-header">
              <div>Lead</div>
              <div>Company</div>
              <div>Stage</div>
              <div>Account</div>
              <div>Last Sent</div>
              <div>Next Step</div>
            </div>
            {filteredAttachedLeads.length ? filteredAttachedLeads.map((item: any) => {
              const lead = leadById.get(item.lead_id);
              const account = item.assigned_account_id ? accountById.get(item.assigned_account_id) : null;
              return (
                <div key={item.id} className="table-row" style={{ cursor: 'pointer' }} onClick={() => openLeadEdit(item)}>
                  <div>{lead ? `${lead.first_name} ${lead.last_name}` : 'Lead'}</div>
                  <div>{lead?.company_name ?? 'Company'}</div>
                  <div><span className="badge">{stageLabels[item.status] || item.status}</span></div>
                  <div>{account?.label ?? 'Unassigned'}</div>
                  <div>{item.last_sent_at ? formatTimestamp(item.last_sent_at) : 'Not yet'}</div>
                  <div>{item.next_step_order ?? 'Done'}</div>
                </div>
              );
            }) : <div className="empty-state">No leads match the current filters.</div>}
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="grid">
          <div className="card form-grid">
            <div className="card-title" style={{ marginBottom: 12 }}>Campaign Properties</div>
            <div className="form-grid columns-2">
              <input className="input" placeholder="Campaign Name" value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} />
              <input className="input" placeholder="Timezone" value={editForm.timezone} onChange={(event) => setEditForm((current) => ({ ...current, timezone: event.target.value }))} />
              <input className="input" placeholder="Window Start" value={editForm.send_window_start} onChange={(event) => setEditForm((current) => ({ ...current, send_window_start: event.target.value }))} />
              <input className="input" placeholder="Window End" value={editForm.send_window_end} onChange={(event) => setEditForm((current) => ({ ...current, send_window_end: event.target.value }))} />
            </div>
            <div className="form-grid columns-2">
              <div className="form-grid">
                <label className="dim" style={{ fontSize: 11 }}>Start Date</label>
                <input className="input" type="date" value={editForm.start_date} onChange={(event) => setEditForm((current) => ({ ...current, start_date: event.target.value }))} />
              </div>
              <div className="form-grid">
                <label className="dim" style={{ fontSize: 11 }}>End Date</label>
                <input className="input" type="date" value={editForm.end_date} onChange={(event) => setEditForm((current) => ({ ...current, end_date: event.target.value }))} />
              </div>
            </div>
            <textarea className="textarea" placeholder="Description" value={editForm.description} onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))} />
            <div className="btn-row">
              <button className="btn" type="button" onClick={saveChanges}>Save Campaign</button>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="card-title">Sequence Editor</div>
              {hasUnsavedChanges && (
                <div className="sequence-unsaved-indicator">
                  <span className="dot" />
                  Unsaved changes
                </div>
              )}
            </div>
            
            {hasUnsavedChanges && (
              <div className="sequence-save-bar">
                <span className="dim" style={{ fontSize: 12 }}>You have unsaved changes to the sequence</span>
                <button className="btn" onClick={saveSequenceChanges} disabled={savingSteps}>
                  {savingSteps ? 'Saving...' : 'Save Sequence'}
                </button>
              </div>
            )}
            
            <div className="card-subtitle" style={{ marginTop: 8 }}>
              Click a placeholder to insert it at cursor position:
            </div>
            <div className="placeholder-pills" style={{ marginTop: 8 }}>
              {templatePlaceholders.map((p) => (
                <button key={p.token} type="button" className="placeholder-pill" onClick={() => insertPlaceholder(p.token)}>
                  {p.label}
                </button>
              ))}
            </div>

            <div className="sequence-stack" style={{ marginTop: 24 }}>
              {stepsForm.length ? stepsForm.map((step: any, idx) => {
                const randomLead = detail.attachedLeads[0] ? leadById.get(detail.attachedLeads[0].lead_id) : { first_name: 'Light', company_name: 'Stark Ind.', telegram_username: 'lightwaslost' };

                return (
                  <div key={step.id} className={`sequence-step-card ${activeEditorStep === idx ? 'active' : ''}`}>
                    <div className="sequence-step-header" onClick={() => setActiveEditorStep(idx)}>
                      <div className="sequence-step-header-left">
                        <div className="sequence-step-number">{step.step_order}</div>
                        <span style={{ fontSize: 13, color: 'var(--text)' }}>
                          {step.step_name || `Step ${step.step_order}`}
                        </span>
                      </div>
                      <div className="sequence-step-meta">
                        <span className="dim" style={{ fontSize: 11 }}>Delay {step.delay_days} day(s)</span>
                        {activeEditorStep === idx && <span className="badge" style={{ fontSize: 9 }}>editing</span>}
                      </div>
                    </div>

                    {activeEditorStep === idx && (
                      <div className="sequence-step-body">
                        <div className="editor-wrapper">
                          <div className="editor-pane">
                            <textarea
                              className="message-input"
                              ref={(el) => { editorRefs.current[idx] = el; }}
                              value={step.message_template}
                              onFocus={() => setActiveEditorStep(idx)}
                              onChange={(e) => {
                                setStepsForm(current => {
                                  const next = [...current];
                                  next[idx] = { ...next[idx], message_template: e.target.value };
                                  return next;
                                });
                              }}
                              placeholder="Type your message here..."
                            />
                          </div>

                          <div className="preview-pane">
                            <div className="preview-header">
                              <div className="preview-avatar">L</div>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Light ✨ ✓</div>
                                <div className="dim" style={{ fontSize: 11 }}>@lightwaslost</div>
                              </div>
                            </div>
                            <div className="preview-bubble">
                              {renderMessageTemplate(step.message_template, randomLead)}
                            </div>
                            <div className="preview-time">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} ✓</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }) : <div className="empty-state">No sequence steps have been created for this campaign yet.</div>}
            </div>
          </div>
        </div>
      )}

      {/* Lead Edit Modal */}
      {editingLead && (
        <div className="edit-lead-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditingLead(null); }}>
          <div className="edit-lead-modal">
            <div className="card-title" style={{ marginBottom: 16 }}>Edit Lead Progress</div>
            <div className="form-grid">
              <div className="form-grid">
                <label className="dim" style={{ fontSize: 11 }}>Status</label>
                <select 
                  className="select" 
                  value={leadEditForm.status} 
                  onChange={(e) => setLeadEditForm(f => ({ ...f, status: e.target.value }))}
                >
                  {stageOrder.map(s => <option key={s} value={s}>{stageLabels[s] || s.replaceAll('_', ' ')}</option>)}
                </select>
              </div>
              <div className="form-grid">
                <label className="dim" style={{ fontSize: 11 }}>Next Step Order</label>
                <input 
                  className="input" 
                  type="number" 
                  min={1}
                  value={leadEditForm.next_step_order} 
                  onChange={(e) => setLeadEditForm(f => ({ ...f, next_step_order: Number(e.target.value) }))} 
                />
              </div>
              <div className="form-grid">
                <label className="dim" style={{ fontSize: 11 }}>Notes</label>
                <textarea 
                  className="textarea" 
                  style={{ minHeight: 80 }}
                  value={leadEditForm.notes} 
                  onChange={(e) => setLeadEditForm(f => ({ ...f, notes: e.target.value }))} 
                  placeholder="Add notes about this lead..."
                />
              </div>
            </div>
            <div className="btn-row" style={{ marginTop: 20 }}>
              <button className="btn" onClick={saveLeadChanges}>
                Save Changes
              </button>
              <button className="btn-secondary" onClick={() => setEditingLead(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
