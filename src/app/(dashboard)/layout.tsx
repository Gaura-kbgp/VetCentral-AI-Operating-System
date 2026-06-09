import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import AppSidebar from '@/components/layout/AppSidebar';
import TopNav from '@/components/layout/TopNav';
import { PreferencesProvider } from '@/components/providers/preferences-provider';
import { getOrCreatePreferences } from '@/lib/actions/preferences';
import type { AppRole } from '@/types/database';

const ROLE_PRIORITY: AppRole[] = [
  'super_admin', 'org_admin', 'hospital_admin', 'practice_manager',
  'it_admin', 'doctor', 'hr', 'marketing', 'csr', 'va', 'viewer',
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Use admin client for role fetch to bypass RLS during layout resolution
  const adminClient = createSupabaseAdminClient();

  const [profileResult, hospRolesResult, orgRolesResult, hospitalsResult, unreadResult, pendingResult, prefs] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('first_name, last_name, display_name, email, avatar_url, job_title, org_id')
        .eq('id', user.id)
        .single(),
      adminClient
        .from('user_hospital_roles')
        .select('role, is_active, expires_at')
        .eq('user_id', user.id),
      // org_user_roles may not exist yet if migration 018 hasn't run; catch gracefully
      adminClient
        .from('org_user_roles')
        .select('role, is_active, expires_at')
        .eq('user_id', user.id),
      supabase
        .from('hospitals')
        .select('id, name, color')
        .order('name'),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false),
      adminClient
        .from('requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      getOrCreatePreferences(),
    ]);

  // Collect active, non-expired roles from both tables
  const now = new Date().toISOString();

  const activeHospRoles = (hospRolesResult.data ?? [])
    .filter(r => {
      const active = (r as { is_active?: boolean }).is_active;
      const exp = (r as { expires_at?: string | null }).expires_at;
      return (active !== false) && (!exp || exp > now);
    })
    .map(r => r.role as AppRole);

  const activeOrgRoles = (orgRolesResult.data ?? [])
    .filter(r => {
      const active = (r as { is_active?: boolean }).is_active;
      const exp = (r as { expires_at?: string | null }).expires_at;
      return (active !== false) && (!exp || exp > now);
    })
    .map(r => r.role as AppRole);

  const allActiveRoles = [...activeOrgRoles, ...activeHospRoles];
  const highestRole: AppRole | null =
    ROLE_PRIORITY.find(r => allActiveRoles.includes(r)) ?? null;

  // ── Onboarding gate ─────────────────────────────────────────────────────────
  // If the user has an active (non-completed) onboarding record, keep them on
  // their onboarding journey until HR/manager marks it complete.
  // Admins are exempt — they manage onboarding and must access the dashboard freely.
  const ADMIN_EXEMPT_ROLES: AppRole[] = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr'];
  const isAdminExempt = highestRole != null && ADMIN_EXEMPT_ROLES.includes(highestRole);

  const headersList = await headers();
  const pathname    = headersList.get('x-pathname') ?? '';
  const onOnboarding = pathname.startsWith('/onboarding');

  if (!onOnboarding && !isAdminExempt) {
    const { data: activeRecord } = await adminClient
      .from('onboarding_records')
      .select('id')
      .eq('employee_id', user.id)
      .not('status', 'in', '("completed","cancelled")')
      .maybeSingle();

    if (activeRecord) {
      redirect(`/onboarding/${user.id}`);
    }
  }
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <PreferencesProvider preferences={prefs}>
      <div className="flex h-screen overflow-hidden bg-background" suppressHydrationWarning>
        <AppSidebar role={highestRole} pendingRequestCount={pendingResult.count ?? 0} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <TopNav
            user={profileResult.data ?? null}
            role={highestRole}
            hospitals={hospitalsResult.data ?? []}
            unreadCount={unreadResult.count ?? 0}
          />
          <main className="flex-1 overflow-y-auto p-6 bg-background">
            {children}
          </main>
        </div>
      </div>
    </PreferencesProvider>
  );
}
