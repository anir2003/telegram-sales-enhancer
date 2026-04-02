import { Sidebar } from '@/components/sidebar';
import { TopBar } from '@/components/topbar';

export function AppShell({
  children,
  profile,
}: {
  children: React.ReactNode;
  profile?: { email?: string | null } | null;
}) {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-main">
        <TopBar profile={profile} />
        <div>{children}</div>
      </div>
    </div>
  );
}
