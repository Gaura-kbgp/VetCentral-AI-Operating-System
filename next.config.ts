import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  // pdf-parse ESM build exposes raw PDF.js internals — keep it as CJS at runtime
  serverExternalPackages: ['pdf-parse'],
  // Raise Turbopack's internal memory limit to match the Node heap increase
  experimental: {
    turbopackMemoryLimit: 3 * 1024 * 1024 * 1024, // 3 GB
  },
  async redirects() {
    const sectionMap: Record<string, string> = {
      '/ai-assistant':       'ai-assistant',
      '/knowledge-base':     'knowledge-base',
      '/training':           'training',
      '/calendar':           'calendar',
      '/tasks':              'tasks',
      '/communication':      'communication',
      '/workflows':          'workflows',
      '/projects':           'projects',
      '/kpi':                'analytics',
      '/analytics':          'analytics',
      '/hospital-hub':       'hospital-hub',
      '/onboarding':         'onboarding',
      '/hr':                 'hr',
      '/documents':          'documents',
      '/approvals':          'approvals',
      '/schedule-requests':  'schedule-requests',
      '/admin/users':        'admin-users',
      '/admin/roles':        'admin-roles',
      '/admin/departments':  'admin-departments',
      '/admin/hospitals':    'admin-hospitals',
      '/admin/integrations': 'admin-integrations',
      '/admin/audit-logs':   'admin-audit-logs',
      '/admin/settings':     'admin-settings',
      '/notifications':      'notifications',
      '/profile':            'profile',
      '/help':               'help',
      '/settings/preferences': 'settings-preferences',
      '/settings/security':  'settings-security',
      '/settings/ai':        'settings-ai',
    };
    return Object.entries(sectionMap).map(([source, section]) => ({
      source,
      destination: `/dashboard?section=${section}`,
      permanent: false,
    }));
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
