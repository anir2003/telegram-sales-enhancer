import React from 'react';
import ProgressBar from './ProgressBar';

function WeeklySnapshot() {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">This Week Snapshot</span>
        <span className="card-icon">&#8599;</span>
      </div>
      <div style={{ marginTop: 4 }}>
        <span className="tag">week 14</span>
        <span className="tag">cold-outreach</span>
        <span className="tag">pipeline</span>
      </div>
      <div className="divider" style={{ marginTop: 12 }} />
      <div className="card-subtitle">You are on track to reach the weekly goal in 2 days.</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0' }}>
        <span style={{ fontSize: 28, fontWeight: 300, color: 'var(--text)' }}>66%</span>
        <span className="badge">
          <span className="arrow">&#8599;</span> 30%
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>vs. the last period</span>
      </div>
      <ProgressBar filled={22} total={33} height={48} />
    </div>
  );
}

export default WeeklySnapshot;
