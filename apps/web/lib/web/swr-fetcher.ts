import { fetchJson } from './fetch-json';

/**
 * Default SWR fetcher — delegates to the existing fetchJson helper.
 * Used as the global `fetcher` in SWRConfig.
 */
export const swrFetcher = <T = unknown>(url: string) => fetchJson<T>(url);
