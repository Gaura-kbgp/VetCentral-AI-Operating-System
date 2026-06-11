'use client';

import { create } from 'zustand';
import type { SectionKey } from '@/types/sections';

interface AppStore {
  activeSection: SectionKey;
  subId: string | null;
  // Per-section subId so navigating back restores the detail view
  sectionSubIds: Partial<Record<SectionKey, string | null>>;
  // Tracks which sections have been mounted at least once (keep-alive)
  mountedSections: Set<SectionKey>;

  navigate: (section: SectionKey, subId?: string | null) => void;
  mountSection: (section: SectionKey) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activeSection: 'dashboard',
  subId: null,
  sectionSubIds: {},
  mountedSections: new Set<SectionKey>(['dashboard']),

  navigate: (section, subId = null) => {
    // Rewrite URL silently — zero Next.js router involvement = zero re-renders
    const params = new URLSearchParams();
    params.set('section', section);
    if (subId) params.set('id', subId);
    history.replaceState(null, '', `/dashboard?${params.toString()}`);

    set((state) => ({
      activeSection: section,
      subId,
      sectionSubIds: { ...state.sectionSubIds, [section]: subId },
      // Only create new Set if section isn't already tracked
      mountedSections: state.mountedSections.has(section)
        ? state.mountedSections
        : new Set([...state.mountedSections, section]),
    }));
  },

  mountSection: (section) => set((state) => ({
    mountedSections: state.mountedSections.has(section)
      ? state.mountedSections
      : new Set([...state.mountedSections, section]),
  })),
}));
