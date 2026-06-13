'use client';

import { useState, useEffect } from 'react';
import {
  LayoutDashboard, Calendar, MessageSquare, BookOpen,
  GraduationCap, FolderOpen, Building2, Sparkles,
  UserPlus, Inbox, Settings, ClipboardList, Users, UserCog,
  CheckSquare, Shield, FileText, AlertCircle, BarChart3, Activity,
  Megaphone, Hash,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getVisibleNavItems, ROLE_META, type NavItem } from '@/lib/permissions';
import { useSPANavigation, HREF_TO_SECTION } from '@/contexts/spa-navigation';
import { getUnreadMessageCount } from '@/lib/actions/communication';
import { getMyReceivedTaskCount } from '@/lib/actions/tasks';
import { getDirectInboxUnreadCount } from '@/lib/actions/direct-requests';
import type { AppRole } from '@/types/database';

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Calendar, MessageSquare, BookOpen,
  GraduationCap, FolderOpen, Building2, Sparkles,
  UserPlus, Inbox, Settings, ClipboardList, Users, UserCog,
  CheckSquare, CheckSquare2: CheckSquare, Shield, FileText, AlertCircle,
  BarChart3, Activity, Megaphone, Hash,
};

interface NavLinkProps {
  item: NavItem;
  activeSection: string;
  badge?: number;
  onClick: () => void;
}

function NavLink({ item, activeSection, badge, onClick }: NavLinkProps) {
  const Icon = ICON_MAP[item.iconKey] ?? LayoutDashboard;
  const sectionKey = HREF_TO_SECTION[item.href];
  const isActive = sectionKey ? activeSection === sectionKey : false;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] transition-all text-left',
        isActive
          ? 'bg-[#e8f0fe] text-[#1e3a5f] font-semibold'
          : 'text-gray-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-gray-800/60 hover:text-gray-800 dark:hover:text-gray-200',
      )}
    >
      <Icon className={cn(
        'h-4 w-4 shrink-0',
        isActive ? 'text-[#1e3a5f]' : 'text-gray-400 dark:text-gray-500',
      )} />
      <span className="flex-1">{item.label}</span>
      {badge != null && badge > 0 && (
        <span className="ml-auto text-[10px] font-bold bg-amber-500 text-white rounded-full min-w-4.5 h-4.5 flex items-center justify-center px-1">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="pt-4 pb-1 px-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-gray-600">
        {label}
      </p>
    </div>
  );
}

interface Props {
  role?: AppRole | null;
  pendingRequestCount?: number;
}

function AppSidebarInner({ role, pendingRequestCount = 0 }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const { activeSection, navigate } = useSPANavigation();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [directInboxCount, setDirectInboxCount] = useState(0);

  // poll unread message count; re-check on section change (reading clears it)
  useEffect(() => {
    let alive = true;
    const load = () =>
      getUnreadMessageCount().then(r => { if (alive && r.success) setUnreadMessages(r.data.count); });
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [activeSection]);

  // poll pending received task count
  useEffect(() => {
    let alive = true;
    const load = () =>
      getMyReceivedTaskCount().then(r => { if (alive && r.success) setPendingTaskCount(r.data); });
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [activeSection]);

  // poll direct request inbox unread count
  useEffect(() => {
    let alive = true;
    const load = () =>
      getDirectInboxUnreadCount().then(r => { if (alive && r.success) setDirectInboxCount(r.data); });
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [activeSection]);

  const visibleItems = getVisibleNavItems(role);
  const coreItems  = visibleItems.filter(i => i.section === 'core');
  const hrItems    = visibleItems.filter(i => i.section === 'hr');
  const adminItems = visibleItems.filter(i => i.section === 'admin');
  const roleMeta   = role ? ROLE_META[role] : null;

  function getBadge(item: NavItem): number | undefined {
    if (item.badge === 'pendingRequests') return pendingRequestCount;
    if (HREF_TO_SECTION[item.href] === 'messages') return unreadMessages;
    if (HREF_TO_SECTION[item.href] === 'tasks') return pendingTaskCount || undefined;
    if (HREF_TO_SECTION[item.href] === 'requests-portal') return directInboxCount || undefined;
    return undefined;
  }

  function handleNav(item: NavItem) {
    const section = HREF_TO_SECTION[item.href];
    if (section) navigate(section);
  }

  if (!mounted) {
    return (
      <aside className="hidden md:flex flex-col w-68 bg-white dark:bg-gray-900 border-r border-slate-200/80 dark:border-gray-800 shrink-0" />
    );
  }

  return (
    <aside className="hidden md:flex flex-col w-68 bg-white dark:bg-gray-900 border-r border-slate-200/80 dark:border-gray-800 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-4.5 border-b border-slate-100 dark:border-gray-800">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0 shadow-sm"
          style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)' }}
        >
          <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5">
            <path d="M10 2C6.13 2 3 5.13 3 9c0 2.39 1.19 4.5 3 5.74V16a1 1 0 001 1h6a1 1 0 001-1v-1.26C15.81 13.5 17 11.39 17 9c0-3.87-3.13-7-7-7z" fill="white" opacity="0.9"/>
            <circle cx="7.5" cy="8.5" r="1.2" fill="#1e3a5f"/>
            <circle cx="12.5" cy="8.5" r="1.2" fill="#1e3a5f"/>
            <path d="M7.5 12c.83.63 1.67.94 2.5.94s1.67-.31 2.5-.94" stroke="#1e3a5f" strokeWidth="1.1" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <p className="text-[15px] font-bold text-gray-900 dark:text-gray-100 leading-tight tracking-tight"
            style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif' }}>
            VetCentral
          </p>
          <p className="text-slate-400 dark:text-gray-500 mt-0.5 tracking-wide" style={{ fontSize: '10px', letterSpacing: '0.05em' }}>
            AI Operating System
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {coreItems.map(item => (
          <NavLink
            key={item.href}
            item={item}
            activeSection={activeSection}
            badge={getBadge(item)}
            onClick={() => handleNav(item)}
          />
        ))}

        {hrItems.length > 0 && (
          <>
            <SectionLabel label="HR" />
            {hrItems.map(item => (
              <NavLink
                key={item.href}
                item={item}
                activeSection={activeSection}
                badge={getBadge(item)}
                onClick={() => handleNav(item)}
              />
            ))}
          </>
        )}

        {adminItems.length > 0 && (
          <>
            <SectionLabel label="Admin" />
            {adminItems.map(item => (
              <NavLink
                key={item.href}
                item={item}
                activeSection={activeSection}
                badge={getBadge(item)}
                onClick={() => handleNav(item)}
              />
            ))}
          </>
        )}
      </nav>

      {/* Role badge */}
      {roleMeta && (
        <div className="px-3 pb-4 pt-2 border-t border-slate-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-gray-800">
            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: roleMeta.color }} />
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-gray-700 dark:text-gray-300 leading-none">{roleMeta.label}</p>
              {roleMeta.scope !== 'own' && (
                <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-0.5">
                  {roleMeta.scope === 'org' ? 'Org-wide access' :
                   roleMeta.scope === 'hospital' ? 'Hospital scope' :
                   roleMeta.scope === 'department' ? 'Department scope' : 'Full access'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

export default function AppSidebar(props: Props) {
  return <AppSidebarInner {...props} />;
}
