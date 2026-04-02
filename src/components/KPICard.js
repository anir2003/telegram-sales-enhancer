import React from 'react';
import BarChart from './BarChart';

function KPICard({ title, value, change, changeLabel, barProps }) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">{title}</span>
        <span className="card-icon">&#8599;</span>
      </div>
      <div className="card-value">{value}</div>
      <div className="card-change">
        <span className="badge">
          <span className="arrow">&#8599;</span> {change}
        </span>
        {changeLabel}
      </div>
      <BarChart {...barProps} />
    </div>
  );
}

export default KPICard;
