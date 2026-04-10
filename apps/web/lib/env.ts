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

export function isTeamAccessConfigured() {
  return Boolean(process.env.TEAM_ACCESS_CODE);
}

export function getTeamAccessCode() {
  return process.env.TEAM_ACCESS_CODE?.trim() ?? '';
}

export function getTelegramAppCredentials() {
  const apiId = process.env.TELEGRAM_API_ID?.trim() ?? '';
  const apiHash = process.env.TELEGRAM_API_HASH?.trim() ?? '';
  const credentialKey = process.env.TELEGRAM_CREDENTIAL_KEY?.trim() ?? '';

  return {
    apiId,
    apiHash,
    credentialKey,
  };
}

export function isTelegramMockAdapter() {
  const explicitMock = process.env.TELEGRAM_ADAPTER_MODE === 'mock';
  const isLocalDev = process.env.NODE_ENV !== 'production';
  const { apiId, apiHash } = getTelegramAppCredentials();

  return explicitMock || (isLocalDev && (!apiId || !apiHash));
}

export function isTelegramAppConfigured() {
  const { apiId, apiHash, credentialKey } = getTelegramAppCredentials();
  return Boolean(apiId && apiHash && credentialKey && Number.isInteger(Number(apiId)));
}

export function isTelegramConsoleAvailable() {
  return isTelegramAppConfigured() || isTelegramMockAdapter();
}
