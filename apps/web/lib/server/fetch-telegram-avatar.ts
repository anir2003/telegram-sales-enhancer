/**
 * Fetches a Telegram profile picture from t.me/{username} (no API key required).
 * The page always has an og:image meta tag when the account has a photo set.
 */
export async function fetchTelegramAvatar(username: string): Promise<string | null> {
  if (!username) return null;

  try {
    const res = await fetch(`https://t.me/${encodeURIComponent(username)}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(10_000),
      // Always fresh — we're saving the result to the DB anyway
      cache: 'no-store',
    });

    if (!res.ok) return null;

    const html = await res.text();

    // og:image can appear in either attribute order
    const match =
      html.match(/property="og:image"\s+content="([^"]+)"/) ??
      html.match(/content="([^"]+)"\s+property="og:image"/) ??
      html.match(/property='og:image'\s+content='([^']+)'/) ??
      html.match(/content='([^']+)'\s+property='og:image'/);

    if (!match?.[1]) return null;

    let url = match[1].trim();

    // Normalise protocol-relative URLs
    if (url.startsWith('//')) url = `https:${url}`;

    // Only accept http(s) URLs; ignore data-URIs or empty strings
    if (!url.startsWith('http')) return null;

    return url;
  } catch {
    return null;
  }
}
