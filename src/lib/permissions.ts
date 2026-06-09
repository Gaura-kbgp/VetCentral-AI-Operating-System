/**
 * Central RBAC Permission Authority for VetOS
 *
 * This file is the single source of truth for:
 *  - All permission strings in the system
 *  - Which roles hold which permissions
 *  - Navigation visibility per role
 *  - Data scope per role per resource
 *  - Route access control
 */

import type { AppRole } from '@/types/database';

// ─────────────────────────────────────────────────────────────────────────────
// Permission strings
// ─────────────────────────────────────────────────────────────────────────────

export type Permission =
  // Users
  | 'users:view' | 'users:create' | 'users:edit' | 'users:delete' | 'users:assign_role'
  // Hospitals
  | 'hospitals:view' | 'hospitals:create' | 'hospitals:edit' | 'hospitals:delete'
  // Departments
  | 'departments:view' | 'departments:create' | 'departments:edit' | 'departments:delete'
  // Roles & system
  | 'roles:view' | 'roles:edit'
  | 'audit_logs:view' | 'audit_logs:export'
  | 'settings:view' | 'settings:edit'
  | 'integrations:view' | 'integrations:edit'
  // Requests
  | 'requests:view_own' | 'requests:view_dept' | 'requests:view_hosp' | 'requests:view_all'
  | 'requests:create' | 'requests:approve' | 'requests:escalate'
  // Calendar
  | 'calendar:view' | 'calendar:create' | 'calendar:edit' | 'calendar:delete'
  // Knowledge Base
  | 'knowledge_base:view' | 'knowledge_base:create' | 'knowledge_base:edit' | 'knowledge_base:delete'
  // Training
  | 'training:view' | 'training:create' | 'training:edit' | 'training:delete'
  // Onboarding
  | 'onboarding:view_own' | 'onboarding:view' | 'onboarding:create' | 'onboarding:manage'
  // AI
  | 'ai:query_own' | 'ai:query_dept' | 'ai:query_hosp' | 'ai:query_all' | 'ai:configure'
  // Projects
  | 'projects:view' | 'projects:create' | 'projects:manage'
  // Communication
  | 'communication:view' | 'communication:create' | 'communication:manage'
  // Hospital Hub
  | 'hospital_hub:view' | 'hospital_hub:manage'
  // Analytics
  | 'analytics:view_own' | 'analytics:view_hosp' | 'analytics:view_all'
  // Documents
  | 'documents:view_own' | 'documents:view_all' | 'documents:verify'
  // HR
  | 'hr:view' | 'hr:manage'
  // Tasks
  | 'tasks:view' | 'tasks:create' | 'tasks:edit' | 'tasks:delete';

// ─────────────────────────────────────────────────────────────────────────────
// Role → Permissions map (source of truth for UI & server action guards)
// ─────────────────────────────────────────────────────────────────────────────

const ALL_PERMISSIONS: Permission[] = [
  'users:view','users:create','users:edit','users:delete','users:assign_role',
  'hospitals:view','hospitals:create','hospitals:edit','hospitals:delete',
  'departments:view','departments:create','departments:edit','departments:delete',
  'roles:view','roles:edit',
  'audit_logs:view','audit_logs:export',
  'settings:view','settings:edit',
  'integrations:view','integrations:edit',
  'requests:view_own','requests:view_dept','requests:view_hosp','requests:view_all',
  'requests:create','requests:approve','requests:escalate',
  'calendar:view','calendar:create','calendar:edit','calendar:delete',
  'knowledge_base:view','knowledge_base:create','knowledge_base:edit','knowledge_base:delete',
  'training:view','training:create','training:edit','training:delete',
  'onboarding:view_own','onboarding:view','onboarding:create','onboarding:manage',
  'ai:query_own','ai:query_dept','ai:query_hosp','ai:query_all','ai:configure',
  'projects:view','projects:create','projects:manage',
  'communication:view','communication:create','communication:manage',
  'hospital_hub:view','hospital_hub:manage',
  'analytics:view_own','analytics:view_hosp','analytics:view_all',
  'documents:view_own','documents:view_all','documents:verify',
  'hr:view','hr:manage',
  'tasks:view','tasks:create','tasks:edit','tasks:delete',
];

export const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {

  super_admin: ALL_PERMISSIONS,

  org_admin: ALL_PERMISSIONS,

  hospital_admin: [
    'users:view','users:create','users:edit','users:assign_role',
    'hospitals:view','hospitals:edit',
    'departments:view','departments:create','departments:edit',
    'roles:view',
    'audit_logs:view',
    'settings:view',
    'integrations:view',
    'requests:view_own','requests:view_dept','requests:view_hosp','requests:create','requests:approve','requests:escalate',
    'calendar:view','calendar:create','calendar:edit','calendar:delete',
    'knowledge_base:view','knowledge_base:create','knowledge_base:edit',
    'training:view','training:create','training:edit',
    'onboarding:view','onboarding:create','onboarding:manage',
    'ai:query_own','ai:query_dept','ai:query_hosp',
    'projects:view','projects:create','projects:manage',
    'communication:view','communication:create','communication:manage',
    'hospital_hub:view','hospital_hub:manage',
    'analytics:view_own','analytics:view_hosp',
    'documents:view_own','documents:view_all','documents:verify',
    'hr:view','hr:manage',
    'tasks:view','tasks:create','tasks:edit','tasks:delete',
  ],

  practice_manager: [
    'users:view',
    'departments:view',
    'requests:view_own','requests:view_dept','requests:create','requests:approve','requests:escalate',
    'calendar:view','calendar:create','calendar:edit',
    'knowledge_base:view','knowledge_base:create','knowledge_base:edit',
    'training:view','training:create','training:edit',
    'onboarding:view',
    'ai:query_own','ai:query_dept',
    'projects:view','projects:create','projects:manage',
    'communication:view','communication:create',
    'analytics:view_own','analytics:view_hosp',
    'documents:view_own',
    'tasks:view','tasks:create','tasks:edit','tasks:delete',
  ],

  hr: [
    'users:view','users:create','users:edit',
    'departments:view',
    'requests:view_own','requests:create','requests:approve',
    'calendar:view','calendar:create',
    'knowledge_base:view',
    'training:view','training:create','training:edit',
    'onboarding:view','onboarding:create','onboarding:manage',
    'ai:query_own',
    'communication:view','communication:create',
    'analytics:view_own',
    'documents:view_own','documents:view_all','documents:verify',
    'hr:view','hr:manage',
    'tasks:view','tasks:create','tasks:edit',
  ],

  doctor: [
    'requests:view_own','requests:create',
    'calendar:view','calendar:create',
    'knowledge_base:view','knowledge_base:create',
    'training:view',
    'onboarding:view_own',
    'ai:query_own',
    'communication:view','communication:create',
    'analytics:view_own',
    'documents:view_own',
    'tasks:view','tasks:create','tasks:edit',
  ],

  csr: [
    'requests:view_own','requests:create',
    'calendar:view','calendar:create',
    'knowledge_base:view',
    'training:view',
    'onboarding:view_own',
    'ai:query_own',
    'communication:view','communication:create',
    'analytics:view_own',
    'documents:view_own',
    'tasks:view','tasks:create',
  ],

  va: [
    'requests:view_own','requests:create',
    'calendar:view','calendar:create',
    'knowledge_base:view',
    'training:view',
    'onboarding:view_own',
    'ai:query_own',
    'communication:view','communication:create',
    'analytics:view_own',
    'documents:view_own',
    'tasks:view','tasks:create',
  ],

  marketing: [
    'requests:view_own','requests:create',
    'calendar:view','calendar:create',
    'knowledge_base:view','knowledge_base:create',
    'training:view',
    'onboarding:view_own',
    'ai:query_own',
    'communication:view','communication:create',
    'analytics:view_own',
    'documents:view_own',
    'tasks:view','tasks:create',
  ],

  it_admin: [
    'users:view','users:create','users:edit',
    'hospitals:view',
    'departments:view',
    'roles:view',
    'settings:view','settings:edit',
    'integrations:view','integrations:edit',
    'audit_logs:view','audit_logs:export',
    'requests:view_own','requests:create',
    'calendar:view',
    'knowledge_base:view',
    'training:view',
    'ai:query_own',
    'communication:view',
    'hospital_hub:view',
    'analytics:view_own',
    'documents:view_own',
    'tasks:view','tasks:create','tasks:edit',
  ],

  viewer: [
    'requests:view_own',
    'calendar:view',
    'knowledge_base:view',
    'training:view',
    'onboarding:view_own',
    'ai:query_own',
    'communication:view',
    'analytics:view_own',
    'documents:view_own',
    'tasks:view',
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Data Scope — controls how much data a role can query per resource
// ─────────────────────────────────────────────────────────────────────────────

export type DataScope = 'own' | 'department' | 'hospital' | 'all';

const SCOPE_MAP: Record<AppRole, DataScope> = {
  super_admin:      'all',
  org_admin:        'all',
  hospital_admin:   'hospital',
  practice_manager: 'department',
  hr:               'hospital',
  doctor:           'own',
  csr:              'own',
  va:               'own',
  marketing:        'own',
  it_admin:         'hospital',
  viewer:           'own',
};

export function getDataScope(role: AppRole | null): DataScope {
  if (!role) return 'own';
  return SCOPE_MAP[role] ?? 'own';
}

// ─────────────────────────────────────────────────────────────────────────────
// Core helpers
// ─────────────────────────────────────────────────────────────────────────────

export function hasPermission(role: AppRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}

export function hasAnyPermission(role: AppRole | null | undefined, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(role, p));
}

export function hasAllPermissions(role: AppRole | null | undefined, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(role, p));
}

export function getUserPermissions(role: AppRole | null | undefined): Permission[] {
  if (!role) return [];
  return ROLE_PERMISSIONS[role] ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Route access — maps URL prefixes to minimum required permissions
// ─────────────────────────────────────────────────────────────────────────────

const ROUTE_PERMISSION_MAP: Array<{ prefix: string; require: Permission }> = [
  // Admin-only
  { prefix: '/admin/roles',      require: 'roles:view' },
  { prefix: '/admin/audit-logs', require: 'audit_logs:view' },
  { prefix: '/admin/settings',   require: 'settings:view' },
  { prefix: '/admin/integrations', require: 'integrations:view' },
  { prefix: '/admin/users',      require: 'users:view' },
  { prefix: '/admin/hospitals',  require: 'hospitals:view' },
  { prefix: '/admin/departments', require: 'departments:view' },
  { prefix: '/admin',            require: 'settings:view' },
  // Ops
  { prefix: '/hospital-hub',     require: 'hospital_hub:view' },
  { prefix: '/approvals',        require: 'requests:approve' },
  { prefix: '/hr',               require: 'hr:view' },
  { prefix: '/projects',         require: 'projects:view' },
  { prefix: '/onboarding',       require: 'onboarding:view' },
  { prefix: '/schedule-requests', require: 'requests:approve' },
];

/**
 * Returns true if the user can access the given pathname.
 * Public/auth pages always return true (they don't appear in this map).
 */
export function canAccessRoute(role: AppRole | null | undefined, pathname: string): boolean {
  const match = ROUTE_PERMISSION_MAP.find(r => pathname.startsWith(r.prefix));
  if (!match) return true; // not restricted
  return hasPermission(role, match.require);
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation items — each item visible to specific roles
// ─────────────────────────────────────────────────────────────────────────────

export interface NavItem {
  label: string;
  href: string;
  iconKey: string;
  permission?: Permission;
  section?: 'core' | 'admin' | 'hr';
  badge?: 'pendingRequests' | 'unread';
}

/** All possible nav items with their required permission (null = always visible) */
export const ALL_NAV_ITEMS: NavItem[] = [
  // Core — visible to all authenticated users
  { label: 'Dashboard',           href: '/dashboard',       iconKey: 'LayoutDashboard', section: 'core' },
  { label: 'AI Assistant',        href: '/ai-assistant',    iconKey: 'Sparkles',        section: 'core' },
  { label: 'Knowledge Base',      href: '/knowledge-base',  iconKey: 'BookOpen',        section: 'core' },
  { label: 'Training Academy',    href: '/training',        iconKey: 'GraduationCap',   section: 'core' },
  { label: 'Master Calendar',     href: '/calendar',        iconKey: 'Calendar',        section: 'core' },
  { label: 'My Tasks',            href: '/tasks',           iconKey: 'CheckSquare2',    section: 'core', permission: 'tasks:view' },
  { label: 'Communications',      href: '/communication',   iconKey: 'MessageSquare',   section: 'core' },
  { label: 'Requests',            href: '/workflows',       iconKey: 'Inbox',           section: 'core' },

  // Role-gated core
  { label: 'Projects',            href: '/projects',        iconKey: 'FolderOpen',      section: 'core', permission: 'projects:view' },
  { label: 'Analytics & KPI',     href: '/kpi',             iconKey: 'BarChart3',       section: 'core', permission: 'analytics:view_hosp' },
  { label: 'Hospital Hub',        href: '/hospital-hub',    iconKey: 'Building2',       section: 'core', permission: 'hospital_hub:view' },
  { label: 'Employee Onboarding', href: '/onboarding',      iconKey: 'UserPlus',        section: 'core', permission: 'onboarding:view' },

  // HR section
  { label: 'Employees',           href: '/hr',              iconKey: 'Users',           section: 'hr',   permission: 'hr:view' },
  { label: 'Documents',           href: '/documents',       iconKey: 'FileText',        section: 'hr',   permission: 'documents:verify' },

  // Admin section
  { label: 'Approval Center',     href: '/approvals',       iconKey: 'CheckSquare',     section: 'admin', permission: 'requests:approve', badge: 'pendingRequests' },
  { label: 'Schedule Requests',   href: '/schedule-requests', iconKey: 'ClipboardList', section: 'admin', permission: 'requests:approve' },
  { label: 'User Management',     href: '/admin/users',     iconKey: 'UserCog',         section: 'admin', permission: 'users:create' },
  { label: 'Roles & Permissions', href: '/admin/roles',     iconKey: 'Shield',          section: 'admin', permission: 'roles:view' },
  { label: 'Audit Logs',          href: '/admin/audit-logs', iconKey: 'Activity',       section: 'admin', permission: 'audit_logs:view' },
  { label: 'Settings',            href: '/admin/settings',  iconKey: 'Settings',        section: 'admin', permission: 'settings:view' },
];

export function getVisibleNavItems(role: AppRole | null | undefined): NavItem[] {
  return ALL_NAV_ITEMS.filter(item => {
    if (!item.permission) return true;
    return hasPermission(role, item.permission);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Role metadata — labels, colors, descriptions
// ─────────────────────────────────────────────────────────────────────────────

export interface RoleMeta {
  label: string;
  description: string;
  color: string;
  badgeClass: string;
  scope: 'org' | 'hospital' | 'department' | 'own';
  isAdmin: boolean;
}

export const ROLE_META: Record<AppRole, RoleMeta> = {
  super_admin: {
    label: 'Super Admin',
    description: 'Full system access across all hospitals and organizations',
    color: '#dc2626',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    scope: 'org',
    isAdmin: true,
  },
  org_admin: {
    label: 'Org Admin',
    description: 'Organization-wide administration and management',
    color: '#7c3aed',
    badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    scope: 'org',
    isAdmin: true,
  },
  hospital_admin: {
    label: 'Hospital Admin',
    description: 'Manages a single hospital — staff, requests, training, calendar',
    color: '#4f46e5',
    badgeClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    scope: 'hospital',
    isAdmin: true,
  },
  practice_manager: {
    label: 'Practice Manager',
    description: 'Department-level management — team, tasks, approvals',
    color: '#2563eb',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    scope: 'department',
    isAdmin: true,
  },
  hr: {
    label: 'HR Admin',
    description: 'Employee lifecycle — onboarding, documents, certifications',
    color: '#db2777',
    badgeClass: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
    scope: 'hospital',
    isAdmin: false,
  },
  doctor: {
    label: 'Veterinarian',
    description: 'Clinical staff with access to personal data and KB',
    color: '#0d9488',
    badgeClass: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
    scope: 'own',
    isAdmin: false,
  },
  csr: {
    label: 'CSR',
    description: 'Customer Service Representative',
    color: '#16a34a',
    badgeClass: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    scope: 'own',
    isAdmin: false,
  },
  va: {
    label: 'Vet Assistant',
    description: 'Veterinary Assistant',
    color: '#0891b2',
    badgeClass: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
    scope: 'own',
    isAdmin: false,
  },
  marketing: {
    label: 'Marketing',
    description: 'Marketing and communications staff',
    color: '#ea580c',
    badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    scope: 'own',
    isAdmin: false,
  },
  it_admin: {
    label: 'IT Admin',
    description: 'IT administration — settings, integrations, user accounts',
    color: '#7c3aed',
    badgeClass: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    scope: 'hospital',
    isAdmin: false,
  },
  viewer: {
    label: 'Viewer',
    description: 'Read-only access to shared resources',
    color: '#64748b',
    badgeClass: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
    scope: 'own',
    isAdmin: false,
  },
};

export const ALL_ROLES: AppRole[] = [
  'super_admin', 'org_admin', 'hospital_admin', 'practice_manager',
  'hr', 'doctor', 'csr', 'va', 'marketing', 'it_admin', 'viewer',
];

export const ADMIN_ROLES: AppRole[] = [
  'super_admin', 'org_admin', 'hospital_admin', 'practice_manager',
];

export const HR_ROLES: AppRole[] = [
  'super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr',
];

// ─────────────────────────────────────────────────────────────────────────────
// Permission display groups — for the Permission Matrix UI
// ─────────────────────────────────────────────────────────────────────────────

export const PERMISSION_GROUPS: Array<{
  module: string;
  label: string;
  permissions: Array<{ key: Permission; label: string }>;
}> = [
  {
    module: 'users', label: 'User Management',
    permissions: [
      { key: 'users:view',        label: 'View' },
      { key: 'users:create',      label: 'Create' },
      { key: 'users:edit',        label: 'Edit' },
      { key: 'users:delete',      label: 'Delete' },
      { key: 'users:assign_role', label: 'Assign Roles' },
    ],
  },
  {
    module: 'requests', label: 'Requests',
    permissions: [
      { key: 'requests:view_own',  label: 'View Own' },
      { key: 'requests:view_dept', label: 'View Dept' },
      { key: 'requests:view_hosp', label: 'View Hospital' },
      { key: 'requests:view_all',  label: 'View All' },
      { key: 'requests:create',    label: 'Create' },
      { key: 'requests:approve',   label: 'Approve' },
      { key: 'requests:escalate',  label: 'Escalate' },
    ],
  },
  {
    module: 'onboarding', label: 'Onboarding',
    permissions: [
      { key: 'onboarding:view_own', label: 'View Own' },
      { key: 'onboarding:view',     label: 'View All' },
      { key: 'onboarding:create',   label: 'Create' },
      { key: 'onboarding:manage',   label: 'Manage' },
    ],
  },
  {
    module: 'ai', label: 'AI Assistant',
    permissions: [
      { key: 'ai:query_own',  label: 'Query Own' },
      { key: 'ai:query_dept', label: 'Query Dept' },
      { key: 'ai:query_hosp', label: 'Query Hospital' },
      { key: 'ai:query_all',  label: 'Query All' },
      { key: 'ai:configure',  label: 'Configure' },
    ],
  },
  {
    module: 'hospital_hub', label: 'Hospital Hub',
    permissions: [
      { key: 'hospital_hub:view',   label: 'View' },
      { key: 'hospital_hub:manage', label: 'Manage' },
    ],
  },
  {
    module: 'projects', label: 'Projects',
    permissions: [
      { key: 'projects:view',   label: 'View' },
      { key: 'projects:create', label: 'Create' },
      { key: 'projects:manage', label: 'Manage' },
    ],
  },
  {
    module: 'analytics', label: 'Analytics',
    permissions: [
      { key: 'analytics:view_own',  label: 'Own' },
      { key: 'analytics:view_hosp', label: 'Hospital' },
      { key: 'analytics:view_all',  label: 'All' },
    ],
  },
  {
    module: 'system', label: 'System',
    permissions: [
      { key: 'roles:view',          label: 'View Roles' },
      { key: 'roles:edit',          label: 'Edit Roles' },
      { key: 'audit_logs:view',     label: 'Audit Logs' },
      { key: 'settings:edit',       label: 'Settings' },
      { key: 'integrations:edit',   label: 'Integrations' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Request visibility scope (used by server actions to scope queries)
// ─────────────────────────────────────────────────────────────────────────────

export function getRequestScope(role: AppRole | null): 'own' | 'dept' | 'hosp' | 'all' {
  if (!role) return 'own';
  if (hasPermission(role, 'requests:view_all'))  return 'all';
  if (hasPermission(role, 'requests:view_hosp')) return 'hosp';
  if (hasPermission(role, 'requests:view_dept')) return 'dept';
  return 'own';
}
