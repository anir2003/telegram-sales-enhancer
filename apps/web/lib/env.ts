export function getSupabasePublicKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''
  );
}

export function isSupabasePublicConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && getSupabasePublicKey());
}

export function isSupabaseConfigured() {
  return Boolean(isSupabasePublicConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function isBotSecretConfigured() {
  return Boolean(process.env.TELEGRAM_WEBHOOK_SECRET);
}
