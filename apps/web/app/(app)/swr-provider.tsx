'use client';

import { SWRConfig } from 'swr';
import { swrFetcher } from '@/lib/web/swr-fetcher';

/**
 * Wraps the app shell in a global SWR configuration.
 *
 * Key behaviours:
 * - stale-while-revalidate: cached data shows immediately, fresh data loads
 *   in the background → instant page navigation after first visit
 * - revalidateOnFocus: refreshes data when the user switches back to the tab
 * - dedupingInterval: collapses identical requests within a 4-second window
 * - refreshInterval: 0 means no automatic polling (data is fresh-enough via
 *   revalidateOnFocus and on-mutation mutate() calls)
 */
export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        revalidateIfStale: true,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        dedupingInterval: 4000,
        errorRetryCount: 2,
        // Keep cached data (don't clear on error)
        keepPreviousData: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
