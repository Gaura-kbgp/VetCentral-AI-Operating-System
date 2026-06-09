'use client';

import { useState, useMemo, useCallback, useTransition } from 'react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameMonth, isSameDay, isToday, addMonths, subMonths,
  parseISO, getHours, isAfter, isBefore, addWeeks, subWeeks,
} from 'date-fns';
import {
  ChevronLeft, ChevronRight, Calendar, Clock, MapPin, Users, ExternalLink,
  Plus, Search, X, Bot, Building2, Filter, ChevronDown, AlertTriangle,
  BookOpen, UserX, Briefcase, Bell, Target, Layers, List,
  MoreHorizontal, Send, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import EventForm from './event-form';
import type { CalendarEvent, EventType, EventCategory } from '@/types/app';

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

const CATEGORY_LABELS: Record<EventCategory, string> = {
  meetings:    'Meetings',
  training:    'Training',
  hr:          'HR Events',
  pto:         'PTO / Leave',
  hospital:    'Hospital Events',
  operational: 'Operational',
  projects:    'Projects',
  other:       'Other',
};

const CATEGORY_ICONS: Record<EventCategory, React.ElementType> = {
  meetings:    Users,
  training:    BookOpen,
  hr:          Briefcase,
  pto:         UserX,
  hospital:    Building2,
  operational: AlertTriangle,
  projects:    Target,
  other:       MoreHorizontal,
};

// Role presets
const ROLE_PRESETS: Record<string, { label: string; categories: EventCategory[] }> = {
  all:       { label: 'All Events',      categories: ['meetings','training','hr','pto','hospital','operational','projects','other'] },
  doctor:    { label: 'Doctor View',     categories: ['meetings','training','hospital'] },
  hr:        { label: 'HR View',         categories: ['hr','pto','training','hospital'] },
  manager:   { label: 'Manager View',    categories: ['meetings','operational','training','pto'] },
  executive: { label: 'Executive View',  categories: ['meetings','hospital','operational','projects'] },
};

type ViewMode = 'month' | 'week' | 'day' | 'timeline';

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

  // Filters
  const [hospitalFilter, setHospitalFilter]     = useState<string>('all');
  const [activeCategories, setActiveCategories] = useState<Set<EventCategory>>(
    new Set(['meetings','training','hr','pto','hospital','operational','projects','other'])
  );
  const [rolePreset, setRolePreset] = useState<string>('all');

  function applyPreset(key: string) {
    setRolePreset(key);
    setActiveCategories(new Set(ROLE_PRESETS[key]?.categories ?? []));
  }

  function toggleCategory(cat: EventCategory) {
    setActiveCategories(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      if (hospitalFilter !== 'all' && e.hospital_id !== hospitalFilter) return false;
      const meta = getMeta(e.event_type);
      if (!activeCategories.has(meta.category)) return false;
      return true;
    });
  }, [events, hospitalFilter, activeCategories]);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return events
      .filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.event_type.replace(/_/g,' ').includes(q) ||
        (e.location ?? '').toLowerCase().includes(q) ||
        (e.description ?? '').toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [events, searchQuery]);

  // Today stats (computed from all events)
  const todayStats = useMemo(() => {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end   = new Date(start.getTime() + 86400000);
    const in7   = new Date(start.getTime() + 7 * 86400000);
    const in14  = new Date(start.getTime() + 14 * 86400000);

    const todayEvents = events.filter(e => {
      const d = parseISO(e.start_time);
      return d >= start && d < end;
    });

    return {
      meetingsCount:   todayEvents.filter(e => getMeta(e.event_type).category === 'meetings').length,
      staffOutCount:   events.filter(e => {
        const cat = getMeta(e.event_type).category;
        if (cat !== 'pto') return false;
        const s = parseISO(e.start_time);
        const en = parseISO(e.end_time);
        return s <= end && en >= start;
      }).length,
      trainingDueCount: events.filter(e => {
        const cat = getMeta(e.event_type).category;
        if (cat !== 'training') return false;
        const d = parseISO(e.start_time);
        return d >= start && d < in14;
      }).length,
      deadlinesCount: events.filter(e => {
        const cat = getMeta(e.event_type).category;
        if (cat !== 'operational') return false;
        const d = parseISO(e.start_time);
        return d >= start && d < in7;
      }).length,
      upcomingCount: events.filter(e => {
        const d = parseISO(e.start_time);
        return d >= start && d < in7;
      }).length,
      onboardingCount: events.filter(e => {
        if (!['onboarding','orientation'].includes(e.event_type)) return false;
        const d = parseISO(e.start_time);
        return d >= start && d < in14;
      }).length,
      todayMeetings: todayEvents.filter(e => getMeta(e.event_type).category === 'meetings'),
      staffOutToday: events.filter(e => {
        if (getMeta(e.event_type).category !== 'pto') return false;
        const s = parseISO(e.start_time);
        const en = parseISO(e.end_time);
        return s <= end && en >= start;
      }),
    };
  }, [events]);

  function openNewEvent(date?: Date) {
    setEditEvent(null);
    setFormInitDate(date);
    setFormOpen(true);
  }

  function openEditEvent(ev: CalendarEvent) {
    setSelected(null);
    setEditEvent(ev);
    setFormInitDate(undefined);
    setFormOpen(true);
  }

  function handleSaved(ev: CalendarEvent) {
    setEvents(prev => {
      const idx = prev.findIndex(e => e.id === ev.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = ev; return next; }
      return [...prev, ev];
    });
  }

  const navigate = useCallback((dir: 1 | -1) => {
    setCurrentDate(d => {
      if (view === 'month')    return dir === 1 ? addMonths(d, 1) : subMonths(d, 1);
      if (view === 'week')     return dir === 1 ? addWeeks(d, 1)  : subWeeks(d, 1);
      return addDays(d, dir);
    });
  }, [view]);

  const eventsOnDay = useCallback((day: Date) =>
    filteredEvents.filter(e => isSameDay(parseISO(e.start_time), day)),
  [filteredEvents]);

  const titleLabel = useMemo(() => {
    if (view === 'month')    return format(currentDate, 'MMMM yyyy');
    if (view === 'week')     return `${format(startOfWeek(currentDate), 'MMM d')} – ${format(endOfWeek(currentDate), 'MMM d, yyyy')}`;
    if (view === 'timeline') return `Next 14 Days — ${format(currentDate, 'MMM d, yyyy')}`;
    return format(currentDate, 'EEEE, MMMM d, yyyy');
  }, [view, currentDate]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

      {/* ── Today Dashboard Strip ─────────────────────── */}
      <TodayDashboard stats={todayStats} />

      {/* ── Main Layout ──────────────────────────────── */}
      <div className="flex-1 flex min-h-0 gap-4 overflow-hidden mt-4">

        {/* ── Left Sidebar ─────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-56 shrink-0 gap-4 overflow-y-auto pb-4">
          {/* Quick actions */}
          <Button className="w-full gap-2" size="sm" onClick={() => openNewEvent()}>
            <Plus className="h-4 w-4" /> New Event
          </Button>

          {/* Hospital filter */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Hospital</p>
            <div className="space-y-1">
              {[{ id: 'all', name: 'All Hospitals', color: null }, ...hospitals].map(h => (
                <button
                  key={h.id}
                  onClick={() => setHospitalFilter(h.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors
                    ${hospitalFilter === h.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  {h.color && h.id !== 'all' ? (
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: h.color }} />
                  ) : (
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  )}
                  <span className="truncate">{h.name}</span>
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Role presets */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">View As</p>
            <div className="space-y-1">
              {Object.entries(ROLE_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => applyPreset(key)}
                  className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors
                    ${rolePreset === key ? 'bg-slate-800 text-white font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Category filters */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Event Types</p>
            <div className="space-y-1">
              {(Object.keys(CATEGORY_LABELS) as EventCategory[]).map(cat => {
                const Icon = CATEGORY_ICONS[cat];
                const active = activeCategories.has(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors
                      ${active ? 'text-slate-700' : 'text-slate-300'} hover:bg-slate-50`}
                  >
                    <span className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0
                      ${active ? 'border-slate-600 bg-slate-600' : 'border-slate-200'}`}>
                      {active && <span className="w-1.5 h-1.5 bg-white rounded-sm" />}
                    </span>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{CATEGORY_LABELS[cat]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* ── Calendar Area ─────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap shrink-0">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => navigate(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={isSameMonth(currentDate, new Date()) && view === 'month' ? 'outline' : 'default'}
                size="sm"
                onClick={() => setCurrentDate(new Date())}
              >
                Today
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => navigate(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <h2 className="text-sm font-semibold text-slate-800 ml-1 hidden sm:block">{titleLabel}</h2>
            </div>

            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                {searchOpen ? (
                  <div className="flex items-center gap-1">
                    <Input
                      autoFocus
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search events…"
                      className="h-8 w-52 text-sm"
                    />
                    <Button variant="ghost" size="sm" onClick={() => { setSearchOpen(false); setSearchQuery(''); }}>
                      <X className="h-4 w-4" />
                    </Button>
                    {searchQuery && (
                      <div className="absolute top-9 left-0 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto">
                        {searchResults.length === 0 ? (
                          <p className="text-sm text-slate-400 text-center py-4">No events found</p>
                        ) : searchResults.map(ev => (
                          <button
                            key={ev.id}
                            onClick={() => { setSelected(ev); setSearchOpen(false); setSearchQuery(''); }}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left"
                          >
                            <span className={`w-2 h-2 rounded-full shrink-0 ${getMeta(ev.event_type).dot}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-700 truncate">{ev.title}</p>
                              <p className="text-xs text-slate-400">
                                {format(parseISO(ev.start_time), 'MMM d · h:mm a')}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setSearchOpen(true)}>
                    <Search className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* AI Assistant */}
              <Button variant="outline" size="sm" onClick={() => setAiOpen(true)} className="gap-1.5">
                <Bot className="h-4 w-4 text-violet-500" />
                <span className="hidden sm:inline text-xs">AI</span>
              </Button>

              {/* New Event (mobile) */}
              <Button size="sm" onClick={() => openNewEvent()} className="gap-1 lg:hidden">
                <Plus className="h-4 w-4" />
              </Button>

              {/* View switcher */}
              <Tabs value={view} onValueChange={v => setView(v as ViewMode)}>
                <TabsList className="h-8">
                  <TabsTrigger value="month"    className="text-xs px-2.5"><Calendar className="h-3.5 w-3.5" /></TabsTrigger>
                  <TabsTrigger value="week"     className="text-xs px-2.5"><Layers className="h-3.5 w-3.5" /></TabsTrigger>
                  <TabsTrigger value="day"      className="text-xs px-2.5"><List className="h-3.5 w-3.5" /></TabsTrigger>
                  <TabsTrigger value="timeline" className="text-xs px-2.5"><Filter className="h-3.5 w-3.5" /></TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          {/* Views */}
          {view === 'month' && (
            <MonthView
              currentDate={currentDate}
              events={filteredEvents}
              onSelectEvent={setSelected}
              onNewEvent={openNewEvent}
              eventsOnDay={eventsOnDay}
            />
          )}
          {view === 'week' && (
            <WeekView
              currentDate={currentDate}
              events={filteredEvents}
              onSelectEvent={setSelected}
            />
          )}
          {view === 'day' && (
            <DayView
              currentDate={currentDate}
              events={filteredEvents}
              onSelectEvent={setSelected}
            />
          )}
          {view === 'timeline' && (
            <TimelineView
              currentDate={currentDate}
              events={filteredEvents}
              onSelectEvent={setSelected}
            />
          )}
        </div>
      </div>

      {/* ── Event Detail Modal ────────────────────────── */}
      {selected && (
        <EventDetailModal
          event={selected}
          hospitals={hospitals}
          onClose={() => setSelected(null)}
          onEdit={() => openEditEvent(selected)}
        />
      )}

      {/* ── Create / Edit Form ────────────────────────── */}
      {formOpen && (
        <EventForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
          hospitals={hospitals}
          initialDate={formInitDate}
          editEvent={editEvent}
          userRole={userRole as any}
          bookedSlots={events.map(e => ({ start: e.start_time, end: e.end_time }))}
        />
      )}

      {/* ── AI Assistant Panel ────────────────────────── */}
      <AIAssistantPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        events={events}
      />
    </div>
  );
}

// ── Today Dashboard ───────────────────────────────────────
function TodayDashboard({ stats }: {
  stats: {
    meetingsCount: number; staffOutCount: number; trainingDueCount: number;
    deadlinesCount: number; upcomingCount: number; onboardingCount: number;
    todayMeetings: CalendarEvent[]; staffOutToday: CalendarEvent[];
  };
}) {
  const today = new Date();

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Today at a Glance</p>
          <p className="text-sm font-semibold text-slate-700">{format(today, 'EEEE, MMMM d')}</p>
        </div>
      </div>

      {/* Stat chips */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
        <StatChip icon={Users}         label="Meetings Today"  count={stats.meetingsCount}   color="blue"   />
        <StatChip icon={UserX}         label="Staff Out"       count={stats.staffOutCount}   color="amber"  />
        <StatChip icon={BookOpen}      label="Training Due"    count={stats.trainingDueCount} color="green"  />
        <StatChip icon={AlertTriangle} label="Deadlines"       count={stats.deadlinesCount}  color="red"    />
        <StatChip icon={Calendar}      label="This Week"       count={stats.upcomingCount}   color="purple" />
        <StatChip icon={Briefcase}     label="Onboarding"      count={stats.onboardingCount} color="teal"   />
      </div>

      {/* Quick lists */}
      {(stats.todayMeetings.length > 0 || stats.staffOutToday.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
          {stats.todayMeetings.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Today&apos;s Meetings</p>
              <div className="space-y-1">
                {stats.todayMeetings.slice(0, 3).map(ev => (
                  <div key={ev.id} className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getMeta(ev.event_type).dot}`} />
                    <span className="text-xs text-slate-600 truncate">{ev.title}</span>
                    <span className="text-xs text-slate-400 shrink-0 ml-auto">
                      {format(parseISO(ev.start_time), 'h:mm a')}
                    </span>
                  </div>
                ))}
                {stats.todayMeetings.length > 3 && (
                  <p className="text-xs text-slate-400">+{stats.todayMeetings.length - 3} more</p>
                )}
              </div>
            </div>
          )}
          {stats.staffOutToday.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Staff Out Today</p>
              <div className="space-y-1">
                {stats.staffOutToday.slice(0, 3).map(ev => (
                  <div key={ev.id} className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getMeta(ev.event_type).dot}`} />
                    <span className="text-xs text-slate-600 truncate">{ev.title}</span>
                    <Badge className={`text-[9px] border-0 ml-auto ${getMeta(ev.event_type).bg} text-white`}>
                      {getMeta(ev.event_type).label}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatChip({ icon: Icon, label, count, color }: {
  icon: React.ElementType; label: string; count: number;
  color: 'blue' | 'amber' | 'green' | 'red' | 'purple' | 'teal';
}) {
  const colors = {
    blue:   'bg-blue-50   text-blue-700   border-blue-100',
    amber:  'bg-amber-50  text-amber-700  border-amber-100',
    green:  'bg-emerald-50 text-emerald-700 border-emerald-100',
    red:    'bg-red-50    text-red-700    border-red-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
    teal:   'bg-teal-50   text-teal-700   border-teal-100',
  };
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${colors[color]}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <div>
        <p className="text-lg font-bold leading-none">{count}</p>
        <p className="text-[10px] leading-tight mt-0.5 opacity-80">{label}</p>
      </div>
    </div>
  );
}

// ── Month View ────────────────────────────────────────────
function MonthView({ currentDate, events, onSelectEvent, onNewEvent, eventsOnDay }: {
  currentDate: Date; events: CalendarEvent[];
  onSelectEvent: (e: CalendarEvent) => void;
  onNewEvent: (d: Date) => void;
  eventsOnDay: (d: Date) => CalendarEvent[];
}) {
  const days: Date[] = [];
  let d = startOfWeek(startOfMonth(currentDate));
  const calEnd = endOfWeek(endOfMonth(currentDate));
  while (d <= calEnd) { days.push(d); d = addDays(d, 1); }

  return (
    <div className="flex-1 border border-slate-200 rounded-xl overflow-y-auto bg-white min-h-0">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => (
          <div key={day} className="py-2 text-center text-xs font-semibold text-slate-500">{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-7" style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(100px, 1fr))` }}>
        {days.map((day, i) => {
          const dayEvents = eventsOnDay(day);
          const inMonth   = isSameMonth(day, currentDate);
          const today     = isToday(day);
          return (
            <div
              key={i}
              className={`border-b border-r border-slate-100 p-1 min-h-[90px] group cursor-pointer
                ${!inMonth ? 'bg-slate-50/70' : 'bg-white hover:bg-slate-50/50'}`}
              onClick={() => onNewEvent(day)}
            >
              <div className="flex items-center justify-between mb-0.5">
                <p className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full
                  ${today ? 'bg-blue-600 text-white' : inMonth ? 'text-slate-700' : 'text-slate-300'}`}>
                  {format(day, 'd')}
                </p>
                {dayEvents.length > 0 && (
                  <span className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    +add
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map(ev => {
                  const meta = getMeta(ev.event_type);
                  return (
                    <button
                      key={ev.id}
                      onClick={e => { e.stopPropagation(); onSelectEvent(ev); }}
                      className={`w-full text-left text-[11px] font-medium text-white px-1.5 py-0.5 rounded truncate
                        ${meta.bg} hover:opacity-90 transition-opacity`}
                    >
                      {ev.is_all_day ? '' : format(parseISO(ev.start_time), 'h:mm ')}
                      {ev.title}
                    </button>
                  );
                })}
                {dayEvents.length > 3 && (
                  <button
                    onClick={e => { e.stopPropagation(); onSelectEvent(dayEvents[3]); }}
                    className="text-[10px] text-slate-400 hover:text-slate-600 px-1 transition-colors"
                  >
                    +{dayEvents.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Week View ─────────────────────────────────────────────
function WeekView({ currentDate, events, onSelectEvent }: {
  currentDate: Date; events: CalendarEvent[];
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(currentDate), i));

  return (
    <div className="flex-1 overflow-auto border border-slate-200 rounded-xl bg-white">
      <div className="grid grid-cols-8 border-b border-slate-100 bg-slate-50 sticky top-0 z-10">
        <div className="py-2 text-xs text-slate-400 text-center border-r border-slate-100">Time</div>
        {days.map(day => (
          <div key={day.toISOString()} className={`py-2 text-center border-r border-slate-100 last:border-0 ${isToday(day) ? 'bg-blue-50' : ''}`}>
            <p className="text-xs text-slate-500">{format(day, 'EEE')}</p>
            <p className={`text-sm font-bold ${isToday(day) ? 'text-blue-600' : 'text-slate-800'}`}>{format(day, 'd')}</p>
          </div>
        ))}
      </div>
      {Array.from({ length: 24 }, (_, hour) => (
        <div key={hour} className="grid grid-cols-8 border-b border-slate-50 min-h-[52px]">
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
                    <button
                      key={ev.id}
                      onClick={() => onSelectEvent(ev)}
                      className={`w-full text-left text-[11px] text-white px-1.5 py-1 rounded mb-0.5 truncate font-medium
                        ${meta.bg} hover:opacity-90 transition-opacity`}
                    >
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
    <div className="flex-1 overflow-auto border border-slate-200 rounded-xl bg-white">
      <div className={`py-4 px-5 border-b border-slate-100 ${isToday(currentDate) ? 'bg-blue-50' : ''}`}>
        <p className={`text-base font-semibold ${isToday(currentDate) ? 'text-blue-700' : 'text-slate-800'}`}>
          {format(currentDate, 'EEEE, MMMM d, yyyy')}
          {isToday(currentDate) && <span className="ml-2 text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">Today</span>}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">{dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}</p>
      </div>

      {dayEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Calendar className="h-12 w-12 text-slate-200 mb-3" />
          <p className="text-slate-400 text-sm font-medium">No events scheduled</p>
          <p className="text-slate-300 text-xs mt-1">Click New Event to add something</p>
        </div>
      ) : (
        <div className="p-4 space-y-2">
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
                    <Badge className={`text-[10px] border-0 text-white shrink-0 ${meta.bg}`}>
                      {meta.label}
                    </Badge>
                    {ev.meeting_link && (
                      <ExternalLink className="h-4 w-4 text-blue-400 shrink-0" />
                    )}
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Timeline View (Operational) ───────────────────────────
function TimelineView({ currentDate, events, onSelectEvent }: {
  currentDate: Date; events: CalendarEvent[];
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(currentDate, i));

  const grouped = useMemo(() => {
    return days.map(day => ({
      day,
      events: events
        .filter(e => isSameDay(parseISO(e.start_time), day))
        .sort((a, b) => parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime()),
    }));
  }, [events, currentDate]);

  return (
    <div className="flex-1 overflow-auto">
      <div className="space-y-3">
        {grouped.map(({ day, events: dayEvents }) => {
          const today   = isToday(day);
          const isEmpty = dayEvents.length === 0;
          if (isEmpty && !today) return null;

          return (
            <div key={day.toISOString()} className={`rounded-xl border overflow-hidden
              ${today ? 'border-blue-200 shadow-sm' : 'border-slate-200'}`}>
              {/* Day header */}
              <div className={`px-4 py-2.5 flex items-center justify-between
                ${today ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-700'}`}>
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <p className={`text-[11px] font-medium uppercase ${today ? 'text-blue-200' : 'text-slate-400'}`}>
                      {format(day, 'EEE')}
                    </p>
                    <p className="text-lg font-bold leading-none">{format(day, 'd')}</p>
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${today ? 'text-white' : 'text-slate-700'}`}>
                      {format(day, 'MMMM d, yyyy')}
                    </p>
                    <p className={`text-xs ${today ? 'text-blue-200' : 'text-slate-400'}`}>
                      {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                {today && <Badge className="bg-white text-blue-700 text-xs">Today</Badge>}
              </div>

              {/* Events */}
              {dayEvents.length > 0 ? (
                <div className="bg-white divide-y divide-slate-50">
                  {dayEvents.map(ev => {
                    const meta = getMeta(ev.event_type);
                    return (
                      <button
                        key={ev.id}
                        onClick={() => onSelectEvent(ev)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left group"
                      >
                        <div className={`w-1.5 h-8 rounded-full shrink-0 ${meta.bg}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 group-hover:text-slate-900 truncate">{ev.title}</p>
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
                <div className="bg-white px-4 py-3">
                  <p className="text-xs text-slate-300 italic">No events</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Helpers for attendee display ─────────────────────────
function getDisplayName(email: string | null): string {
  if (!email) return 'Guest';
  const username = email.split('@')[0];
  return username
    .replace(/[._-]/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getInitials(email: string | null): string {
  const name = getDisplayName(email);
  const parts = name.split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const ATTENDEE_STATUS_CONFIG = {
  accepted:  { label: 'Accepted',  bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500',  icon: '✓' },
  declined:  { label: 'Declined',  bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500',    icon: '✗' },
  tentative: { label: 'Tentative', bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-400',  icon: '?' },
  invited:   { label: 'Invited',   bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400',   icon: '·' },
} as const;

const AVATAR_COLORS = [
  '#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444',
  '#06B6D4','#D946EF','#0EA5E9','#14B8A6','#F97316',
];
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
  const [showAllAttendees, setShowAllAttendees] = useState(false);
  const hospital = hospitals.find(h => h.id === ev.hospital_id);
  const meta     = getMeta(ev.event_type);

  const attendees  = ev.attendees ?? [];
  const organizer  = attendees.find(a => a.is_organizer);
  const guests     = attendees.filter(a => !a.is_organizer);
  const VISIBLE_COUNT = 6;
  const displayList = showAllAttendees ? attendees : attendees.slice(0, VISIBLE_COUNT);

  // RSVP summary counts
  const accepted  = attendees.filter(a => a.status === 'accepted').length;
  const declined  = attendees.filter(a => a.status === 'declined').length;
  const tentative = attendees.filter(a => a.status === 'tentative').length;
  const pending   = attendees.filter(a => a.status === 'invited').length;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">

        {/* ── Header ───────────────────────────────────── */}
        <div className={`px-6 py-5 ${meta.light}`}>
          <div className="flex items-start gap-3">
            <span className={`w-10 h-10 rounded-xl ${meta.bg} flex items-center justify-center shrink-0 mt-0.5`}>
              <span className="text-white text-[11px] font-bold">{meta.label.slice(0, 2).toUpperCase()}</span>
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900 leading-tight">{ev.title}</h2>
              <Badge className={`mt-1 text-[10px] border-0 text-white ${meta.bg}`}>{meta.label}</Badge>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[70vh]">
          <div className="px-6 py-4 space-y-4">

            {/* ── Time ─────────────────────────────────── */}
            <div className="flex items-center gap-3 text-[13px] text-slate-600">
              <Clock className="h-4 w-4 text-slate-400 shrink-0" />
              <span>
                {ev.is_all_day
                  ? `${format(parseISO(ev.start_time), 'EEEE, MMM d')} – ${format(parseISO(ev.end_time), 'MMM d')} · All day`
                  : `${format(parseISO(ev.start_time), 'EEEE, MMM d')} · ${format(parseISO(ev.start_time), 'h:mm a')} – ${format(parseISO(ev.end_time), 'h:mm a')}`
                }
              </span>
            </div>

            {/* ── Hospital ──────────────────────────────── */}
            {hospital && (
              <div className="flex items-center gap-3 text-[13px] text-slate-600">
                <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="font-medium" style={{ color: hospital.color ?? undefined }}>{hospital.name}</span>
              </div>
            )}

            {/* ── Location ──────────────────────────────── */}
            {ev.location && (
              <div className="flex items-center gap-3 text-[13px] text-slate-600">
                <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                <span>{ev.location}</span>
              </div>
            )}

            {/* ── Meeting Link ──────────────────────────── */}
            {ev.meeting_link && (
              <a href={ev.meeting_link} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-[13px] text-blue-600 hover:text-blue-700 font-medium hover:underline">
                <ExternalLink className="h-4 w-4 shrink-0" />
                Join Meeting
              </a>
            )}

            {/* ── Description ──────────────────────────── */}
            {ev.description && (
              <p className="text-[13px] text-slate-500 bg-gray-50 rounded-xl p-3 leading-relaxed">
                {ev.description}
              </p>
            )}

            {/* ── Attendees ─────────────────────────────── */}
            {attendees.length > 0 && (
              <>
                <Separator />

                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-500" />
                    <span className="text-[13px] font-bold text-slate-800">
                      Invited People
                    </span>
                    <span className="text-[11px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {attendees.length}
                    </span>
                  </div>
                </div>

                {/* RSVP summary pills */}
                {(accepted > 0 || declined > 0 || tentative > 0) && (
                  <div className="flex flex-wrap gap-1.5">
                    {accepted  > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        {accepted} Accepted
                      </span>
                    )}
                    {tentative > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        {tentative} Tentative
                      </span>
                    )}
                    {declined  > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        {declined} Declined
                      </span>
                    )}
                    {pending   > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200 px-2.5 py-1 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                        {pending} Pending
                      </span>
                    )}
                  </div>
                )}

                {/* Attendee list */}
                <div className="space-y-1 rounded-xl border border-gray-100 overflow-hidden">
                  {displayList.map((a, idx) => {
                    const statusCfg = ATTENDEE_STATUS_CONFIG[a.status as keyof typeof ATTENDEE_STATUS_CONFIG]
                      ?? ATTENDEE_STATUS_CONFIG.invited;
                    const color = avatarColor(a.email);
                    const initials = getInitials(a.email);
                    const displayName = getDisplayName(a.email);
                    return (
                      <div key={a.id}
                        className={`flex items-center gap-3 px-4 py-3 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'} hover:bg-blue-50/30 transition-colors`}>
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                          style={{ backgroundColor: color }}>
                          {initials}
                        </div>

                        {/* Name + email */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[13px] font-semibold text-gray-800 truncate">{displayName}</p>
                            {a.is_organizer && (
                              <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
                                Organizer
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 truncate">{a.email ?? '—'}</p>
                        </div>

                        {/* Status badge */}
                        <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${statusCfg.bg} ${statusCfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                          {statusCfg.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Show all / collapse toggle */}
                {attendees.length > VISIBLE_COUNT && (
                  <button
                    type="button"
                    onClick={() => setShowAllAttendees(v => !v)}
                    className="w-full text-[12px] font-semibold text-blue-600 hover:text-blue-700 py-1.5 flex items-center justify-center gap-1 transition-colors"
                  >
                    {showAllAttendees
                      ? <>Show less</>
                      : <>{attendees.length - VISIBLE_COUNT} more invited &rarr; Show all</>
                    }
                  </button>
                )}
              </>
            )}

            {/* No attendees */}
            {attendees.length === 0 && (
              <>
                <Separator />
                <div className="flex items-center gap-2 py-2 text-[13px] text-slate-400">
                  <Users className="h-4 w-4" />
                  <span>No attendees added</span>
                </div>
              </>
            )}

          </div>
        </div>

        {/* ── Footer ───────────────────────────────────── */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
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
  const [messages, setMessages]   = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Hi! I can answer questions about your calendar. Try asking:\n\n• "When is the next manager meeting?"\n• "Who is off next week?"\n• "What training is due this month?"\n• "What events are at Clifton?"' },
  ]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);

  async function handleSend() {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', content: q }]);
    setLoading(true);

    try {
      const eventPayload = events.slice(0, 300).map(e => ({
        id:         e.id,
        title:      e.title,
        event_type: e.event_type,
        start_time: e.start_time,
        end_time:   e.end_time,
        location:   e.location,
        is_all_day: e.is_all_day,
      }));

      const res = await fetch('/api/v1/calendar/ai-query', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          query:  q,
          events: eventPayload,
          today:  new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
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
      {/* Header */}
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed
              ${msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-sm'
                : 'bg-slate-100 text-slate-700 rounded-bl-sm'
              }`}
            >
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

      {/* Input */}
      <div className="p-3 border-t border-slate-200">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Ask about your calendar…"
            className="text-sm h-9"
            disabled={loading}
          />
          <Button size="sm" onClick={handleSend} disabled={loading || !input.trim()} className="h-9 w-9 p-0 shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] text-slate-300 mt-1.5 text-center">Powered by Claude AI</p>
      </div>
    </div>
  );
}
