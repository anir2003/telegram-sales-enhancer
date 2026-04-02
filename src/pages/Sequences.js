import React, { useEffect, useMemo, useState } from 'react';
import Tabs from '../components/Tabs';
import BarChart from '../components/BarChart';
import {
  IconMail,
  IconLinkedIn,
  IconTelegram,
  IconPhone,
  IconPlay,
  IconPause,
  IconCheck,
  IconClock,
  IconChevronRight,
} from '../components/Icons';

const channelTabs = [
  { id: 'all', label: 'All Sequences', count: 18 },
  { id: 'email', label: 'Email', icon: <IconMail size={13} />, count: 8 },
  { id: 'linkedin', label: 'LinkedIn', icon: <IconLinkedIn size={13} />, count: 5 },
  { id: 'telegram', label: 'Telegram', icon: <IconTelegram size={13} />, count: 3 },
  { id: 'calls', label: 'Cold Calls', icon: <IconPhone size={13} />, count: 2 },
];

const initialSequences = [
  { id: 1, name: 'Pain Point Opener', channel: 'email', steps: 3, status: 'active', enrolled: 847, replied: 154, meetings: 54, replyRate: 18.2, meetingRate: 6.4, tags: ['SaaS ICP', '3-step'] },
  { id: 2, name: 'Case Study Follow-up', channel: 'email', steps: 4, status: 'active', enrolled: 623, replied: 87, meetings: 31, replyRate: 14.0, meetingRate: 5.0, tags: ['enterprise', '4-step'] },
  { id: 3, name: 'Quick Value Prop', channel: 'email', steps: 2, status: 'active', enrolled: 412, replied: 58, meetings: 18, replyRate: 14.1, meetingRate: 4.4, tags: ['SMB', 'short'] },
  { id: 4, name: 'CEO Direct Outreach', channel: 'linkedin', steps: 5, status: 'active', enrolled: 312, replied: 62, meetings: 28, replyRate: 19.9, meetingRate: 9.0, tags: ['C-suite', 'personal'] },
  { id: 5, name: 'Connection + Nurture', channel: 'linkedin', steps: 4, status: 'active', enrolled: 287, replied: 43, meetings: 15, replyRate: 15.0, meetingRate: 5.2, tags: ['warm', 'nurture'] },
  { id: 6, name: 'InMail Blitz', channel: 'linkedin', steps: 2, status: 'paused', enrolled: 198, replied: 22, meetings: 8, replyRate: 11.1, meetingRate: 4.0, tags: ['InMail', 'volume'] },
  { id: 7, name: 'Telegram Group Intro', channel: 'telegram', steps: 3, status: 'active', enrolled: 524, replied: 89, meetings: 22, replyRate: 17.0, meetingRate: 4.2, tags: ['groups', 'crypto'] },
  { id: 8, name: 'Bot Auto-Sequence', channel: 'telegram', steps: 6, status: 'active', enrolled: 439, replied: 61, meetings: 14, replyRate: 13.9, meetingRate: 3.2, tags: ['automated', 'bot'] },
  { id: 9, name: 'Discovery Call Script', channel: 'calls', steps: 1, status: 'active', enrolled: 312, replied: 78, meetings: 42, replyRate: 25.0, meetingRate: 13.5, tags: ['script', 'high-intent'] },
  { id: 10, name: 'Re-engagement Warm', channel: 'email', steps: 3, status: 'paused', enrolled: 245, replied: 29, meetings: 8, replyRate: 11.8, meetingRate: 3.3, tags: ['re-engage', 'warm'] },
  { id: 11, name: 'Multi-Channel Blitz', channel: 'email', steps: 7, status: 'active', enrolled: 156, replied: 34, meetings: 16, replyRate: 21.8, meetingRate: 10.3, tags: ['multi-channel', 'premium'] },
  { id: 12, name: 'Referral Ask', channel: 'linkedin', steps: 3, status: 'active', enrolled: 178, replied: 38, meetings: 12, replyRate: 21.3, meetingRate: 6.7, tags: ['referral', 'ask'] },
];

const statusColor = {
  active: 'var(--status-strong)',
  paused: 'var(--status-dim)',
  completed: 'var(--status-soft)',
};

function getStatusIcon(status) {
  if (status === 'paused') {
    return <IconPause size={12} />;
  }
  if (status === 'completed') {
    return <IconCheck size={12} />;
  }
  return <IconPlay size={12} />;
}

function buildSequenceSteps(seq) {
  const steps = [
    { day: 0, type: 'Initial', subject: 'First touch — personalized opener', sent: seq.enrolled, opened: Math.floor(seq.enrolled * 0.52), replied: Math.floor(seq.replied * 0.5) },
    { day: 2, type: 'Follow-up', subject: 'Value prop with social proof', sent: Math.floor(seq.enrolled * 0.85), opened: Math.floor(seq.enrolled * 0.38), replied: Math.floor(seq.replied * 0.3) },
    { day: 5, type: 'Breakup', subject: 'Final nudge — last chance CTA', sent: Math.floor(seq.enrolled * 0.7), opened: Math.floor(seq.enrolled * 0.28), replied: Math.floor(seq.replied * 0.2) },
    { day: 8, type: 'Re-engage', subject: 'New angle — case study share', sent: Math.floor(seq.enrolled * 0.5), opened: Math.floor(seq.enrolled * 0.2), replied: Math.floor(seq.replied * 0.1) },
    { day: 12, type: 'Nurture', subject: 'Resource share — no ask', sent: Math.floor(seq.enrolled * 0.35), opened: Math.floor(seq.enrolled * 0.12), replied: Math.floor(seq.replied * 0.05) },
    { day: 16, type: 'Social Proof', subject: 'Proof point — customer win snapshot', sent: Math.floor(seq.enrolled * 0.25), opened: Math.floor(seq.enrolled * 0.09), replied: Math.floor(seq.replied * 0.03) },
    { day: 21, type: 'Close Loop', subject: 'Final close loop with strong CTA', sent: Math.floor(seq.enrolled * 0.18), opened: Math.floor(seq.enrolled * 0.06), replied: Math.floor(seq.replied * 0.02) },
  ];

  return steps.slice(0, seq.steps);
}

function LiveRunBanner({ seq, liveRun, onPause }) {
  if (!seq || !liveRun) {
    return null;
  }

  const steps = buildSequenceSteps(seq);
  const isComplete = liveRun.phase === 'completed';
  const activeStep = steps[Math.min(Math.max(liveRun.stepIndex - 1, 0), steps.length - 1)];
  const progress = isComplete ? 100 : Math.round((liveRun.stepIndex / steps.length) * 100);

  return (
    <div className="card live-run-card">
      <div className="card-header">
        <div>
          <div className="card-title">Live Sequence Run</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text)', marginTop: 8 }}>{seq.name}</div>
        </div>
        <span className="badge" style={{ borderColor: 'var(--border-soft)' }}>
          {isComplete ? <IconCheck size={10} /> : <IconClock size={10} />}
          {isComplete ? 'Completed' : `Step ${Math.min(liveRun.stepIndex, steps.length)} of ${steps.length}`}
        </span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7, marginTop: 12 }}>
        {isComplete
          ? 'Sequence run completed and the next eligible contacts have been queued for send-window validation.'
          : `Now running ${activeStep.type.toLowerCase()} on day ${activeStep.day}. The message variant "${activeStep.subject}" is being staged for delivery.`}
      </div>

      <div className="live-run-meter">
        <div className="live-run-meter-fill" style={{ width: `${progress}%` }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {progress}% processed
        </div>
        {!isComplete && (
          <button className="ghost-btn" onClick={() => onPause(seq.id)}>
            Pause run
          </button>
        )}
      </div>
    </div>
  );
}

function SequenceRow({ seq, onClick, onRunToggle, isRunning }) {
  const buttonLabel = isRunning ? 'Pause' : seq.status === 'paused' ? 'Play' : 'Replay';

  return (
    <div className="seq-row" onClick={onClick}>
      <div className="seq-row-status" style={{ color: statusColor[seq.status] }}>{getStatusIcon(seq.status)}</div>
      <div className="seq-row-info">
        <div className="seq-row-name">{seq.name}</div>
        <div className="seq-row-meta">
          {seq.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
          <button
            className={`seq-inline-btn ${isRunning ? 'live' : ''}`}
            onClick={(event) => {
              event.stopPropagation();
              onRunToggle(seq.id);
            }}
          >
            {isRunning ? <IconPause size={11} /> : <IconPlay size={11} />}
            {buttonLabel}
          </button>
        </div>
      </div>
      <div className="seq-row-stat">
        <div className="seq-row-stat-val">{seq.steps}</div>
        <div className="seq-row-stat-label">Steps</div>
      </div>
      <div className="seq-row-stat">
        <div className="seq-row-stat-val">{seq.enrolled.toLocaleString()}</div>
        <div className="seq-row-stat-label">Enrolled</div>
      </div>
      <div className="seq-row-stat">
        <div className="seq-row-stat-val">{seq.replied}</div>
        <div className="seq-row-stat-label">Replied</div>
      </div>
      <div className="seq-row-stat">
        <div className="seq-row-stat-val">{seq.replyRate}%</div>
        <div className="seq-row-stat-label">Reply Rate</div>
      </div>
      <div className="seq-row-stat">
        <div className="seq-row-stat-val">{seq.meetings}</div>
        <div className="seq-row-stat-label">Meetings</div>
      </div>
      <div className="seq-row-stat">
        <div className="seq-row-stat-val">{seq.meetingRate}%</div>
        <div className="seq-row-stat-label">Meeting %</div>
      </div>
      <div className="seq-row-arrow"><IconChevronRight /></div>
    </div>
  );
}

function SequenceDetail({ seq, onBack, onRunToggle, onPause, liveRun, isRunning }) {
  const steps = buildSequenceSteps(seq);

  return (
    <div>
      <button className="back-btn" onClick={onBack}>&larr; Back to sequences</button>

      {liveRun?.id === seq.id && <LiveRunBanner seq={seq} liveRun={liveRun} onPause={onPause} />}

      <div className="card" style={{ marginTop: liveRun?.id === seq.id ? 16 : 16 }}>
        <div className="card-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: statusColor[seq.status] }}>{getStatusIcon(seq.status)}</span>
              <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text)' }}>{seq.name}</span>
              <span className="badge" style={{ fontSize: 10 }}>{seq.status}</span>
            </div>
            <div style={{ marginTop: 8 }}>
              {seq.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
            </div>
          </div>
          <div className="seq-toolbar">
            <button className="ghost-btn" onClick={() => onRunToggle(seq.id)}>
              {isRunning ? <IconPause size={11} /> : <IconPlay size={11} />}
              {isRunning ? 'Pause Sequence' : 'Play Sequence'}
            </button>
            <span className="menu-dots">&middot;&middot;&middot;</span>
          </div>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-title">Total Enrolled</div>
          <div className="card-value">{seq.enrolled.toLocaleString()}</div>
          <BarChart count={12} minH={20} maxH={90} trend="up" />
        </div>
        <div className="card">
          <div className="card-title">Reply Rate</div>
          <div className="card-value">{seq.replyRate}%</div>
          <BarChart count={12} minH={30} maxH={80} trend="up" />
        </div>
        <div className="card">
          <div className="card-title">Meetings Booked</div>
          <div className="card-value">{seq.meetings}</div>
          <BarChart count={12} minH={15} maxH={85} trend="up" />
        </div>
        <div className="card">
          <div className="card-title">Avg Response Time</div>
          <div className="card-value">1.8h</div>
          <BarChart count={12} minH={20} maxH={70} trend="down" />
        </div>
      </div>

      <div className="section-label">Sequence Steps</div>
      <div className="card">
        <div className="step-timeline">
          {steps.map((step, index) => {
            const isCompleted = liveRun?.id === seq.id && (liveRun.phase === 'completed' || index < liveRun.stepIndex - 1);
            const isCurrent = liveRun?.id === seq.id && liveRun.phase === 'running' && index === liveRun.stepIndex - 1;

            return (
              <div key={step.subject} className="step-row">
                <div className="step-connector">
                  <div
                    className="step-dot"
                    style={{
                      background: isCompleted || isCurrent ? 'var(--accent)' : 'var(--panel-alt)',
                      borderColor: isCurrent ? 'var(--accent)' : isCompleted ? 'var(--status-dim)' : 'var(--status-quiet)',
                    }}
                  />
                  {index < steps.length - 1 && <div className="step-line" />}
                </div>
                <div className="step-content" style={{ opacity: isCurrent || isCompleted || !liveRun || liveRun.id !== seq.id ? 1 : 0.55 }}>
                  <div className="step-header">
                    <div>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 8 }}>Day {step.day}</span>
                      <span className="tag">{step.type}</span>
                      {isCurrent && <span className="tag" style={{ borderColor: 'var(--accent)', color: 'var(--text)' }}>Live</span>}
                    </div>
                    <span className="menu-dots" style={{ fontSize: 14 }}>&middot;&middot;&middot;</span>
                  </div>
                  <div className="step-subject">{step.subject}</div>
                  <div className="step-stats">
                    <span>{step.sent} sent</span>
                    <span>{step.opened} opened ({Math.round((step.opened / step.sent) * 100)}%)</span>
                    <span>{step.replied} replied ({Math.round((step.replied / step.sent) * 100)}%)</span>
                  </div>
                  <div className="step-funnel">
                    <div className="step-funnel-bar" style={{ width: '100%', background: 'var(--status-quiet)' }} />
                    <div className="step-funnel-bar" style={{ width: `${(step.opened / step.sent) * 100}%`, background: 'var(--status-dim)' }} />
                    <div className="step-funnel-bar" style={{ width: `${(step.replied / step.sent) * 100}%`, background: 'var(--status-strong)' }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="section-label">A/B Test Results</div>
      <div className="grid grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Variant A — Original</span>
            <span className="badge">control</span>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 32 }}>
            <div><div style={{ fontSize: 20, fontWeight: 300, color: 'var(--text)' }}>{seq.replyRate}%</div><div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Reply Rate</div></div>
            <div><div style={{ fontSize: 20, fontWeight: 300, color: 'var(--text)' }}>48.3%</div><div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Open Rate</div></div>
            <div><div style={{ fontSize: 20, fontWeight: 300, color: 'var(--text)' }}>{seq.meetingRate}%</div><div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Meeting Rate</div></div>
          </div>
          <BarChart count={20} minH={20} maxH={75} trend="flat" />
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Variant B — New Subject</span>
            <span className="badge" style={{ borderColor: 'var(--accent)' }}>challenger</span>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 32 }}>
            <div><div style={{ fontSize: 20, fontWeight: 300, color: 'var(--text)' }}>{(seq.replyRate * 1.12).toFixed(1)}%</div><div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Reply Rate</div></div>
            <div><div style={{ fontSize: 20, fontWeight: 300, color: 'var(--text)' }}>52.1%</div><div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Open Rate</div></div>
            <div><div style={{ fontSize: 20, fontWeight: 300, color: 'var(--text)' }}>{(seq.meetingRate * 1.2).toFixed(1)}%</div><div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Meeting Rate</div></div>
          </div>
          <BarChart count={20} minH={25} maxH={85} trend="flat" />
        </div>
      </div>
    </div>
  );
}

function Sequences() {
  const [activeTab, setActiveTab] = useState('all');
  const [sequenceData, setSequenceData] = useState(initialSequences);
  const [selectedSequenceId, setSelectedSequenceId] = useState(null);
  const [liveRun, setLiveRun] = useState(null);

  const filtered = activeTab === 'all' ? sequenceData : sequenceData.filter((sequence) => sequence.channel === activeTab);
  const selectedSeq = sequenceData.find((sequence) => sequence.id === selectedSequenceId) || null;
  const liveSequence = useMemo(
    () => sequenceData.find((sequence) => sequence.id === liveRun?.id) || null,
    [sequenceData, liveRun],
  );

  useEffect(() => {
    if (!liveRun || !liveSequence) {
      return undefined;
    }

    if (liveSequence.status !== 'active') {
      setLiveRun(null);
      return undefined;
    }

    if (liveRun.phase === 'completed') {
      const cleanupTimer = window.setTimeout(() => {
        setLiveRun((current) => (current?.id === liveRun.id ? null : current));
      }, 1800);

      return () => window.clearTimeout(cleanupTimer);
    }

    const timer = window.setTimeout(() => {
      setLiveRun((current) => {
        if (!current || current.id !== liveRun.id) {
          return current;
        }

        if (current.stepIndex >= liveSequence.steps) {
          return { ...current, phase: 'completed' };
        }

        return { ...current, stepIndex: current.stepIndex + 1 };
      });
    }, 850);

    return () => window.clearTimeout(timer);
  }, [liveRun, liveSequence]);

  const handleRunSequence = (sequenceId) => {
    setSequenceData((current) => current.map((sequence) => (
      sequence.id === sequenceId
        ? { ...sequence, status: 'active' }
        : sequence
    )));
    setLiveRun({ id: sequenceId, stepIndex: 1, phase: 'running' });
  };

  const handlePauseSequence = (sequenceId) => {
    setSequenceData((current) => current.map((sequence) => (
      sequence.id === sequenceId
        ? { ...sequence, status: 'paused' }
        : sequence
    )));
    setLiveRun((current) => (current?.id === sequenceId ? null : current));
  };

  const handleRunToggle = (sequenceId) => {
    if (liveRun?.id === sequenceId && liveRun.phase === 'running') {
      handlePauseSequence(sequenceId);
      return;
    }

    handleRunSequence(sequenceId);
  };

  if (selectedSeq) {
    return (
      <div className="page-content">
        <SequenceDetail
          seq={selectedSeq}
          onBack={() => setSelectedSequenceId(null)}
          onRunToggle={handleRunToggle}
          onPause={handlePauseSequence}
          liveRun={liveRun}
          isRunning={liveRun?.id === selectedSeq.id && liveRun.phase === 'running'}
        />
      </div>
    );
  }

  return (
    <div className="page-content">
      <Tabs tabs={channelTabs} activeTab={activeTab} onChange={setActiveTab} />

      {liveSequence && (
        <div style={{ marginTop: 20 }}>
          <LiveRunBanner seq={liveSequence} liveRun={liveRun} onPause={handlePauseSequence} />
        </div>
      )}

      <div className="grid grid-4" style={{ marginTop: 20 }}>
        <div className="card">
          <div className="card-title">Active Sequences</div>
          <div className="card-value">{sequenceData.filter((sequence) => sequence.status === 'active').length}</div>
          <div className="card-change"><span className="badge"><span className="arrow">&#8599;</span> +3</span> this week</div>
        </div>
        <div className="card">
          <div className="card-title">Total Enrolled</div>
          <div className="card-value">{sequenceData.reduce((total, sequence) => total + sequence.enrolled, 0).toLocaleString()}</div>
          <div className="card-change"><span className="badge"><span className="arrow">&#8599;</span> +412</span> today</div>
        </div>
        <div className="card">
          <div className="card-title">Avg Reply Rate</div>
          <div className="card-value">{(sequenceData.reduce((total, sequence) => total + sequence.replyRate, 0) / sequenceData.length).toFixed(1)}%</div>
          <div className="card-change"><span className="badge"><span className="arrow">&#8599;</span> +1.2%</span> vs last week</div>
        </div>
        <div className="card">
          <div className="card-title">Total Meetings</div>
          <div className="card-value">{sequenceData.reduce((total, sequence) => total + sequence.meetings, 0)}</div>
          <div className="card-change"><span className="badge"><span className="arrow">&#8599;</span> +18</span> this week</div>
        </div>
      </div>

      <div className="section-label">
        {activeTab === 'all' ? 'All Sequences' : `${channelTabs.find((tab) => tab.id === activeTab)?.label} Sequences`}
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="seq-table-header">
          <div></div>
          <div>Sequence</div>
          <div>Steps</div>
          <div>Enrolled</div>
          <div>Replied</div>
          <div>Reply %</div>
          <div>Meetings</div>
          <div>Meeting %</div>
          <div></div>
        </div>
        {filtered.map((seq) => (
          <SequenceRow
            key={seq.id}
            seq={seq}
            onClick={() => setSelectedSequenceId(seq.id)}
            onRunToggle={handleRunToggle}
            isRunning={liveRun?.id === seq.id && liveRun.phase === 'running'}
          />
        ))}
      </div>
    </div>
  );
}

export default Sequences;
