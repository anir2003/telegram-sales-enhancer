import React from 'react';

const stages = [
  { label: 'Contacted', count: 312, flex: 8, bg: '#ffffff', color: '#111' },
  { label: 'Interested', count: 187, flex: 5, bg: '#bbbbbb', color: '#111' },
  { label: 'Meeting', count: 94, flex: 3, bg: '#777777', color: '#ddd' },
  { label: 'Proposal', count: 47, flex: 2, bg: '#444444', color: '#bbb' },
  { label: 'Closed', count: 23, flex: 1.2, bg: '#222222', color: '#888' },
];

function Pipeline() {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Pipeline Stages</span>
        <span className="menu-dots">&middot;&middot;&middot;</span>
      </div>
      <div className="card-subtitle">Current active deals by stage</div>
      <div className="pipeline">
        {stages.map(s => (
          <div
            key={s.label}
            className="pipeline-stage"
            style={{ flex: s.flex, background: s.bg, color: s.color }}
          >
            {s.count}
          </div>
        ))}
      </div>
      <div className="pipeline-labels">
        {stages.map(s => (
          <div key={s.label} className="pipeline-label" style={{ flex: s.flex }}>
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Pipeline;
