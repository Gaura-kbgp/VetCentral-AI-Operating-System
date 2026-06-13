'use client';

import { BookOpen, GraduationCap, Calendar, Users, Building2, FolderOpen } from 'lucide-react';
import { useSPANavigation } from '@/contexts/spa-navigation';
import type { SectionKey } from '@/types/sections';

const ACTIONS: Array<{
  label: string;
  section: SectionKey;
  Icon: React.ElementType;
  color: string;
  bg: string;
}> = [
  { label: 'SOP Library',        section: 'knowledge-base', Icon: BookOpen,      color: '#1e3a5f', bg: '#eef2ff' },
  { label: 'Training Center',    section: 'training',       Icon: GraduationCap, color: '#ea580c', bg: '#fff7ed' },
  { label: 'Master Calendar',    section: 'calendar',       Icon: Calendar,      color: '#16a34a', bg: '#f0fdf4' },
  { label: 'Employee Directory', section: 'hr',             Icon: Users,         color: '#7c3aed', bg: '#f5f3ff' },
  { label: 'Hospital Resources', section: 'hospital-hub',   Icon: Building2,     color: '#1e3a5f', bg: '#eef2ff' },
  { label: 'Projects',           section: 'projects',       Icon: FolderOpen,    color: '#db2777', bg: '#fdf2f8' },
];

export function QuickActions() {
  const { navigate } = useSPANavigation();

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
      {ACTIONS.map(({ label, section, Icon, color, bg }) => (
        <button
          key={section}
          type="button"
          onClick={() => navigate(section)}
          className="flex flex-col items-center gap-3 p-4 bg-white border border-slate-200/80 rounded-xl hover:shadow-md hover:border-blue-200 transition-all text-center group"
        >
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: bg }}>
            <Icon className="h-6 w-6" style={{ color }} />
          </div>
          <span className="text-[12px] font-medium text-gray-700 group-hover:text-gray-900 leading-tight">
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}
