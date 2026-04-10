import { createDecipheriv, createHash } from 'node:crypto';

function getKey() {
  const credentialKey = process.env.TELEGRAM_CREDENTIAL_KEY?.trim();
  if (!credentialKey) {
    throw new Error('TELEGRAM_CREDENTIAL_KEY is required.');
  }
  return createHash('sha256').update(credentialKey).digest();
}

export function decryptSecret(payload: string | null | undefined) {
  if (!payload) return null;
  const [version, ivRaw, tagRaw, ciphertextRaw] = payload.split(':');
  if (version !== 'v1' || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error('Unsupported encrypted Telegram credential payload.');
  }
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function decryptJson<T>(payload: string | null | undefined) {
  const text = decryptSecret(payload);
  return text ? JSON.parse(text) as T : null;
}
