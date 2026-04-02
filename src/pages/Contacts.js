import React, { useState } from 'react';
import Tabs from '../components/Tabs';
import { IconFilter, IconExport, IconPlus } from '../components/Icons';

const contactTabs = [
  { id: 'all', label: 'All Contacts', count: 2847 },
  { id: 'leads', label: 'New Leads', count: 412 },
  { id: 'engaged', label: 'Engaged', count: 834 },
  { id: 'meeting', label: 'Meeting Set', count: 132 },
  { id: 'qualified', label: 'Qualified', count: 89 },
  { id: 'unresponsive', label: 'Unresponsive', count: 1380 },
];

const contacts = [
  { name: 'Sarah Chen', company: 'TechFlow Inc', title: 'VP of Engineering', email: 'sarah@techflow.io', status: 'engaged', lastActivity: '2h ago', channel: 'Email', score: 92, avatar: 'https://i.pravatar.cc/64?img=1' },
  { name: 'James Morrison', company: 'DataStack', title: 'CTO', email: 'james@datastack.co', status: 'meeting', lastActivity: '4h ago', channel: 'LinkedIn', score: 88, avatar: 'https://i.pravatar.cc/64?img=3' },
  { name: 'Elena Rodriguez', company: 'ScaleUp AI', title: 'Head of Growth', email: 'elena@scaleup.ai', status: 'engaged', lastActivity: '1d ago', channel: 'Email', score: 85, avatar: 'https://i.pravatar.cc/64?img=5' },
  { name: 'Michael Park', company: 'CloudNine SaaS', title: 'CEO', email: 'michael@cloudnine.com', status: 'qualified', lastActivity: '3h ago', channel: 'Cold Call', score: 94, avatar: 'https://i.pravatar.cc/64?img=8' },
  { name: 'Lisa Wang', company: 'Nexus Labs', title: 'VP Sales', email: 'lisa@nexuslabs.io', status: 'leads', lastActivity: '6h ago', channel: 'Telegram', score: 72, avatar: 'https://i.pravatar.cc/64?img=9' },
  { name: 'David Okafor', company: 'FinSync', title: 'Director of Eng', email: 'david@finsync.com', status: 'engaged', lastActivity: '12h ago', channel: 'Email', score: 78, avatar: 'https://i.pravatar.cc/64?img=12' },
  { name: 'Anna Kowalski', company: 'ByteShift', title: 'CTO', email: 'anna@byteshift.io', status: 'leads', lastActivity: '1d ago', channel: 'LinkedIn', score: 68, avatar: 'https://i.pravatar.cc/64?img=16' },
  { name: 'Raj Mehta', company: 'PulseMetrics', title: 'CEO', email: 'raj@pulsemetrics.com', status: 'unresponsive', lastActivity: '5d ago', channel: 'Email', score: 45, avatar: 'https://i.pravatar.cc/64?img=14' },
  { name: 'Sophie Laurent', company: 'Veritas Cloud', title: 'Head of Product', email: 'sophie@veritascloud.co', status: 'meeting', lastActivity: '1h ago', channel: 'LinkedIn', score: 91, avatar: 'https://i.pravatar.cc/64?img=20' },
  { name: 'Tom Harris', company: 'GridPoint', title: 'VP Engineering', email: 'tom@gridpoint.dev', status: 'engaged', lastActivity: '2d ago', channel: 'Telegram', score: 74, avatar: 'https://i.pravatar.cc/64?img=53' },
  { name: 'Maria Santos', company: 'LevelUp SaaS', title: 'COO', email: 'maria@levelup.io', status: 'qualified', lastActivity: '8h ago', channel: 'Email', score: 87, avatar: 'https://i.pravatar.cc/64?img=23' },
  { name: 'Chris Nguyen', company: 'Apex Data', title: 'Founder', email: 'chris@apexdata.co', status: 'leads', lastActivity: '3d ago', channel: 'Cold Call', score: 62, avatar: 'https://i.pravatar.cc/64?img=33' },
];

const statusColors = {
  leads: 'var(--status-soft)',
  engaged: 'var(--status-mid)',
  meeting: 'var(--status-dim)',
  qualified: 'var(--status-strong)',
  unresponsive: 'var(--status-quiet)',
};

function ScoreBar({ score }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 48, height: 4, background: 'var(--track)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: score > 80 ? 'var(--fill-strong)' : score > 60 ? 'var(--fill-mid)' : 'var(--fill-soft)', borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{score}</span>
    </div>
  );
}

function Contacts() {
  const [activeTab, setActiveTab] = useState('all');
  const filtered = activeTab === 'all' ? contacts : contacts.filter(c => c.status === activeTab);

  return (
    <div className="page-content">
      <Tabs tabs={contactTabs} activeTab={activeTab} onChange={setActiveTab} />

      <div className="grid grid-4" style={{ marginTop: 20 }}>
        <div className="card">
          <div className="card-title">Total Contacts</div>
          <div className="card-value">2,847</div>
          <div className="card-change"><span className="badge"><span className="arrow">&#8599;</span> +124</span> this week</div>
        </div>
        <div className="card">
          <div className="card-title">Contacted Today</div>
          <div className="card-value">186</div>
          <div className="card-change"><span className="badge"><span className="arrow">&#8599;</span> +23%</span> vs avg</div>
        </div>
        <div className="card">
          <div className="card-title">Avg Lead Score</div>
          <div className="card-value">74.2</div>
          <div className="card-change"><span className="badge"><span className="arrow">&#8599;</span> +4.1</span> this month</div>
        </div>
        <div className="card">
          <div className="card-title">Enrichment Rate</div>
          <div className="card-value">92.4%</div>
          <div className="card-change"><span className="badge"><span className="arrow">&#8599;</span> +1.8%</span> vs last batch</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
        <div className="section-label" style={{ margin: 0 }}>
          {activeTab === 'all' ? 'All Contacts' : contactTabs.find(t => t.id === activeTab)?.label} ({filtered.length})
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="topbar-action-btn" style={{ background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text)' }}>
            <IconFilter size={13} /><span>Filter</span>
          </button>
          <button className="topbar-action-btn" style={{ background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text)' }}>
            <IconExport size={13} /><span>Export</span>
          </button>
          <button className="topbar-action-btn">
            <IconPlus size={13} /><span>Import</span>
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, marginTop: 16 }}>
        <div className="contact-table-header">
          <div></div>
          <div>Name</div>
          <div>Company</div>
          <div>Channel</div>
          <div>Status</div>
          <div>Score</div>
          <div>Last Activity</div>
        </div>
        {filtered.map((c, i) => (
          <div key={i} className="contact-row">
            <div className="team-avatar" style={{ width: 28, height: 28 }}>
              <img src={c.avatar} alt={c.name} style={{ filter: 'grayscale(100%) contrast(1.1)' }} onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = c.name.split(' ').map(n => n[0]).join(''); }} />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{c.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{c.title}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.company}</div>
            <div><span className="tag">{c.channel}</span></div>
            <div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColors[c.status] }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.status}</span>
              </span>
            </div>
            <div><ScoreBar score={c.score} /></div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{c.lastActivity}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Contacts;
