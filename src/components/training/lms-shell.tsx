'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2, Award, AlertCircle, Clock, Play,
  GraduationCap, ShieldCheck, Settings2,
  Loader2, ChevronRight, Star, Calendar, Download,
  RefreshCw, Trophy, BookOpen, Video, FileText, Link2,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CourseViewer } from './course-viewer';
import { AdminLMS } from './admin-lms';
import { CertViewModal } from './cert-view-modal';
import {
  getMyLearningData, enrollInCourse, enrollInLearningPath,
  getCourseForViewing, generateCertificate,
  type LMSCourse, type CourseEnrollment, type LMSCertificate,
  type LearningPath,
} from '@/lib/actions/training';

// ── Helpers ───────────────────────────────────────────────────

function formatDate(iso: string | null, fallback = '—') {
  if (!iso) return fallback;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function isOverdue(e: CourseEnrollment): boolean {
  return !e.completed_at && !!e.due_date && new Date(e.due_date) < new Date();
}

// Role-based category tabs
const ROLE_TABS = [
  { id: 'all',            label: 'All Courses' },
  { id: 'reception',      label: 'Reception' },
  { id: 'va',             label: 'Veterinary Assistants' },
  { id: 'doctors',        label: 'Doctors' },
  { id: 'emergency',      label: 'Emergency Staff' },
  { id: 'managers',       label: 'Managers' },
];

const CATEGORY_COLORS: Record<string, string> = {
  compliance: '#ef4444', osha: '#ef4444', safety: '#f97316', cpr: '#f59e0b',
  clinical:   '#3b82f6', onboarding: '#8b5cf6', leadership: '#6366f1',
  hr:         '#ec4899', operations: '#10b981', reception: '#06b6d4',
  emergency:  '#ef4444', doctors: '#3b82f6', managers: '#8b5cf6',
};

function courseColor(course: LMSCourse): string {
  return CATEGORY_COLORS[course.category?.toLowerCase() ?? ''] ?? course.cover_color ?? '#f97316';
}

// ── Progress Hero Card ────────────────────────────────────────

function ProgressHero({ avg, active, completed, certs }: {
  avg: number; active: number; completed: number; certs: number;
}) {
  return (
    <div className="rounded-2xl overflow-hidden shrink-0" style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #16304f 100%)' }}>
      <div className="px-7 py-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <p className="text-white/60 text-[12px] font-semibold uppercase tracking-widest mb-1">Your Training Progress</p>
            <p className="text-white text-[15px] font-medium mb-5">
              {avg >= 80 ? 'Excellent work! Keep it up.' : avg >= 50 ? 'Keep up the great work!' : 'You\'re making progress!'}
            </p>
            <div className="h-2.5 bg-white/20 rounded-full overflow-hidden max-w-xl">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${avg}%`, background: 'linear-gradient(90deg, #f97316, #fb923c)' }}
              />
            </div>
            <div className="flex items-center gap-6 mt-4">
              <span className="text-white/70 text-[12px]"><span className="text-white font-bold">{active}</span> In Progress</span>
              <span className="text-white/70 text-[12px]"><span className="text-white font-bold">{completed}</span> Completed</span>
              <span className="text-white/70 text-[12px]"><span className="text-white font-bold">{certs}</span> Certificates</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[48px] font-extrabold text-white leading-none">{avg}<span className="text-[28px] text-white/60">%</span></p>
            <p className="text-white/50 text-[12px] font-semibold uppercase tracking-wider mt-1">Overall Completion</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Continue Learning Card (expanded module list) ─────────────

function ContinueLearningCard({
  course, enrollment, fullCourse, onOpen, onLoadModules, loadingModules,
}: {
  course: LMSCourse;
  enrollment: CourseEnrollment;
  fullCourse: LMSCourse | null;
  onOpen: (courseId: string) => void;
  onLoadModules: (courseId: string) => void;
  loadingModules: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const color   = courseColor(course);
  const modules = (fullCourse as any)?.modules ?? [];

  const handleToggle = () => {
    if (!expanded && !fullCourse) onLoadModules(course.id);
    setExpanded(v => !v);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Card header */}
      <div
        className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 cursor-pointer"
        onClick={handleToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {course.is_required && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border"
                style={{ color, borderColor: `${color}40`, backgroundColor: `${color}12` }}>
                Required
              </span>
            )}
          </div>
          <h3 className="text-[18px] font-bold text-slate-900 leading-tight">{course.title}</h3>
          {course.description && (
            <p className="text-[13px] text-slate-500 mt-1">{course.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-[12px] text-slate-400">
            <span className="flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" />{(fullCourse as any)?.modules?.length ?? course.module_count ?? '–'} modules</span>
            <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{course.estimated_hours}h</span>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          <div className="text-right">
            <p className="text-[13px] font-bold text-slate-800">{enrollment.progress_pct}%</p>
            <p className="text-[11px] text-slate-400">complete</p>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-6 pb-1">
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${enrollment.progress_pct}%`, backgroundColor: color }} />
        </div>
      </div>

      {/* Module list */}
      {expanded && (
        <div className="px-4 pb-4 pt-3 space-y-2">
          {loadingModules && !fullCourse ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : modules.length > 0 ? (
            modules.map((mod: any, idx: number) => {
              const isCompleted = (mod.completions?.length ?? 0) > 0;
              const isCurrent   = !isCompleted && modules.slice(0, idx).every((m: any) => (m.completions?.length ?? 0) > 0);
              return (
                <div key={mod.id}
                  className={cn(
                    'flex items-center gap-4 px-4 py-3.5 rounded-xl transition-colors',
                    isCurrent ? 'bg-slate-50 border border-slate-200' : 'bg-white hover:bg-slate-50/50',
                  )}
                >
                  {/* Status icon */}
                  <div className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2',
                    isCompleted
                      ? 'bg-emerald-500 border-emerald-500'
                      : isCurrent
                        ? 'border-slate-300 bg-white'
                        : 'border-slate-200 bg-white',
                  )}>
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5 text-white" />
                    ) : (
                      <Play className={cn('h-4 w-4', isCurrent ? 'text-slate-600' : 'text-slate-300')} />
                    )}
                  </div>

                  {/* Module info */}
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-[14px] font-semibold leading-tight',
                      isCompleted ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-800'
                    )}>
                      {mod.title}
                    </p>
                    <p className="text-[12px] text-slate-400 mt-0.5">{mod.duration_minutes} min</p>
                  </div>

                  {/* CTA */}
                  {isCurrent && (
                    <button
                      onClick={() => onOpen(course.id)}
                      className="shrink-0 px-5 py-2 rounded-xl text-[13px] font-bold text-white transition-all"
                      style={{ backgroundColor: '#1e3a5f' }}
                    >
                      Continue
                    </button>
                  )}
                  {!isCompleted && !isCurrent && idx > 0 && (
                    <button
                      onClick={() => onOpen(course.id)}
                      className="shrink-0 px-5 py-2 rounded-xl text-[13px] font-bold text-white transition-all"
                      style={{ backgroundColor: '#1e3a5f' }}
                    >
                      Start
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="flex justify-center py-4">
              <button
                onClick={() => onOpen(course.id)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[14px] font-bold text-white transition-all"
                style={{ backgroundColor: color }}
              >
                <Play className="h-4 w-4" />
                {enrollment.progress_pct > 0 ? 'Continue Course' : 'Start Course'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Course Grid Card ──────────────────────────────────────────

function CourseCard({
  course, enrollment, onOpen, onEnroll, enrolling,
}: {
  course: LMSCourse;
  enrollment?: CourseEnrollment | null;
  onOpen: (id: string) => void;
  onEnroll: (id: string) => void;
  enrolling?: boolean;
}) {
  const color    = courseColor(course);
  const done     = !!enrollment?.completed_at;
  const progress = enrollment?.progress_pct ?? 0;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-4 hover:shadow-md transition-shadow cursor-pointer group"
      onClick={() => enrollment ? onOpen(course.id) : onEnroll(course.id)}>

      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}18` }}>
          <GraduationCap className="h-6 w-6" style={{ color }} />
        </div>
        {course.is_required && (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
            style={{ color, backgroundColor: `${color}12`, border: `1px solid ${color}30` }}>
            Required
          </span>
        )}
        {done && (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            Completed
          </span>
        )}
      </div>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <h3 className="text-[15px] font-bold text-slate-900 leading-snug line-clamp-2 group-hover:text-[#1e3a5f] transition-colors">
          {course.title}
        </h3>
        <div className="flex items-center gap-3 mt-1.5 text-[12px] text-slate-400">
          <span>{(course as any).module_count ?? '–'} modules</span>
          <span>·</span>
          <span>{course.estimated_hours}h</span>
        </div>
      </div>

      {/* Progress */}
      {enrollment && !done && (
        <div>
          <div className="flex items-center justify-between text-[12px] mb-1.5">
            <span className="text-slate-500 font-medium">Progress</span>
            <span className="font-bold text-slate-700">{progress}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: color }} />
          </div>
        </div>
      )}
      {done && (
        <div>
          <div className="flex items-center justify-between text-[12px] mb-1.5">
            <span className="text-slate-500 font-medium">Progress</span>
            <span className="font-bold text-emerald-600">100%</span>
          </div>
          <div className="h-2 bg-emerald-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 w-full" />
          </div>
        </div>
      )}
      {!enrollment && (
        <button
          onClick={e => { e.stopPropagation(); onEnroll(course.id); }}
          disabled={enrolling}
          className="w-full flex items-center justify-center gap-2 h-9 rounded-xl text-[13px] font-bold text-white transition-all disabled:opacity-60"
          style={{ backgroundColor: color }}
        >
          {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Start Course
        </button>
      )}
    </div>
  );
}

// ── Certificate Card ──────────────────────────────────────────

function CertCard({ cert, onView }: { cert: LMSCertificate; onView: (id: string) => void }) {
  const expired   = cert.expires_at && new Date(cert.expires_at) < new Date();
  const expiresIn = cert.expires_at ? daysUntil(cert.expires_at) : null;
  return (
    <div className={cn('bg-white rounded-2xl border p-4 flex items-start gap-4 shadow-sm',
      expired ? 'border-red-200' : expiresIn !== null && expiresIn <= 30 ? 'border-amber-200' : 'border-slate-200')}>
      <div className="h-12 w-12 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
        <Award className="h-6 w-6 text-amber-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-slate-900">{(cert.course as any)?.title ?? 'Certificate'}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">Issued {formatDate(cert.issued_at)}{cert.cert_number && ` · ${cert.cert_number}`}</p>
        {cert.expires_at && (
          <p className={cn('text-[11px] mt-1 flex items-center gap-1',
            expired ? 'text-red-500' : expiresIn !== null && expiresIn <= 30 ? 'text-amber-500' : 'text-slate-400')}>
            <Clock className="h-3 w-3" />
            {expired ? 'Expired' : `Expires ${formatDate(cert.expires_at)}`}
          </p>
        )}
      </div>
      <button onClick={() => onView(cert.id)}
        className="shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 text-[12px] font-semibold transition-colors border border-amber-100">
        <Download className="h-3.5 w-3.5" /> View
      </button>
    </div>
  );
}

// ── Main Shell ────────────────────────────────────────────────

interface LMSShellProps {
  userId: string;
  orgId: string;
  isAdmin: boolean;
  hospitals: Array<{ id: string; name: string; color: string | null }>;
}

type ActiveView = 'home' | 'certifications' | 'compliance' | 'admin';

export function LMSShell({ userId, orgId, isAdmin, hospitals }: LMSShellProps) {
  const [loading, setLoading]           = useState(true);
  const [enrolling, setEnrolling]       = useState<Set<string>>(new Set());
  const [activeView, setActiveView]     = useState<ActiveView>('home');
  const [activeRole, setActiveRole]     = useState('all');

  const [enrollments, setEnrollments]   = useState<CourseEnrollment[]>([]);
  const [courses, setCourses]           = useState<Record<string, LMSCourse>>({});
  const [certificates, setCertificates] = useState<LMSCertificate[]>([]);
  const [assignments, setAssignments]   = useState<any[]>([]);

  // Continue Learning: full course with modules for the first in-progress course
  const [continueFullCourse, setContinueFullCourse]   = useState<LMSCourse | null>(null);
  const [loadingModules, setLoadingModules]           = useState(false);

  const [viewingCourse, setViewingCourse] = useState<LMSCourse | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const result = await getMyLearningData();
    if (result.success) {
      setEnrollments(result.data.enrollments);
      setCourses(result.data.courses);
      setCertificates(result.data.certificates);
      setAssignments(result.data.assignments);
    }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-load modules for the first in-progress course
  const activeCourses    = enrollments.filter(e => !e.completed_at);
  const completedCourses = enrollments.filter(e => e.completed_at);
  const overdueItems     = activeCourses.filter(e => isOverdue(e));
  const complianceCourses = enrollments.filter(e => courses[e.course_id]?.compliance_type);

  const firstActive = activeCourses[0];

  useEffect(() => {
    if (!firstActive || continueFullCourse?.id === firstActive.course_id) return;
    setContinueFullCourse(null);
    setLoadingModules(true);
    getCourseForViewing(firstActive.course_id).then(r => {
      if (r.success) setContinueFullCourse(r.data);
      setLoadingModules(false);
    });
  }, [firstActive?.course_id]);

  const loadModules = async (courseId: string) => {
    setLoadingModules(true);
    const r = await getCourseForViewing(courseId);
    if (r.success) setContinueFullCourse(r.data);
    setLoadingModules(false);
  };

  const stats = {
    active:    activeCourses.length,
    completed: completedCourses.length,
    certs:     certificates.length,
    overdue:   overdueItems.length,
    avg: enrollments.length > 0
      ? Math.round(enrollments.reduce((s, e) => s + e.progress_pct, 0) / enrollments.length)
      : 0,
  };

  const openCourse = async (courseId: string) => {
    setViewerLoading(true);
    const r = await getCourseForViewing(courseId);
    if (r.success) setViewingCourse(r.data);
    setViewerLoading(false);
  };

  const handleEnroll = async (courseId: string) => {
    setEnrolling(prev => new Set(prev).add(courseId));
    const r = await enrollInCourse(courseId);
    if (r.success) {
      setEnrollments(prev => prev.find(e => e.course_id === courseId) ? prev : [...prev, r.data]);
      await openCourse(courseId);
    }
    setEnrolling(prev => { const n = new Set(prev); n.delete(courseId); return n; });
  };

  const [viewingCertId, setViewingCertId] = useState<string | null>(null);
  const viewCert = (certId: string) => setViewingCertId(certId);

  // Filter courses by role tab
  const allCourseList = Object.values(courses);
  const filteredCourses = activeRole === 'all'
    ? allCourseList
    : allCourseList.filter(c => {
        const cat = (c.category ?? '').toLowerCase();
        const rt  = ((c as any).role_target ?? '').toLowerCase();
        if (activeRole === 'reception')  return cat.includes('reception') || rt.includes('reception') || rt.includes('csr');
        if (activeRole === 'va')         return cat.includes('clinical') || cat.includes('onboarding') || rt.includes('va') || rt.includes('assistant');
        if (activeRole === 'doctors')    return cat.includes('clinical') || rt.includes('doctor') || rt.includes('vet');
        if (activeRole === 'emergency')  return cat.includes('emergency') || cat.includes('safety') || cat.includes('cpr') || rt.includes('emergency');
        if (activeRole === 'managers')   return cat.includes('leadership') || cat.includes('operations') || rt.includes('manager');
        return true;
      });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        <p className="text-[14px] text-slate-500">Loading your training dashboard…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">

      {/* ── Top navigation pills ─────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-1 px-6 py-3 border-b border-slate-100 bg-white overflow-x-auto">
        {[
          { id: 'home',           label: 'My Learning' },
          { id: 'certifications', label: 'Certifications', badge: stats.certs },
          { id: 'compliance',     label: 'Compliance', badge: overdueItems.length || undefined, badgeRed: true },
          ...(isAdmin ? [{ id: 'admin', label: 'Admin Dashboard' }] : []),
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id as ActiveView)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-all',
              activeView === tab.id
                ? 'bg-[#1e3a5f] text-white'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100',
            )}
          >
            {tab.label}
            {(tab as any).badge != null && (tab as any).badge > 0 && (
              <span className={cn('text-[10px] font-bold rounded-full px-1.5 py-0.5',
                (tab as any).badgeRed ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600')}>
                {(tab as any).badge}
              </span>
            )}
          </button>
        ))}

        {/* Add Course shortcut for admins */}
        {isAdmin && (
          <button
            onClick={() => setActiveView('admin')}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold bg-orange-500 hover:bg-orange-600 text-white transition-all whitespace-nowrap shrink-0"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Add Course
          </button>
        )}
      </div>

      {/* ── Content ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-7">

          {/* ── HOME VIEW ────────────────────────────────────── */}
          {activeView === 'home' && (
            <>
              {/* Progress hero */}
              <ProgressHero
                avg={stats.avg}
                active={stats.active}
                completed={stats.completed}
                certs={stats.certs}
              />

              {/* Overdue alert */}
              {overdueItems.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[13px] font-bold text-red-700">{overdueItems.length} overdue course{overdueItems.length !== 1 ? 's' : ''}</p>
                    <p className="text-[12px] text-red-500 mt-0.5">
                      {overdueItems.map(e => courses[e.course_id]?.title).filter(Boolean).join(', ')}
                    </p>
                  </div>
                </div>
              )}

              {/* Role filter pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {ROLE_TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveRole(tab.id)}
                    className={cn(
                      'px-4 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap border transition-all',
                      activeRole === tab.id
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-800',
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Continue Learning */}
              {firstActive && courses[firstActive.course_id] && (
                <div>
                  <h2 className="text-[17px] font-bold text-slate-900 mb-3">Continue Learning</h2>
                  <ContinueLearningCard
                    course={courses[firstActive.course_id]}
                    enrollment={firstActive}
                    fullCourse={continueFullCourse}
                    onOpen={openCourse}
                    onLoadModules={loadModules}
                    loadingModules={loadingModules}
                  />
                </div>
              )}

              {/* All Courses grid */}
              {filteredCourses.length > 0 ? (
                <div>
                  <h2 className="text-[17px] font-bold text-slate-900 mb-3">All Courses</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredCourses.map(course => (
                      <CourseCard
                        key={course.id}
                        course={course}
                        enrollment={enrollments.find(e => e.course_id === course.id) ?? null}
                        onOpen={openCourse}
                        onEnroll={handleEnroll}
                        enrolling={enrolling.has(course.id)}
                      />
                    ))}
                  </div>
                </div>
              ) : enrollments.length === 0 ? (
                <div className="text-center py-20">
                  <GraduationCap className="h-16 w-16 text-slate-200 mx-auto mb-4" />
                  <p className="text-[16px] font-semibold text-slate-600">No courses yet</p>
                  <p className="text-[13px] text-slate-400 mt-1">Ask your manager to assign training, or enrol from Learning Paths</p>
                </div>
              ) : null}
            </>
          )}

          {/* ── CERTIFICATIONS ───────────────────────────────── */}
          {activeView === 'certifications' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[17px] font-bold text-slate-900">My Certifications</h2>
                <p className="text-[12px] text-slate-400">{certificates.length} certificate{certificates.length !== 1 ? 's' : ''}</p>
              </div>
              {certificates.length === 0 ? (
                <div className="text-center py-20">
                  <Award className="h-16 w-16 text-slate-200 mx-auto mb-4" />
                  <p className="text-[15px] font-semibold text-slate-600">No certificates yet</p>
                  <p className="text-[13px] text-slate-400 mt-1">Complete a course to earn your first certificate</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {certificates.map(cert => <CertCard key={cert.id} cert={cert} onView={viewCert} />)}
                </div>
              )}
            </div>
          )}

          {/* ── COMPLIANCE ───────────────────────────────────── */}
          {activeView === 'compliance' && (
            <div className="space-y-4">
              <h2 className="text-[17px] font-bold text-slate-900">Compliance Training</h2>
              {complianceCourses.length === 0 ? (
                <div className="text-center py-20">
                  <ShieldCheck className="h-16 w-16 text-slate-200 mx-auto mb-4" />
                  <p className="text-[15px] font-semibold text-slate-600">No compliance courses assigned</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        {['Course', 'Type', 'Due Date', 'Completed', 'Status', ''].map(h => (
                          <th key={h} className="text-left text-[11px] font-bold uppercase tracking-widest text-slate-400 px-4 py-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {complianceCourses.map(e => {
                        const course  = courses[e.course_id];
                        const overdue = isOverdue(e);
                        const cert    = certificates.find(c => c.course_id === e.course_id);
                        return (
                          <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50/50 last:border-0">
                            <td className="px-4 py-3 text-[13px] font-medium text-slate-900">{course?.title ?? '—'}</td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-100 rounded-full px-2 py-0.5">
                                <ShieldCheck className="h-3 w-3" />{course?.compliance_type ?? '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[12px] text-slate-500">{formatDate(e.due_date)}</td>
                            <td className="px-4 py-3 text-[12px] text-slate-500">{formatDate(e.completed_at)}</td>
                            <td className="px-4 py-3">
                              {e.completed_at ? (
                                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 border border-emerald-100">
                                  <CheckCircle2 className="h-3 w-3" /> Complete
                                </span>
                              ) : overdue ? (
                                <span className="inline-flex items-center gap-1 text-[11px] text-red-700 bg-red-50 rounded-full px-2 py-0.5 border border-red-100">
                                  <AlertCircle className="h-3 w-3" /> Overdue
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 rounded-full px-2 py-0.5 border border-amber-100">
                                  <Clock className="h-3 w-3" /> In Progress
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {cert ? (
                                <button onClick={() => viewCert(cert.id)} className="text-[11px] text-amber-600 hover:text-amber-700 flex items-center gap-1 ml-auto">
                                  <Award className="h-3 w-3" /> Cert
                                </button>
                              ) : (
                                <button onClick={() => openCourse(e.course_id)} className="text-[11px] text-orange-600 hover:text-orange-700 flex items-center gap-1 ml-auto">
                                  <Play className="h-3 w-3" /> {e.progress_pct > 0 ? 'Continue' : 'Start'}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── ADMIN ────────────────────────────────────────── */}
          {activeView === 'admin' && isAdmin && (
            <AdminLMS orgId={orgId} hospitals={hospitals} />
          )}

        </div>
      </div>

      {/* ── Course Viewer Overlay ────────────────────────────── */}
      {viewerLoading && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-8 flex items-center gap-4 shadow-xl">
            <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
            <p className="text-[15px] font-medium text-slate-700">Loading course…</p>
          </div>
        </div>
      )}

      {viewingCourse && (
        <CourseViewer
          course={viewingCourse}
          userId={userId}
          onClose={() => { setViewingCourse(null); loadData(); }}
          onProgressUpdate={() => loadData(true)}
        />
      )}

      {viewingCertId && (
        <CertViewModal certId={viewingCertId} onClose={() => setViewingCertId(null)} />
      )}
    </div>
  );
}
