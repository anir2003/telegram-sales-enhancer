'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { fetchJson, invalidateCache } from '@/lib/web/fetch-json';
import { buildAccountInsights, buildHeatmap, formatPercent, summariseCampaign, type Account, type Activity, type Campaign, type CampaignDetail, type HeatmapDay, type Lead } from '@/lib/web/insights';
import { InfoTooltip } from '@/components/ui/info-tooltip';

function MiniCalendar() {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(today);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthName = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  // Build calendar cells
  const cells: { date: Date; isCurrentMonth: boolean; isToday: boolean }[] = [];

  // Previous month days
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), isCurrentMonth: false, isToday: false });
  }
  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const isToday = date.toDateString() === today.toDateString();
    cells.push({ date, isCurrentMonth: true, isToday });
  }
  // Next month days to complete grid
  const remaining = 35 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ date: new Date(year, month + 1, d), isCurrentMonth: false, isToday: false });
  }

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const selectedLabel = selectedDate
    ? selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    : null;

  const isSelected = (date: Date) => selectedDate && date.toDateString() === selectedDate.toDateString();

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
        {cells.map((cell, i) => (
          <div
            key={i}
            className={[
              'mini-calendar-cell',
              cell.isToday ? 'today' : '',
              !cell.isCurrentMonth ? 'other-month' : '',
              isSelected(cell.date) && !cell.isToday ? 'selected' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => setSelectedDate(cell.date)}
          >
            {cell.date.getDate()}
          </div>
        ))}
      </div>
      {selectedDate && (
        <div className="mini-calendar-event-list">
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {selectedLabel}
          </div>
          {selectedDate.toDateString() === today.toDateString() ? (
            <div className="mini-calendar-event-item">
              <div className="mini-calendar-event-dot" />
              <span>Today — check your active campaigns</span>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>No events scheduled</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [details, setDetails] = useState<CampaignDetail[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="page-content">
      <div className="grid grid-4">
        <div className="card">
          <div className="card-title-row"><div className="card-title">Telegram Accounts Active</div><InfoTooltip text="Sender accounts available for campaigns." /></div>
          <div className="card-value">{loading ? '...' : metrics.activeAccounts}</div>
        </div>
        <div className="card">
          <div className="card-title-row"><div className="card-title">Avg Reply Rate</div><InfoTooltip text="Replies across all campaign activity." /></div>
          <div className="card-value">{loading ? '...' : formatPercent(metrics.avgReplyRate)}</div>
        </div>
        <div className="card">
          <div className="card-title-row"><div className="card-title">Active Campaigns</div><InfoTooltip text="Currently feeding Telegram tasks." /></div>
          <div className="card-value">{loading ? '...' : metrics.liveCampaigns}</div>
        </div>
        <div className="card">
          <div className="card-title-row"><div className="card-title">Leads In Motion</div><InfoTooltip text={`${metrics.blockedLeads} blocked. ${metrics.totalLeads} total in CRM.`} /></div>
          <div className="card-value">{loading ? '...' : metrics.openLeads}</div>
        </div>
      </div>

      <div className="section-label">Message Heatmap</div>
      <div className="dashboard-split">
        <div className="dashboard-main">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Daily Message Volume</div>
                <div className="card-subtitle" style={{ marginTop: 8 }}>Tasks completed each day over the last 12 weeks.</div>
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
                    <div key={day.iso} className={`gh-heatmap-cell level-${day.count === 0 ? 0 : day.intensity < 0.25 ? 1 : day.intensity < 0.5 ? 2 : day.intensity < 0.75 ? 3 : 4}`}
                      style={{ gridColumn: day.weekIndex + 1, gridRow: day.dayOfWeek + 1 }}
                      title={`${day.label}: ${day.count} messages`} />
                  ))}
                </div>
              </div>
              <div className="gh-heatmap-legend">
                <span className="dim">Less</span>
                <div className="gh-heatmap-cell level-0" /><div className="gh-heatmap-cell level-1" /><div className="gh-heatmap-cell level-2" /><div className="gh-heatmap-cell level-3" /><div className="gh-heatmap-cell level-4" />
                <span className="dim">More</span>
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-sidebar">
          <MiniCalendar />
        </div>
      </div>

      <div className="section-label">Operational Pulse</div>
      <div className="grid grid-2">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Campaign Pulse</div>
              <div className="card-subtitle" style={{ marginTop: 8 }}>Which campaigns are moving right now.</div>
            </div>
            <Link href="/campaigns" className="btn-secondary">Open Campaigns</Link>
          </div>
          <div className="list-stack">
            {metrics.campaignPulse.length ? metrics.campaignPulse.map((item) => (
              <div key={item.campaign?.id} className="metric-row">
                <div>
                  <div>{item.campaign?.name ?? 'Campaign'}</div>
                  <div className="dim">{item.totalLeads} leads · {item.assignedAccounts.length} accounts · {item.sentToday} sent today</div>
                </div>
                <div className="metric-row-side">
                  <span className="badge">{item.campaign?.status ?? 'draft'}</span>
                  <span className="dim">{formatPercent(item.replyRate)} reply</span>
                </div>
              </div>
            )) : <div className="empty-state">Create and launch campaigns to see data here.</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Account Utilization</div>
              <div className="card-subtitle" style={{ marginTop: 8 }}>How loaded each Telegram account is today.</div>
            </div>
            <Link href="/accounts" className="btn-secondary">Open Accounts</Link>
          </div>
          <div className="list-stack">
            {metrics.accountInsights.length ? metrics.accountInsights.map((account) => (
              <div key={account.id} className="metric-row">
                <div>
                  <div>{account.label}</div>
                  <div className="dim">@{account.telegram_username} · {account.campaignCount} campaigns · {account.sentYesterday} yesterday</div>
                </div>
                <div className="metric-row-side">
                  <span className="badge">{account.sentToday}/{account.daily_limit} today</span>
                  <span className="dim">{account.utilization}% used</span>
                </div>
              </div>
            )) : <div className="empty-state">Add Telegram sender accounts to track utilization.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
