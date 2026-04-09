const TELEGRAM_GENERIC_TITLE = 'telegram messenger';
const TELEGRAM_GENERIC_OG_TITLE = 'telegram - a new era of messaging';
const TELEGRAM_GENERIC_IMAGE = 'https://telegram.org/img/t_logo_2x.png';

export type TelegramPublicProfile = {
  username: string;
  exists: boolean | null;
  avatarUrl: string | null;
};

function extractMeta(html: string, property: string) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+property="${escaped}"[^>]+content="([^"]+)"`, 'i'),
    new RegExp(`<meta[^>]+content="([^"]+)"[^>]+property="${escaped}"`, 'i'),
    new RegExp(`<meta[^>]+property='${escaped}'[^>]+content='([^']+)'`, 'i'),
    new RegExp(`<meta[^>]+content='([^']+)'[^>]+property='${escaped}'`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

function extractTitle(html: string) {
  const match = html.match(/<title>(.*?)<\/title>/is);
  return match?.[1]?.trim() ?? null;
}

function normalizeAvatarUrl(url: string | null) {
  if (!url) return null;
  let value = url.trim();
  if (!value) return null;
  if (value.startsWith('//')) value = `https:${value}`;
  if (!value.startsWith('http')) return null;
  if (value === TELEGRAM_GENERIC_IMAGE) return null;
  return value;
}

function normalizeTelegramText(value: string | null) {
  return value?.trim().toLowerCase().replaceAll('\u2013', '-') ?? '';
}

function isKnownTelegramProfilePage(username: string, title: string | null, ogTitle: string | null) {
  const clean = username.trim().toLowerCase();
  const normalizedTitle = normalizeTelegramText(title);
  const normalizedOgTitle = normalizeTelegramText(ogTitle);

  if (!normalizedTitle || normalizedTitle === TELEGRAM_GENERIC_TITLE) return false;
  if (normalizedOgTitle === TELEGRAM_GENERIC_OG_TITLE) return false;
  if (normalizedTitle === `telegram: view @${clean}`) return true;
  if (normalizedTitle.includes(`@${clean}`)) return true;
  return false;
}

/**
 * Fetches the public Telegram page for a username and determines whether the
 * username exists, plus any public avatar URL currently advertised by Telegram.
 */
export async function fetchTelegramPublicProfile(username: string): Promise<TelegramPublicProfile> {
  const clean = username.replace(/^@/, '').trim();
  if (!clean) {
    return { username: '', exists: false, avatarUrl: null };
  }

  try {
    const res = await fetch(`https://t.me/${encodeURIComponent(clean)}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });

    if (!res.ok) {
      return { username: clean, exists: null, avatarUrl: null };
    }

    const html = await res.text();
    const title = extractTitle(html);
    const ogTitle = extractMeta(html, 'og:title');
    const exists = isKnownTelegramProfilePage(clean, title, ogTitle);
    if (!exists) {
      return { username: clean, exists: false, avatarUrl: null };
    }

    const avatarUrl = normalizeAvatarUrl(extractMeta(html, 'og:image'));
    return { username: clean, exists: true, avatarUrl };
  } catch {
    return { username: clean, exists: null, avatarUrl: null };
  }
}

/**
 * Backwards-compatible avatar helper used across the app.
 */
export async function fetchTelegramAvatar(username: string): Promise<string | null> {
  const profile = await fetchTelegramPublicProfile(username);
  return profile.exists === true ? profile.avatarUrl : null;
}
