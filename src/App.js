import React, { useEffect, useState } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Dashboard from './pages/Dashboard';
import Sequences from './pages/Sequences';
import Automations from './pages/Automations';
import Contacts from './pages/Contacts';
import PipelinePage from './pages/PipelinePage';
import Inbox from './pages/Inbox';
import Analytics from './pages/Analytics';
import Team from './pages/Team';
import Settings from './pages/Settings';

const pages = {
  dashboard: Dashboard,
  sequences: Sequences,
  automations: Automations,
  contacts: Contacts,
  pipeline: PipelinePage,
  inbox: Inbox,
  analytics: Analytics,
  team: Team,
  settings: Settings,
};

function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [theme, setTheme] = useState(() => window.localStorage.getItem('salessystem-theme') || 'dark');
  const PageComponent = pages[activePage] || Dashboard;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('salessystem-theme', theme);
  }, [theme]);

  return (
    <div className="app-layout">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <div className="app-main">
        <TopBar activePage={activePage} />
        <div className="app-content">
          <PageComponent theme={theme} onThemeChange={setTheme} />
        </div>
      </div>
    </div>
  );
}

export default App;
