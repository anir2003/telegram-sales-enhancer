import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { getTelegramAppCredentials } from '@/lib/env';

const version = 'v1';

function getKey() {
  const { credentialKey } = getTelegramAppCredentials();
  if (!credentialKey && process.env.NODE_ENV !== 'production') {
    return createHash('sha256').update('local-dev-telegram-console-mock-key').digest();
  }
  if (!credentialKey) {
    throw new Error('TELEGRAM_CREDENTIAL_KEY is required.');
  }
  return createHash('sha256').update(credentialKey).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [version, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':');
}

export function decryptSecret(payload: string | null | undefined) {
  if (!payload) return null;
  const [payloadVersion, ivRaw, tagRaw, ciphertextRaw] = payload.split(':');
  if (payloadVersion !== version || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error('Unsupported encrypted Telegram credential payload.');
  }

  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function encryptJson(value: unknown) {
  return encryptSecret(JSON.stringify(value));
}

export function decryptJson<T>(payload: string | null | undefined) {
  const text = decryptSecret(payload);
  return text ? JSON.parse(text) as T : null;
}
