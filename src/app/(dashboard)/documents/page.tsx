import { FileText } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getDocuments, getDocCategories, getDocTags } from '@/lib/actions/documents';
import { DocumentsShell } from '@/components/documents/documents-shell';

export const metadata = { title: 'Documents — VetOS' };

const ADMIN_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr', 'it_admin'];

export default async function DocumentsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createSupabaseAdminClient();

  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) redirect('/login');

  const [docsRes, catsRes, tagsRes, hospitalsRes, myRolesRes, orgRolesRes] = await Promise.all([
    getDocuments({ status: 'published', sortBy: 'updated_at' }),
    getDocCategories(),
    getDocTags(),
    admin.from('hospitals').select('id,name').eq('org_id', profile.org_id).eq('is_active', true).order('name'),
    admin.from('user_hospital_roles').select('role').eq('user_id', user.id),
    admin.from('org_user_roles').select('role').eq('user_id', user.id),
  ]);

  const allRoles = [
    ...(myRolesRes.data ?? []).map(r => r.role),
    ...(orgRolesRes.data ?? []).map(r => r.role),
  ];
  const canManage = allRoles.some(r => ADMIN_ROLES.includes(r));

  return (
    <div className="flex flex-col h-full" style={{ height: 'calc(100vh - 4rem)' }}>
      <div className="px-6 pt-6 pb-4 shrink-0">
        <PageHeader
          title="Documents"
          description="Shared files, SOPs, policies, and hospital documentation"
          color="navy"
          icon={<FileText className="h-7 w-7" />}
        />
      </div>
      <div className="flex-1 min-h-0 border-t border-slate-200">
        <DocumentsShell
          initialDocs={docsRes.success ? docsRes.data : []}
          categories={catsRes.success ? catsRes.data : []}
          tags={tagsRes.success ? tagsRes.data : []}
          hospitals={hospitalsRes.data ?? []}
          canManage={canManage}
        />
      </div>
    </div>
  );
}
