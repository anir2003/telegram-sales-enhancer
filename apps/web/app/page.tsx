import { redirect } from 'next/navigation';
import { getWorkspaceContext } from '@/lib/server/context';

export default async function HomePage() {
  const context = await getWorkspaceContext();

  if (context?.configured && !context.profile) {
    redirect('/login');
  }

  if (context?.configured && context.profile && !context.workspace) {
    redirect('/organization');
  }

  redirect('/dashboard');
}
