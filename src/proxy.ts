import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_ROUTES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/accept-invite',
  '/auth/callback',
  '/api/v1/webhooks',
];

const ADMIN_ONLY_ROUTES = [
  '/admin',
  '/api/v1/admin',
];

const MANAGER_ROUTES = [
  '/kpi',
  '/api/v1/kpi',
];

const ADMIN_ROLES = ['super_admin', 'org_admin', 'hospital_admin'];
const MANAGER_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager'];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => pathname.startsWith(route));
}

function isAdminRoute(pathname: string): boolean {
  return ADMIN_ONLY_ROUTES.some(route => pathname.startsWith(route));
}

function isManagerRoute(pathname: string): boolean {
  return MANAGER_ROUTES.some(route => pathname.startsWith(route));
}

async function getUserRoles(userId: string): Promise<string[]> {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const [hospRoles, orgRoles] = await Promise.all([
    admin.from('user_hospital_roles').select('role').eq('user_id', userId),
    admin.from('org_user_roles').select('role').eq('user_id', userId),
  ]);
  return [
    ...((hospRoles.data ?? []).map((r: { role: string }) => r.role)),
    ...((orgRoles.data ?? []).map((r: { role: string }) => r.role)),
  ];
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  // Root redirect
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Allow public routes
  if (isPublicRoute(pathname)) {
    if (user && pathname === '/login') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return response;
  }

  // Require auth for all other routes
  if (!user) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Inject user context headers for server components
  response.headers.set('x-user-id', user.id);

  const appMetadata = user.app_metadata as { org_id?: string };
  if (appMetadata?.org_id) {
    response.headers.set('x-org-id', appMetadata.org_id);
  }

  // RBAC: guard admin and manager routes using the database (app_metadata.roles is not populated)
  if (isAdminRoute(pathname) || isManagerRoute(pathname)) {
    const roles = await getUserRoles(user.id);
    const required = isAdminRoute(pathname) ? ADMIN_ROLES : MANAGER_ROLES;
    const allowed = roles.some(r => required.includes(r));
    if (!allowed) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
