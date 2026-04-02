'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { fetchJson } from '@/lib/web/fetch-json';
import { buildAccountInsights, buildHeatmap, formatPercent, summariseCampaign, type Account, type Activity, type Campaign, type CampaignDetail, type HeatmapDay, type Lead } from '@/lib/web/insights';

export default function DashboardPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [details, setDetails] = useState<CampaignDetail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [campaignResponse, accountResponse, leadResponse, activityResponse] = await Promise.all([
        fetchJson('/api/campaigns'),
        fetchJson('/api/accounts'),
        fetchJson('/api/leads'),
        fetchJson('/api/activity'),
      ]);

      const nextCampaigns = campaignResponse.campaigns ?? [];
      setCampaigns(nextCampaigns);
      setAccounts(accountResponse.accounts ?? []);
      setLeads(leadResponse.leads ?? []);
      setActivity(activityResponse.activity ?? []);

      const nextDetails = await Promise.all(
        nextCampaigns.map((campaign: Campaign) => fetchJson(`/api/campaigns/${campaign.id}`)),
      );
      setDetails(nextDetails);
      setLoading(false);
    };

    void load();
  }, []);

  const metrics = useMemo(() => {
    const campaignSummaries = details.map((detail) => ({
      campaign: detail.campaign,
      ...summariseCampaign(detail, activity),
    }));
    const activeAccounts = accounts.filter((account) => account.is_active).length;
    const sentEvents = activity.filter((item) => item.event_type === 'task.sent').length;
    const replyEvents = activity.filter((item) => item.event_type === 'task.sent' && item.payload?.reply_status).length;
    const avgReplyRate = sentEvents ? Math.round((replyEvents / sentEvents) * 100) : campaignSummaries.length
      ? Math.round(campaignSummaries.reduce((sum, item) => sum + item.replyRate, 0) / campaignSummaries.length)
      : 0;
    const liveCampaigns = campaigns.filter((campaign) => campaign.status === 'active').length;
    const openLeads = campaignSummaries.reduce((sum, item) => sum + item.active, 0);
    const blockedLeads = campaignSummaries.reduce((sum, item) => sum + item.blocked, 0);
    const heatmap = buildHeatmap(activity, 12);
    const accountInsights = buildAccountInsights(accounts, details)
      .sort((a, b) => b.sentToday - a.sentToday || b.campaignCount - a.campaignCount)
      .slice(0, 4);
    const campaignPulse = campaignSummaries
      .sort((a, b) => b.sentToday - a.sentToday || b.totalLeads - a.totalLeads)
      .slice(0, 4);

    return {
      activeAccounts,
      avgReplyRate,
      liveCampaigns,
      openLeads,
      blockedLeads,
      heatmap,
      accountInsights,
      campaignPulse,
      sentEvents,
      totalLeads: leads.length,
    };
  }, [accounts, activity, campaigns, details, leads.length]);

  return (
    <div className="page-content">
      <div className="grid grid-4">
        <div className="card">
          <div className="card-title">Telegram Accounts Active</div>
          <div className="card-value">{loading ? '...' : metrics.activeAccounts}</div>
          <div className="card-subtitle">Sender accounts currently available for campaign assignment.</div>
        </div>
        <div className="card">
          <div className="card-title">Avg Reply Rate</div>
          <div className="card-value">{loading ? '...' : formatPercent(metrics.avgReplyRate)}</div>
          <div className="card-subtitle">Replies captured across campaign activity and lead progression.</div>
        </div>
        <div className="card">
          <div className="card-title">Active Campaigns</div>
          <div className="card-value">{loading ? '...' : metrics.liveCampaigns}</div>
          <div className="card-subtitle">Campaigns currently feeding Telegram tasks to the team.</div>
        </div>
        <div className="card">
          <div className="card-title">Leads In Motion</div>
          <div className="card-value">{loading ? '...' : metrics.openLeads}</div>
          <div className="card-subtitle">{metrics.blockedLeads} blocked. {metrics.totalLeads} reusable leads in CRM.</div>
        </div>
      </div>

      <div className="section-label">Message Heatmap</div>
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
            <div className="gh-heatmap-months" style={{ gridTemplateColumns: `repeat(${metrics.heatmap.weeks}, 13px)` }}>
              {metrics.heatmap.weekLabels.map((label, i) => (
                <div key={i} className="gh-heatmap-month-label">{label}</div>
              ))}
            </div>
            <div className="gh-heatmap-grid" style={{ gridTemplateColumns: `repeat(${metrics.heatmap.weeks}, 13px)` }}>
              {metrics.heatmap.days.map((day) => (
                <div
                  key={day.iso}
                  className={`gh-heatmap-cell level-${day.count === 0 ? 0 : day.intensity < 0.25 ? 1 : day.intensity < 0.5 ? 2 : day.intensity < 0.75 ? 3 : 4}`}
                  style={{ gridColumn: day.weekIndex + 1, gridRow: day.dayOfWeek + 1 }}
                  title={`${day.label}: ${day.count} messages`}
                />
              ))}
            </div>
          </div>
          <div className="gh-heatmap-legend">
            <span className="dim">Less</span>
            <div className="gh-heatmap-cell level-0" />
            <div className="gh-heatmap-cell level-1" />
            <div className="gh-heatmap-cell level-2" />
            <div className="gh-heatmap-cell level-3" />
            <div className="gh-heatmap-cell level-4" />
            <span className="dim">More</span>
          </div>
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
            )) : <div className="empty-state">Create campaigns and launch them to fill the dashboard pulse.</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Account Utilization</div>
              <div className="card-subtitle" style={{ marginTop: 8 }}>How loaded each Telegram sending account is today.</div>
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
            )) : <div className="empty-state">Add Telegram sender accounts to track utilization here.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
