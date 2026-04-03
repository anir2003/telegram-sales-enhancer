// Simple in-flight request deduplication (no caching)
const inFlightRequests = new Map<string, Promise<unknown>>();

/**
 * Fetch JSON with automatic request deduplication for GET requests.
 * Does NOT cache responses — every call after dedup hits the server.
 */
export async function fetchJson<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const isGetRequest = !init?.method || init.method === 'GET';
  const cacheKey = `${url}:${JSON.stringify(init?.body ?? {})}`;

  // Skip dedup for non-GET requests
  if (!isGetRequest) {
    return performFetch<T>(url, init);
  }

  // Check in-flight requests (deduplication only — not caching)
  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) {
    return inFlight as Promise<T>;
  }

  // Perform the fetch and track it
  const promise = performFetch<T>(url, init).then((data) => {
    inFlightRequests.delete(cacheKey);
    return data;
  }).catch((error) => {
    inFlightRequests.delete(cacheKey);
    throw error;
  });

  inFlightRequests.set(cacheKey, promise);
  return promise;
}

async function performFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? 'Request failed');
  }
  return payload as T;
}

/**
 * Clear the in-flight request tracking.
 */
export function clearRequestCache(): void {
  inFlightRequests.clear();
}

/**
 * No-op for backward compatibility.
 */
export function invalidateCache(_url: string): void {
  // no-op — no cache to invalidate
}
