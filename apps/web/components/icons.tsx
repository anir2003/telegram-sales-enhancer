type IconProps = { size?: number };

const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function IconDashboard({ size = 18 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></svg>;
}

export function IconLeads({ size = 18 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
}

export function IconCampaigns({ size = 18 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M4 6h16M4 12h10M4 18h7" /><circle cx="19" cy="12" r="2" /><circle cx="15" cy="18" r="2" /><path d="M19 10V7M15 16v-3" /></svg>;
}

export function IconAccounts({ size = 18 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M7 16h4" /></svg>;
}

export function IconActivity({ size = 18 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>;
}

export function IconSettings({ size = 18 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
}

export function IconBusinessTracker({ size = 18 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...base}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /><path d="M7 6h.01M12 6h.01" /></svg>;
}
