import React, { useState } from 'react';
import Tabs from '../components/Tabs';
import BarChart from '../components/BarChart';

const viewTabs = [
  { id: 'board', label: 'Board View' },
  { id: 'list', label: 'List View' },
  { id: 'forecast', label: 'Forecast' },
];

const stages = [
  { id: 'contacted', label: 'Contacted', color: 'var(--status-quiet)' },
  { id: 'interested', label: 'Interested', color: 'var(--status-soft)' },
  { id: 'meeting', label: 'Meeting Set', color: 'var(--status-dim)' },
  { id: 'proposal', label: 'Proposal', color: 'var(--status-mid)' },
  { id: 'negotiation', label: 'Negotiation', color: 'var(--text-dim)' },
  { id: 'closed', label: 'Closed Won', color: 'var(--status-strong)' },
];

const deals = [
  { id: 1, name: 'TechFlow Inc', value: 24000, owner: 'Arjun', stage: 'negotiation', probability: 85, daysInStage: 3, contact: 'Sarah Chen' },
  { id: 2, name: 'DataStack', value: 18000, owner: 'Sofia', stage: 'proposal', probability: 60, daysInStage: 5, contact: 'James Morrison' },
  { id: 3, name: 'ScaleUp AI', value: 36000, owner: 'Arjun', stage: 'meeting', probability: 40, daysInStage: 2, contact: 'Elena Rodriguez' },
  { id: 4, name: 'CloudNine SaaS', value: 42000, owner: 'Marcus', stage: 'negotiation', probability: 90, daysInStage: 1, contact: 'Michael Park' },
  { id: 5, name: 'Nexus Labs', value: 15000, owner: 'Lena', stage: 'interested', probability: 25, daysInStage: 4, contact: 'Lisa Wang' },
  { id: 6, name: 'FinSync', value: 28000, owner: 'Sofia', stage: 'meeting', probability: 45, daysInStage: 7, contact: 'David Okafor' },
  { id: 7, name: 'ByteShift', value: 12000, owner: 'David', stage: 'contacted', probability: 10, daysInStage: 1, contact: 'Anna Kowalski' },
  { id: 8, name: 'Veritas Cloud', value: 52000, owner: 'Arjun', stage: 'proposal', probability: 70, daysInStage: 3, contact: 'Sophie Laurent' },
  { id: 9, name: 'GridPoint', value: 8000, owner: 'Lena', stage: 'contacted', probability: 15, daysInStage: 6, contact: 'Tom Harris' },
  { id: 10, name: 'LevelUp SaaS', value: 31000, owner: 'Marcus', stage: 'closed', probability: 100, daysInStage: 0, contact: 'Maria Santos' },
  { id: 11, name: 'Apex Data', value: 19000, owner: 'David', stage: 'interested', probability: 20, daysInStage: 3, contact: 'Chris Nguyen' },
  { id: 12, name: 'PulseMetrics', value: 22000, owner: 'Sofia', stage: 'meeting', probability: 50, daysInStage: 4, contact: 'Raj Mehta' },
];

function DealCard({ deal }) {
  return (
    <div className="deal-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{deal.name}</div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>${(deal.value / 1000).toFixed(0)}K</div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{deal.contact}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{deal.owner}</span>
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{deal.daysInStage}d in stage</span>
      </div>
      <div style={{ marginTop: 8, height: 3, background: 'var(--track)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${deal.probability}%`, height: '100%', background: deal.probability > 70 ? 'var(--fill-strong)' : deal.probability > 40 ? 'var(--fill-mid)' : 'var(--fill-soft)', borderRadius: 2 }} />
      </div>
    </div>
  );
}

function PipelinePage() {
  const [activeTab, setActiveTab] = useState('board');

  const totalValue = deals.reduce((a, d) => a + d.value, 0);
  const weightedValue = deals.reduce((a, d) => a + d.value * d.probability / 100, 0);

  return (
    <div className="page-content">
      <Tabs tabs={viewTabs} activeTab={activeTab} onChange={setActiveTab} />

      <div className="grid grid-4" style={{ marginTop: 20 }}>
        <div className="card">
          <div className="card-title">Pipeline Value</div>
          <div className="card-value">${(totalValue / 1000).toFixed(0)}K</div>
          <div className="card-change"><span className="badge"><span className="arrow">&#8599;</span> +$42K</span> this month</div>
        </div>
        <div className="card">
          <div className="card-title">Weighted Value</div>
          <div className="card-value">${(weightedValue / 1000).toFixed(0)}K</div>
          <div className="card-change"><span className="badge"><span className="arrow">&#8599;</span> +$18K</span> this month</div>
        </div>
        <div className="card">
          <div className="card-title">Active Deals</div>
          <div className="card-value">{deals.length}</div>
          <div className="card-change"><span className="badge"><span className="arrow">&#8599;</span> +4</span> this week</div>
        </div>
        <div className="card">
          <div className="card-title">Avg Deal Size</div>
          <div className="card-value">${(totalValue / deals.length / 1000).toFixed(1)}K</div>
          <div className="card-change"><span className="badge"><span className="arrow">&#8599;</span> +$2.1K</span> vs last mo</div>
        </div>
      </div>

      {activeTab === 'board' && (
        <div className="pipeline-board">
          {stages.map(stage => {
            const stageDeals = deals.filter(d => d.stage === stage.id);
            const stageValue = stageDeals.reduce((a, d) => a + d.value, 0);
            return (
              <div key={stage.id} className="pipeline-column">
                <div className="pipeline-column-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: stage.color }} />
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stage.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{stageDeals.length}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>${(stageValue / 1000).toFixed(0)}K</span>
                  </div>
                </div>
                {stageDeals.map(deal => <DealCard key={deal.id} deal={deal} />)}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'list' && (
        <div className="card" style={{ padding: 0, marginTop: 20 }}>
          <div className="deal-list-header">
            <div>Deal</div><div>Contact</div><div>Value</div><div>Stage</div><div>Owner</div><div>Probability</div><div>Days</div>
          </div>
          {deals.map(d => (
            <div key={d.id} className="deal-list-row">
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{d.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.contact}</div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>${(d.value / 1000).toFixed(0)}K</div>
              <div><span className="tag">{stages.find(s => s.id === d.stage)?.label}</span></div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.owner}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 40, height: 4, background: 'var(--track)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${d.probability}%`, height: '100%', background: d.probability > 70 ? 'var(--fill-strong)' : 'var(--fill-dim)', borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.probability}%</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{d.daysInStage}d</div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'forecast' && (
        <>
          <div className="section-label">Revenue Forecast</div>
          <div className="grid grid-2">
            <div className="card">
              <div className="card-header"><span className="card-title">Monthly Forecast</span><span className="card-icon">&#8599;</span></div>
              <div className="card-subtitle">Projected close based on weighted pipeline</div>
              <BarChart count={12} minH={20} maxH={95} trend="up" tall />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>Jan</span>
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>Dec</span>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><span className="card-title">Win Rate by Stage</span><span className="card-icon">&#8599;</span></div>
              <div style={{ marginTop: 12 }}>
                {stages.map(s => {
                  const rate = s.id === 'closed' ? 100 : s.id === 'negotiation' ? 78 : s.id === 'proposal' ? 52 : s.id === 'meeting' ? 34 : s.id === 'interested' ? 18 : 8;
                  return (
                    <div key={s.id} className="status-item">
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 12, flexShrink: 0 }} />
                      <span className="status-label">{s.label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60, height: 4, background: 'var(--track)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${rate}%`, height: '100%', background: s.color, borderRadius: 2 }} />
                        </div>
                        <span className="status-value">{rate}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default PipelinePage;
