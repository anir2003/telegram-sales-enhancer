import React from 'react';

const statuses = [
  { label: 'Email Deliverability', value: '98.2%', status: 'active' },
  { label: 'Domain Health (SPF/DKIM)', value: 'Passing', status: 'active' },
  { label: 'LinkedIn Account Standing', value: 'Good', status: 'active' },
  { label: 'Telegram Bot', value: 'Running', status: 'active' },
  { label: 'CRM Sync', value: 'Synced', status: 'active' },
  { label: 'Enrichment API', value: 'Degraded', status: 'warning' },
  { label: 'Call System', value: 'Low Credits', status: 'warning' },
  { label: 'Backup Domains', value: 'Inactive', status: 'inactive' },
];

function CompanyStatus() {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Operational Status</span>
        <span className="menu-dots">&middot;&middot;&middot;</span>
      </div>
      <div style={{ marginTop: 12 }}>
        {statuses.map((s, i) => (
          <div key={i} className="status-item">
            <span className={`status-dot ${s.status}`} />
            <span className="status-label">{s.label}</span>
            <span className="status-value">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CompanyStatus;
