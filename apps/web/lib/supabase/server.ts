import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { getSupabasePublicKey, isSupabaseConfigured, isSupabasePublicConfigured } from '@/lib/env';

export async function getServerSupabaseClient() {
  if (!isSupabasePublicConfigured()) {
    return null;
  }

  const cookieStore = await cookies();
  const publicKey = getSupabasePublicKey();
  type CookieToSet = {
    name: string;
    value: string;
    options?: any;
  };

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    publicKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    },
  );
}

export function getAdminSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
