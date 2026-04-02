import { getServerSupabaseClient, getAdminSupabaseClient } from '@/lib/supabase/server';
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

  // Use admin client to bypass RLS — new users have workspace_id = NULL
  // and the RLS policy (workspace_id = requesting_workspace_id()) filters them out.
  const admin = getAdminSupabaseClient();
  if (!admin) {
    return { configured: true, user, profile: null, workspace: null };
  }

  const { data: profile } = await admin
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

  if (!profile.workspace_id) {
    return {
      configured: true,
      user,
      profile,
      workspace: null,
    };
  }

  const { data: workspace } = await admin
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
