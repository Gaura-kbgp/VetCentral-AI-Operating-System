'use client';

import { FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { DocumentsShell } from '@/components/documents/documents-shell';
import { getDocuments, getDocCategories, getDocTags } from '@/lib/actions/documents';
import { BannerListSkeleton } from './skeletons';
import type { SectionProps } from './types';

const ADMIN_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr', 'it_admin'];

export function DocumentsSection({ userId, orgId }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['documents-data', userId, orgId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const [docsRes, catsRes, tagsRes, hospitalsRes, myRolesRes, orgRolesRes] = await Promise.all([
        getDocuments({ status: 'published', sortBy: 'updated_at' }),
        getDocCategories(),
        getDocTags(),
        supabase.from('hospitals').select('id,name').eq('org_id', orgId).eq('is_active', true).order('name'),
        supabase.from('user_hospital_roles').select('role').eq('user_id', userId),
        supabase.from('org_user_roles').select('role').eq('user_id', userId),
      ]);
      const allRoles = [
        ...(myRolesRes.data ?? []).map(r => r.role),
        ...(orgRolesRes.data ?? []).map(r => r.role),
      ];
      return {
        docs:       docsRes.success ? docsRes.data : [],
        categories: catsRes.success ? catsRes.data : [],
        tags:       tagsRes.success ? tagsRes.data : [],
        hospitals:  (hospitalsRes.data ?? []) as { id: string; name: string }[],
        canManage:  allRoles.some(r => ADMIN_ROLES.includes(r)),
      };
    },
  });

  return (
    <div className="flex flex-col h-full" style={{ height: 'calc(100vh - 4rem)' }}>
      <div className="px-0 pt-0 pb-4 shrink-0">
        <PageHeader
          title="Documents"
          description="Shared files, SOPs, policies, and hospital documentation"
          color="navy"
          variant="banner"
          icon={<FileText className="h-7 w-7" />}
        />
      </div>
      <div className="flex-1 min-h-0 border-t border-slate-200">
        {data ? (
          <DocumentsShell
            initialDocs={data.docs as Parameters<typeof DocumentsShell>[0]['initialDocs']}
            categories={data.categories as Parameters<typeof DocumentsShell>[0]['categories']}
            tags={data.tags as Parameters<typeof DocumentsShell>[0]['tags']}
            hospitals={data.hospitals}
            canManage={data.canManage}
          />
        ) : <BannerListSkeleton />}
      </div>
    </div>
  );
}
