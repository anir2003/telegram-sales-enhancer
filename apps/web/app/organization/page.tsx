import { redirect } from 'next/navigation';
import { getWorkspaceContext } from '@/lib/server/context';
import { OrganizationSetupClient } from './setup-client';

export default async function OrganizationPage() {
  const context = await getWorkspaceContext();

  if (context?.configured && !context.profile) {
    redirect('/login');
  }

  if (context?.configured && context.profile && context.workspace) {
    redirect('/dashboard');
  }

  return (
    <OrganizationSetupClient
      email={context?.profile?.email ?? ''}
      fullName={context?.profile?.full_name ?? ''}
    />
  );
}
