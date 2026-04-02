import React from 'react';
import { IconSearch, IconBell, IconPlus } from './Icons';

const pageLabels = {
  dashboard: { title: 'Dashboard', subtitle: 'Overview of all outreach metrics' },
  sequences: { title: 'Sequences', subtitle: 'Manage multi-step outreach campaigns' },
  automations: { title: 'Automations', subtitle: 'Auto-responses, routing, and guardrails across channels', actionLabel: 'New Automation' },
  contacts: { title: 'Contacts', subtitle: 'Lead database and segmentation' },
  pipeline: { title: 'Pipeline', subtitle: 'Deal flow and revenue tracking' },
  inbox: { title: 'Inbox', subtitle: 'Replies, bounces, and notifications' },
  analytics: { title: 'Analytics', subtitle: 'Deep dive into performance data' },
  team: { title: 'Team', subtitle: 'Members, roles, and leaderboard' },
  settings: { title: 'Settings', subtitle: 'Accounts, domains, and integrations' },
};

function TopBar({ activePage }) {
  const page = pageLabels[activePage] || pageLabels.dashboard;

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="topbar-title">{page.title}</h1>
        <span className="topbar-subtitle">{page.subtitle}</span>
      </div>
      <div className="topbar-right">
        <div className="topbar-search">
          <IconSearch size={14} />
          <input type="text" placeholder="Search..." className="topbar-search-input" />
          <kbd className="topbar-kbd">/</kbd>
        </div>
        <button className="topbar-icon-btn">
          <IconBell size={16} />
          <span className="topbar-notif-dot" />
        </button>
        <button className="topbar-action-btn">
          <IconPlus size={14} />
          <span>{page.actionLabel || 'New Sequence'}</span>
        </button>
      </div>
    </header>
  );
}

export default TopBar;
