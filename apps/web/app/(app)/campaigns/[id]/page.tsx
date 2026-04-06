'use client';

import { useEffect, useId, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchJson } from '@/lib/web/fetch-json';
import { type Account, type CampaignDetail, type Lead, summariseCampaign } from '@/lib/web/insights';
import { CustomSelect } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Kolkata',        label: 'IST — India Standard Time (UTC+5:30)' },
  { value: 'UTC',                 label: 'UTC — Coordinated Universal Time' },
  { value: 'America/New_York',    label: 'EST/EDT — New York (UTC−5/−4)' },
  { value: 'America/Chicago',     label: 'CST/CDT — Chicago (UTC−6/−5)' },
  { value: 'America/Denver',      label: 'MST/MDT — Denver (UTC−7/−6)' },
  { value: 'America/Los_Angeles', label: 'PST/PDT — Los Angeles (UTC−8/−7)' },
  { value: 'America/Sao_Paulo',   label: 'BRT — São Paulo (UTC−3)' },
  { value: 'Europe/London',       label: 'GMT/BST — London (UTC+0/+1)' },
  { value: 'Europe/Paris',        label: 'CET/CEST — Paris (UTC+1/+2)' },
  { value: 'Europe/Berlin',       label: 'CET/CEST — Berlin (UTC+1/+2)' },
  { value: 'Asia/Dubai',          label: 'GST — Dubai (UTC+4)' },
  { value: 'Asia/Singapore',      label: 'SGT — Singapore (UTC+8)' },
  { value: 'Asia/Shanghai',       label: 'CST — Shanghai (UTC+8)' },
  { value: 'Asia/Tokyo',          label: 'JST — Tokyo (UTC+9)' },
  { value: 'Australia/Sydney',    label: 'AEST/AEDT — Sydney (UTC+10/+11)' },
];

// Virtual stage IDs
const STATIC_STAGES_BEFORE = ['queued', 'due'] as const;
const STATIC_STAGES_AFTER = ['replied', 'meeting_scheduled', 'blocked', 'call_in_future', 'skipped', 'completed'] as const;

const BASE_STAGE_LABELS: Record<string, string> = {
  queued: 'Queued',
  due: 'Due',
  replied: 'Replied',
  meeting_scheduled: 'Meeting Scheduled',
  blocked: 'Blocked',
  call_in_future: 'Call in Future',
  skipped: 'Skipped',
  completed: 'Completed',
  // legacy fallbacks
  sent_waiting_followup: 'Sent — Waiting FU 1',
  first_followup_done: 'FU 1 Done',
};

function getStageLabel(stage: string): string {
  if (BASE_STAGE_LABELS[stage]) return BASE_STAGE_LABELS[stage];
  const vfuMatch = stage.match(/^vfu_(\d+)$/);
  if (vfuMatch) {
    const n = parseInt(vfuMatch[1]);
    if (n === 1) return 'Sent — Waiting FU 1';
    return `FU ${n - 1} Sent — Waiting FU ${n}`;
  }
  return stage.replaceAll('_', ' ');
}

// Stage icons as SVG path data
const stageIcons: Record<string, { path: string; color: string }> = {
  queued: { color: '#6b7280', path: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  due: { color: '#f59e0b', path: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
  vfu_1: { color: '#6366f1', path: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8' },
  vfu_2: { color: '#8b5cf6', path: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  vfu_3: { color: '#a78bfa', path: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  vfu_4: { color: '#c4b5fd', path: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  replied: { color: '#10b981', path: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  meeting_scheduled: { color: '#3b82f6', path: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  blocked: { color: '#ef4444', path: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' },
  call_in_future: { color: '#f97316', path: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z' },
  skipped: { color: '#6b7280', path: 'M13 5l7 7-7 7M5 5l7 7-7 7' },
  completed: { color: '#22c55e', path: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
};

function StageIcon({ stage }: { stage: string }) {
  // For dynamic vfu_N stages beyond what's hardcoded, fall back to vfu_4 icon style
  const vfuMatch = !stageIcons[stage] && stage.match(/^vfu_(\d+)$/);
  const icon = stageIcons[stage] ?? (vfuMatch ? { color: '#a78bfa', path: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' } : null);
  if (!icon) return null;
  return (
    <div className="stage-icon" style={{ color: icon.color }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={icon.path} />
      </svg>
    </div>
  );
}

const templatePlaceholders = [
  { label: 'First Name', token: '{First Name}', color: '#6366f1' },
  { label: 'Last Name', token: '{Last Name}', color: '#ec4899' },
  { label: 'Company', token: '{Company}', color: '#f59e0b' },
  { label: 'Telegram Username', token: '{Telegram Username}', color: '#14b8a6' },
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

const ACCOUNT_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];

function AccountPill({ account, colorIndex }: { account: Account | null | undefined; colorIndex: number }) {
  if (!account) return <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>Unassigned</span>;
  const color = ACCOUNT_COLORS[colorIndex % ACCOUNT_COLORS.length];
  return (
    <span className="account-pill" style={{
      background: `${color}20`,
      color,
      border: `1px solid ${color}40`,
    }}>
      {account.label}
    </span>
  );
}

// Map a lead's actual status + next_step_order to a virtual stage ID
function getVirtualStage(item: any): string {
  if (item.status === 'sent_waiting_followup' || item.status === 'first_followup_done') {
    // current_step_order tells us which step was last sent → vfu_N
    const sent = item.current_step_order ?? (item.status === 'sent_waiting_followup' ? 1 : 2);
    return `vfu_${sent}`;
  }
  return item.status;
}

// Map a virtual stage back to real DB patch values
function patchForVirtualStage(virtualStage: string, totalSteps: number): Record<string, unknown> {
  const vfuMatch = virtualStage.match(/^vfu_(\d+)$/);
  if (vfuMatch) {
    const stepSent = parseInt(vfuMatch[1]);
    const nextStepOrder = stepSent + 1;
    return {
      status: stepSent === 1 ? 'sent_waiting_followup' : 'first_followup_done',
      current_step_order: stepSent,
      next_step_order: nextStepOrder <= totalSteps ? nextStepOrder : null,
    };
  }
  if (virtualStage === 'replied') return { status: 'replied', last_reply_at: new Date().toISOString() };
  return { status: virtualStage };
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const campaignId = params.id;
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [stepsForm, setStepsForm] = useState<any[]>([]);
  const [originalSteps, setOriginalSteps] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'stages' | 'leads' | 'settings'>('overview');
  const [stageView, setStageView] = useState<'board' | 'table'>('board');
  const [stageFilterAccount, setStageFilterAccount] = useState('all');
  const [leadSearch, setLeadSearch] = useState('');
  const [leadStageFilter, setLeadStageFilter] = useState('all');
  const [leadCompanyFilter, setLeadCompanyFilter] = useState('all');
  const [leadAccountFilter, setLeadAccountFilter] = useState('all');
  const [activeEditorStep, setActiveEditorStep] = useState(0);
  const editorRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const [savingSteps, setSavingSteps] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [runningScheduler, setRunningScheduler] = useState(false);
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
  const [editingLead, setEditingLead] = useState<any>(null);
  const [leadEditForm, setLeadEditForm] = useState({ status: '', notes: '', next_step_order: 1 });
  const [trackerSaving, setTrackerSaving] = useState(false);
  const [trackerDoneIds, setTrackerDoneIds] = useState<Set<string>>(new Set());
  const [inlineNoteItem, setInlineNoteItem] = useState<string | null>(null);
  const [inlineNoteText, setInlineNoteText] = useState('');

  // ── Add More Leads state ─────────────────────────────────────────
  const [addLeadsMethod, setAddLeadsMethod] = useState<'upload' | 'tag'>('upload');
  const [addLeadsFile, setAddLeadsFile] = useState<File | null>(null);
  const [addLeadsExtraTags, setAddLeadsExtraTags] = useState('');
  const [addLeadsTag, setAddLeadsTag] = useState('');
  const [addLeadsLoading, setAddLeadsLoading] = useState(false);
  const [addLeadsResult, setAddLeadsResult] = useState<{ msg: string; ok: boolean } | null>(null);
  const [allLeadTags, setAllLeadTags] = useState<string[]>([]);
  const addLeadsFileRef = useRef<HTMLInputElement>(null);

  // Fetch available tags when the "From Tag" method is selected
  useEffect(() => {
    if (addLeadsMethod !== 'tag') return;
    fetchJson<{ leads: { tags: string[] }[] }>('/api/leads').then((res) => {
      const t = new Set<string>();
      res.leads?.forEach((l: any) => l.tags?.forEach((tag: string) => t.add(tag)));
      setAllLeadTags(Array.from(t).sort());
    }).catch(() => {});
  }, [addLeadsMethod]);

  const handleAddLeads = async () => {
    setAddLeadsLoading(true);
    setAddLeadsResult(null);
    try {
      if (addLeadsMethod === 'upload') {
        if (!addLeadsFile) return;
        const fd = new FormData();
        fd.append('file', addLeadsFile);
        if (addLeadsExtraTags.trim()) fd.append('tags', addLeadsExtraTags.trim());
        const res = await fetchJson<{
          imported: number; added_to_campaign: number; already_in_campaign: number; error?: string;
        }>(`/api/campaigns/${campaignId}/add-leads`, { method: 'POST', body: fd });
        if (res.error) throw new Error(res.error);
        setAddLeadsResult({
          ok: true,
          msg: `${res.imported} leads imported — ${res.added_to_campaign} added to campaign, ${res.already_in_campaign} already present.`,
        });
        setAddLeadsFile(null);
        setAddLeadsExtraTags('');
      } else {
        if (!addLeadsTag) return;
        const res = await fetchJson<{
          matched: number; added_to_campaign: number; already_in_campaign: number; error?: string;
        }>(`/api/campaigns/${campaignId}/add-leads`, {
          method: 'POST',
          body: JSON.stringify({ tag: addLeadsTag }),
        });
        if (res.error) throw new Error(res.error);
        setAddLeadsResult({
          ok: true,
          msg: `${res.matched} leads matched "${addLeadsTag}" — ${res.added_to_campaign} added to campaign, ${res.already_in_campaign} already present.`,
        });
      }
      void load();
    } catch (e: any) {
      setAddLeadsResult({ ok: false, msg: e.message || 'Failed to add leads.' });
    }
    setAddLeadsLoading(false);
  };

  const load = useCallback(async () => {
    const [response, btData] = await Promise.all([
      fetchJson<CampaignDetail>(`/api/campaigns/${campaignId}`),
      fetchJson<{ entries: any[] }>('/api/business-tracker'),
    ]);
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
    // Restore "added to BT" state from existing entries
    const btLeadIds = new Set(
      (btData.entries ?? [])
        .filter((e: any) => e.campaign_id === campaignId && e.lead_id)
        .map((e: any) => e.lead_id)
    );
    const doneIds = new Set<string>(
      (response.attachedLeads ?? [])
        .filter((item: any) => btLeadIds.has(item.lead_id))
        .map((item: any) => item.id)
    );
    setTrackerDoneIds(doneIds);
  }, [campaignId]);

  useEffect(() => { if (campaignId) void load(); }, [campaignId, load]);

  useEffect(() => {
    const current = JSON.stringify(stepsForm);
    const original = JSON.stringify(originalSteps);
    setHasUnsavedChanges(current !== original);
  }, [stepsForm, originalSteps]);

  const metrics = useMemo(() => (detail ? summariseCampaign(detail) : null), [detail]);
  const leadById = useMemo(() => new Map<string, Lead>((detail?.leads ?? []).map((l) => [l.id, l])), [detail?.leads]);
  const accountById = useMemo(() => new Map<string, Account>((detail?.accounts ?? []).map((a) => [a.id, a])), [detail?.accounts]);

  // Build account color index map
  const accountColorIndex = useMemo(() => {
    const map = new Map<string, number>();
    (detail?.accounts ?? []).forEach((acc, idx) => map.set(acc.id, idx));
    return map;
  }, [detail?.accounts]);

  // Determine follow-up count from steps — one vfu column per step except the last
  const followUpCount = useMemo(() => Math.max((detail?.steps?.length ?? 1) - 1, 1), [detail?.steps]);

  // Build dynamic stage order
  const dynamicStageOrder = useMemo(() => {
    const fuStages = Array.from({ length: followUpCount }, (_, i) => `vfu_${i + 1}`);
    return [...STATIC_STAGES_BEFORE, ...fuStages, ...STATIC_STAGES_AFTER];
  }, [followUpCount]);

  const leadsByStage = useMemo(() => {
    return dynamicStageOrder.map((virtualStage) => ({
      status: virtualStage,
      items: (detail?.attachedLeads ?? []).filter((item: any) => {
        const vs = getVirtualStage(item);
        if (vs !== virtualStage) return false;
        if (stageFilterAccount !== 'all' && item.assigned_account_id !== stageFilterAccount) return false;
        return true;
      }),
    }));
  }, [detail?.attachedLeads, stageFilterAccount, dynamicStageOrder]);

  const filteredAttachedLeads = useMemo(() => {
    return (detail?.attachedLeads ?? []).filter((item: any) => {
      const lead = leadById.get(item.lead_id);
      const virtualStage = getVirtualStage(item);
      const matchesStage = leadStageFilter === 'all' || virtualStage === leadStageFilter || item.status === leadStageFilter;
      const matchesSearch = !leadSearch.trim() || [
        lead?.first_name, lead?.last_name, lead?.company_name, lead?.telegram_username,
      ].join(' ').toLowerCase().includes(leadSearch.trim().toLowerCase());
      const matchesCompany = leadCompanyFilter === 'all' || lead?.company_name === leadCompanyFilter;
      const matchesAccount = leadAccountFilter === 'all' || item.assigned_account_id === leadAccountFilter;
      return matchesStage && matchesSearch && matchesCompany && matchesAccount;
    });
  }, [detail?.attachedLeads, leadById, leadStageFilter, leadSearch, leadCompanyFilter, leadAccountFilter]);

  // Daily messages sent chart (last 7 days)
  const dailyChartData = useMemo(() => {
    const days: { label: string; iso: string; accounts: Record<string, number>; total: number }[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      days.push({ label: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), iso, accounts: {}, total: 0 });
    }
    detail?.attachedLeads?.forEach((lead: any) => {
      const accountId = lead.assigned_account_id;
      if (!accountId) return;
      const events = lead.step_events || [];
      events.forEach((evt: any) => {
        if (evt.event === 'sent' || evt.event === 'followup_sent') {
          const eventIso = evt.at?.slice(0, 10);
          const day = days.find(d => d.iso === eventIso);
          if (day) { day.accounts[accountId] = (day.accounts[accountId] || 0) + 1; day.total++; }
        }
      });
      if (events.length === 0 && lead.last_sent_at) {
        const sentIso = lead.last_sent_at.slice(0, 10);
        const day = days.find(d => d.iso === sentIso);
        if (day) { day.accounts[accountId] = (day.accounts[accountId] || 0) + 1; day.total++; }
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
      } else {
        await fetchJson(`/api/campaigns/${campaignId}/launch`, { method: 'POST' });
      }
      await load();
    } catch (err: any) {
      setStatusMessage(`Error: ${err?.message ?? 'Failed to change status'}`);
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleRunScheduler = async () => {
    setRunningScheduler(true);
    try {
      await fetchJson('/api/scheduler/run', { method: 'POST' });
      await load();
    } catch (err: any) {
      setStatusMessage(`Scheduler error: ${err?.message ?? 'Failed'}`);
    } finally {
      setRunningScheduler(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this campaign? This cannot be undone.')) return;
    setIsDeleting(true);
    try {
      await fetchJson(`/api/campaigns/${campaignId}`, { method: 'DELETE' });
      router.push('/campaigns');
    } catch (err: any) {
      setStatusMessage(`Error: ${err?.message ?? 'Failed to delete'}`);
      setIsDeleting(false);
    }
  };

  const saveChanges = async () => {
    try {
      await fetchJson(`/api/campaigns/${campaignId}`, { method: 'PATCH', body: JSON.stringify(editForm) });
      setIsEditing(false);
      setStatusMessage('Saved.');
      await load();
    } catch (err: any) {
      setStatusMessage(`Error: ${err?.message ?? 'Failed to save'}`);
    }
  };

  const saveSequenceChanges = async () => {
    setSavingSteps(true);
    try {
      for (const step of stepsForm) {
        await fetchJson(`/api/campaigns/${campaignId}/steps/${step.id}`, { method: 'PATCH', body: JSON.stringify({ message_template: step.message_template }) });
      }
      setOriginalSteps(JSON.parse(JSON.stringify(stepsForm)));
      setHasUnsavedChanges(false);
      setStatusMessage('Sequence saved.');
    } catch (err: any) {
      setStatusMessage(`Error: ${err?.message ?? 'Failed to save'}`);
    }
    setSavingSteps(false);
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

  const handleDragLeave = () => setDragOverStage(null);

  const handleDrop = async (e: React.DragEvent, targetVirtualStage: string) => {
    e.preventDefault();
    setDragOverStage(null);
    const leadId = e.dataTransfer.getData('text/plain');
    setDraggingLeadId(null);
    if (!leadId) return;
    const item = detail?.attachedLeads?.find((l: any) => l.id === leadId);
    if (!item) return;
    const currentVS = getVirtualStage(item);
    if (currentVS === targetVirtualStage) return;
    const patch = patchForVirtualStage(targetVirtualStage, detail?.steps?.length ?? 2);
    try {
      await fetchJson(`/api/campaigns/${campaignId}/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify(patch) });
      await load();
    } catch (err: any) {
      setStatusMessage(`Error: ${err?.message ?? 'Failed to move lead'}`);
    }
  };

  const handleDragEnd = () => { setDraggingLeadId(null); setDragOverStage(null); };

  const openLeadEdit = (item: any) => {
    setEditingLead(item);
    setLeadEditForm({ status: item.status, notes: item.notes || '', next_step_order: item.next_step_order || 1 });
  };

  const saveLeadChanges = async () => {
    if (!editingLead) return;
    try {
      await fetchJson(`/api/campaigns/${campaignId}/leads/${editingLead.id}`, { method: 'PATCH', body: JSON.stringify(leadEditForm) });
      setEditingLead(null);
      await load();
    } catch (err: any) {
      setStatusMessage(`Error: ${err?.message ?? 'Failed to save'}`);
    }
  };

  const saveInlineNote = async (itemId: string) => {
    try {
      await fetchJson(`/api/campaigns/${campaignId}/leads/${itemId}`, { method: 'PATCH', body: JSON.stringify({ notes: inlineNoteText }) });
      setInlineNoteItem(null);
      await load();
    } catch (err: any) {
      setStatusMessage(`Error: ${err?.message ?? 'Failed to save note'}`);
    }
  };

  const sendToBusinessTracker = async (item: any) => {
    if (trackerDoneIds.has(item.id)) return;
    const lead = leadById.get(item.lead_id);
    if (!lead) return;
    setTrackerSaving(true);
    try {
      const res = await fetchJson<any>('/api/business-tracker', {
        method: 'POST',
        body: JSON.stringify({
          company_name: lead.company_name || `${lead.first_name} ${lead.last_name}`,
          lead_id: item.lead_id,
          campaign_id: campaignId,
          account_id: item.assigned_account_id,
          current_status: 'Opportunity',
          comments: item.notes || '',
        }),
      });
      if (res?.error) throw new Error(res.error);
      setTrackerDoneIds(prev => new Set([...prev, item.id]));
    } catch (err: any) {
      setStatusMessage(`Error adding to Business Tracker: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setTrackerSaving(false);
    }
  };

  const insertPlaceholder = (token: string) => {
    const ta = editorRefs.current[activeEditorStep];
    if (!ta) {
      setStepsForm(current => { const next = [...current]; if (next[activeEditorStep]) { next[activeEditorStep] = { ...next[activeEditorStep], message_template: next[activeEditorStep].message_template + token }; } return next; });
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const current = stepsForm[activeEditorStep]?.message_template ?? '';
    const updated = current.substring(0, start) + token + current.substring(end);
    setStepsForm(prev => { const next = [...prev]; next[activeEditorStep] = { ...next[activeEditorStep], message_template: updated }; return next; });
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + token.length, start + token.length); });
  };

  const getStatusButtonProps = () => {
    switch (detail.campaign?.status) {
      case 'active': return { text: 'Pause Campaign', className: 'status-toggle-btn pause' };
      case 'paused': return { text: 'Resume Campaign', className: 'status-toggle-btn launch' };
      case 'draft': return { text: 'Launch Campaign', className: 'status-toggle-btn launch' };
      case 'completed': return { text: 'Reactivate Campaign', className: 'status-toggle-btn launch' };
      default: return { text: 'Launch Campaign', className: 'status-toggle-btn launch' };
    }
  };

  const statusButton = getStatusButtonProps();

  const statusColor: Record<string, string> = {
    active: '#22c55e', paused: '#f97316', draft: 'var(--text-dim)', completed: '#3b82f6',
  };
  const sColor = statusColor[detail.campaign.status ?? 'draft'] ?? 'var(--text-dim)';

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{detail.campaign.name}</h1>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 3,
              background: `${sColor}18`, color: sColor, border: `1px solid ${sColor}40`,
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>{detail.campaign.status}</span>
          </div>
          {detail.campaign.description && (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 5 }}>{detail.campaign.description}</div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            className="board-card-btn"
            onClick={() => setActiveTab('settings')}
            title="Settings"
            style={{ padding: '6px 8px' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          </button>
          <button
            className="board-card-btn"
            onClick={handleDelete}
            disabled={isDeleting || togglingStatus}
            title="Delete campaign"
            style={{ padding: '6px 8px', color: '#ef4444' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
          <button
            className="board-card-btn"
            onClick={handleStatusToggle}
            disabled={togglingStatus}
            title={statusButton.text}
            style={{ padding: '6px 8px', color: detail.campaign.status === 'active' ? '#f97316' : '#22c55e' }}
          >
            {detail.campaign.status === 'active' ? (
              /* Pause icon */
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
            ) : (
              /* Play icon */
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            )}
          </button>
        </div>
      </div>
      {statusMessage && (
        <div className={`status-callout ${statusMessage.startsWith('Error') ? 'error' : 'success'}`} style={{ marginBottom: 16 }}>
          {statusMessage}
        </div>
      )}

      {/* Tabs */}
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

          <div className="card">
            <div className="card-title">Daily Messages Sent</div>
            <div className="card-subtitle">Messages sent per day over the last 7 days, grouped by account</div>
            {hasChartData ? (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 180, marginTop: 24, paddingTop: 10, borderBottom: '1px solid var(--border-soft)', position: 'relative' }}>
                  {dailyChartData.map((day, dayIdx) => (
                    <div key={dayIdx} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', height: '100%', position: 'relative', cursor: 'pointer' }}
                      onMouseEnter={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setHoveredBar({ dayIdx, x: rect.left + rect.width / 2, y: rect.top }); }}
                      onMouseLeave={() => setHoveredBar(null)}>
                      {chartAccountIds.map((accId, accIdx) => {
                        const count = day.accounts[accId] || 0;
                        if (count === 0) return null;
                        return <div key={accId} style={{ width: '70%', maxWidth: 32, height: `${(count / maxDailyValue) * 100}%`, minHeight: count > 0 ? 3 : 0, background: ACCOUNT_COLORS[accIdx % ACCOUNT_COLORS.length], borderRadius: accIdx === 0 ? '4px 4px 0 0' : '0', transition: 'height 0.3s ease' }} />;
                      })}
                      {day.total === 0 && <div style={{ width: '70%', maxWidth: 32, height: 3, background: 'var(--border-soft)', borderRadius: 2 }} />}
                    </div>
                  ))}
                  {hoveredBar !== null && (
                    <div style={{ position: 'fixed', left: hoveredBar.x, top: hoveredBar.y - 10, transform: 'translate(-50%, -100%)', background: 'var(--card)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '10px 14px', fontSize: 11, zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', minWidth: 140, pointerEvents: 'none' }}>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>{dailyChartData[hoveredBar.dayIdx].label}</div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>Total: {dailyChartData[hoveredBar.dayIdx].total}</div>
                      {chartAccountIds.map((accId, accIdx) => { const count = dailyChartData[hoveredBar.dayIdx].accounts[accId] || 0; if (count === 0) return null; const acc = accountById.get(accId); return <div key={accId} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: ACCOUNT_COLORS[accIdx % ACCOUNT_COLORS.length] }} /><span style={{ color: 'var(--text-dim)' }}>{acc?.label || 'Account'}: {count}</span></div>; })}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  {dailyChartData.map((day, i) => <span key={i} className="dim" style={{ fontSize: 9, flex: 1, textAlign: 'center' }}>{day.label.split(',')[0]}</span>)}
                </div>
                {chartAccountIds.length > 0 && (
                  <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
                    {chartAccountIds.map((accId, idx) => { const acc = accountById.get(accId); return <div key={accId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-dim)' }}><div style={{ width: 10, height: 10, borderRadius: 2, background: ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length] }} />{acc?.label || 'Account'}</div>; })}
                  </div>
                )}
              </>
            ) : <div className="empty-state" style={{ marginTop: 16 }}>No messages sent in the last 7 days.</div>}
          </div>

          <div className="card">
            <div className="card-title">Telegram Accounts In Use</div>
            <div className="list-stack" style={{ marginTop: 12 }}>
              {metrics.assignedAccounts.length ? metrics.assignedAccounts.map((account: any, idx: number) => {
                const accountLeads = (detail?.attachedLeads ?? []).filter((l: any) => l.assigned_account_id === account.id);
                const sentFromAccount = accountLeads.filter((l: any) => l.last_sent_at).length;
                const repliesFromAccount = accountLeads.filter((l: any) => l.status === 'replied').length;
                const campaignAssignment = (detail?.accountAssignments ?? []).find((a: any) => a.telegram_account_id === account.id);
                const campaignLimit = campaignAssignment?.message_limit ?? null;
                const capLabel = campaignLimit !== null
                  ? `campaign cap ${campaignLimit}/day (global ${account.daily_limit})`
                  : `cap ${account.daily_limit}/day`;
                return (
                  <div key={account.id} className="metric-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <AccountPill account={account} colorIndex={idx} />
                      <div className="dim">@{account.telegram_username} · {sentFromAccount} sent · {repliesFromAccount} replies · {capLabel}</div>
                    </div>
                    <span className="badge">{account.is_active ? 'active' : 'paused'}</span>
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
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <CustomSelect style={{ width: 220 }} value={stageFilterAccount} onChange={setStageFilterAccount} options={[{ value: 'all', label: 'All Accounts' }, ...metrics.assignedAccounts.map((a: any) => ({ value: a.id, label: `${a.label} (@${a.telegram_username})` }))]} />
            <div className="view-toggle">
              <button className={`view-toggle-btn ${stageView === 'board' ? 'active' : ''}`} onClick={() => setStageView('board')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="11" rx="1"/><rect x="14" y="17" width="7" height="4" rx="1"/></svg>
                Board
              </button>
              <button className={`view-toggle-btn ${stageView === 'table' ? 'active' : ''}`} onClick={() => setStageView('table')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10h18M3 14h18M10 3v18"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                Table
              </button>
            </div>
            <button
              onClick={handleRunScheduler}
              disabled={runningScheduler}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', fontSize: 11, cursor: runningScheduler ? 'not-allowed' : 'pointer',
                background: 'var(--panel-alt)', border: '1px solid var(--border-soft)',
                borderRadius: 4, color: runningScheduler ? 'var(--text-dim)' : 'var(--text)',
                fontFamily: 'inherit', opacity: runningScheduler ? 0.6 : 1, transition: 'opacity 0.15s',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
              </svg>
              {runningScheduler ? 'Running…' : 'Run Scheduler'}
            </button>
          </div>

          {stageView === 'board' ? (
            <div className="stage-board">
              {leadsByStage.map((column) => (
                <div key={column.status} className={`stage-column ${dragOverStage === column.status ? 'drag-over' : ''}`}
                  onDragOver={(e) => handleDragOver(e, column.status)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, column.status)}>
                  <div className="stage-column-head">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <StageIcon stage={column.status} />
                      <span>{getStageLabel(column.status)}</span>
                    </div>
                    <span className="badge">{column.items.length}</span>
                  </div>
                  <div className="stage-column-body">
                    {column.items.length ? column.items.map((item: any) => {
                      const lead = leadById.get(item.lead_id);
                      const account = item.assigned_account_id ? accountById.get(item.assigned_account_id) : null;
                      const colorIdx = item.assigned_account_id ? (accountColorIndex.get(item.assigned_account_id) ?? 0) : 0;
                      const lastAction = item.last_reply_at || item.last_sent_at;
                      const isInlineNote = inlineNoteItem === item.id;
                      return (
                        <div key={item.id} className={`board-card ${draggingLeadId === item.id ? 'dragging' : ''}`}
                          draggable onDragStart={(e) => handleDragStart(e, item.id)} onDragEnd={handleDragEnd}>
                          <div className="board-card-header">
                            <span className="board-card-title">{lead ? `${lead.first_name} ${lead.last_name}` : 'Lead'}</span>
                            <span className="drag-handle" title="Drag to move">⠿</span>
                          </div>
                          <div className="board-card-meta">
                            <div className="dim">{lead?.company_name ?? 'Company'} · @{lead?.telegram_username ?? 'unknown'}</div>
                            <div style={{ marginTop: 2 }}><AccountPill account={account} colorIndex={colorIdx} /></div>
                            {item.last_sent_at && <div className="dim">Sent: {formatDate(item.last_sent_at)}</div>}
                            {item.last_reply_at && <div className="dim">Replied: {formatDate(item.last_reply_at)}</div>}
                            {item.next_step_order && <div className="dim">Next step: {item.next_step_order}</div>}
                          </div>
                          {item.notes ? (
                            <div className="board-card-comment" onClick={() => { setInlineNoteItem(item.id); setInlineNoteText(item.notes || ''); }}>
                              {item.notes}
                            </div>
                          ) : (
                            <button className="board-card-note-btn" onClick={() => { setInlineNoteItem(item.id); setInlineNoteText(''); }}>
                              + Add note
                            </button>
                          )}
                          {isInlineNote && (
                            <div style={{ display: 'grid', gap: 6 }}>
                              <textarea
                                className="textarea"
                                style={{ minHeight: 60, fontSize: 11 }}
                                value={inlineNoteText}
                                onChange={e => setInlineNoteText(e.target.value)}
                                placeholder="Add a note..."
                                autoFocus
                              />
                              <div className="btn-row">
                                <button className="board-card-btn" onClick={() => saveInlineNote(item.id)}>Save</button>
                                <button className="board-card-btn" onClick={() => setInlineNoteItem(null)}>Cancel</button>
                              </div>
                            </div>
                          )}
                          {lastAction && (
                            <div className="board-card-timestamp">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                              {formatTimestamp(lastAction)}
                            </div>
                          )}
                          <div className="board-card-actions">
                            <button className="board-card-btn" onClick={(e) => { e.stopPropagation(); openLeadEdit(item); }}>Edit</button>
                            <button className="board-card-btn" onClick={(e) => { e.stopPropagation(); sendToBusinessTracker(item); }} disabled={trackerDoneIds.has(item.id)}>
                              {trackerDoneIds.has(item.id) ? '✓ Added' : '+ Business Tracker'}
                            </button>
                          </div>
                        </div>
                      );
                    }) : <div className="board-card empty" style={{ border: 'none', background: 'transparent' }}>No leads in this stage.</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Table view */
            <div className="table campaign-detail-table">
              <div className="table-header">
                <div>Lead</div>
                <div>Company</div>
                <div>Stage</div>
                <div>Account</div>
                <div>Last Sent</div>
                <div>Next Step</div>
              </div>
              {(detail?.attachedLeads ?? [])
                .filter((item: any) => stageFilterAccount === 'all' || item.assigned_account_id === stageFilterAccount)
                .map((item: any) => {
                  const lead = leadById.get(item.lead_id);
                  const account = item.assigned_account_id ? accountById.get(item.assigned_account_id) : null;
                  const colorIdx = item.assigned_account_id ? (accountColorIndex.get(item.assigned_account_id) ?? 0) : 0;
                  const vs = getVirtualStage(item);
                  return (
                    <div key={item.id} className="table-row" style={{ cursor: 'pointer' }} onClick={() => openLeadEdit(item)}>
                      <div>{lead ? `${lead.first_name} ${lead.last_name}` : 'Lead'}</div>
                      <div>{lead?.company_name ?? 'Company'}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <StageIcon stage={vs} />
                        <span style={{ fontSize: 11 }}>{getStageLabel(vs)}</span>
                      </div>
                      <div><AccountPill account={account} colorIndex={colorIdx} /></div>
                      <div>{item.last_sent_at ? formatTimestamp(item.last_sent_at) : '—'}</div>
                      <div>{item.next_step_order ?? 'Done'}</div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Leads Tab */}
      {activeTab === 'leads' && (
        <div className="grid">
          <div className="card" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="input" style={{ flex: 1, minWidth: 0 }} placeholder="Search leads..." value={leadSearch} onChange={(e) => setLeadSearch(e.target.value)} />
              <CustomSelect
                style={{ width: 150, flexShrink: 0 }}
                value={leadCompanyFilter}
                onChange={setLeadCompanyFilter}
                options={[{ value: 'all', label: 'All Companies' }, ...([...new Set((detail?.leads ?? []).map((l) => l.company_name).filter(Boolean))].map(c => ({ value: c, label: c })))]}
              />
              <CustomSelect
                style={{ width: 140, flexShrink: 0 }}
                value={leadAccountFilter}
                onChange={setLeadAccountFilter}
                options={[{ value: 'all', label: 'All Accounts' }, ...(detail?.accounts ?? []).map(a => ({ value: a.id, label: a.label }))]}
              />
              <CustomSelect
                style={{ width: 140, flexShrink: 0 }}
                value={leadStageFilter}
                onChange={setLeadStageFilter}
                options={[{ value: 'all', label: 'All Stages' }, ...dynamicStageOrder.map(s => ({ value: s, label: getStageLabel(s) }))]}
              />
            </div>
          </div>
          <div className="table campaign-leads-table">
            <div className="table-header">
              <div>Lead</div>
              <div>Company</div>
              <div>Account</div>
            </div>
            {filteredAttachedLeads.length ? filteredAttachedLeads.map((item: any) => {
              const lead = leadById.get(item.lead_id);
              const account = item.assigned_account_id ? accountById.get(item.assigned_account_id) : null;
              const colorIdx = item.assigned_account_id ? (accountColorIndex.get(item.assigned_account_id) ?? 0) : 0;
              return (
                <div key={item.id} className="table-row" style={{ cursor: 'pointer' }} onClick={() => openLeadEdit(item)}>
                  <div>
                    <div>{lead ? `${lead.first_name} ${lead.last_name}` : 'Lead'}</div>
                    <div className="dim" style={{ fontSize: 11 }}>@{lead?.telegram_username}</div>
                  </div>
                  <div>{lead?.company_name ?? '—'}</div>
                  <div><AccountPill account={account} colorIndex={colorIdx} /></div>
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
            <div className="form-grid">
              <input className="input" placeholder="Campaign Name" value={editForm.name} onChange={(e) => setEditForm(c => ({ ...c, name: e.target.value }))} />
              <CustomSelect value={editForm.timezone} onChange={(v) => setEditForm(c => ({ ...c, timezone: v }))} options={TIMEZONE_OPTIONS} />
            </div>
            <div className="form-grid columns-2">
              <input className="input" type="time" placeholder="Window Start" value={editForm.send_window_start} onChange={(e) => setEditForm(c => ({ ...c, send_window_start: e.target.value }))} />
              <input className="input" type="time" placeholder="Window End" value={editForm.send_window_end} onChange={(e) => setEditForm(c => ({ ...c, send_window_end: e.target.value }))} />
            </div>
            <div className="form-grid columns-2">
              <div className="form-grid"><label className="dim" style={{ fontSize: 11 }}>Start Date</label><DatePicker value={editForm.start_date} onChange={(v) => setEditForm(c => ({ ...c, start_date: v }))} placeholder="Start date" /></div>
              <div className="form-grid"><label className="dim" style={{ fontSize: 11 }}>End Date</label><DatePicker value={editForm.end_date} onChange={(v) => setEditForm(c => ({ ...c, end_date: v }))} placeholder="End date" /></div>
            </div>
            <textarea className="textarea" placeholder="Description" value={editForm.description} onChange={(e) => setEditForm(c => ({ ...c, description: e.target.value }))} />
            <div className="btn-row"><button className="btn" type="button" onClick={saveChanges}>Save Campaign</button></div>
          </div>

          {/* ── Add More Leads ─────────────────────────────────── */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 4 }}>Add More Leads</div>
            <div className="card-subtitle" style={{ marginBottom: 20 }}>
              Add leads to this campaign from a CSV file or by tag. New leads are queued and picked up by the scheduler on the next run.
            </div>

            {/* Method toggle */}
            <div style={{
              display: 'inline-flex', borderRadius: 5, overflow: 'hidden',
              border: '1px solid var(--border-soft)', marginBottom: 20,
            }}>
              {(['upload', 'tag'] as const).map((m) => (
                <button key={m} type="button" onClick={() => { setAddLeadsMethod(m); setAddLeadsResult(null); }}
                  style={{
                    padding: '6px 16px', fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none',
                    background: addLeadsMethod === m ? 'var(--accent)' : 'transparent',
                    color: addLeadsMethod === m ? 'var(--accent-contrast)' : 'var(--text-muted)',
                    transition: 'all 0.15s ease',
                  }}>
                  {m === 'upload' ? 'Upload CSV' : 'From Tag'}
                </button>
              ))}
            </div>

            {addLeadsMethod === 'upload' && (
              <div style={{ display: 'grid', gap: 12 }}>
                {/* Drop zone */}
                <div
                  className={`add-leads-dropzone${addLeadsFile ? ' has-file' : ''}`}
                  onClick={() => addLeadsFileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) { setAddLeadsFile(f); setAddLeadsResult(null); }
                  }}
                >
                  <input
                    ref={addLeadsFileRef}
                    type="file"
                    accept=".csv"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) { setAddLeadsFile(f); setAddLeadsResult(null); }
                      e.target.value = '';
                    }}
                  />
                  {addLeadsFile ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--accent)' }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <span style={{ color: 'var(--text)', fontWeight: 500 }}>{addLeadsFile.name}</span>
                      <span className="dim" style={{ fontSize: 11 }}>Click to change file</span>
                    </>
                  ) : (
                    <>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4 }}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      <span>Drop a CSV file here, or click to browse</span>
                      <span className="dim" style={{ fontSize: 11 }}>Required columns: First Name · Telegram Username · Company</span>
                    </>
                  )}
                </div>

                <div className="form-grid">
                  <label className="dim" style={{ fontSize: 11 }}>Apply tags to all imported leads (optional, comma-separated)</label>
                  <input className="input" placeholder="e.g. outreach-apr, warm-lead" value={addLeadsExtraTags} onChange={(e) => setAddLeadsExtraTags(e.target.value)} />
                </div>
              </div>
            )}

            {addLeadsMethod === 'tag' && (
              <div style={{ display: 'grid', gap: 12 }}>
                <div className="form-grid">
                  <label className="dim" style={{ fontSize: 11 }}>Select tag</label>
                  <CustomSelect
                    value={addLeadsTag}
                    onChange={(v) => { setAddLeadsTag(v); setAddLeadsResult(null); }}
                    options={[
                      { value: '', label: allLeadTags.length ? 'Pick a tag…' : 'No tags found in leads database' },
                      ...allLeadTags.map((t) => ({ value: t, label: t })),
                    ]}
                  />
                </div>
                {addLeadsTag && (
                  <div className="dim" style={{ fontSize: 11 }}>
                    All leads tagged <strong style={{ color: 'var(--text-muted)' }}>{addLeadsTag}</strong> will be added. Leads already in this campaign are skipped automatically.
                  </div>
                )}
              </div>
            )}

            {addLeadsResult && (
              <div style={{
                marginTop: 14, padding: '9px 12px', borderRadius: 5, fontSize: 12,
                background: addLeadsResult.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${addLeadsResult.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                color: addLeadsResult.ok ? '#22c55e' : '#ef4444',
              }}>
                {addLeadsResult.ok ? '✓ ' : '✕ '}{addLeadsResult.msg}
              </div>
            )}

            <div className="btn-row" style={{ marginTop: 16 }}>
              <button
                className="btn"
                onClick={handleAddLeads}
                disabled={addLeadsLoading || (addLeadsMethod === 'upload' ? !addLeadsFile : !addLeadsTag)}
              >
                {addLeadsLoading ? 'Adding…' : 'Add Leads to Campaign'}
              </button>
              {addLeadsMethod === 'upload' && addLeadsFile && (
                <button className="btn-secondary" onClick={() => { setAddLeadsFile(null); setAddLeadsResult(null); }}>
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="card-title">Sequence Editor</div>
              {hasUnsavedChanges && <div className="sequence-unsaved-indicator"><span className="dot" />Unsaved changes</div>}
            </div>
            {hasUnsavedChanges && (
              <div className="sequence-save-bar">
                <span className="dim" style={{ fontSize: 12 }}>You have unsaved changes</span>
                <button className="btn" onClick={saveSequenceChanges} disabled={savingSteps}>{savingSteps ? 'Saving...' : 'Save Sequence'}</button>
              </div>
            )}
            <div className="card-subtitle" style={{ marginTop: 8 }}>Click a placeholder to insert at cursor:</div>
            <div className="placeholder-pills" style={{ marginTop: 8 }}>
              {templatePlaceholders.map((p) => (
                <button key={p.token} type="button" className="placeholder-pill" onClick={() => insertPlaceholder(p.token)}
                  style={{ background: `${p.color}18`, color: p.color, borderColor: `${p.color}50`, borderRadius: 4 }}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="sequence-stack" style={{ marginTop: 24 }}>
              {stepsForm.length ? stepsForm.map((step: any, idx) => {
                // Always use mock lead so the preview is consistent regardless of attached leads
                const mockLead = { first_name: 'Light', company_name: 'Stark Industries', telegram_username: 'lightwaslost' };
                const isOpen = activeEditorStep === idx;
                // Unique ID scope for any SVG <defs> inside this step card
                const stepUid = `step-${step.id ?? idx}`;
                return (
                  <div key={step.id} className={`sequence-step-card ${isOpen ? 'active' : ''}`}>
                    <div className="sequence-step-header" onClick={() => setActiveEditorStep(isOpen ? -1 : idx)}>
                      <div className="sequence-step-header-left">
                        <div className="sequence-step-number">{step.step_order}</div>
                        <div>
                          <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{step.step_name || `Step ${step.step_order}`}</div>
                          {!isOpen && step.message_template && (
                            <div className="dim" style={{ fontSize: 11, marginTop: 2, maxWidth: 480, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {step.message_template.slice(0, 80)}{step.message_template.length > 80 ? '…' : ''}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="sequence-step-meta">
                        <span className="dim" style={{ fontSize: 11 }}>
                          {step.delay_days === 0 ? 'Send immediately' : `+${step.delay_days} day${step.delay_days !== 1 ? 's' : ''}`}
                        </span>
                        {isOpen && <span className="badge" style={{ fontSize: 9 }}>editing</span>}
                      </div>
                    </div>
                    {isOpen && (
                      <div className="sequence-step-body">
                        <div className="editor-wrapper">
                          {/* ── Write pane */}
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
                              placeholder="Type your message here…"
                            />
                          </div>
                          {/* ── Preview pane */}
                          <div className="preview-pane">
                            {/* Chat top-bar */}
                            <div className="preview-topbar">
                              <div className="preview-avatar" key={stepUid}>
                                <svg width="36" height="36" viewBox="0 0 36 36">
                                  <rect width="36" height="36" rx="18" fill="#0d0928"/>
                                  {/* Purple hair */}
                                  <rect x="5" y="7" width="26" height="9" rx="3" fill="#5b21b6"/>
                                  <rect x="5" y="7" width="26" height="5" rx="3" fill="#7c3aed"/>
                                  {/* Skin */}
                                  <rect x="8" y="11" width="20" height="19" rx="3" fill="#e8c07a"/>
                                  {/* Eyes */}
                                  <rect x="11" y="16" width="5" height="5" rx="1" fill="#1c1033"/>
                                  <rect x="20" y="16" width="5" height="5" rx="1" fill="#1c1033"/>
                                  <rect x="12" y="17" width="2" height="2" fill="white"/>
                                  <rect x="21" y="17" width="2" height="2" fill="white"/>
                                  {/* Mouth */}
                                  <rect x="13" y="25" width="10" height="2.5" rx="1.25" fill="#1c1033"/>
                                  <rect x="14" y="25" width="8" height="1.5" rx="0.75" fill="#c0392b" opacity="0.6"/>
                                  {/* Gold earrings */}
                                  <circle cx="6" cy="20" r="1.8" fill="#fbbf24"/>
                                  <circle cx="30" cy="20" r="1.8" fill="#fbbf24"/>
                                </svg>
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>Light</div>
                                <div style={{ fontSize: 10, color: '#4ade80', marginTop: 1 }}>online</div>
                              </div>
                              {/* Telegram-style action icons */}
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-dim)', flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                            </div>
                            {/* Chat area */}
                            <div className="preview-chat-area">
                              <div className="preview-bubble">
                                {renderMessageTemplate(step.message_template, mockLead)}
                              </div>
                              <div className="preview-time">
                                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 3, color: '#60a5fa', flexShrink: 0 }}><path d="M4 12l4 4L15 7M7 12l4 4 7-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }) : <div className="empty-state">No sequence steps created yet.</div>}
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
                <CustomSelect value={leadEditForm.status} onChange={v => setLeadEditForm(f => ({ ...f, status: v }))} options={dynamicStageOrder.map(s => ({ value: s, label: getStageLabel(s) }))} />
              </div>
              <div className="form-grid">
                <label className="dim" style={{ fontSize: 11 }}>Next Step Order</label>
                <input className="input" type="number" min={1} value={leadEditForm.next_step_order} onChange={(e) => setLeadEditForm(f => ({ ...f, next_step_order: Number(e.target.value) }))} />
              </div>
              <div className="form-grid">
                <label className="dim" style={{ fontSize: 11 }}>Notes</label>
                <textarea className="textarea" style={{ minHeight: 80 }} value={leadEditForm.notes} onChange={(e) => setLeadEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Add notes about this lead..." />
              </div>
            </div>
            <div className="btn-row" style={{ marginTop: 20 }}>
              <button className="btn" onClick={saveLeadChanges}>Save Changes</button>
              <button className="btn-secondary" onClick={() => setEditingLead(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
