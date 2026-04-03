// Simple in-flight request deduplication
const inFlightRequests = new Map<string, Promise<unknown>>();

// Cache for GET requests (short-lived, in-memory only)
const requestCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5000; // 5 seconds cache for same requests

/**
 * Fetch JSON with automatic request deduplication and caching for GET requests.
 * Prevents duplicate in-flight requests and caches GET responses briefly.
 */
export async function fetchJson<T = unknown>(
  url: string, 
  init?: RequestInit & { cacheDuration?: number }
): Promise<T> {
  const isGetRequest = !init?.method || init.method === 'GET';
  const cacheKey = `${url}:${JSON.stringify(init?.body ?? {})}`;
  const cacheDuration = init?.cacheDuration ?? CACHE_TTL;
  
  // Skip cache/dedup for non-GET requests
  if (!isGetRequest) {
    return performFetch<T>(url, init);
  }

  // Check in-flight requests (deduplication)
  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) {
    return inFlight as Promise<T>;
  }

  // Check cache
  const cached = requestCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < cacheDuration) {
    return cached.data as T;
  }

  // Perform the fetch and track it
  const promise = performFetch<T>(url, init).then((data) => {
    // Cache successful GET responses
    requestCache.set(cacheKey, { data, timestamp: Date.now() });
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
 * Clear the request cache. Useful after mutations.
 */
export function clearRequestCache(): void {
  requestCache.clear();
  inFlightRequests.clear();
}

/**
 * Invalidate a specific URL from cache.
 */
export function invalidateCache(url: string): void {
  for (const key of requestCache.keys()) {
    if (key.startsWith(url)) {
      requestCache.delete(key);
    }
  }
}
