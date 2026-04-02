import React from 'react';

const conversions = [
  { label: 'Email Open Rate', value: '48.3%', pct: 48.3 },
  { label: 'Email → Reply', value: '12.4%', pct: 12.4 },
  { label: 'Reply → Meeting', value: '34.1%', pct: 34.1 },
  { label: 'Meeting → Proposal', value: '52.6%', pct: 52.6 },
  { label: 'Proposal → Close', value: '48.9%', pct: 48.9 },
  { label: 'Overall Lead → Close', value: '1.1%', pct: 1.1 },
  { label: 'LinkedIn Accept Rate', value: '31.2%', pct: 31.2 },
  { label: 'Telegram Response Rate', value: '22.7%', pct: 22.7 },
];

function ConversionRates() {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Conversion Rates</span>
        <span className="card-icon">&#8599;</span>
      </div>
      <div style={{ marginTop: 12 }}>
        {conversions.map((c, i) => (
          <div key={i} className="status-item">
            <span className="status-label">{c.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="conversion-bar-track">
                <div
                  className="conversion-bar-fill"
                  style={{
                    width: `${c.pct}%`,
                    background: c.pct > 40 ? 'var(--fill-strong)' : c.pct > 20 ? 'var(--fill-mid)' : 'var(--fill-dim)'
                  }}
                />
              </div>
              <span className="status-value">{c.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ConversionRates;
