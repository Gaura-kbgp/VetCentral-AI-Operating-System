import { notFound } from 'next/navigation';
import { getKBDocument, getKBVersions, getKBCategories, getKBTags } from '@/lib/actions/knowledge';
import { KBDocumentViewer } from '@/components/knowledge-base/kb-document-viewer';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function KBDocumentPage({ params }: Props) {
  const { id } = await params;

  const [docResult, versionsResult, catsResult, tagsResult] = await Promise.all([
    getKBDocument(id),
    getKBVersions(id),
    getKBCategories(),
    getKBTags(),
  ]);

  if (!docResult.success) notFound();

  return (
    <KBDocumentViewer
      document={docResult.data}
      versions={versionsResult.success ? versionsResult.data : []}
      categories={catsResult.success ? catsResult.data : []}
      tags={tagsResult.success ? tagsResult.data : []}
    />
  );
}
