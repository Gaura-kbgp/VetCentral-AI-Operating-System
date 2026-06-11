'use client';

// Re-export the shared types so existing imports keep working unchanged.
export type { SectionKey } from '@/types/sections';
export { HREF_TO_SECTION } from '@/types/sections';

import { useAppStore } from '@/store/app-store';

// Drop-in hook — same API as before, now backed by Zustand.
// All existing callers (AppSidebar, TopNav, AccountMenu) work without changes.
// history.replaceState is used internally — no router.push, no page remounting.
export function useSPANavigation() {
  const activeSection = useAppStore((s) => s.activeSection);
  const activeSubId   = useAppStore((s) => s.subId);
  const navigate      = useAppStore((s) => s.navigate);
  return { activeSection, activeSubId, navigate };
}
