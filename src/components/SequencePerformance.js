import React from 'react';
import BarChart from './BarChart';

function ResponseTime() {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Avg Response Time</span>
        <span className="card-icon">&#8599;</span>
      </div>
      <div className="card-value">2.4h</div>
      <div className="card-change">
        <span className="badge">
          <span className="arrow">&#8599;</span> -18%
        </span>
        faster than last week
      </div>
      <BarChart count={14} minH={30} maxH={90} trend="down" />
    </div>
  );
}

function BestSequence() {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Best Performing Sequence</span>
        <span className="menu-dots">&middot;&middot;&middot;</span>
      </div>
      <div>
        <span className="tag">email</span>
        <span className="tag">3-step</span>
        <span className="tag">SaaS ICP</span>
      </div>
      <div className="divider" style={{ marginTop: 12 }} />
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>
        "Pain Point Opener"
      </div>
      <div className="card-subtitle">3-step email sequence targeting SaaS founders</div>
      <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 300, color: 'var(--text)' }}>18.2%</div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', marginTop: 2 }}>Reply Rate</div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 300, color: 'var(--text)' }}>6.4%</div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', marginTop: 2 }}>Meeting Rate</div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 300, color: 'var(--text)' }}>847</div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', marginTop: 2 }}>Contacts</div>
        </div>
      </div>
    </div>
  );
}

function BounceRate() {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Bounce &amp; Spam Rate</span>
        <span className="card-icon">&#8599;</span>
      </div>
      <div className="card-value">1.8%</div>
      <div className="card-change">
        <span className="badge">
          <span className="arrow">&#8599;</span> -0.4%
        </span>
        improving
      </div>
      <BarChart count={14} minH={10} maxH={60} trend="down" />
    </div>
  );
}

export { ResponseTime, BestSequence, BounceRate };
