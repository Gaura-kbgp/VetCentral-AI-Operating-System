export type SectionKey =
  | 'dashboard' | 'ai-assistant' | 'knowledge-base' | 'training' | 'calendar'
  | 'tasks' | 'announcements' | 'messages' | 'requests-portal'
  | 'workflows' | 'projects' | 'analytics'
  | 'hospital-hub' | 'onboarding' | 'hr' | 'documents' | 'approvals'
  | 'schedule-requests' | 'attendance' | 'hiring'
  | 'admin-users' | 'admin-roles' | 'admin-departments'
  | 'admin-hospitals' | 'admin-integrations' | 'admin-audit-logs' | 'admin-settings'
  | 'notifications' | 'profile' | 'help' | 'settings-preferences'
  | 'settings-security' | 'settings-ai'
  | 'communication';

export const HREF_TO_SECTION: Record<string, SectionKey> = {
  '/dashboard':            'dashboard',
  '/ai-assistant':         'ai-assistant',
  '/knowledge-base':       'knowledge-base',
  '/training':             'training',
  '/calendar':             'calendar',
  '/tasks':                'tasks',
  '/announcements':        'announcements',
  '/messages':             'messages',
  '/requests-portal':      'requests-portal',
  '/workflows':            'workflows',
  '/projects':             'projects',
  '/kpi':                  'analytics',
  '/analytics':            'analytics',
  '/hospital-hub':         'hospital-hub',
  '/onboarding':           'onboarding',
  '/hr':                   'hr',
  '/documents':            'documents',
  '/approvals':            'approvals',
  '/schedule-requests':    'schedule-requests',
  '/attendance':           'attendance',
  '/hiring':               'hiring',
  '/admin/users':          'admin-users',
  '/admin/roles':          'admin-roles',
  '/admin/departments':    'admin-departments',
  '/admin/hospitals':      'admin-hospitals',
  '/admin/integrations':   'admin-integrations',
  '/admin/audit-logs':     'admin-audit-logs',
  '/admin/settings':       'admin-settings',
  '/notifications':        'notifications',
  '/profile':              'profile',
  '/help':                 'help',
  '/settings/preferences': 'settings-preferences',
  '/settings/security':    'settings-security',
  '/settings/ai':          'settings-ai',
  '/communication':        'communication',
};
