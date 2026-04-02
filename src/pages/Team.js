import React, { useState } from 'react';
import Tabs from '../components/Tabs';
import BarChart from '../components/BarChart';

const teamTabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'activity', label: 'Activity Feed' },
];

const members = [
  { name: 'Arjun Kapoor', role: 'SDR Lead', avatar: 'https://i.pravatar.cc/64?img=11', sent: 1248, replies: 156, meetings: 42, deals: 14, revenue: 28400, streak: 12, rank: 1 },
  { name: 'Sofia Nakamura', role: 'Account Executive', avatar: 'https://i.pravatar.cc/64?img=5', sent: 986, replies: 134, meetings: 38, deals: 12, revenue: 22100, streak: 8, rank: 2 },
  { name: 'Marcus Rivera', role: 'SDR', avatar: 'https://i.pravatar.cc/64?img=12', sent: 874, replies: 98, meetings: 28, deals: 9, revenue: 16800, streak: 15, rank: 3 },
  { name: 'Lena Petrov', role: 'SDR', avatar: 'https://i.pravatar.cc/64?img=9', sent: 642, replies: 78, meetings: 18, deals: 8, revenue: 12200, streak: 6, rank: 4 },
  { name: 'David Jansen', role: 'BDR', avatar: 'https://i.pravatar.cc/64?img=53', sent: 468, replies: 52, meetings: 14, deals: 4, revenue: 4700, streak: 3, rank: 5 },
];

const activities = [
  { person: 'Arjun Kapoor', action: 'booked a meeting with', target: 'Sarah Chen (TechFlow)', time: '10 min ago' },
  { person: 'Sofia Nakamura', action: 'got a reply from', target: 'James Morrison (DataStack)', time: '25 min ago' },
  { person: 'Marcus Rivera', action: 'sent 50 emails in sequence', target: '"Pain Point Opener"', time: '1h ago' },
  { person: 'Arjun Kapoor', action: 'closed a deal with', target: 'LevelUp SaaS ($31K)', time: '2h ago' },
  { person: 'Lena Petrov', action: 'enrolled 24 contacts in', target: '"Connection + Nurture"', time: '3h ago' },
  { person: 'David Jansen', action: 'completed 18 cold calls', target: 'Discovery Call Script', time: '4h ago' },
  { person: 'Sofia Nakamura', action: 'moved deal to Proposal', target: 'Veritas Cloud ($52K)', time: '5h ago' },
  { person: 'Marcus Rivera', action: 'got 3 interested replies from', target: 'Telegram Group Intro', time: '6h ago' },
  { person: 'Arjun Kapoor', action: 'added 45 contacts to', target: 'SaaS ICP list', time: '8h ago' },
  { person: 'Lena Petrov', action: 'updated sequence', target: '"Bot Auto-Sequence" step 3', time: '12h ago' },
];

function Team() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="page-content">
      <Tabs tabs={teamTabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' && (
        <>
          <div className="grid grid-5" style={{ marginTop: 20 }}>
            {members.map(m => (
              <div key={m.name} className="card" style={{ textAlign: 'center' }}>
                <div className="team-avatar" style={{ width: 48, height: 48, margin: '0 auto 12px', borderRadius: 4 }}>
                  <img src={m.avatar} alt={m.name} style={{ filter: 'grayscale(100%) contrast(1.1)' }} onError={e => { e.target.style.display = 'none'; }} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{m.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 16 }}>{m.role}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, textAlign: 'center' }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 300, color: 'var(--text)' }}>{m.sent.toLocaleString()}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Sent</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 300, color: 'var(--text)' }}>{m.replies}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Replies</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 300, color: 'var(--text)' }}>{m.meetings}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Meetings</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 300, color: 'var(--text)' }}>${(m.revenue / 1000).toFixed(1)}K</div>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Revenue</div>
                  </div>
                </div>
                <BarChart count={10} minH={20} maxH={80} trend="up" />
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'leaderboard' && (
        <>
          <div className="section-label" style={{ marginTop: 20 }}>Monthly Leaderboard</div>
          <div className="card" style={{ padding: 0 }}>
            {members.map((m, i) => (
              <div key={m.name} style={{ display: 'grid', gridTemplateColumns: '40px 48px 1.5fr repeat(4, 1fr)', gap: 16, alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 20, fontWeight: 300, color: i === 0 ? 'var(--text)' : 'var(--text-dim)', textAlign: 'center' }}>#{m.rank}</div>
                <div className="team-avatar" style={{ width: 36, height: 36, borderRadius: 4 }}>
                  <img src={m.avatar} alt={m.name} style={{ filter: 'grayscale(100%) contrast(1.1)' }} onError={e => { e.target.style.display = 'none'; }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{m.role} &middot; {m.streak} day streak</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{m.meetings}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Meetings</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{m.deals}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Deals</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>${(m.revenue / 1000).toFixed(1)}K</div>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Revenue</div>
                </div>
                <div style={{ width: 80 }}>
                  <div style={{ height: 6, background: 'var(--track)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${m.revenue / 284}%`, height: '100%', background: i === 0 ? 'var(--fill-strong)' : 'var(--fill-dim)', borderRadius: 2 }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === 'activity' && (
        <>
          <div className="section-label" style={{ marginTop: 20 }}>Recent Activity</div>
          <div className="card">
            {activities.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: i < activities.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-soft)', marginTop: 6, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    <span style={{ color: 'var(--text)', fontWeight: 500 }}>{a.person}</span> {a.action} <span style={{ color: 'var(--text)' }}>{a.target}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default Team;
