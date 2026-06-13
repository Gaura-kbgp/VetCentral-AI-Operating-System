'use client';

import { useQuery } from '@tanstack/react-query';
import { KBShell } from '@/components/knowledge-base/kb-shell';
import { getKBCategories, getKBTags, seedKBCategories, seedDefaultDocuments } from '@/lib/actions/knowledge';
import type { KBCategory, KBTag } from '@/types/app';
import type { SectionProps } from './types';

export function KnowledgeBaseSection({ role }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['kb-meta'],
    queryFn: async () => {
      let [catsResult, tagsResult] = await Promise.all([getKBCategories(), getKBTags()]);
      if (catsResult.success && catsResult.data.length === 0) {
        catsResult = await seedKBCategories();
      }
      // Seed default documents (CBC, Employee Handbook, OSHA) — skips if already exist
      await seedDefaultDocuments();
      return {
        categories: (catsResult.success ? catsResult.data : []) as KBCategory[],
        tags: (tagsResult.success ? tagsResult.data : []) as KBTag[],
      };
    },
    placeholderData: { categories: [] as KBCategory[], tags: [] as KBTag[] },
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      <KBShell
        initialCategories={data?.categories ?? []}
        initialTags={data?.tags ?? []}
        role={role}
      />
    </div>
  );
}
