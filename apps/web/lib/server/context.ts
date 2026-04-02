import { getServerSupabaseClient } from '@/lib/supabase/server';
import { demoProfile, demoWorkspace } from '@/lib/server/demo-store';
import { isSupabaseConfigured } from '@/lib/env';

export async function getWorkspaceContext() {
  if (!isSupabaseConfigured()) {
    return {
      configured: false,
      user: demoProfile,
      profile: demoProfile,
      workspace: demoWorkspace,
    };
  }

  const supabase = await getServerSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user) {
    return {
      configured: true,
      user: null,
      profile: null,
      workspace: null,
    };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    return {
      configured: true,
      user,
      profile: null,
      workspace: null,
    };
  }

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', profile.workspace_id)
    .maybeSingle();

  return {
    configured: true,
    user,
    profile,
    workspace,
  };
}
