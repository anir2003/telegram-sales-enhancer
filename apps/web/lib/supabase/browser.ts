'use client';

import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublicKey } from '@/lib/env';

let client: ReturnType<typeof createBrowserClient> | null = null;

export function getBrowserSupabaseClient() {
  const publicKey = getSupabasePublicKey();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !publicKey) {
    return null;
  }

  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      publicKey,
    );
  }

  return client;
}
