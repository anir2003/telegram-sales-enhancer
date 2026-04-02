import React, { useMemo, useState } from 'react';
import Tabs from '../components/Tabs';
import BrandLogo from '../components/BrandLogo';
import {
  IconMail,
  IconLinkedIn,
  IconTelegram,
  IconPlay,
  IconPause,
  IconCheck,
  IconClock,
} from '../components/Icons';

const channelIcons = {
  email: <BrandLogo brand="google" size={16} />,
  linkedin: <IconLinkedIn size={16} />,
  telegram: <IconTelegram size={16} />,
  slack: <BrandLogo brand="slack" size={16} />,
  whatsapp: <BrandLogo brand="whatsapp" size={16} />,
};

const channelCards = [
  { id: 'linkedin', name: 'LinkedIn', icon: <IconLinkedIn size={16} />, live: '42 active threads', sla: '1m 18s', coverage: 'Connection accept, replies, follow-ups', state: 'healthy' },
  { id: 'telegram', name: 'Telegram', icon: <IconTelegram size={16} />, live: '19 live chats', sla: '38s', coverage: 'Bot replies, group routing, lead capture', state: 'healthy' },
  { id: 'email', name: 'Email', icon: <IconMail size={16} />, live: '127 inbox checks', sla: '2m 04s', coverage: 'FAQ replies, meeting nudges, handoff tags', state: 'healthy' },
  { id: 'whatsapp', name: 'WhatsApp', icon: <BrandLogo brand="whatsapp" size={16} />, live: '11 warm follow-ups', sla: '2m 41s', coverage: 'No-show recovery and warm re-engagement', state: 'pilot' },
  { id: 'slack', name: 'Slack', icon: <BrandLogo brand="slack" size={16} />, live: '7 escalations open', sla: '4m 12s', coverage: 'Internal alerts and approvals', state: 'review' },
];

const guardrails = [
  { label: 'Human handoff threshold', value: 'Intent score > 82 or pricing requested' },
  { label: 'Quiet hours', value: '11:00 PM to 7:00 AM per lead timezone' },
  { label: 'Blocked actions', value: 'Contracts, discounts, refunds, legal claims' },
  { label: 'Reply source', value: 'Templates + CRM context + most recent thread' },
];

const initialAutomations = [
  {
    id: 'linkedin-qualifier',
    name: 'LinkedIn Inbound Qualification',
    channel: 'linkedin',
    status: 'active',
    trigger: 'Reply or connection accepted',
    scope: 'Founder and VP personas',
    handledToday: 42,
    handoffRate: 28,
    responseWindow: '90 sec',
    owner: 'Marcus Rivera',
    summary: 'Qualifies interest, offers a short intro, and routes hot leads straight to an SDR.',
    steps: [
      'Detect new reply and score intent against buying signals.',
      'Check CRM history, active deal stage, and do-not-contact flags.',
      'Send a short contextual response with the best next action.',
      'Escalate to Slack when intent spikes or a meeting window is requested.',
    ],
    exampleResponse: 'Appreciate the reply. Based on what you shared, I can send over a tighter breakdown for teams scaling outbound this quarter, or we can skip ahead and line up a 15-minute walkthrough.',
    guardrails: ['Avoids pricing promises', 'Stops after 2 unanswered nudges', 'Escalates enterprise accounts automatically'],
  },
  {
    id: 'telegram-community',
    name: 'Telegram Community Responder',
    channel: 'telegram',
    status: 'active',
    trigger: 'Bot mention or DM received',
    scope: 'Community and inbound demo leads',
    handledToday: 31,
    handoffRate: 18,
    responseWindow: '35 sec',
    owner: 'Lena Petrov',
    summary: 'Handles product questions, captures intent, and moves qualified chats into the pipeline.',
    steps: [
      'Classify the message as support, sales, spam, or community chatter.',
      'Pull matching snippets from product notes and FAQs.',
      'Reply with a short answer and one next-step CTA.',
      'Create a contact record when meeting intent or referral value is detected.',
    ],
    exampleResponse: 'Happy to help. The fastest path is to keep this thread moving here if you want a quick answer, or I can open a meeting slot and send the details back in this chat.',
    guardrails: ['Blocks promo spam', 'Escalates billing mentions', 'Holds messages with external links for review'],
  },
  {
    id: 'email-faq',
    name: 'Email FAQ Auto-Responder',
    channel: 'email',
    status: 'active',
    trigger: 'Known question lands in shared inbox',
    scope: 'Pricing, integrations, onboarding',
    handledToday: 56,
    handoffRate: 12,
    responseWindow: '2 min',
    owner: 'Sofia Nakamura',
    summary: 'Sends fast, CRM-aware replies for repeat questions while preserving a clean handoff trail.',
    steps: [
      'Parse the inbound email and classify topic confidence.',
      'Check account tier, owner, and active opportunities.',
      'Draft a response using approved snippets and recent context.',
      'Tag the thread and hand off if confidence falls below the safe threshold.',
    ],
    exampleResponse: 'Thanks for reaching out. I pulled the latest details for your account and the integration path you asked about is available. I can outline the setup steps here, or bring in the owning rep if you want a tailored rollout recommendation.',
    guardrails: ['Never sends attachments automatically', 'Requires approval for refund language', 'Skips prospects flagged as high-risk'],
  },
  {
    id: 'slack-escalation',
    name: 'Slack Escalation Router',
    channel: 'slack',
    status: 'review',
    trigger: 'High-intent event from any channel',
    scope: 'SDR, AE, and RevOps approvals',
    handledToday: 17,
    handoffRate: 100,
    responseWindow: '4 min',
    owner: 'Arjun Kapoor',
    summary: 'Packages the full conversation, urgency, and recommended next move into one approval-ready Slack thread.',
    steps: [
      'Collect source transcript, lead score, and latest sequence performance.',
      'Route the event into the right owner channel based on territory and stage.',
      'Add the recommended reply path and timing window.',
      'Track acknowledgement and reopen if no owner responds.',
    ],
    exampleResponse: 'Hot lead surfaced from Telegram with pricing intent and a meeting request. Recommended owner is West Enterprise pod. Suggested response window: under 5 minutes.',
    guardrails: ['No external sending from Slack', 'Escalates only verified identities', 'Requires owner acknowledgement'],
  },
  {
    id: 'whatsapp-followup',
    name: 'WhatsApp Follow-Up Pilot',
    channel: 'whatsapp',
    status: 'paused',
    trigger: 'Meeting no-show or warm re-engagement',
    scope: 'Pilot list only',
    handledToday: 9,
    handoffRate: 22,
    responseWindow: 'Manual release',
    owner: 'Rina Shah',
    summary: 'Reserved for warm opportunities where a lighter-touch channel improves follow-through.',
    steps: [
      'Check consent and regional messaging compliance.',
      'Hold message until the prospect timezone opens.',
      'Send a brief reminder with reschedule options.',
      'Stop after one send and move follow-up back to the owning rep.',
    ],
    exampleResponse: 'Checking in with a quick follow-up. We missed each other earlier, so if it still helps, I can send over a couple of fresh time slots and keep it easy.',
    guardrails: ['Pilot only', 'Consent required', 'Single message cap'],
  },
];

const statusMeta = {
  active: { label: 'active', icon: <IconPlay size={12} />, color: 'var(--status-strong)' },
  paused: { label: 'paused', icon: <IconPause size={12} />, color: 'var(--status-dim)' },
  review: { label: 'review', icon: <IconClock size={12} />, color: 'var(--status-mid)' },
};

function Automations() {
  const [automations, setAutomations] = useState(initialAutomations);
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedAutomationId, setSelectedAutomationId] = useState(initialAutomations[0].id);

  const automationTabs = useMemo(() => ([
    { id: 'all', label: 'All Automations', count: automations.length },
    { id: 'active', label: 'Live', count: automations.filter((automation) => automation.status === 'active').length },
    { id: 'review', label: 'Needs Review', count: automations.filter((automation) => automation.status === 'review').length },
    { id: 'paused', label: 'Paused', count: automations.filter((automation) => automation.status === 'paused').length },
  ]), [automations]);

  const filteredAutomations = activeFilter === 'all'
    ? automations
    : automations.filter((automation) => automation.status === activeFilter);

  const selectedAutomation = automations.find((automation) => automation.id === selectedAutomationId) || automations[0];
  const handledToday = automations.reduce((total, automation) => total + automation.handledToday, 0);
  const activeCount = automations.filter((automation) => automation.status === 'active').length;
  const reviewCount = automations.filter((automation) => automation.status === 'review').length;
  const avgHandoffRate = Math.round(automations.reduce((total, automation) => total + automation.handoffRate, 0) / automations.length);

  const toggleAutomation = (automationId) => {
    setAutomations((current) => current.map((automation) => {
      if (automation.id !== automationId) {
        return automation;
      }

      if (automation.status === 'active') {
        return { ...automation, status: 'paused' };
      }

      return { ...automation, status: 'active' };
    }));
  };

  return (
    <div className="page-content">
      <Tabs tabs={automationTabs} activeTab={activeFilter} onChange={setActiveFilter} />

      <div className="grid grid-4" style={{ marginTop: 20 }}>
        <div className="card">
          <div className="card-title">Live Automations</div>
          <div className="card-value">{activeCount}</div>
          <div className="card-change"><span className="badge"><IconCheck size={10} /> stable</span> across 5 channels</div>
        </div>
        <div className="card">
          <div className="card-title">Auto-Replies Today</div>
          <div className="card-value">{handledToday}</div>
          <div className="card-change"><span className="badge"><span className="arrow">&#8599;</span> +18%</span> from yesterday</div>
        </div>
        <div className="card">
          <div className="card-title">Avg Human Handoff</div>
          <div className="card-value">{avgHandoffRate}%</div>
          <div className="card-change"><span className="badge"><IconClock size={10} /> {reviewCount} waiting</span> queued for review</div>
        </div>
        <div className="card">
          <div className="card-title">Median Response SLA</div>
          <div className="card-value">1.6m</div>
          <div className="card-change"><span className="badge"><span className="arrow">&#8599;</span> -22s</span> faster than last week</div>
        </div>
      </div>

      <div className="section-label">Automation Mesh</div>
      <div className="grid grid-3">
        <div className="card span-2 automation-hero">
          <div className="card-header">
            <div>
              <div className="card-title">Response Engine</div>
              <div className="card-subtitle" style={{ marginTop: 10 }}>
                Every message passes through intent scoring, CRM context, template selection, and safety checks before a response is sent.
              </div>
            </div>
            <span className="badge">24/7 live</span>
          </div>

          <div className="automation-stream">
            {[
              { label: 'Listen', detail: 'New message across email, LinkedIn, Telegram, Slack' },
              { label: 'Understand', detail: 'Intent, topic, urgency, owner, do-not-contact' },
              { label: 'Respond', detail: 'Approved draft, send window, safe CTA, follow-up tag' },
            ].map((node) => (
              <div key={node.label} className="automation-stream-node">
                <div className="automation-stream-title">{node.label}</div>
                <div className="automation-stream-detail">{node.detail}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-3" style={{ marginTop: 16 }}>
            <div className="automation-mini-metric">
              <span className="automation-mini-label">Intent scoring</span>
              <span className="automation-mini-value">Realtime</span>
            </div>
            <div className="automation-mini-metric">
              <span className="automation-mini-label">Compliance gates</span>
              <span className="automation-mini-value">7 enabled</span>
            </div>
            <div className="automation-mini-metric">
              <span className="automation-mini-label">Fallback owner</span>
              <span className="automation-mini-value">Always assigned</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Channel Coverage</span>
            <span className="badge">healthy</span>
          </div>

          <div className="automation-channel-grid">
            {channelCards.map((channel) => (
              <div key={channel.id} className="automation-channel-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="integration-logo-wrap" style={{ width: 32, height: 32 }}>
                    {channel.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{channel.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{channel.live}</div>
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-muted)' }}>{channel.coverage}</div>
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)' }}>
                  <span>SLA {channel.sla}</span>
                  <span>{channel.state}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section-label">Automation Library</div>
      <div className="grid grid-2">
        {filteredAutomations.map((automation) => {
          const status = statusMeta[automation.status];
          const isSelected = selectedAutomation?.id === automation.id;

          return (
            <div
              key={automation.id}
              className={`card automation-card ${isSelected ? 'selected' : ''}`}
              onClick={() => setSelectedAutomationId(automation.id)}
            >
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="integration-logo-wrap" style={{ width: 34, height: 34 }}>
                    {channelIcons[automation.channel]}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{automation.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{automation.trigger}</div>
                  </div>
                </div>
                <span className="badge" style={{ color: status.color, borderColor: 'var(--border-soft)' }}>
                  {status.icon}
                  {status.label}
                </span>
              </div>

              <div className="card-subtitle">{automation.summary}</div>

              <div className="automation-card-grid">
                <div>
                  <div className="automation-card-label">Scope</div>
                  <div className="automation-card-value">{automation.scope}</div>
                </div>
                <div>
                  <div className="automation-card-label">Window</div>
                  <div className="automation-card-value">{automation.responseWindow}</div>
                </div>
                <div>
                  <div className="automation-card-label">Handled today</div>
                  <div className="automation-card-value">{automation.handledToday}</div>
                </div>
                <div>
                  <div className="automation-card-label">Owner</div>
                  <div className="automation-card-value">{automation.owner}</div>
                </div>
              </div>

              <div className="automation-action-row">
                <button
                  className="ghost-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedAutomationId(automation.id);
                  }}
                >
                  Inspect
                </button>
                <button
                  className="ghost-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleAutomation(automation.id);
                  }}
                >
                  {automation.status === 'active' ? 'Pause' : 'Activate'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="section-label">Automation Preview</div>
      <div className="grid grid-3">
        <div className="card span-2">
          <div className="card-header">
            <div>
              <div className="card-title">Selected Flow</div>
              <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text)', marginTop: 8 }}>{selectedAutomation.name}</div>
            </div>
            <span className="badge">{statusMeta[selectedAutomation.status].label}</span>
          </div>

          <div className="automation-preview-list">
            {selectedAutomation.steps.map((step, index) => (
              <div key={step} className="automation-preview-row">
                <div className="automation-preview-index">{String(index + 1).padStart(2, '0')}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>{step}</div>
              </div>
            ))}
          </div>

          <div className="section-label" style={{ marginTop: 24, marginBottom: 10 }}>Suggested Reply Shape</div>
          <div className="automation-response-preview">
            {selectedAutomation.exampleResponse}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Guardrails</span>
            <span className="badge">safe send</span>
          </div>

          <div className="automation-rule-list">
            {guardrails.map((rule) => (
              <div key={rule.label} className="automation-rule-row">
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{rule.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 6 }}>{rule.value}</div>
              </div>
            ))}
          </div>

          <div className="section-label" style={{ marginTop: 24, marginBottom: 10 }}>Selected Flow Rules</div>
          <div className="automation-rule-list">
            {selectedAutomation.guardrails.map((rule) => (
              <div key={rule} className="automation-rule-row" style={{ padding: '10px 0' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rule}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Automations;
