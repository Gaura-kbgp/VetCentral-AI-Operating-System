import { getKBCategories, getKBTags, seedKBCategories } from '@/lib/actions/knowledge';
import { KBShell } from '@/components/knowledge-base/kb-shell';
import { PageHeader } from '@/components/ui/page-header';
import { BookOpen } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function KnowledgeBasePage() {
  let [catsResult, tagsResult] = await Promise.all([
    getKBCategories(),
    getKBTags(),
  ]);

  // Auto-seed categories on first visit
  if (catsResult.success && catsResult.data.length === 0) {
    catsResult = await seedKBCategories();
  }

  const categories = catsResult.success ? catsResult.data : [];
  const tags       = tagsResult.success  ? tagsResult.data  : [];

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        title="Knowledge Base"
        description="Single source of truth for all hospital documentation"
        color="navy"
        variant="banner"
        icon={<BookOpen className="h-7 w-7" />}
      />
      <KBShell
        initialCategories={categories}
        initialTags={tags}
      />
    </div>
  );
}
