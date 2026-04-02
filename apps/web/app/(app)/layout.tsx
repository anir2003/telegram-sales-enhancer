import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { getWorkspaceContext } from '@/lib/server/context';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await getWorkspaceContext();

  if (context?.configured && !context.profile) {
    redirect('/login');
  }

  return <AppShell profile={context?.profile}>{children}</AppShell>;
}
