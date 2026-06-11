'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  User,
  Calendar,
  CheckSquare,
  GraduationCap,
  Bell,
  Shield,
  Settings2,
  Bot,
  HelpCircle,
  LogOut,
  Users,
  KeyRound,
  Building2,
  LayoutGrid,
  ScrollText,
  Settings,
  Plug,
  ChevronDown,
  UserPlus,
  FileText,
  ClipboardCheck,
} from 'lucide-react';
import { hasPermission } from '@/lib/permissions';
import { useSPANavigation, HREF_TO_SECTION } from '@/contexts/spa-navigation';
import type { AppRole } from '@/types/database';

export interface AccountMenuProfile {
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  job_title: string | null;
}

interface AccountMenuProps {
  profile: AccountMenuProfile | null;
  role: AppRole | null;
  unreadCount?: number;
}

const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super Admin',
  org_admin: 'Org Admin',
  hospital_admin: 'Hospital Admin',
  practice_manager: 'Practice Manager',
  doctor: 'Doctor',
  csr: 'Client Services',
  va: 'Virtual Assistant',
  marketing: 'Marketing',
  hr: 'Human Resources',
  it_admin: 'IT Admin',
  viewer: 'Viewer',
};

const ROLE_COLORS: Record<AppRole, string> = {
  super_admin: 'bg-red-100 text-red-700',
  org_admin: 'bg-purple-100 text-purple-700',
  hospital_admin: 'bg-indigo-100 text-indigo-700',
  practice_manager: 'bg-blue-100 text-blue-700',
  doctor: 'bg-teal-100 text-teal-700',
  csr: 'bg-green-100 text-green-700',
  va: 'bg-cyan-100 text-cyan-700',
  marketing: 'bg-orange-100 text-orange-700',
  hr: 'bg-pink-100 text-pink-700',
  it_admin: 'bg-violet-100 text-violet-700',
  viewer: 'bg-slate-100 text-slate-600',
};


export default function AccountMenu({ profile, role, unreadCount = 0 }: AccountMenuProps) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const { navigate } = useSPANavigation();
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const fullName =
    profile?.display_name?.trim() ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
    'User';
  const initials =
    `${profile?.first_name?.[0] ?? ''}${profile?.last_name?.[0] ?? ''}`.toUpperCase() || 'U';
  const canAccessHR        = hasPermission(role, 'hr:view');
  const canManageOnboarding = hasPermission(role, 'onboarding:manage');
  const canVerifyDocuments  = hasPermission(role, 'documents:verify');
  const showHRSection = canAccessHR;

  const canManageUsers     = hasPermission(role, 'users:assign_role');
  const canManageRoles     = hasPermission(role, 'roles:view');
  const canManageHospitals = hasPermission(role, 'hospitals:edit');
  const canManageDepts     = hasPermission(role, 'departments:create');
  const canViewAuditLogs   = hasPermission(role, 'audit_logs:view');
  const canEditSettings    = hasPermission(role, 'settings:edit');
  const canViewIntegrations = hasPermission(role, 'integrations:view');
  const showAdminSection = canManageUsers || canManageRoles || canManageHospitals ||
    canManageDepts || canViewAuditLogs || canEditSettings || canViewIntegrations;

  async function handleLogout() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  function nav(path: string) {
    const section = HREF_TO_SECTION[path];
    if (section) navigate(section);
    else router.push(path);
  }

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 h-9 px-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarImage src={profile?.avatar_url ?? undefined} alt={fullName} />
          <AvatarFallback className="text-xs bg-blue-600 text-white font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="hidden sm:flex flex-col items-start min-w-0">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200 max-w-28 truncate leading-tight">
            {fullName}
          </span>
          {role && (
            <span className="text-[10px] text-slate-400 leading-tight">
              {ROLE_LABELS[role]}
            </span>
          )}
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400 hidden sm:block shrink-0" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72 p-0 overflow-hidden flex flex-col max-h-[85vh]">
        {/* ── Header card ── */}
        <div className="flex items-center gap-3 px-4 py-3 bg-linear-to-br from-slate-50 to-blue-50/60 dark:from-slate-900 dark:to-slate-800 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <Avatar className="h-11 w-11 shrink-0 ring-2 ring-white shadow-sm">
            <AvatarImage src={profile?.avatar_url ?? undefined} alt={fullName} />
            <AvatarFallback className="text-sm bg-blue-600 text-white font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{fullName}</p>
            {profile?.job_title && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{profile.job_title}</p>
            )}
            <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">{profile?.email ?? ''}</p>
          </div>
          {role && (
            <Badge
              className={cn(
                'text-[10px] px-1.5 py-0.5 shrink-0 border-0 font-medium rounded-md',
                ROLE_COLORS[role]
              )}
            >
              {ROLE_LABELS[role]}
            </Badge>
          )}
        </div>

        {/* ── Menu body ── */}
        <div className="p-1.5 space-y-0.5 overflow-y-auto scroll-smooth overscroll-contain flex-1">

          {/* Personal */}
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 px-2 pt-2 pb-1 font-semibold">
              Personal
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => nav('/profile')}>
              <User className="h-4 w-4 text-slate-400" />
              My Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => nav('/calendar')}>
              <Calendar className="h-4 w-4 text-slate-400" />
              My Calendar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => nav('/tasks')}>
              <CheckSquare className="h-4 w-4 text-slate-400" />
              My Tasks
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => nav('/training')}>
              <GraduationCap className="h-4 w-4 text-slate-400" />
              Training Progress
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          {/* Settings */}
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 px-2 pt-1 pb-1 font-semibold">
              Settings
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => nav('/notifications')}>
              <Bell className="h-4 w-4 text-slate-400" />
              Notifications
              {unreadCount > 0 && (
                <DropdownMenuShortcut>
                  <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-semibold">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                </DropdownMenuShortcut>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => nav('/settings/security')}>
              <Shield className="h-4 w-4 text-slate-400" />
              Security Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => nav('/settings/preferences')}>
              <Settings2 className="h-4 w-4 text-slate-400" />
              Preferences
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => nav('/settings/ai')}>
              <Bot className="h-4 w-4 text-slate-400" />
              AI Assistant Settings
            </DropdownMenuItem>
          </DropdownMenuGroup>

          {/* HR Tools — visible to roles with hr:view */}
          {showHRSection && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 px-2 pt-1 pb-1 font-semibold">
                  HR Tools
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => nav('/hr')}>
                  <Users className="h-4 w-4 text-slate-400" />
                  Employees
                </DropdownMenuItem>
                {canManageOnboarding && (
                  <DropdownMenuItem onClick={() => nav('/onboarding')}>
                    <UserPlus className="h-4 w-4 text-slate-400" />
                    Employee Onboarding
                  </DropdownMenuItem>
                )}
                {canVerifyDocuments && (
                  <DropdownMenuItem onClick={() => nav('/documents')}>
                    <FileText className="h-4 w-4 text-slate-400" />
                    Documents
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => nav('/approvals')}>
                  <ClipboardCheck className="h-4 w-4 text-slate-400" />
                  Approval Center
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}

          {/* Administration — per-permission visibility */}
          {showAdminSection && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 px-2 pt-1 pb-1 font-semibold">
                  Administration
                </DropdownMenuLabel>
                {canManageUsers && (
                  <DropdownMenuItem onClick={() => nav('/admin/users')}>
                    <Users className="h-4 w-4 text-slate-400" />
                    User Management
                  </DropdownMenuItem>
                )}
                {canManageRoles && (
                  <DropdownMenuItem onClick={() => nav('/admin/roles')}>
                    <KeyRound className="h-4 w-4 text-slate-400" />
                    Roles &amp; Permissions
                  </DropdownMenuItem>
                )}
                {canManageHospitals && (
                  <DropdownMenuItem onClick={() => nav('/admin/hospitals')}>
                    <Building2 className="h-4 w-4 text-slate-400" />
                    Hospital Management
                  </DropdownMenuItem>
                )}
                {canManageDepts && (
                  <DropdownMenuItem onClick={() => nav('/admin/departments')}>
                    <LayoutGrid className="h-4 w-4 text-slate-400" />
                    Departments
                  </DropdownMenuItem>
                )}
                {canViewAuditLogs && (
                  <DropdownMenuItem onClick={() => nav('/admin/audit-logs')}>
                    <ScrollText className="h-4 w-4 text-slate-400" />
                    Audit Logs
                  </DropdownMenuItem>
                )}
                {canEditSettings && (
                  <DropdownMenuItem onClick={() => nav('/admin/settings')}>
                    <Settings className="h-4 w-4 text-slate-400" />
                    System Settings
                  </DropdownMenuItem>
                )}
                {canViewIntegrations && (
                  <DropdownMenuItem onClick={() => nav('/admin/integrations')}>
                    <Plug className="h-4 w-4 text-slate-400" />
                    Integrations
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </>
          )}

          <DropdownMenuSeparator />

          {/* Footer */}
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => nav('/help')}>
              <HelpCircle className="h-4 w-4 text-slate-400" />
              Help &amp; Support
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setShowSignOutDialog(true)}>
              <LogOut className="h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuGroup>

        </div>
      </DropdownMenuContent>
    </DropdownMenu>

    <AlertDialog open={showSignOutDialog} onOpenChange={setShowSignOutDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out of VetOS?</AlertDialogTitle>
          <AlertDialogDescription>
            Your session will be ended and you will be redirected to the login page.
            Any unsaved changes will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={signingOut}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleLogout}
            disabled={signingOut}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
          >
            {signingOut ? 'Signing out…' : 'Sign Out'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
