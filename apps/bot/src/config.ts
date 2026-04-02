function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeUrl(value: string) {
  return value.replace(/\/$/, '');
}

export function getBotConfig() {
  return {
    token: requireEnv('TELEGRAM_BOT_TOKEN'),
    appUrl: normalizeUrl(requireEnv('APP_URL')),
    botPublicUrl: normalizeUrl(process.env.BOT_PUBLIC_URL ?? 'http://localhost:4000'),
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
    port: Number(process.env.PORT ?? 4000),
    useWebhook:
      process.env.NODE_ENV === 'production' ||
      !normalizeUrl(process.env.BOT_PUBLIC_URL ?? 'http://localhost:4000').includes('localhost'),
  };
}
