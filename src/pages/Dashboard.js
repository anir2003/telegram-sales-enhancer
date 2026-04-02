import React from 'react';
import KPICard from '../components/KPICard';
import Heatmap from '../components/Heatmap';
import Pipeline from '../components/Pipeline';
import ProgressBar from '../components/ProgressBar';
import TeamTable from '../components/TeamTable';
import AccountRegistry from '../components/AccountRegistry';
import CompanyStatus from '../components/CompanyStatus';
import ConversionRates from '../components/ConversionRates';
import WeeklySnapshot from '../components/WeeklySnapshot';
import { ResponseTime, BestSequence, BounceRate } from '../components/SequencePerformance';

function Dashboard() {
  return (
    <div className="page-content">
      <div className="grid grid-4">
        <KPICard title="Revenue (MRR)" value="$84.2K" change="+18%" changeLabel="month-on-month" barProps={{ count: 14, minH: 20, maxH: 92, trend: 'up' }} />
        <KPICard title="Deals Closed" value="47" change="+32%" changeLabel="vs. last month" barProps={{ count: 14, minH: 15, maxH: 100, trend: 'up' }} />
        <KPICard title="Meetings Booked" value="132" change="+24%" changeLabel="week-on-week" barProps={{ count: 14, minH: 25, maxH: 95, trend: 'up' }} />
        <KPICard title="Reply Rate" value="12.4%" change="+3.1%" changeLabel="vs. last week" barProps={{ count: 14, minH: 30, maxH: 88, trend: 'up' }} />
      </div>

      <div className="section-label">Outreach Volume</div>
      <div className="grid grid-4">
        <KPICard title="Emails Sent" value="4,218" change="+150%" changeLabel="month-on-month" barProps={{ count: 28, minH: 10, maxH: 95, trend: 'up', tall: true }} />
        <KPICard title="LinkedIn Messages" value="1,847" change="+89%" changeLabel="month-on-month" barProps={{ count: 28, minH: 15, maxH: 90, trend: 'up', tall: true }} />
        <KPICard title="Telegram Outreach" value="963" change="+67%" changeLabel="week-on-week" barProps={{ count: 28, minH: 10, maxH: 85, trend: 'up', tall: true }} />
        <KPICard title="Cold Calls" value="521" change="+41%" changeLabel="week-on-week" barProps={{ count: 28, minH: 20, maxH: 80, trend: 'up', tall: true }} />
      </div>

      <div className="section-label">Pipeline &amp; Targets</div>
      <div className="grid grid-2">
        <Pipeline />
        <div className="card">
          <div className="card-header">
            <span className="card-title">Quarterly Revenue Target</span>
            <span className="menu-dots">&middot;&middot;&middot;</span>
          </div>
          <div className="card-subtitle">You are on track to hit the goal 6 days early</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <span className="card-value small">71%</span>
            <span className="badge"><span className="arrow">&#8599;</span> 14%</span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>since you last checked</span>
          </div>
          <ProgressBar filled={25} total={35} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>$0</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>$250K target</span>
          </div>
        </div>
      </div>

      <div className="section-label">Outreach Activity</div>
      <div className="grid grid-1"><Heatmap /></div>

      <div className="section-label">Team Performance</div>
      <div className="grid grid-1"><TeamTable /></div>

      <div className="section-label">Outreach Accounts &amp; Channels</div>
      <div className="grid grid-1"><AccountRegistry /></div>

      <div className="section-label">Company Status</div>
      <div className="grid grid-3">
        <CompanyStatus />
        <ConversionRates />
        <WeeklySnapshot />
      </div>

      <div className="section-label">Sequence Performance</div>
      <div className="grid grid-3">
        <ResponseTime />
        <BestSequence />
        <BounceRate />
      </div>
    </div>
  );
}

export default Dashboard;
