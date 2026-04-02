import React from 'react';
import {
  IconDashboard, IconSequences, IconAutomations, IconContacts, IconPipeline,
  IconAnalytics, IconTeam, IconInbox, IconSettings
} from './Icons';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: IconDashboard },
  { id: 'sequences', label: 'Sequences', icon: IconSequences },
  { id: 'automations', label: 'Automations', icon: IconAutomations },
  { id: 'contacts', label: 'Contacts', icon: IconContacts },
  { id: 'pipeline', label: 'Pipeline', icon: IconPipeline },
  { id: 'inbox', label: 'Inbox', icon: IconInbox, badge: 12 },
  { id: 'analytics', label: 'Analytics', icon: IconAnalytics },
  { id: 'team', label: 'Team', icon: IconTeam },
];

const bottomItems = [
  { id: 'settings', label: 'Settings', icon: IconSettings },
];

function Sidebar({ activePage, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">S</div>
        <div>
          <div className="sidebar-logo-text">SalesCLI</div>
          <div className="sidebar-logo-sub">Command Center</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Main</div>
        {navItems.map(item => (
          <button
            key={item.id}
            className={`sidebar-item ${activePage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <item.icon size={16} />
            <span>{item.label}</span>
            {item.badge && <span className="sidebar-badge">{item.badge}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        {bottomItems.map(item => (
          <button
            key={item.id}
            className={`sidebar-item ${activePage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <item.icon size={16} />
            <span>{item.label}</span>
          </button>
        ))}

        <div className="sidebar-user">
          <div className="sidebar-user-avatar">
            <img src="https://i.pravatar.cc/64?img=11" alt="User" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(100%)' }} />
          </div>
          <div>
            <div className="sidebar-user-name">Arjun Kapoor</div>
            <div className="sidebar-user-role">SDR Lead</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
