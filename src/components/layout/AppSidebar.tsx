'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Calendar, MessageSquare, BookOpen,
  GraduationCap, FolderOpen, Building2, Sparkles,
  UserPlus, Inbox, Settings, ClipboardList, Users, UserCog,
  CheckSquare, Shield, FileText, AlertCircle, BarChart3, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getVisibleNavItems, ROLE_META, type NavItem } from '@/lib/permissions';
import type { AppRole } from '@/types/database';

// ── Icon registry (avoids importing entire lucide in permissions.ts) ──────

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Calendar, MessageSquare, BookOpen,
  GraduationCap, FolderOpen, Building2, Sparkles,
  UserPlus, Inbox, Settings, ClipboardList, Users, UserCog,
  CheckSquare, CheckSquare2: CheckSquare, Shield, FileText, AlertCircle,
  BarChart3, Activity,
};

// ── NavLink ───────────────────────────────────────────────────────────────

interface NavLinkProps {
  item: NavItem;
  pathname: string;
  badge?: number;
}

function NavLink({ item, pathname, badge }: NavLinkProps) {
  const Icon = ICON_MAP[item.iconKey] ?? LayoutDashboard;
  const isActive =
    pathname === item.href ||
    (item.href !== '/dashboard' && pathname.startsWith(item.href));

  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] transition-colors',
        isActive
          ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-semibold'
          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/60 hover:text-gray-800 dark:hover:text-gray-200',
      )}
    >
      <Icon className={cn(
        'h-4 w-4 shrink-0',
        isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500',
      )} />
      <span className="flex-1">{item.label}</span>
      {badge != null && badge > 0 && (
        <span className="ml-auto text-[10px] font-bold bg-amber-500 text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="pt-3 pb-1 px-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600">
        {label}
      </p>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────

interface Props {
  role?: AppRole | null;
  pendingRequestCount?: number;
}

export default function AppSidebar({ role, pendingRequestCount = 0 }: Props) {
  const pathname = usePathname();

  const visibleItems = getVisibleNavItems(role);

  const coreItems   = visibleItems.filter(i => i.section === 'core');
  const hrItems     = visibleItems.filter(i => i.section === 'hr');
  const adminItems  = visibleItems.filter(i => i.section === 'admin');

  const roleMeta = role ? ROLE_META[role] : null;

  function getBadge(item: NavItem): number | undefined {
    if (item.badge === 'pendingRequests') return pendingRequestCount;
    return undefined;
  }

  return (
    <aside className="hidden md:flex flex-col w-[272px] bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-100 dark:border-gray-800">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
          style={{ backgroundColor: '#1e3a5f' }}
        >
          <span className="text-white text-base font-bold">V</span>
        </div>
        <div>
          <p
            className="text-[15px] font-bold text-gray-900 dark:text-gray-100 leading-tight tracking-tight"
            style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif' }}
          >
            VetCentral
          </p>
          <p
            className="text-gray-400 dark:text-gray-500 mt-0.5 tracking-wide uppercase"
            style={{ fontSize: '10px', letterSpacing: '0.06em' }}
          >
            AI Operating System
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {/* Core items */}
        {coreItems.map(item => (
          <NavLink key={item.href} item={item} pathname={pathname} badge={getBadge(item)} />
        ))}

        {/* HR section */}
        {hrItems.length > 0 && (
          <>
            <SectionLabel label="HR" />
            {hrItems.map(item => (
              <NavLink key={item.href} item={item} pathname={pathname} badge={getBadge(item)} />
            ))}
          </>
        )}

        {/* Admin section */}
        {adminItems.length > 0 && (
          <>
            <SectionLabel label="Admin" />
            {adminItems.map(item => (
              <NavLink key={item.href} item={item} pathname={pathname} badge={getBadge(item)} />
            ))}
          </>
        )}
      </nav>

      {/* Role badge at bottom */}
      {roleMeta && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: roleMeta.color }}
            />
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {roleMeta.label}
            </span>
          </div>
          {roleMeta.scope !== 'own' && (
            <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-0.5 pl-4">
              {roleMeta.scope === 'org' ? 'Org-wide' :
               roleMeta.scope === 'hospital' ? 'Hospital scope' :
               roleMeta.scope === 'department' ? 'Department scope' :
               'Full access'}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
