import React, { useState } from 'react';
import Tabs from '../components/Tabs';

const inboxTabs = [
  { id: 'all', label: 'All', count: 48 },
  { id: 'replies', label: 'Replies', count: 23 },
  { id: 'interested', label: 'Interested', count: 12 },
  { id: 'bounced', label: 'Bounced', count: 8 },
  { id: 'ooo', label: 'Out of Office', count: 5 },
];

const messages = [
  { from: 'Sarah Chen', company: 'TechFlow Inc', subject: 'Re: Quick question about scaling', preview: 'Hi Arjun, thanks for reaching out. We are actually looking for a solution like this...', time: '10 min ago', type: 'interested', channel: 'Email', unread: true },
  { from: 'James Morrison', company: 'DataStack', subject: 'Re: DataStack + Our Platform', preview: 'Interesting. Can you send me a case study? We have a team meeting on Thursday...', time: '32 min ago', type: 'replies', channel: 'LinkedIn', unread: true },
  { from: 'Mail Delivery System', company: '', subject: 'Undelivered: Re: Quick intro', preview: 'This message was created automatically. Delivery to alex@defunct-startup.io failed...', time: '1h ago', type: 'bounced', channel: 'Email', unread: false },
  { from: 'Elena Rodriguez', company: 'ScaleUp AI', subject: 'Re: Congrats on the funding round', preview: 'Thanks! We are indeed scaling the team. Let us set up a call next week...', time: '2h ago', type: 'interested', channel: 'Email', unread: true },
  { from: 'Michael Park', company: 'CloudNine SaaS', subject: 'Re: Following up', preview: 'Arjun, I showed this to my CTO and we would like a demo. How is Wednesday?', time: '3h ago', type: 'interested', channel: 'Email', unread: false },
  { from: 'Auto Reply', company: 'Nexus Labs', subject: 'Out of Office: Re: Partnership', preview: 'I am currently out of the office until April 10. For urgent matters...', time: '4h ago', type: 'ooo', channel: 'Email', unread: false },
  { from: 'David Okafor', company: 'FinSync', subject: 'Re: FinSync integration idea', preview: 'Not the right time for us. Maybe circle back in Q3?', time: '5h ago', type: 'replies', channel: 'Email', unread: false },
  { from: 'Sophie Laurent', company: 'Veritas Cloud', subject: 'via Telegram', preview: 'Hey, saw your message in the group. Definitely interested in learning more about...', time: '6h ago', type: 'interested', channel: 'Telegram', unread: false },
  { from: 'Tom Harris', company: 'GridPoint', subject: 'Re: Developer tools for GridPoint', preview: 'Unsubscribe me from this list please.', time: '8h ago', type: 'replies', channel: 'Email', unread: false },
  { from: 'Anna Kowalski', company: 'ByteShift', subject: 'Re: ByteShift + Cold Outreach', preview: 'We just closed a round and are hiring aggressively. This could be useful...', time: '12h ago', type: 'interested', channel: 'LinkedIn', unread: false },
];

const typeColors = {
  replies: 'var(--status-dim)',
  interested: 'var(--status-strong)',
  bounced: 'var(--status-soft)',
  ooo: 'var(--status-quiet)',
};

function Inbox() {
  const [activeTab, setActiveTab] = useState('all');
  const [selectedMsg, setSelectedMsg] = useState(null);
  const filtered = activeTab === 'all' ? messages : messages.filter(m => m.type === activeTab);

  return (
    <div className="page-content">
      <Tabs tabs={inboxTabs} activeTab={activeTab} onChange={setActiveTab} />

      <div className="inbox-layout">
        <div className="inbox-list">
          {filtered.map((msg, i) => (
            <div
              key={i}
              className={`inbox-item ${selectedMsg === i ? 'selected' : ''} ${msg.unread ? 'unread' : ''}`}
              onClick={() => setSelectedMsg(i)}
            >
              <div className="inbox-item-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {msg.unread && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
                  <span style={{ fontSize: 12, fontWeight: msg.unread ? 600 : 400, color: 'var(--text)' }}>{msg.from}</span>
                  {msg.company && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>&middot; {msg.company}</span>}
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>{msg.time}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{msg.subject}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.preview}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <span className="tag" style={{ fontSize: 10 }}>{msg.channel}</span>
                <span className="tag" style={{ fontSize: 10, borderColor: typeColors[msg.type], color: typeColors[msg.type] }}>{msg.type}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="inbox-detail">
          {selectedMsg !== null ? (
            <div>
              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{filtered[selectedMsg]?.subject}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered[selectedMsg]?.from}</span>
                  {filtered[selectedMsg]?.company && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>&middot; {filtered[selectedMsg]?.company}</span>}
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 'auto' }}>{filtered[selectedMsg]?.time}</span>
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.8 }}>
                {filtered[selectedMsg]?.preview}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
                <button className="topbar-action-btn">Reply</button>
                <button className="topbar-action-btn" style={{ background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text)' }}>Add to Sequence</button>
                <button className="topbar-action-btn" style={{ background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text)' }}>Mark Interested</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 12 }}>
              Select a message to view
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Inbox;
