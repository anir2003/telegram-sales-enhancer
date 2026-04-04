'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { fetchJson, invalidateCache } from '@/lib/web/fetch-json';
import { buildAccountInsights, buildHeatmap, formatPercent, summariseCampaign, type Account, type Activity, type Campaign, type CampaignDetail, type HeatmapDay, type Lead } from '@/lib/web/insights';
import { InfoTooltip } from '@/components/ui/info-tooltip';

// ─── Types ────────────────────────────────────────────────────────
type CalendarHighlight = {
  id: string;
  date: string; // YYYY-MM-DD
  is_highlighted: boolean;
  comment: string | null;
};

type DayStats = {
  messagesSent: number;
  repliesReceived: number;
  campaigns: { id: string; name: string; status: string; sent: number; replies: number }[];
  accounts: { id: string; label: string; username: string; sent: number }[];
};

// ─── Heatmap Tooltip ──────────────────────────────────────────────
function HeatmapTooltip({ day, position }: { day: HeatmapDay; position: { x: number; y: number } }) {
  return (
    <div className="heatmap-tooltip" style={{ left: position.x, top: position.y }}>
      <div className="heatmap-tooltip-date">{day.label}</div>
      <div className="heatmap-tooltip-count">
        <span className="heatmap-tooltip-number">{day.count}</span>
        <span className="heatmap-tooltip-label">{day.count === 1 ? 'message sent' : 'messages sent'}</span>
      </div>
      {day.count > 0 && (
        <div className="heatmap-tooltip-bar">
          <div className="heatmap-tooltip-bar-fill" style={{ width: `${Math.max(8, day.intensity * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

// ─── Mini Calendar ────────────────────────────────────────────────
function MiniCalendar({ activity, campaigns, details, accounts }: {
  activity: Activity[];
  campaigns: Campaign[];
  details: CampaignDetail[];
  accounts: Account[];
}) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [highlights, setHighlights] = useState<CalendarHighlight[]>([]);
  const [commentText, setCommentText] = useState('');
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [savingHighlight, setSavingHighlight] = useState(false);
  const [savingComment, setSavingComment] = useState(false);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthName = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  // Load highlights
  const loadHighlights = useCallback(async () => {
    try {
      const res = await fetchJson<{ highlights: CalendarHighlight[] }>('/api/calendar-highlights');
      setHighlights(res.highlights ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadHighlights(); }, [loadHighlights]);

  // Build highlight lookup
  const highlightMap = useMemo(() => {
    const map = new Map<string, CalendarHighlight>();
    highlights.forEach(h => map.set(h.date, h));
    return map;
  }, [highlights]);

  // Build daily stats
  const dayStatsMap = useMemo(() => {
    const map = new Map<string, DayStats>();

    // Count messages from activity log
    const sentByDay = new Map<string, { campaigns: Map<string, { sent: number; replies: number }>; accounts: Map<string, number> }>();

    activity.forEach(entry => {
      if (!entry.event_type.startsWith('task.')) return;
      const iso = new Date(entry.created_at).toISOString().slice(0, 10);
      if (!sentByDay.has(iso)) sentByDay.set(iso, { campaigns: new Map(), accounts: new Map() });
      const day = sentByDay.get(iso)!;

      const campaignId = String(entry.payload?.campaign_id ?? '');
      const accountId = String(entry.payload?.account_id ?? '');

      if (campaignId) {
        const c = day.campaigns.get(campaignId) ?? { sent: 0, replies: 0 };
        if (entry.event_type === 'task.sent') c.sent++;
        if (entry.payload?.reply_status) c.replies++;
        day.campaigns.set(campaignId, c);
      }

      if (accountId) {
        day.accounts.set(accountId, (day.accounts.get(accountId) ?? 0) + 1);
      }
    });

    // Build campaign and account lookup
    const campaignById = new Map(campaigns.map(c => [c.id, c]));
    const accountById = new Map(accounts.map(a => [a.id, a]));

    sentByDay.forEach((data, iso) => {
      const campaignsList = Array.from(data.campaigns.entries()).map(([id, stats]) => {
        const campaign = campaignById.get(id);
        return {
          id,
          name: campaign?.name ?? 'Campaign',
          status: campaign?.status ?? 'unknown',
          sent: stats.sent,
          replies: stats.replies,
        };
      });

      const accountsList = Array.from(data.accounts.entries()).map(([id, sent]) => {
        const account = accountById.get(id);
        return {
          id,
          label: account?.label ?? 'Account',
          username: account?.telegram_username ?? '',
          sent,
        };
      });

      const totalSent = campaignsList.reduce((sum, c) => sum + c.sent, 0);
      const totalReplies = campaignsList.reduce((sum, c) => sum + c.replies, 0);

      map.set(iso, {
        messagesSent: totalSent,
        repliesReceived: totalReplies,
        campaigns: campaignsList,
        accounts: accountsList,
      });
    });

    return map;
  }, [activity, campaigns, accounts]);

  // Calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: { date: Date; iso: string; isCurrentMonth: boolean; isToday: boolean }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, daysInPrevMonth - i);
    cells.push({ date: d, iso: d.toISOString().slice(0, 10), isCurrentMonth: false, isToday: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const isToday = date.toDateString() === today.toDateString();
    cells.push({ date, iso: date.toISOString().slice(0, 10), isCurrentMonth: true, isToday });
  }
  const remaining = 35 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const dt = new Date(year, month + 1, d);
    cells.push({ date: dt, iso: dt.toISOString().slice(0, 10), isCurrentMonth: false, isToday: false });
  }

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setShowCommentInput(false);
    const iso = date.toISOString().slice(0, 10);
    const h = highlightMap.get(iso);
    setCommentText(h?.comment ?? '');
  };

  const selectedIso = selectedDate?.toISOString().slice(0, 10) ?? '';
  const selectedStats = selectedIso ? dayStatsMap.get(selectedIso) : null;
  const selectedHighlight = selectedIso ? highlightMap.get(selectedIso) : null;

  const selectedLabel = selectedDate
    ? selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    : null;

  const isSelected = (iso: string) => selectedIso === iso;

  const toggleHighlight = async () => {
    if (!selectedDate) return;
    setSavingHighlight(true);
    try {
      const newState = !selectedHighlight?.is_highlighted;
      await fetchJson('/api/calendar-highlights', {
        method: 'POST',
        body: JSON.stringify({
          date: selectedIso,
          is_highlighted: newState,
          comment: (selectedHighlight?.comment ?? commentText) || null,
        }),
      });
      await loadHighlights();
    } catch { /* ignore */ }
    setSavingHighlight(false);
  };

  const saveComment = async () => {
    if (!selectedDate) return;
    setSavingComment(true);
    try {
      await fetchJson('/api/calendar-highlights', {
        method: 'POST',
        body: JSON.stringify({
          date: selectedIso,
          is_highlighted: selectedHighlight?.is_highlighted ?? false,
          comment: commentText.trim() || null,
        }),
      });
      await loadHighlights();
      setShowCommentInput(false);
    } catch { /* ignore */ }
    setSavingComment(false);
  };

  // Active campaigns for selected date
  const activeCampaignsOnDate = useMemo(() => {
    if (!selectedDate) return [];
    return campaigns.filter(c => {
      if (c.status === 'draft') return false;
      // Check if campaign was active around this date
      if (c.start_date && new Date(c.start_date) > selectedDate) return false;
      if (c.end_date && new Date(c.end_date) < selectedDate) return false;
      return true;
    });
  }, [selectedDate, campaigns]);

  return (
    <div className="mini-calendar">
      <div className="mini-calendar-header">
        <button className="mini-calendar-nav" onClick={prevMonth}>‹</button>
        <div className="mini-calendar-title">{monthName}</div>
        <button className="mini-calendar-nav" onClick={nextMonth}>›</button>
      </div>
      <div className="mini-calendar-grid">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} className="mini-calendar-day-label">{d}</div>
        ))}
        {cells.map((cell, i) => {
          const h = highlightMap.get(cell.iso);
          const stats = dayStatsMap.get(cell.iso);
          const hasMessages = (stats?.messagesSent ?? 0) > 0;
          return (
            <div
              key={i}
              className={[
                'mini-calendar-cell',
                cell.isToday ? 'today' : '',
                !cell.isCurrentMonth ? 'other-month' : '',
                isSelected(cell.iso) && !cell.isToday ? 'selected' : '',
                h?.is_highlighted ? 'highlighted' : '',
                h?.comment ? 'has-comment' : '',
                hasMessages ? 'has-activity' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => handleDateClick(cell.date)}
            >
              {cell.date.getDate()}
            </div>
          );
        })}
      </div>

      {/* Date detail card (Floating Overlay) */}
      {selectedDate && (
        <div className="calendar-detail-card">
          <div className="calendar-detail-header">
            <div className="calendar-detail-date">{selectedLabel}</div>
            <button className="calendar-detail-close" onClick={() => setSelectedDate(null)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          {/* Stats */}
          {selectedStats && selectedStats.messagesSent > 0 ? (
            <div className="calendar-detail-stats">
              <div className="calendar-detail-stat">
                <div className="calendar-detail-stat-value">{selectedStats.messagesSent}</div>
                <div className="calendar-detail-stat-label">sent</div>
              </div>
              <div className="calendar-detail-stat">
                <div className="calendar-detail-stat-value">{selectedStats.repliesReceived}</div>
                <div className="calendar-detail-stat-label">replies</div>
              </div>
              <div className="calendar-detail-stat">
                <div className="calendar-detail-stat-value">{selectedStats.campaigns.length}</div>
                <div className="calendar-detail-stat-label">campaigns</div>
              </div>
              <div className="calendar-detail-stat">
                <div className="calendar-detail-stat-value">{selectedStats.accounts.length}</div>
                <div className="calendar-detail-stat-label">accounts</div>
              </div>
            </div>
          ) : (
            <div className="calendar-detail-empty">
              {selectedDate.toDateString() === today.toDateString()
                ? 'Today — check your active campaigns'
                : 'No messaging activity'}
            </div>
          )}

          {/* Campaign breakdown */}
          {selectedStats && selectedStats.campaigns.length > 0 && (
            <div className="calendar-detail-section">
              <div className="calendar-detail-section-title">Campaigns</div>
              {selectedStats.campaigns.map(c => (
                <div key={c.id} className="calendar-detail-campaign-row">
                  <div className="calendar-detail-campaign-name">{c.name}</div>
                  <div className="calendar-detail-campaign-stats">
                    <span>{c.sent} sent</span>
                    {c.replies > 0 && <span className="calendar-detail-reply-badge">{c.replies} replies</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Accounts breakdown */}
          {selectedStats && selectedStats.accounts.length > 0 && (
            <div className="calendar-detail-section">
              <div className="calendar-detail-section-title">Accounts</div>
              {selectedStats.accounts.map(a => (
                <div key={a.id} className="calendar-detail-account-row">
                  <span className="calendar-detail-account-label">{a.label}</span>
                  <span className="calendar-detail-account-stat">{a.sent} msg</span>
                </div>
              ))}
            </div>
          )}

          {/* Active campaigns on this date (when no direct stats) */}
          {(!selectedStats || selectedStats.messagesSent === 0) && activeCampaignsOnDate.length > 0 && (
            <div className="calendar-detail-section">
              <div className="calendar-detail-section-title">Active Campaigns</div>
              {activeCampaignsOnDate.slice(0, 3).map(c => (
                <div key={c.id} className="calendar-detail-campaign-row">
                  <div className="calendar-detail-campaign-name">{c.name}</div>
                  <div className={`calendar-detail-status-dot ${c.status}`} />
                </div>
              ))}
              {activeCampaignsOnDate.length > 3 && (
                <div className="calendar-detail-more">+{activeCampaignsOnDate.length - 3} more</div>
              )}
            </div>
          )}

          {/* Saved comment */}
          {selectedHighlight?.comment && !showCommentInput && (
            <div
              className="calendar-detail-comment"
              onClick={() => { setShowCommentInput(true); setCommentText(selectedHighlight.comment ?? ''); }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              <span>{selectedHighlight.comment}</span>
            </div>
          )}

          {/* Comment input form */}
          {showCommentInput && (
            <div className="calendar-comment-form">
              <textarea
                ref={commentInputRef}
                autoFocus
                className="calendar-comment-input"
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="Note for this day…"
              />
              <div className="calendar-comment-actions">
                <button className="calendar-comment-cancel" onClick={() => setShowCommentInput(false)}>Cancel</button>
                <button className="calendar-comment-save" onClick={saveComment} disabled={savingComment}>
                  {savingComment ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {/* Actions Strip */}
          {!showCommentInput && (
            <div className="calendar-action-row">
              <button
                className="calendar-action-btn"
                onClick={() => { setShowCommentInput(true); setCommentText(selectedHighlight?.comment ?? ''); }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                {selectedHighlight?.comment ? 'Edit Note' : 'Add Note'}
              </button>
              <button
                className={`calendar-action-btn ${selectedHighlight?.is_highlighted ? 'active' : ''}`}
                onClick={toggleHighlight}
                disabled={savingHighlight}
              >
                {selectedHighlight?.is_highlighted ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    Unmark
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    Mark
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────
export default function DashboardPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [details, setDetails] = useState<CampaignDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredCell, setHoveredCell] = useState<{ day: HeatmapDay; x: number; y: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [campaignResponse, accountResponse, leadResponse, activityResponse] = await Promise.all([
      fetchJson<{ campaigns: Campaign[] }>('/api/campaigns'),
      fetchJson<{ accounts: Account[] }>('/api/accounts'),
      fetchJson<{ leads: Lead[] }>('/api/leads'),
      fetchJson<{ activity: Activity[] }>('/api/activity'),
    ]);
    const nextCampaigns = campaignResponse.campaigns ?? [];
    setCampaigns(nextCampaigns);
    setAccounts(accountResponse.accounts ?? []);
    setLeads(leadResponse.leads ?? []);
    setActivity(activityResponse.activity ?? []);
    if (nextCampaigns.length > 0) {
      const nextDetails = await Promise.all(nextCampaigns.map((c: Campaign) => fetchJson<CampaignDetail>(`/api/campaigns/${c.id}`)));
      setDetails(nextDetails);
    } else {
      setDetails([]);
    }
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => { invalidateCache('/api/'); await load(); }, [load]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const interval = setInterval(() => { void refresh(); }, 60000);
    return () => clearInterval(interval);
  }, [refresh]);

  const metrics = useMemo(() => {
    const campaignSummaries = details.map((detail) => ({ campaign: detail.campaign, ...summariseCampaign(detail, activity) }));
    const activeAccounts = accounts.filter((a) => a.is_active).length;
    const sentEvents = activity.filter((i) => i.event_type === 'task.sent').length;
    const replyEvents = activity.filter((i) => i.event_type === 'task.sent' && i.payload?.reply_status).length;
    const avgReplyRate = sentEvents
      ? Math.round((replyEvents / sentEvents) * 100)
      : campaignSummaries.length
      ? Math.round(campaignSummaries.reduce((sum, i) => sum + i.replyRate, 0) / campaignSummaries.length)
      : 0;
    const liveCampaigns = campaigns.filter((c) => c.status === 'active').length;
    const openLeads = campaignSummaries.reduce((sum, i) => sum + i.active, 0);
    const blockedLeads = campaignSummaries.reduce((sum, i) => sum + i.blocked, 0);
    const heatmap = buildHeatmap(activity, 36);
    const accountInsights = buildAccountInsights(accounts, details).sort((a, b) => b.sentToday - a.sentToday || b.campaignCount - a.campaignCount).slice(0, 4);
    const campaignPulse = campaignSummaries.sort((a, b) => b.sentToday - a.sentToday || b.totalLeads - a.totalLeads).slice(0, 4);
    return { activeAccounts, avgReplyRate, liveCampaigns, openLeads, blockedLeads, heatmap, accountInsights, campaignPulse, sentEvents, totalLeads: leads.length };
  }, [accounts, activity, campaigns, details, leads.length]);

  const handleCellHover = useCallback((day: HeatmapDay, e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setHoveredCell({
      day,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  }, []);

  return (
    <div className="page-content">
      <div className="grid grid-4">
        <div className="card">
          <div className="card-title">Telegram Accounts Active</div>
          <div className="card-value">{loading ? '...' : metrics.activeAccounts}</div>
          <div className="card-subtitle">Sender accounts available.</div>
        </div>
        <div className="card">
          <div className="card-title">Avg Reply Rate</div>
          <div className="card-value">{loading ? '...' : formatPercent(metrics.avgReplyRate)}</div>
          <div className="card-subtitle">Across all campaign activity.</div>
        </div>
        <div className="card">
          <div className="card-title">Active Campaigns</div>
          <div className="card-value">{loading ? '...' : metrics.liveCampaigns}</div>
          <div className="card-subtitle">Currently sending tasks.</div>
        </div>
        <div className="card">
          <div className="card-title">Leads In Motion</div>
          <div className="card-value">{loading ? '...' : metrics.openLeads}</div>
          <div className="card-subtitle">{metrics.blockedLeads} blocked · {metrics.totalLeads} total in CRM.</div>
        </div>
      </div>

      <div className="section-label">Message Heatmap</div>
      <div className="dashboard-split">
        <div className="dashboard-main">
          <div className="card">
            <div className="card-header">
              <div className="card-title-row">
                <div className="card-title">Daily Message Volume</div>
                <InfoTooltip text="Tasks completed each day over the last 12 weeks." />
              </div>
              <div className="badge">{metrics.sentEvents} total sends</div>
            </div>
            <div className="gh-heatmap">
              <div className="gh-heatmap-days">
                {['', 'Mon', '', 'Wed', '', 'Fri', ''].map((d, i) => (
                  <div key={i} className="gh-heatmap-day-label">{d}</div>
                ))}
              </div>
              <div className="gh-heatmap-body">
                <div className="gh-heatmap-months" style={{ gridTemplateColumns: `repeat(${metrics.heatmap.weeks}, 16px)` }}>
                  {metrics.heatmap.weekLabels.map((label, i) => (
                    <div key={i} className="gh-heatmap-month-label">{label}</div>
                  ))}
                </div>
                <div className="gh-heatmap-grid" style={{ gridTemplateColumns: `repeat(${metrics.heatmap.weeks}, 16px)` }}>
                  {metrics.heatmap.days.map((day) => (
                    <div
                      key={day.iso}
                      className={`gh-heatmap-cell level-${day.count === 0 ? 0 : day.intensity < 0.25 ? 1 : day.intensity < 0.5 ? 2 : day.intensity < 0.75 ? 3 : 4}`}
                      style={{ gridColumn: day.weekIndex + 1, gridRow: day.dayOfWeek + 1 }}
                      onMouseEnter={(e) => handleCellHover(day, e)}
                      onMouseLeave={() => setHoveredCell(null)}
                    />
                  ))}
                </div>
              </div>
              <div className="gh-heatmap-legend">
                <span className="dim">Less</span>
                <div className="gh-heatmap-cell level-0" /><div className="gh-heatmap-cell level-1" /><div className="gh-heatmap-cell level-2" /><div className="gh-heatmap-cell level-3" /><div className="gh-heatmap-cell level-4" />
                <span className="dim">More</span>
              </div>
            </div>

            {/* Floating heatmap tooltip */}
            {hoveredCell && (
              <HeatmapTooltip day={hoveredCell.day} position={{ x: hoveredCell.x, y: hoveredCell.y }} />
            )}
          </div>
        </div>

        <div className="dashboard-sidebar">
          <MiniCalendar
            activity={activity}
            campaigns={campaigns}
            details={details}
            accounts={accounts}
          />
        </div>
      </div>

      <div className="section-label">Operational Pulse</div>
      <div className="grid grid-2">
        <div className="card">
          <div className="card-header">
            <div className="card-title-row">
              <div className="card-title">Campaign Pulse</div>
              <InfoTooltip text="Which campaigns are moving right now." />
            </div>
            <Link href="/campaigns" className="btn-secondary">Open Campaigns</Link>
          </div>
          <div className="pulse-table">
            {metrics.campaignPulse.length ? metrics.campaignPulse.map((item) => (
              <div key={item.campaign?.id} className="pulse-table-row">
                <div className="pulse-table-main">
                  <div className="pulse-table-name">
                    <span className={`pulse-status-dot ${item.campaign?.status ?? 'draft'}`} />
                    {item.campaign?.name ?? 'Campaign'}
                  </div>
                  <div className="pulse-table-meta">{item.totalLeads} leads · {item.assignedAccounts.length} accounts · {item.sentToday} sent today</div>
                </div>
                <div className="pulse-table-right">
                  <span className="pulse-table-rate">{formatPercent(item.replyRate)}</span>
                  <span className="pulse-table-rate-label">reply rate</span>
                </div>
              </div>
            )) : <div className="empty-state">Create and launch campaigns to see data here.</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title-row">
              <div className="card-title">Account Utilization</div>
              <InfoTooltip text="How loaded each Telegram account is today." />
            </div>
            <Link href="/accounts" className="btn-secondary">Open Accounts</Link>
          </div>
          <div className="pulse-table">
            {metrics.accountInsights.length ? metrics.accountInsights.map((account) => (
              <div key={account.id} className="pulse-table-row">
                <div className="pulse-table-main">
                  <div className="pulse-table-name">{account.label}</div>
                  <div className="pulse-table-meta">@{account.telegram_username} · {account.campaignCount} campaigns · {account.sentYesterday} yesterday</div>
                </div>
                <div className="pulse-table-right">
                  <div className="util-bar">
                    <div className="util-bar-fill" style={{ width: `${account.utilization}%` }} />
                  </div>
                  <span className="pulse-table-count">{account.sentToday}/{account.daily_limit} <span className="pulse-table-rate-label">today</span></span>
                </div>
              </div>
            )) : <div className="empty-state">Add Telegram sender accounts to track utilization.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
