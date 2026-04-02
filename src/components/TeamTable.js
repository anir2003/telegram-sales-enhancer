import React from 'react';

const teamData = [
  { initials: 'AK', name: 'Arjun Kapoor', role: 'SDR Lead', sent: 1248, replies: 156, meetings: 42, deals: 14, revenue: '$28.4K', trend: [30, 45, 38, 52, 60, 55, 70, 75, 82, 90], avatar: 'https://i.pravatar.cc/64?img=11' },
  { initials: 'SN', name: 'Sofia Nakamura', role: 'Account Executive', sent: 986, replies: 134, meetings: 38, deals: 12, revenue: '$22.1K', trend: [25, 35, 40, 38, 48, 55, 60, 58, 68, 72], avatar: 'https://i.pravatar.cc/64?img=5' },
  { initials: 'MR', name: 'Marcus Rivera', role: 'SDR', sent: 874, replies: 98, meetings: 28, deals: 9, revenue: '$16.8K', trend: [20, 28, 32, 35, 40, 42, 50, 55, 60, 65], avatar: 'https://i.pravatar.cc/64?img=12' },
  { initials: 'LP', name: 'Lena Petrov', role: 'SDR', sent: 642, replies: 78, meetings: 18, deals: 8, revenue: '$12.2K', trend: [15, 20, 25, 30, 28, 35, 40, 45, 48, 52], avatar: 'https://i.pravatar.cc/64?img=9' },
  { initials: 'DJ', name: 'David Jansen', role: 'BDR', sent: 468, replies: 52, meetings: 14, deals: 4, revenue: '$4.7K', trend: [10, 15, 18, 22, 20, 25, 28, 30, 35, 38], avatar: 'https://i.pravatar.cc/64?img=53' },
];

function MiniTrend({ data }) {
  return (
    <div className="mini-bars">
      {data.map((v, i) => (
        <div
          key={i}
          className="mini-bar"
          style={{
            height: `${v}%`,
            background: `rgb(${30 + v * 0.7}%,${30 + v * 0.7}%,${30 + v * 0.7}%)`
          }}
        />
      ))}
    </div>
  );
}

function TeamTable() {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Individual Metrics &middot; This Month</span>
        <span className="menu-dots">&middot;&middot;&middot;</span>
      </div>

      <div className="team-table-header">
        <span></span>
        <span>Name</span>
        <span style={{ textAlign: 'right' }}>Sent</span>
        <span style={{ textAlign: 'right' }}>Replies</span>
        <span style={{ textAlign: 'right' }}>Meetings</span>
        <span style={{ textAlign: 'right' }}>Deals</span>
        <span style={{ textAlign: 'right' }}>Revenue</span>
        <span style={{ textAlign: 'center' }}>Trend</span>
      </div>

      {teamData.map(p => (
        <div key={p.initials} className="team-table-row">
          <div className="team-avatar">
            <img
              src={p.avatar}
              alt={p.name}
              style={{ filter: 'grayscale(100%) contrast(1.1)' }}
              onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.textContent = p.initials; }}
            />
          </div>
          <div>
            <div className="team-name">{p.name}</div>
            <div className="team-role">{p.role}</div>
          </div>
          <div className="team-stat">{p.sent.toLocaleString()}</div>
          <div className="team-stat">{p.replies}</div>
          <div className="team-stat">{p.meetings}</div>
          <div className="team-stat">{p.deals}</div>
          <div className="team-stat">{p.revenue}</div>
          <MiniTrend data={p.trend} />
        </div>
      ))}
    </div>
  );
}

export default TeamTable;
