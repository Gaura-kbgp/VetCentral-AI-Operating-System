// Shared search index used by TopNav header search and DashboardSearchBar.
import type { SectionKey } from '@/types/sections';

export interface SearchItem {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  category: 'section' | 'content';
  section: SectionKey;
  subId?: string;
  iconKey: string;
  iconColor: string;
  iconBg: string;
}

export const SEARCH_INDEX: SearchItem[] = [
  // ── Core navigation ───────────────────────────────────────────────────────
  { id: 'dashboard',            label: 'Dashboard',           description: 'Your home dashboard and quick overview',       keywords: ['dashboard','home','overview','start','main','feed','summary'],                                           category: 'section', section: 'dashboard',            iconKey: 'LayoutDashboard',   iconColor: '#1e3a5f', iconBg: '#eef2ff' },
  { id: 'calendar',             label: 'Master Calendar',     description: 'View and manage all hospital events',          keywords: ['calendar','master calendar','schedule','events','appointments','dates'],                                 category: 'section', section: 'calendar',             iconKey: 'Calendar',          iconColor: '#16a34a', iconBg: '#f0fdf4' },
  { id: 'ai-assistant',         label: 'AI Assistant',        description: 'Ask anything to the VetCentral AI',            keywords: ['ai','assistant','ask','chat','gpt','intelligence','bot','help me'],                                        category: 'section', section: 'ai-assistant',         iconKey: 'Sparkles',          iconColor: '#7c3aed', iconBg: '#f5f3ff' },
  { id: 'knowledge-base',       label: 'Knowledge Base',      description: 'SOPs, protocols, and hospital documents',      keywords: ['knowledge','sop','protocol','documents','library','handbook','policy','procedures','manual'],                category: 'section', section: 'knowledge-base',       iconKey: 'BookOpen',          iconColor: '#1e3a5f', iconBg: '#eef2ff' },
  { id: 'training',             label: 'Training Academy',    description: 'Staff training courses and certifications',    keywords: ['training','academy','courses','learn','certification','modules','education','lms'],                        category: 'section', section: 'training',             iconKey: 'GraduationCap',     iconColor: '#ea580c', iconBg: '#fff7ed' },
  { id: 'tasks',                label: 'My Tasks',            description: 'Your personal task list and to-dos',           keywords: ['tasks','todos','my tasks','to do','checklist','assignments'],                                            category: 'section', section: 'tasks',                iconKey: 'CheckSquare',       iconColor: '#0891b2', iconBg: '#ecfeff' },
  { id: 'messages',             label: 'Messages',            description: 'Team channels and direct communication',       keywords: ['messages','chat','communication','channels','direct message','team chat','dm','inbox'],                    category: 'section', section: 'messages',             iconKey: 'MessageSquare',     iconColor: '#1e3a5f', iconBg: '#eef2ff' },
  { id: 'communication',        label: 'Communication',       description: 'Slack-style team communication hub',           keywords: ['communication','slack','channels','direct message','dm','team chat','hash','messaging','realtime'],          category: 'section', section: 'communication',        iconKey: 'Hash',              iconColor: '#2563eb', iconBg: '#eff6ff' },
  { id: 'announcements',        label: 'Announcements',       description: 'Hospital-wide announcements and news',         keywords: ['announcements','news','updates','notices','broadcast','bulletin'],                                        category: 'section', section: 'announcements',        iconKey: 'Bell',              iconColor: '#d97706', iconBg: '#fffbeb' },
  { id: 'requests-portal',      label: 'My Requests',         description: 'Submit and track your requests',              keywords: ['requests','portal','my requests','submit request','ticket'],                                             category: 'section', section: 'requests-portal',      iconKey: 'ClipboardList',     iconColor: '#db2777', iconBg: '#fdf2f8' },
  { id: 'approvals',            label: 'Approvals',           description: 'Review and approve pending requests',          keywords: ['approvals','approve','review','pending','sign off','authorize'],                                         category: 'section', section: 'approvals',            iconKey: 'ClipboardCheck',    iconColor: '#16a34a', iconBg: '#f0fdf4' },
  { id: 'projects',             label: 'Projects',            description: 'Hospital projects and initiatives',            keywords: ['projects','initiatives','kanban','project management','board'],                                          category: 'section', section: 'projects',             iconKey: 'FolderKanban',      iconColor: '#7c3aed', iconBg: '#f5f3ff' },
  { id: 'workflows',            label: 'Workflows',           description: 'Automated workflows and process templates',    keywords: ['workflows','automation','process','flow','trigger','rules'],                                             category: 'section', section: 'workflows',            iconKey: 'GitBranch',         iconColor: '#0891b2', iconBg: '#ecfeff' },
  { id: 'analytics',            label: 'Analytics & KPI',    description: 'Performance metrics and reports',              keywords: ['analytics','kpi','reports','metrics','performance','stats','data','charts','graphs'],                    category: 'section', section: 'analytics',            iconKey: 'BarChart2',         iconColor: '#0891b2', iconBg: '#ecfeff' },
  { id: 'hospital-hub',         label: 'Hospital Hub',        description: 'Hospital management and settings',            keywords: ['hospital','hub','hospital hub','facility','site','location'],                                           category: 'section', section: 'hospital-hub',         iconKey: 'Building2',         iconColor: '#1e3a5f', iconBg: '#eef2ff' },
  { id: 'hr',                   label: 'HR',                  description: 'Human resources, leave and payroll',          keywords: ['hr','human resources','leave','payroll','staff','employees','holiday','benefits','time off'],              category: 'section', section: 'hr',                   iconKey: 'Users',             iconColor: '#16a34a', iconBg: '#f0fdf4' },
  { id: 'documents',            label: 'Documents',           description: 'Upload and manage shared files',              keywords: ['documents','files','uploads','attachments','shared files','drive'],                                      category: 'section', section: 'documents',            iconKey: 'FileText',          iconColor: '#d97706', iconBg: '#fffbeb' },
  { id: 'onboarding',           label: 'Employee Onboarding', description: 'Onboard new staff members',                  keywords: ['onboarding','new hire','new employee','joining','induction'],                                            category: 'section', section: 'onboarding',           iconKey: 'UserPlus',          iconColor: '#0891b2', iconBg: '#ecfeff' },

  // ── Admin ─────────────────────────────────────────────────────────────────
  { id: 'admin-users',          label: 'User Management',     description: 'Manage staff accounts and roles',             keywords: ['user management','users','accounts','roles','staff accounts','admin','manage users'],                    category: 'section', section: 'admin-users',          iconKey: 'UserCog',           iconColor: '#64748b', iconBg: '#f8fafc' },
  { id: 'admin-roles',          label: 'Roles & Permissions', description: 'Manage roles and access permissions',         keywords: ['roles','permissions','access','rbac','role management','access control','privileges','roles and permissions'], category: 'section', section: 'admin-roles',         iconKey: 'ShieldCheck',       iconColor: '#7c3aed', iconBg: '#f5f3ff' },
  { id: 'admin-departments',    label: 'Departments',         description: 'Manage hospital departments and teams',       keywords: ['departments','teams','divisions','department management'],                                               category: 'section', section: 'admin-departments',    iconKey: 'LayoutGrid',        iconColor: '#0891b2', iconBg: '#ecfeff' },
  { id: 'admin-hospitals',      label: 'Hospitals',           description: 'Add and manage hospital locations',           keywords: ['hospitals','locations','branches','facilities','sites','manage hospitals'],                              category: 'section', section: 'admin-hospitals',      iconKey: 'Building',          iconColor: '#1e3a5f', iconBg: '#eef2ff' },
  { id: 'admin-integrations',   label: 'Integrations',        description: 'Connect third-party tools and APIs',          keywords: ['integrations','api','connect','third party','webhooks','apps','plugins'],                               category: 'section', section: 'admin-integrations',   iconKey: 'Puzzle',            iconColor: '#ea580c', iconBg: '#fff7ed' },
  { id: 'admin-audit-logs',     label: 'Audit Logs',          description: 'View system activity and audit trail',        keywords: ['audit','logs','audit logs','activity','history','trail','security logs','changes','actions'],             category: 'section', section: 'admin-audit-logs',     iconKey: 'ScrollText',        iconColor: '#64748b', iconBg: '#f8fafc' },
  { id: 'admin-settings',       label: 'System Settings',     description: 'Global system configuration and settings',    keywords: ['settings','system settings','configuration','config','admin settings','global'],                        category: 'section', section: 'admin-settings',       iconKey: 'SlidersHorizontal', iconColor: '#64748b', iconBg: '#f8fafc' },

  // ── Settings ──────────────────────────────────────────────────────────────
  { id: 'settings-preferences', label: 'Preferences',         description: 'Personal preferences and UI settings',        keywords: ['preferences','settings','theme','dark mode','language','personalise','customize','profile settings'],    category: 'section', section: 'settings-preferences', iconKey: 'SlidersHorizontal', iconColor: '#0891b2', iconBg: '#ecfeff' },
  { id: 'settings-security',    label: 'Security Settings',   description: 'Password, 2FA and account security',          keywords: ['security','password','2fa','two factor','mfa','account security','login','change password'],             category: 'section', section: 'settings-security',    iconKey: 'Lock',              iconColor: '#dc2626', iconBg: '#fef2f2' },
  { id: 'settings-ai',          label: 'AI Settings',         description: 'Configure AI assistant and model settings',   keywords: ['ai settings','ai config','model','llm','assistant settings','ai preferences'],                         category: 'section', section: 'settings-ai',          iconKey: 'Cpu',               iconColor: '#7c3aed', iconBg: '#f5f3ff' },

  // ── Personal ──────────────────────────────────────────────────────────────
  { id: 'notifications',        label: 'Notifications',       description: 'View all your notifications',                 keywords: ['notifications','alerts','inbox','unread','notify'],                                                     category: 'section', section: 'notifications',        iconKey: 'BellRing',          iconColor: '#d97706', iconBg: '#fffbeb' },
  { id: 'profile',              label: 'My Profile',          description: 'View and edit your profile details',          keywords: ['profile','my profile','account','bio','avatar','personal details','edit profile'],                    category: 'section', section: 'profile',              iconKey: 'CircleUser',        iconColor: '#1e3a5f', iconBg: '#eef2ff' },
  { id: 'help',                 label: 'Help & Support',      description: 'Documentation, FAQs and support',             keywords: ['help','support','faq','docs','documentation','guide','how to','contact support'],                      category: 'section', section: 'help',                 iconKey: 'CircleHelp',        iconColor: '#16a34a', iconBg: '#f0fdf4' },

  // ── Knowledge base content shortcuts ──────────────────────────────────────
  { id: 'cbc-procedure',        label: 'CBC Procedure',        description: 'Search knowledge base', keywords: ['cbc','complete blood count','blood test','haematology','hematology'],                        category: 'content', section: 'knowledge-base', subId: 'CBC procedure',        iconKey: 'Hash', iconColor: '#64748b', iconBg: '#f8fafc' },
  { id: 'employee-handbook',    label: 'Employee Handbook',    description: 'Search knowledge base', keywords: ['employee handbook','handbook','staff guide','employee guide','onboarding guide'],            category: 'content', section: 'knowledge-base', subId: 'Employee handbook',    iconKey: 'Hash', iconColor: '#64748b', iconBg: '#f8fafc' },
  { id: 'osha',                 label: 'OSHA Requirements',    description: 'Search knowledge base', keywords: ['osha','safety','compliance','health and safety','regulations','workplace safety'],           category: 'content', section: 'knowledge-base', subId: 'OSHA requirements',    iconKey: 'Hash', iconColor: '#64748b', iconBg: '#f8fafc' },
  { id: 'vaccination',          label: 'Vaccination Protocols',description: 'Search knowledge base', keywords: ['vaccination','vaccine','immunization','rabies','distemper'],                                category: 'content', section: 'knowledge-base', subId: 'Vaccination protocols', iconKey: 'Hash', iconColor: '#64748b', iconBg: '#f8fafc' },
  { id: 'surgery',              label: 'Surgery Protocols',    description: 'Search knowledge base', keywords: ['surgery','surgical','operation','anaesthesia','anesthesia','pre-op','post-op'],             category: 'content', section: 'knowledge-base', subId: 'Surgery protocols',    iconKey: 'Hash', iconColor: '#64748b', iconBg: '#f8fafc' },
  { id: 'drug-formulary',       label: 'Drug Formulary',       description: 'Search knowledge base', keywords: ['drug','formulary','medication','dosage','prescription','pharmacy','medicine'],              category: 'content', section: 'knowledge-base', subId: 'Drug formulary',       iconKey: 'Hash', iconColor: '#64748b', iconBg: '#f8fafc' },
  { id: 'emergency-protocols',  label: 'Emergency Protocols',  description: 'Search knowledge base', keywords: ['emergency','urgent','critical','cpr','resuscitation','triage','code'],                      category: 'content', section: 'knowledge-base', subId: 'Emergency protocols',  iconKey: 'Hash', iconColor: '#64748b', iconBg: '#f8fafc' },
];

function scoreItem(item: SearchItem, q: string): number {
  const lq = q.toLowerCase();
  const labelLower = item.label.toLowerCase();
  if (labelLower === lq)           return 100;
  if (labelLower.startsWith(lq))   return 90;
  if (labelLower.includes(lq))     return 70;
  for (const kw of item.keywords) {
    if (kw === lq)                 return 85;
    if (kw.startsWith(lq))        return 75;
    if (kw.includes(lq))          return 60;
  }
  if (labelLower.split(' ').some(w => w.startsWith(lq))) return 65;
  return 0;
}

export function getSuggestions(q: string, max = 7): SearchItem[] {
  if (!q.trim()) return [];
  return SEARCH_INDEX
    .map(item => ({ item, s: scoreItem(item, q) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map(x => x.item);
}
