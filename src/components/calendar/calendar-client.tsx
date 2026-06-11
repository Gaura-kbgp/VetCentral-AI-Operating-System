'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameMonth, isSameDay, isToday, addMonths, subMonths,
  parseISO, getHours, addWeeks, subWeeks, isAfter, isBefore, startOfDay,
} from 'date-fns';
import {
  ChevronLeft, ChevronRight, Calendar, Clock, MapPin, Users, ExternalLink,
  Plus, Search, X, Bot, Building2, AlertTriangle,
  BookOpen, UserX, Briefcase, Target,
  MoreHorizontal, Send, Loader2, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import EventForm from './event-form';
import type { CalendarEvent, EventCategory } from '@/types/app';

// ── Event metadata ────────────────────────────────────────
interface EventMeta { label: string; color: string; bg: string; light: string; text: string; dot: string; category: EventCategory; }

const EVENT_META: Record<string, EventMeta> = {
  meeting:             { label: 'Meeting',            color: '#3B82F6', bg: 'bg-blue-500',     light: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-500',    category: 'meetings'    },
  doctor_meeting:      { label: 'Doctor Meeting',     color: '#6366F1', bg: 'bg-indigo-500',   light: 'bg-indigo-50',   text: 'text-indigo-700',  dot: 'bg-indigo-500',  category: 'meetings'    },
  leadership_meeting:  { label: 'Leadership Meeting', color: '#7C3AED', bg: 'bg-violet-600',   light: 'bg-violet-50',   text: 'text-violet-700',  dot: 'bg-violet-600',  category: 'meetings'    },
  manager_meeting:     { label: 'Manager Meeting',    color: '#2563EB', bg: 'bg-blue-600',     light: 'bg-blue-50',     text: 'text-blue-800',    dot: 'bg-blue-600',    category: 'meetings'    },
  department_meeting:  { label: 'Dept. Meeting',      color: '#0EA5E9', bg: 'bg-sky-500',      light: 'bg-sky-50',      text: 'text-sky-700',     dot: 'bg-sky-500',     category: 'meetings'    },
  training:            { label: 'Training',           color: '#10B981', bg: 'bg-emerald-500',  light: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500', category: 'training'    },
  cpr_training:        { label: 'CPR Training',       color: '#EF4444', bg: 'bg-red-500',      light: 'bg-red-50',      text: 'text-red-700',     dot: 'bg-red-500',     category: 'training'    },
  osha_training:       { label: 'OSHA Training',      color: '#F97316', bg: 'bg-orange-500',   light: 'bg-orange-50',   text: 'text-orange-700',  dot: 'bg-orange-500',  category: 'training'    },
  compliance_training: { label: 'Compliance',         color: '#D97706', bg: 'bg-amber-600',    light: 'bg-amber-50',    text: 'text-amber-800',   dot: 'bg-amber-600',   category: 'training'    },
  lms_session:         { label: 'LMS Session',        color: '#22C55E', bg: 'bg-green-500',    light: 'bg-green-50',    text: 'text-green-700',   dot: 'bg-green-500',   category: 'training'    },
  onboarding:          { label: 'Onboarding',         color: '#14B8A6', bg: 'bg-teal-500',     light: 'bg-teal-50',     text: 'text-teal-700',    dot: 'bg-teal-500',    category: 'hr'          },
  orientation:         { label: 'Orientation',        color: '#06B6D4', bg: 'bg-cyan-500',     light: 'bg-cyan-50',     text: 'text-cyan-700',    dot: 'bg-cyan-500',    category: 'hr'          },
  performance_review:  { label: 'Performance Review', color: '#0D9488', bg: 'bg-teal-600',     light: 'bg-teal-50',     text: 'text-teal-800',    dot: 'bg-teal-600',    category: 'hr'          },
  pto:                 { label: 'PTO',                color: '#F59E0B', bg: 'bg-amber-500',    light: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-500',   category: 'pto'         },
  vacation:            { label: 'Vacation',           color: '#FBBF24', bg: 'bg-amber-400',    light: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-400',   category: 'pto'         },
  sick_leave:          { label: 'Sick Leave',         color: '#FB7185', bg: 'bg-rose-400',     light: 'bg-rose-50',     text: 'text-rose-700',    dot: 'bg-rose-400',    category: 'pto'         },
  personal_leave:      { label: 'Personal Leave',     color: '#F472B6', bg: 'bg-pink-400',     light: 'bg-pink-50',     text: 'text-pink-700',    dot: 'bg-pink-400',    category: 'pto'         },
  hospital_event:      { label: 'Hospital Event',     color: '#A855F7', bg: 'bg-purple-500',   light: 'bg-purple-50',   text: 'text-purple-700',  dot: 'bg-purple-500',  category: 'hospital'    },
  town_hall:           { label: 'Town Hall',          color: '#9333EA', bg: 'bg-purple-600',   light: 'bg-purple-50',   text: 'text-purple-800',  dot: 'bg-purple-600',  category: 'hospital'    },
  staff_event:         { label: 'Staff Event',        color: '#D946EF', bg: 'bg-fuchsia-500',  light: 'bg-fuchsia-50',  text: 'text-fuchsia-700', dot: 'bg-fuchsia-500', category: 'hospital'    },
  announcement:        { label: 'Announcement',       color: '#8B5CF6', bg: 'bg-violet-500',   light: 'bg-violet-50',   text: 'text-violet-700',  dot: 'bg-violet-500',  category: 'hospital'    },
  audit:               { label: 'Audit',              color: '#DC2626', bg: 'bg-red-600',      light: 'bg-red-50',      text: 'text-red-800',     dot: 'bg-red-600',     category: 'operational' },
  inspection:          { label: 'Inspection',         color: '#EA580C', bg: 'bg-orange-600',   light: 'bg-orange-50',   text: 'text-orange-800',  dot: 'bg-orange-600',  category: 'operational' },
  deadline:            { label: 'Deadline',           color: '#B91C1C', bg: 'bg-red-700',      light: 'bg-red-50',      text: 'text-red-700',     dot: 'bg-red-700',     category: 'operational' },
  project_milestone:   { label: 'Milestone',          color: '#475569', bg: 'bg-slate-600',    light: 'bg-slate-100',   text: 'text-slate-700',   dot: 'bg-slate-600',   category: 'projects'    },
  project_review:      { label: 'Project Review',     color: '#64748B', bg: 'bg-slate-500',    light: 'bg-slate-100',   text: 'text-slate-600',   dot: 'bg-slate-500',   category: 'projects'    },
  maintenance:         { label: 'Maintenance',        color: '#94A3B8', bg: 'bg-slate-400',    light: 'bg-slate-50',    text: 'text-slate-600',   dot: 'bg-slate-400',   category: 'other'       },
  other:               { label: 'Other',              color: '#64748B', bg: 'bg-slate-500',    light: 'bg-slate-50',    text: 'text-slate-700',   dot: 'bg-slate-500',   category: 'other'       },
};

function getMeta(type: string): EventMeta {
  return EVENT_META[type] ?? EVENT_META.other;
}

const ALL_CATEGORIES: EventCategory[] = ['meetings','training','hr','pto','hospital','operational','projects','other'];

const CATEGORY_META: Record<EventCategory, { label: string; color: string; dotColor: string; Icon: React.ElementType }> = {
  meetings:    { label: 'Meetings',    color: '#3B82F6', dotColor: 'bg-blue-500',    Icon: Users       },
  training:    { label: 'Training',    color: '#10B981', dotColor: 'bg-emerald-500', Icon: BookOpen    },
  hr:          { label: 'HR Events',   color: '#14B8A6', dotColor: 'bg-teal-500',    Icon: Briefcase   },
  pto:         { label: 'PTO / Leave', color: '#F59E0B', dotColor: 'bg-amber-500',   Icon: UserX       },
  hospital:    { label: 'Hospital',    color: '#A855F7', dotColor: 'bg-purple-500',  Icon: Building2   },
  operational: { label: 'Operational', color: '#DC2626', dotColor: 'bg-red-600',     Icon: AlertTriangle },
  projects:    { label: 'Projects',    color: '#475569', dotColor: 'bg-slate-600',   Icon: Target      },
  other:       { label: 'Other',       color: '#64748B', dotColor: 'bg-slate-500',   Icon: MoreHorizontal },
};

type ViewMode = 'month' | 'week' | 'day' | 'agenda';

interface Hospital { id: string; name: string; color: string | null; }
interface ChatMessage { role: 'user' | 'assistant'; content: string; }

interface Props {
  initialEvents: CalendarEvent[];
  hospitals: Hospital[];
  userId: string;
  userRole?: string | null;
}

export default function MasterCalendarClient({ initialEvents, hospitals, userId, userRole }: Props) {
  const [events, setEvents]             = useState<CalendarEvent[]>(initialEvents);
  const [currentDate, setCurrentDate]   = useState<Date>(() => new Date());
  const [view, setView]                 = useState<ViewMode>('month');
  const [selected, setSelected]         = useState<CalendarEvent | null>(null);
  const [formOpen, setFormOpen]         = useState(false);
  const [editEvent, setEditEvent]       = useState<CalendarEvent | null>(null);
  const [formInitDate, setFormInitDate] = useState<Date | undefined>(undefined);
  const [aiOpen, setAiOpen]             = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchOpen, setSearchOpen]     = useState(false);
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);

  const [hospitalFilter, setHospitalFilter]     = useState<string>('all');
  const [activeCategories, setActiveCategories] = useState<Set<EventCategory>>(
    new Set(ALL_CATEGORIES)
  );

  function toggleCategory(cat: EventCategory) {
    setActiveCategories(prev => {
      const next = new Set(prev);
      if (next.size === ALL_CATEGORIES.length) {
        // if all are active, clicking one isolates it
        return new Set([cat]);
      }
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next.size === 0 ? new Set(ALL_CATEGORIES) : next;
    });
  }

  function selectAllCategories() {
    setActiveCategories(new Set(ALL_CATEGORIES));
  }

  const allCategoriesActive = activeCategories.size === ALL_CATEGORIES.length;

  const filteredEvents = useMemo(() => events.filter(e => {
    if (hospitalFilter !== 'all' && e.hospital_id !== hospitalFilter) return false;
    return activeCategories.has(getMeta(e.event_type).category);
  }), [events, hospitalFilter, activeCategories]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return events.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.event_type.replace(/_/g,' ').includes(q) ||
      (e.location ?? '').toLowerCase().includes(q) ||
      (e.description ?? '').toLowerCase().includes(q)
    ).slice(0, 20);
  }, [events, searchQuery]);

  const upcomingEvents = useMemo(() => {
    const today = startOfDay(new Date());
    return filteredEvents
      .filter(e => !isBefore(parseISO(e.start_time), today))
      .sort((a, b) => parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime())
      .slice(0, upcomingExpanded ? 50 : 15);
  }, [filteredEvents, upcomingExpanded]);

  function openNewEvent(date?: Date) { setEditEvent(null); setFormInitDate(date); setFormOpen(true); }
  function openEditEvent(ev: CalendarEvent) { setSelected(null); setEditEvent(ev); setFormInitDate(undefined); setFormOpen(true); }
  function handleSaved(ev: CalendarEvent) {
    setEvents(prev => {
      const idx = prev.findIndex(e => e.id === ev.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = ev; return next; }
      return [...prev, ev];
    });
  }

  const navigateDate = useCallback((dir: 1 | -1) => {
    setCurrentDate(d => {
      if (view === 'month')  return dir === 1 ? addMonths(d, 1) : subMonths(d, 1);
      if (view === 'week')   return dir === 1 ? addWeeks(d, 1)  : subWeeks(d, 1);
      if (view === 'agenda') return addDays(d, dir * 14);
      return addDays(d, dir);
    });
  }, [view]);

  const eventsOnDay = useCallback((day: Date) =>
    filteredEvents.filter(e => isSameDay(parseISO(e.start_time), day)),
  [filteredEvents]);

  const titleLabel = useMemo(() => {
    if (view === 'month')  return format(currentDate, 'MMMM yyyy');
    if (view === 'week')   return `${format(startOfWeek(currentDate), 'MMM d')} – ${format(endOfWeek(currentDate), 'MMM d, yyyy')}`;
    if (view === 'agenda') return `${format(currentDate, 'MMM d')} – ${format(addDays(currentDate, 13), 'MMM d, yyyy')}`;
    return format(currentDate, 'EEEE, MMMM d, yyyy');
  }, [view, currentDate]);

  const VIEW_TABS: { key: ViewMode; label: string }[] = [
    { key: 'month',  label: 'Month'  },
    { key: 'week',   label: 'Week'   },
    { key: 'day',    label: 'Day'    },
    { key: 'agenda', label: 'Agenda' },
  ];

  return (
    <div className="space-y-4 pb-10">

      {/* ── Location filter row ──────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide shrink-0 w-16">Location</span>
          <button
            type="button"
            onClick={() => setHospitalFilter('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              hospitalFilter === 'all'
                ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Building2 className="h-3 w-3" />
            All Hospitals
          </button>
          {hospitals.map(h => (
            <button
              key={h.id}
              type="button"
              onClick={() => setHospitalFilter(h.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                hospitalFilter === h.id
                  ? 'text-white border-transparent'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
              style={hospitalFilter === h.id ? { backgroundColor: h.color ?? '#1e3a5f', borderColor: h.color ?? '#1e3a5f' } : {}}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: h.color ?? '#94a3b8' }}
              />
              {h.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── Category filter row ──────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide shrink-0 w-16">Category</span>
          <button
            type="button"
            onClick={selectAllCategories}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              allCategoriesActive
                ? 'bg-slate-700 text-white border-slate-700'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            All
          </button>
          {ALL_CATEGORIES.map(cat => {
            const cm     = CATEGORY_META[cat];
            const active = activeCategories.has(cat) && !allCategoriesActive;
            const count  = filteredEvents.filter(e => getMeta(e.event_type).category === cat).length;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  active
                    ? 'text-white border-transparent'
                    : allCategoriesActive
                      ? 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      : activeCategories.has(cat)
                        ? 'text-white border-transparent'
                        : 'bg-white text-slate-300 border-slate-100 hover:border-slate-200 hover:text-slate-500'
                }`}
                style={(active || (!allCategoriesActive && activeCategories.has(cat))) ? { backgroundColor: cm.color, borderColor: cm.color } : {}}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${cm.dotColor}`} />
                {cm.label}
                {count > 0 && (
                  <span className={`text-[10px] font-bold ml-0.5 ${(active || (!allCategoriesActive && activeCategories.has(cat))) ? 'text-white/80' : 'text-slate-400'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Calendar toolbar ─────────────────────────────── */}
      <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex-wrap">

        {/* Navigation */}
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => navigateDate(-1)}
            className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1 text-xs font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            Today
          </button>
          <button type="button" onClick={() => navigateDate(1)}
            className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Title */}
        <h2 className="text-sm font-semibold text-slate-800 min-w-0">{titleLabel}</h2>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative shrink-0">
          {searchOpen ? (
            <div className="flex items-center gap-1">
              <Input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search events…" className="h-8 w-44 text-sm" />
              <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100">
                <X className="h-3.5 w-3.5" />
              </button>
              {searchQuery && (
                <div className="absolute top-9 right-0 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto">
                  {searchResults.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4">No events found</p>
                  ) : searchResults.map(ev => (
                    <button key={ev.id} onClick={() => { setSelected(ev); setSearchOpen(false); setSearchQuery(''); }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${getMeta(ev.event_type).dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{ev.title}</p>
                        <p className="text-xs text-slate-400">{format(parseISO(ev.start_time), 'MMM d · h:mm a')}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button type="button" onClick={() => setSearchOpen(true)}
              className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 transition-colors">
              <Search className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* AI */}
        <button type="button" onClick={() => setAiOpen(true)}
          className="p-1.5 rounded-md text-violet-500 hover:bg-violet-50 transition-colors shrink-0"
          title="AI Calendar Assistant">
          <Bot className="h-4 w-4" />
        </button>

        <div className="w-px h-5 bg-slate-200 shrink-0" />

        {/* View tabs */}
        <div className="flex items-center bg-slate-100 rounded-md p-0.5 shrink-0">
          {VIEW_TABS.map(({ key, label }) => (
            <button key={key} type="button" onClick={() => setView(key)}
              className={`px-3 py-1 text-xs font-medium rounded transition-all ${
                view === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* New Event */}
        <button type="button" onClick={() => openNewEvent()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e3a5f] hover:bg-[#16304f] text-white text-xs font-medium rounded-md transition-colors shrink-0">
          <Plus className="h-3.5 w-3.5" />
          New Event
        </button>
      </div>

      {/* ── Calendar ─────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {view === 'month'  && <MonthView  currentDate={currentDate} events={filteredEvents} onSelectEvent={setSelected} onNewEvent={openNewEvent} eventsOnDay={eventsOnDay} />}
        {view === 'week'   && <WeekView   currentDate={currentDate} events={filteredEvents} onSelectEvent={setSelected} />}
        {view === 'day'    && <DayView    currentDate={currentDate} events={filteredEvents} onSelectEvent={setSelected} />}
        {view === 'agenda' && <AgendaView currentDate={currentDate} events={filteredEvents} onSelectEvent={setSelected} />}
      </div>

      {/* ── Upcoming Events ──────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#1e3a5f]" />
            <h3 className="text-sm font-semibold text-slate-800">Upcoming Events</h3>
            <span className="text-xs font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
              {upcomingEvents.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => openNewEvent()}
            className="flex items-center gap-1 text-xs text-[#1e3a5f] hover:text-[#16304f] font-medium transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Event
          </button>
        </div>

        {upcomingEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Calendar className="h-10 w-10 text-slate-200 mb-3" />
            <p className="text-sm text-slate-400 font-medium">No upcoming events</p>
            <p className="text-xs text-slate-300 mt-1">Events you create will appear here</p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-0 border-b border-slate-100 bg-slate-50/60">
              {['Event Name','Type','Date','Time','Participants','Location','Status'].map(col => (
                <div key={col} className="px-4 py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{col}</div>
              ))}
            </div>

            {/* Table rows */}
            <div className="divide-y divide-slate-50">
              {upcomingEvents.map(ev => {
                const meta    = getMeta(ev.event_type);
                const start   = parseISO(ev.start_time);
                const isNow   = isToday(start);
                const isPast  = isBefore(start, new Date());
                const statusLabel = ev.is_cancelled ? 'Cancelled' : isPast ? 'Ended' : isNow ? 'Today' : isAfter(start, addDays(new Date(), 7)) ? 'Scheduled' : 'This Week';
                const statusColor = ev.is_cancelled ? 'bg-red-50 text-red-600' : isPast ? 'bg-slate-100 text-slate-400' : isNow ? 'bg-blue-50 text-blue-700' : isAfter(start, addDays(new Date(), 7)) ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700';

                return (
                  <button
                    key={ev.id}
                    onClick={() => setSelected(ev)}
                    className="w-full grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-0 hover:bg-slate-50/70 transition-colors text-left group"
                  >
                    {/* Event Name */}
                    <div className="px-4 py-3 flex items-center gap-2.5 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${meta.dot}`} />
                      <span className="text-sm font-medium text-slate-800 truncate group-hover:text-[#1e3a5f] transition-colors">
                        {ev.title}
                      </span>
                    </div>
                    {/* Type */}
                    <div className="px-4 py-3 flex items-center">
                      <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full text-white ${meta.bg}`}>
                        {meta.label}
                      </span>
                    </div>
                    {/* Date */}
                    <div className="px-4 py-3 flex items-center">
                      <span className={`text-xs ${isNow ? 'font-semibold text-blue-700' : 'text-slate-600'}`}>
                        {format(start, 'MMM d, yyyy')}
                      </span>
                    </div>
                    {/* Time */}
                    <div className="px-4 py-3 flex items-center">
                      <span className="text-xs text-slate-500">
                        {ev.is_all_day ? 'All day' : format(start, 'h:mm a')}
                      </span>
                    </div>
                    {/* Participants */}
                    <div className="px-4 py-3 flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-slate-300" />
                      <span className="text-xs text-slate-500">
                        {(ev.attendees?.length ?? 0) > 0 ? ev.attendees!.length : '—'}
                      </span>
                    </div>
                    {/* Location */}
                    <div className="px-4 py-3 flex items-center gap-1 min-w-0">
                      {ev.location ? (
                        <>
                          <MapPin className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                          <span className="text-xs text-slate-500 truncate">{ev.location}</span>
                        </>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </div>
                    {/* Status */}
                    <div className="px-4 py-3 flex items-center">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Show more */}
            {!upcomingExpanded && filteredEvents.filter(e => !isBefore(parseISO(e.start_time), startOfDay(new Date()))).length > 15 && (
              <div className="border-t border-slate-100 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setUpcomingExpanded(true)}
                  className="flex items-center gap-1.5 text-xs text-[#1e3a5f] hover:text-[#16304f] font-medium transition-colors"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                  Show more events
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {selected && (
        <EventDetailModal event={selected} hospitals={hospitals} onClose={() => setSelected(null)} onEdit={() => openEditEvent(selected)} />
      )}

      {formOpen && (
        <EventForm
          open={formOpen} onClose={() => setFormOpen(false)} onSaved={handleSaved}
          hospitals={hospitals} initialDate={formInitDate} editEvent={editEvent}
          userRole={userRole as any}
          bookedSlots={events.map(e => ({ start: e.start_time, end: e.end_time }))}
        />
      )}

      <AIAssistantPanel open={aiOpen} onClose={() => setAiOpen(false)} events={events} />
    </div>
  );
}

// ── Month View ────────────────────────────────────────────
function MonthView({ currentDate, events, onSelectEvent, onNewEvent, eventsOnDay }: {
  currentDate: Date; events: CalendarEvent[];
  onSelectEvent: (e: CalendarEvent) => void; onNewEvent: (d: Date) => void;
  eventsOnDay: (d: Date) => CalendarEvent[];
}) {
  const days: Date[] = [];
  let d = startOfWeek(startOfMonth(currentDate));
  const calEnd = endOfWeek(endOfMonth(currentDate));
  while (d <= calEnd) { days.push(d); d = addDays(d, 1); }

  return (
    <>
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => (
          <div key={day} className="py-2.5 text-center text-xs font-semibold text-slate-500">{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-7" style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(110px, 1fr))` }}>
        {days.map((day, i) => {
          const dayEvents = eventsOnDay(day);
          const inMonth   = isSameMonth(day, currentDate);
          const today     = isToday(day);
          return (
            <div key={i}
              className={`border-b border-r border-slate-100 p-1.5 group cursor-pointer
                ${!inMonth ? 'bg-slate-50/60' : 'bg-white hover:bg-slate-50/40'}`}
              onClick={() => onNewEvent(day)}>
              <div className="flex items-center mb-1">
                <p className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full leading-none
                  ${today ? 'bg-[#1e3a5f] text-white' : inMonth ? 'text-slate-700' : 'text-slate-300'}`}>
                  {format(day, 'd')}
                </p>
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 4).map(ev => {
                  const meta = getMeta(ev.event_type);
                  return (
                    <button key={ev.id}
                      onClick={e => { e.stopPropagation(); onSelectEvent(ev); }}
                      className={`w-full text-left text-[11px] font-medium text-white px-1.5 py-0.5 rounded truncate ${meta.bg} hover:opacity-90 transition-opacity`}>
                      {ev.is_all_day ? '' : format(parseISO(ev.start_time), 'h:mm ')}
                      {ev.title}
                    </button>
                  );
                })}
                {dayEvents.length > 4 && (
                  <button onClick={e => { e.stopPropagation(); onSelectEvent(dayEvents[4]); }}
                    className="text-[10px] text-slate-400 hover:text-slate-600 px-1 transition-colors">
                    +{dayEvents.length - 4} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Week View ─────────────────────────────────────────────
function WeekView({ currentDate, events, onSelectEvent }: {
  currentDate: Date; events: CalendarEvent[];
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(currentDate), i));

  return (
    <div className="overflow-auto max-h-[600px]">
      <div className="grid grid-cols-8 border-b border-slate-100 bg-slate-50 sticky top-0 z-10">
        <div className="py-2 text-xs text-slate-400 text-center border-r border-slate-100">Time</div>
        {days.map(day => (
          <div key={day.toISOString()} className={`py-2 text-center border-r border-slate-100 last:border-0 ${isToday(day) ? 'bg-blue-50' : ''}`}>
            <p className="text-xs text-slate-500">{format(day, 'EEE')}</p>
            <p className={`text-sm font-bold ${isToday(day) ? 'text-[#1e3a5f]' : 'text-slate-800'}`}>{format(day, 'd')}</p>
          </div>
        ))}
      </div>
      {Array.from({ length: 24 }, (_, hour) => (
        <div key={hour} className="grid grid-cols-8 border-b border-slate-50 min-h-[48px]">
          <div className="text-[11px] text-slate-300 text-right pr-2 pt-1 border-r border-slate-100">
            {hour === 0 ? '' : `${hour % 12 || 12}${hour < 12 ? 'am' : 'pm'}`}
          </div>
          {days.map(day => {
            const dayEvents = events.filter(e => {
              const start = parseISO(e.start_time);
              return isSameDay(start, day) && getHours(start) === hour;
            });
            return (
              <div key={day.toISOString()} className={`border-r border-slate-50 last:border-0 p-0.5 ${isToday(day) ? 'bg-blue-50/20' : ''}`}>
                {dayEvents.map(ev => {
                  const meta = getMeta(ev.event_type);
                  return (
                    <button key={ev.id} onClick={() => onSelectEvent(ev)}
                      className={`w-full text-left text-[11px] text-white px-1.5 py-1 rounded mb-0.5 truncate font-medium ${meta.bg} hover:opacity-90 transition-opacity`}>
                      <span className="opacity-80">{format(parseISO(ev.start_time), 'h:mm')} </span>
                      {ev.title}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Day View ──────────────────────────────────────────────
function DayView({ currentDate, events, onSelectEvent }: {
  currentDate: Date; events: CalendarEvent[];
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  const dayEvents = events
    .filter(e => isSameDay(parseISO(e.start_time), currentDate))
    .sort((a, b) => parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime());

  return (
    <>
      <div className={`py-3 px-4 border-b border-slate-100 ${isToday(currentDate) ? 'bg-blue-50' : ''}`}>
        <p className={`text-sm font-semibold ${isToday(currentDate) ? 'text-[#1e3a5f]' : 'text-slate-800'}`}>
          {format(currentDate, 'EEEE, MMMM d, yyyy')}
          {isToday(currentDate) && <span className="ml-2 text-xs bg-[#1e3a5f] text-white px-2 py-0.5 rounded-full">Today</span>}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">{dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}</p>
      </div>
      {dayEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Calendar className="h-10 w-10 text-slate-200 mb-3" />
          <p className="text-slate-400 text-sm font-medium">No events scheduled</p>
          <p className="text-slate-300 text-xs mt-1">Click New Event to add something</p>
        </div>
      ) : (
        <div className="p-3 space-y-2">
          {dayEvents.map(ev => {
            const meta = getMeta(ev.event_type);
            return (
              <button key={ev.id} onClick={() => onSelectEvent(ev)} className="w-full text-left group">
                <Card className={`hover:shadow-md transition-all border-slate-100 ${meta.light}`}>
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className={`w-1 self-stretch rounded-full ${meta.bg}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 group-hover:text-slate-900">{ev.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {ev.is_all_day ? 'All day' : `${format(parseISO(ev.start_time), 'h:mm a')} – ${format(parseISO(ev.end_time), 'h:mm a')}`}
                        {ev.location ? ` · ${ev.location}` : ''}
                      </p>
                    </div>
                    <Badge className={`text-[10px] border-0 text-white shrink-0 ${meta.bg}`}>{meta.label}</Badge>
                    {ev.meeting_link && <ExternalLink className="h-4 w-4 text-blue-400 shrink-0" />}
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Agenda View (14-day list) ─────────────────────────────
function AgendaView({ currentDate, events, onSelectEvent }: {
  currentDate: Date; events: CalendarEvent[];
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(currentDate, i));

  const grouped = useMemo(() =>
    days.map(day => ({
      day,
      events: events
        .filter(e => isSameDay(parseISO(e.start_time), day))
        .sort((a, b) => parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime()),
    })),
  [events, currentDate]);

  return (
    <div className="p-4 space-y-2">
      {grouped.map(({ day, events: dayEvents }) => {
        const today = isToday(day);
        if (dayEvents.length === 0 && !today) return null;
        return (
          <div key={day.toISOString()} className={`rounded-xl border overflow-hidden ${today ? 'border-blue-200 shadow-sm' : 'border-slate-200'}`}>
            <div className={`px-4 py-2 flex items-center gap-3 ${today ? 'bg-[#1e3a5f] text-white' : 'bg-slate-50 text-slate-700'}`}>
              <div className="text-center w-8">
                <p className={`text-[10px] font-medium uppercase ${today ? 'text-blue-200' : 'text-slate-400'}`}>{format(day, 'EEE')}</p>
                <p className="text-base font-bold leading-none">{format(day, 'd')}</p>
              </div>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${today ? 'text-white' : 'text-slate-700'}`}>{format(day, 'MMMM d, yyyy')}</p>
                <p className={`text-xs ${today ? 'text-blue-200' : 'text-slate-400'}`}>{dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}</p>
              </div>
              {today && <Badge className="bg-white text-[#1e3a5f] text-xs">Today</Badge>}
            </div>
            {dayEvents.length > 0 ? (
              <div className="bg-white divide-y divide-slate-50">
                {dayEvents.map(ev => {
                  const meta = getMeta(ev.event_type);
                  return (
                    <button key={ev.id} onClick={() => onSelectEvent(ev)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left group">
                      <div className={`w-1.5 h-7 rounded-full shrink-0 ${meta.bg}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{ev.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {ev.is_all_day ? 'All day' : `${format(parseISO(ev.start_time), 'h:mm a')} – ${format(parseISO(ev.end_time), 'h:mm a')}`}
                          {ev.location ? ` · ${ev.location}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge className={`text-[10px] border-0 text-white ${meta.bg}`}>{meta.label}</Badge>
                        {ev.meeting_link && <ExternalLink className="h-3.5 w-3.5 text-slate-300 group-hover:text-blue-400" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white px-4 py-2.5">
                <p className="text-xs text-slate-300 italic">No events</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────
function getDisplayName(email: string | null): string {
  if (!email) return 'Guest';
  return email.split('@')[0].replace(/[._-]/g, ' ').split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function getInitials(email: string | null): string {
  const name = getDisplayName(email);
  const parts = name.split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const ATTENDEE_STATUS_CONFIG = {
  accepted:  { label: 'Accepted',  bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  declined:  { label: 'Declined',  bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
  tentative: { label: 'Tentative', bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-400'  },
  invited:   { label: 'Invited',   bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400'   },
} as const;

const AVATAR_COLORS = ['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#06B6D4','#D946EF','#0EA5E9','#14B8A6','#F97316'];
function avatarColor(email: string | null): string {
  if (!email) return '#94A3B8';
  let n = 0;
  for (let i = 0; i < email.length; i++) n += email.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

// ── Event Detail Modal ────────────────────────────────────
function EventDetailModal({ event: ev, hospitals, onClose, onEdit }: {
  event: CalendarEvent; hospitals: Hospital[];
  onClose: () => void; onEdit: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const hospital = hospitals.find(h => h.id === ev.hospital_id);
  const meta     = getMeta(ev.event_type);

  const attendees = ev.attendees ?? [];
  const VISIBLE   = 6;
  const list      = showAll ? attendees : attendees.slice(0, VISIBLE);

  const accepted  = attendees.filter(a => a.status === 'accepted').length;
  const declined  = attendees.filter(a => a.status === 'declined').length;
  const tentative = attendees.filter(a => a.status === 'tentative').length;
  const pending   = attendees.filter(a => a.status === 'invited').length;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <div className={`px-6 py-5 ${meta.light}`}>
          <div className="flex items-start gap-3">
            <span className={`w-10 h-10 rounded-xl ${meta.bg} flex items-center justify-center shrink-0`}>
              <span className="text-white text-[11px] font-bold">{meta.label.slice(0, 2).toUpperCase()}</span>
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900 leading-tight">{ev.title}</h2>
              <Badge className={`mt-1 text-[10px] border-0 text-white ${meta.bg}`}>{meta.label}</Badge>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[65vh]">
          <div className="px-6 py-4 space-y-3">
            <div className="flex items-center gap-3 text-[13px] text-slate-600">
              <Clock className="h-4 w-4 text-slate-400 shrink-0" />
              <span>
                {ev.is_all_day
                  ? `${format(parseISO(ev.start_time), 'EEEE, MMM d')} – ${format(parseISO(ev.end_time), 'MMM d')} · All day`
                  : `${format(parseISO(ev.start_time), 'EEEE, MMM d')} · ${format(parseISO(ev.start_time), 'h:mm a')} – ${format(parseISO(ev.end_time), 'h:mm a')}`}
              </span>
            </div>
            {hospital && (
              <div className="flex items-center gap-3 text-[13px] text-slate-600">
                <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="font-medium" style={{ color: hospital.color ?? undefined }}>{hospital.name}</span>
              </div>
            )}
            {ev.location && (
              <div className="flex items-center gap-3 text-[13px] text-slate-600">
                <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                <span>{ev.location}</span>
              </div>
            )}
            {ev.meeting_link && (
              <a href={ev.meeting_link} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-[13px] text-blue-600 hover:underline font-medium">
                <ExternalLink className="h-4 w-4 shrink-0" />Join Meeting
              </a>
            )}
            {ev.description && (
              <p className="text-[13px] text-slate-500 bg-gray-50 rounded-xl p-3 leading-relaxed">{ev.description}</p>
            )}

            {attendees.length > 0 && (
              <>
                <Separator />
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-500" />
                  <span className="text-[13px] font-bold text-slate-800">Invited People</span>
                  <span className="text-[11px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{attendees.length}</span>
                </div>
                {(accepted > 0 || declined > 0 || tentative > 0) && (
                  <div className="flex flex-wrap gap-1.5">
                    {accepted  > 0 && <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />{accepted} Accepted</span>}
                    {tentative > 0 && <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{tentative} Tentative</span>}
                    {declined  > 0 && <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />{declined} Declined</span>}
                    {pending   > 0 && <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200 px-2.5 py-1 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-gray-400" />{pending} Pending</span>}
                  </div>
                )}
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  {list.map((a, idx) => {
                    const cfg  = ATTENDEE_STATUS_CONFIG[a.status as keyof typeof ATTENDEE_STATUS_CONFIG] ?? ATTENDEE_STATUS_CONFIG.invited;
                    return (
                      <div key={a.id} className={`flex items-center gap-3 px-4 py-2.5 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}`}>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                          style={{ backgroundColor: avatarColor(a.email) }}>
                          {getInitials(a.email)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[13px] font-semibold text-gray-800 truncate">{getDisplayName(a.email)}</p>
                            {a.is_organizer && <span className="text-[9px] font-bold uppercase bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">Organizer</span>}
                          </div>
                          <p className="text-[11px] text-gray-400 truncate">{a.email ?? '—'}</p>
                        </div>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {attendees.length > VISIBLE && (
                  <button type="button" onClick={() => setShowAll(v => !v)}
                    className="w-full text-[12px] font-semibold text-blue-600 hover:text-blue-700 py-1.5 flex items-center justify-center gap-1">
                    {showAll ? 'Show less' : <>{attendees.length - VISIBLE} more &rarr; Show all</>}
                  </button>
                )}
              </>
            )}
            {attendees.length === 0 && (
              <>
                <Separator />
                <div className="flex items-center gap-2 py-2 text-[13px] text-slate-400">
                  <Users className="h-4 w-4" /><span>No attendees added</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-3 border-t border-gray-100 bg-gray-50/50">
          <Button variant="outline" size="sm" onClick={onEdit}>Edit Event</Button>
          <Button size="sm" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── AI Assistant Panel ────────────────────────────────────
function AIAssistantPanel({ open, onClose, events }: {
  open: boolean; onClose: () => void; events: CalendarEvent[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Hi! I can answer questions about your calendar.\n\n• "When is the next manager meeting?"\n• "Who is off next week?"\n• "What training is due this month?"' },
  ]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', content: q }]);
    setLoading(true);
    try {
      const res  = await fetch('/api/v1/calendar/ai-query', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          events: events.slice(0, 300).map(e => ({ id: e.id, title: e.title, event_type: e.event_type, start_time: e.start_time, end_time: e.end_time, location: e.location, is_all_day: e.is_all_day })),
          today: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        }),
      });
      const json = await res.json();
      setMessages(m => [...m, { role: 'assistant', content: json.answer ?? 'Sorry, I could not process that.' }]);
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Error reaching AI assistant. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-white border-l border-slate-200 shadow-xl z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-violet-600 to-blue-600">
        <div className="flex items-center gap-2 text-white">
          <Bot className="h-5 w-5" />
          <div>
            <p className="text-sm font-semibold">AI Calendar Assistant</p>
            <p className="text-xs text-violet-200">Ask about your schedule</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-white/20">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed
              ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-700 rounded-bl-sm'}`}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-xl rounded-bl-sm px-3 py-2 flex items-center gap-2">
              <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
              <span className="text-sm text-slate-400">Thinking…</span>
            </div>
          </div>
        )}
      </div>
      <div className="p-3 border-t border-slate-200">
        <div className="flex gap-2">
          <Input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Ask about your calendar…" className="text-sm h-9" disabled={loading} />
          <Button size="sm" onClick={handleSend} disabled={loading || !input.trim()} className="h-9 w-9 p-0 shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] text-slate-300 mt-1.5 text-center">Powered by Claude AI</p>
      </div>
    </div>
  );
}
