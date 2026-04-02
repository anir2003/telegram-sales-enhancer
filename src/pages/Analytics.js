import React, { useState } from 'react';
import Tabs from '../components/Tabs';
import BarChart from '../components/BarChart';
import Heatmap from '../components/Heatmap';

const analyticsTabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'channels', label: 'By Channel' },
  { id: 'sequences', label: 'By Sequence' },
  { id: 'team', label: 'By Team' },
];

const channelData = [
  { name: 'Email', sent: 4218, replies: 523, meetings: 84, replyRate: 12.4, meetingRate: 2.0, cost: '$420', cpl: '$5.00' },
  { name: 'LinkedIn', sent: 1847, replies: 289, meetings: 52, replyRate: 15.6, meetingRate: 2.8, cost: '$280', cpl: '$5.38' },
  { name: 'Telegram', sent: 963, replies: 150, meetings: 22, replyRate: 15.6, meetingRate: 2.3, cost: '$60', cpl: '$2.73' },
  { name: 'Cold Call', sent: 521, replies: 130, meetings: 42, replyRate: 25.0, meetingRate: 8.1, cost: '$340', cpl: '$8.10' },
];

const weeklyData = [
  { week: 'W10', sent: 1420, replies: 168, meetings: 28 },
  { week: 'W11', sent: 1580, replies: 192, meetings: 34 },
  { week: 'W12', sent: 1740, replies: 218, meetings: 38 },
  { week: 'W13', sent: 1890, replies: 246, meetings: 44 },
  { week: 'W14', sent: 1919, replies: 268, meetings: 48 },
];

function Analytics() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="page-content">
      <Tabs tabs={analyticsTabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' && (
        <>
          <div className="grid grid-4" style={{ marginTop: 20 }}>
            <div className="card">
              <div className="card-title">Total Outreach</div>
              <div className="card-value">7,549</div>
              <div className="card-change"><span className="badge"><span className="arrow">&#8599;</span> +28%</span> MoM</div>
              <BarChart count={14} minH={20} maxH={90} trend="up" />
            </div>
            <div className="card">
              <div className="card-title">Total Replies</div>
              <div className="card-value">1,092</div>
              <div className="card-change"><span className="badge"><span className="arrow">&#8599;</span> +34%</span> MoM</div>
              <BarChart count={14} minH={25} maxH={85} trend="up" />
            </div>
            <div className="card">
              <div className="card-title">Cost Per Meeting</div>
              <div className="card-value">$5.50</div>
              <div className="card-change"><span className="badge"><span className="arrow">&#8599;</span> -12%</span> improving</div>
              <BarChart count={14} minH={30} maxH={80} trend="down" />
            </div>
            <div className="card">
              <div className="card-title">Pipeline Generated</div>
              <div className="card-value">$307K</div>
              <div className="card-change"><span className="badge"><span className="arrow">&#8599;</span> +42%</span> MoM</div>
              <BarChart count={14} minH={15} maxH={95} trend="up" />
            </div>
          </div>

          <div className="section-label">Weekly Trends</div>
          <div className="card">
            <div className="card-header"><span className="card-title">Week-over-Week Performance</span><span className="card-icon">&#8599;</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginTop: 16 }}>
              {weeklyData.map(w => (
                <div key={w.week} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>{w.week}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ height: 6, background: 'var(--track)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${w.sent / 20}%`, height: '100%', background: 'var(--fill-strong)', borderRadius: 2 }} />
                    </div>
                    <div style={{ height: 6, background: 'var(--track)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${w.replies / 3}%`, height: '100%', background: 'var(--fill-mid)', borderRadius: 2 }} />
                    </div>
                    <div style={{ height: 6, background: 'var(--track)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${w.meetings}%`, height: '100%', background: 'var(--fill-dim)', borderRadius: 2 }} />
                    </div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-dim)' }}>{w.sent} sent</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{w.replies} replies</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{w.meetings} mtgs</div>
                </div>
              ))}
            </div>
          </div>

          <div className="section-label">Activity Map</div>
          <Heatmap />
        </>
      )}

      {activeTab === 'channels' && (
        <>
          <div className="section-label">Channel Comparison</div>
          <div className="card" style={{ padding: 0, marginTop: 0 }}>
            <div className="channel-table-header">
              <div>Channel</div><div>Sent</div><div>Replies</div><div>Reply %</div><div>Meetings</div><div>Meeting %</div><div>Cost</div><div>CPL</div>
            </div>
            {channelData.map(c => (
              <div key={c.name} className="channel-table-row">
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{c.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text)' }}>{c.sent.toLocaleString()}</div>
                <div style={{ fontSize: 12, color: 'var(--text)' }}>{c.replies}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 40, height: 4, background: 'var(--track)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${c.replyRate * 4}%`, height: '100%', background: 'var(--fill-strong)', borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.replyRate}%</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text)' }}>{c.meetings}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.meetingRate}%</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.cost}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.cpl}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-2" style={{ marginTop: 20 }}>
            {channelData.map(c => (
              <div key={c.name} className="card">
                <div className="card-header"><span className="card-title">{c.name} Performance</span><span className="card-icon">&#8599;</span></div>
                <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
                  <div><div style={{ fontSize: 20, fontWeight: 300, color: 'var(--text)' }}>{c.replyRate}%</div><div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Reply Rate</div></div>
                  <div><div style={{ fontSize: 20, fontWeight: 300, color: 'var(--text)' }}>{c.meetingRate}%</div><div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Meeting Rate</div></div>
                  <div><div style={{ fontSize: 20, fontWeight: 300, color: 'var(--text)' }}>{c.cpl}</div><div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Cost/Lead</div></div>
                </div>
                <BarChart count={20} minH={15} maxH={85} trend="up" />
              </div>
            ))}
          </div>
        </>
      )}

      {(activeTab === 'sequences' || activeTab === 'team') && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--text-dim)', fontSize: 12 }}>
          {activeTab === 'sequences' ? 'Sequence analytics — drill down from Sequences page' : 'Team analytics — drill down from Team page'}
        </div>
      )}
    </div>
  );
}

export default Analytics;
