import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { getWorkspaceContext } from '@/lib/server/context';
import { SWRProvider } from './swr-provider';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await getWorkspaceContext();

  if (context?.configured && !context.profile) {
    redirect('/login');
  }

  if (context?.configured && context.profile && !context.workspace) {
    redirect('/organization');
  }

  return (
    <AppShell profile={context?.profile} workspace={context?.workspace}>
      <SWRProvider>{children}</SWRProvider>
    </AppShell>
  );
}
