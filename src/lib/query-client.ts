import { QueryClient } from '@tanstack/react-query';

let instance: QueryClient | undefined;

// Singleton so the same cache is shared across all providers.
// staleTime: Infinity  → data never goes stale during the session.
// Sections are CSS-hidden (never unmount), so there is no value in
// background re-fetching — each section fetches exactly once per page load.
export function getQueryClient(): QueryClient {
  if (!instance) {
    instance = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime:            Infinity,
          gcTime:               60 * 60 * 1000, // 1 h — keep cache while tab is open
          retry:                1,
          refetchOnWindowFocus: false,
          refetchOnReconnect:   false,
          refetchOnMount:       false,
        },
      },
    });
  }
  return instance;
}
