import React, { useMemo, useState } from 'react';

const people = ['Arjun Kapoor', 'Sofia Nakamura', 'Marcus Rivera', 'Lena Petrov', 'David Jansen'];
const channels = ['Email', 'LinkedIn', 'Telegram', 'Cold Call'];
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function generateCellData(heat) {
  if (heat === 0) return null;
  const total = heat * Math.floor(Math.random() * 12 + 5);
  const breakdown = {};
  const activeChannels = channels.slice(0, Math.floor(Math.random() * 3) + 2);
  let remaining = total;
  activeChannels.forEach((ch, i) => {
    if (i === activeChannels.length - 1) {
      breakdown[ch] = remaining;
    } else {
      const portion = Math.floor(Math.random() * remaining * 0.6) + 1;
      breakdown[ch] = portion;
      remaining -= portion;
    }
  });
  const topSenders = people
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(3, Math.floor(Math.random() * 3) + 1))
    .map(name => ({
      name: name.split(' ')[0],
      count: Math.floor(Math.random() * total * 0.5) + 1
    }))
    .sort((a, b) => b.count - a.count);

  return { total, breakdown, topSenders };
}

function HeatmapCell({ heat, weekIndex, dayName }) {
  const [hovered, setHovered] = useState(false);
  const data = useMemo(() => generateCellData(heat), [heat]);

  const fakeDate = useMemo(() => {
    const d = new Date(2025, 3, 1);
    d.setDate(d.getDate() + weekIndex * 7);
    return `${monthNames[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }, [weekIndex]);

  return (
    <div
      className={`heatmap-cell heat-${heat}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && (
        <div className="heatmap-tooltip">
          <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--fill-strong)' }}>
            {dayName}, {fakeDate}
          </div>
          {data ? (
            <>
              <div style={{ color: 'var(--status-mid)', marginBottom: 6 }}>
                {data.total} messages sent
              </div>
              <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 6, marginBottom: 4 }}>
                <span style={{ color: 'var(--status-dim)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>By channel</span>
              </div>
              {Object.entries(data.breakdown).map(([ch, count]) => (
                <div key={ch} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, color: 'var(--status-soft)' }}>
                  <span>{ch}</span>
                  <span style={{ color: 'var(--fill-strong)', fontWeight: 500 }}>{count}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 6, marginTop: 6, marginBottom: 4 }}>
                <span style={{ color: 'var(--status-dim)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top senders</span>
              </div>
              {data.topSenders.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, color: 'var(--status-soft)' }}>
                  <span>{s.name}</span>
                  <span style={{ color: 'var(--fill-strong)', fontWeight: 500 }}>{s.count}</span>
                </div>
              ))}
            </>
          ) : (
            <div style={{ color: 'var(--status-dim)' }}>No activity</div>
          )}
        </div>
      )}
    </div>
  );
}

function HeatmapRow({ dayName }) {
  const cells = useMemo(() => {
    return Array.from({ length: 52 }, (_, w) => {
      const recency = w / 52;
      let base;
      if (recency > 0.7) base = Math.floor(Math.random() * 4) + 2;
      else if (recency > 0.4) base = Math.floor(Math.random() * 4) + 1;
      else base = Math.floor(Math.random() * 4);
      const heat = Math.random() > 0.15 ? base : 0;
      return Math.min(heat, 5);
    });
  }, []);

  return (
    <div className="heatmap-grid">
      {cells.map((heat, i) => (
        <HeatmapCell key={i} heat={heat} weekIndex={i} dayName={dayName} />
      ))}
    </div>
  );
}

function Heatmap() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const months = ['Apr', 'Jun', 'Aug', 'Oct', 'Dec', 'Feb', 'Apr'];

  return (
    <div className="card" style={{ overflow: 'visible' }}>
      <div className="card-header">
        <span className="card-title">Daily Outreach Heatmap</span>
        <span className="card-icon">&#8599;</span>
      </div>
      <div className="card-subtitle">Messages sent per day &middot; last 52 weeks &middot; hover for details</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '2px 0' }}>
          {days.map(d => (
            <span key={d} style={{ fontSize: 10, color: 'var(--text-dim)' }}>{d}</span>
          ))}
        </div>
        <div style={{ flex: 1 }}>
          {days.map(d => (
            <HeatmapRow key={d} dayName={d} />
          ))}
          <div className="heatmap-labels">
            {months.map((m, i) => <span key={i}>{m}</span>)}
          </div>
          <div className="heatmap-legend">
            <span>Less</span>
            {[0, 1, 2, 3, 4, 5].map(h => (
              <div key={h} className={`legend-cell heat-${h}`} />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Heatmap;
