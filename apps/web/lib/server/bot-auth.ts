import { NextRequest } from 'next/server';
import { isBotSecretConfigured } from '@/lib/env';

export function isTrustedBotRequest(request: NextRequest) {
  if (!isBotSecretConfigured()) {
    return true;
  }

  return request.headers.get('x-telegram-webhook-secret') === process.env.TELEGRAM_WEBHOOK_SECRET;
}
