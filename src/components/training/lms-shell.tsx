'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, CheckCircle2, Award, AlertCircle, Clock, Play,
  GraduationCap, ShieldCheck, Route, BarChart3, Settings2,
  Loader2, ChevronRight, Star, Calendar, Download, Lock,
  RefreshCw, Trophy, Users, FileText, Video, Link2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CourseViewer } from './course-viewer';
import { AdminLMS } from './admin-lms';
import {
  getMyLearningData, enrollInCourse, enrollInLearningPath,
  getCourseForViewing, generateCertificate,
  type LMSCourse, type CourseEnrollment, type LMSCertificate,
  type LearningPath,
} from '@/lib/actions/training';

// ─────────────────────────────────────────────────────────────
// Types & Constants
// ─────────────────────────────────────────────────────────────

type Tab = 'my-learning' | 'assigned' | 'completed' | 'certifications' | 'compliance' | 'paths' | 'admin';

const COMPLIANCE_TYPES = ['OSHA', 'CPR', 'Safety', 'Hospital Compliance', 'HIPAA', 'Fire Safety'];

const CATEGORY_COLORS: Record<string, string> = {
  compliance: '#ef4444', osha: '#ef4444', safety: '#f97316', cpr: '#f59e0b',
  clinical: '#3b82f6', onboarding: '#8b5cf6', leadership: '#6366f1',
  hr: '#ec4899', operations: '#10b981',
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatDate(iso: string | null, fallback = '—') {
  if (!iso) return fallback;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function isOverdue(enrollment: CourseEnrollment): boolean {
  return !enrollment.completed_at && !!enrollment.due_date && new Date(enrollment.due_date) < new Date();
}

function contentTypeIcon(type: string) {
  const cls = 'h-3.5 w-3.5';
  if (type === 'video')   return <Video   className={cls} />;
  if (type === 'pdf')     return <FileText className={cls} />;
  if (type === 'link')    return <Link2    className={cls} />;
  return <FileText className={cls} />;
}

// ─────────────────────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color, sub }: {
  label: string; value: number | string; icon: React.ReactNode; color: string; sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
      <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center shrink-0', color)}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        <p className="text-[12px] text-gray-500">{label}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Course Card (user-facing)
// ─────────────────────────────────────────────────────────────

function CourseCard({
  course, enrollment, onOpen, onEnroll, loading,
}: {
  course: LMSCourse;
  enrollment?: CourseEnrollment | null;
  onOpen: (courseId: string) => void;
  onEnroll: (courseId: string) => void;
  loading?: boolean;
}) {
  const overdue   = enrollment ? isOverdue(enrollment) : false;
  const done      = !!enrollment?.completed_at;
  const progress  = enrollment?.progress_pct ?? 0;
  const dueIn     = enrollment?.due_date ? daysUntil(enrollment.due_date) : null;

  const categoryColor = CATEGORY_COLORS[course.category?.toLowerCase() ?? ''] ?? course.cover_color ?? '#f97316';

  return (
    <div className={cn(
      'bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow',
      overdue ? 'border-red-200' : done ? 'border-green-200' : 'border-gray-100',
    )}>
      {/* Color strip */}
      <div className="h-1.5 w-full" style={{ backgroundColor: categoryColor }} />

      <div className="p-4 flex-1 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div
            className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${categoryColor}20` }}
          >
            <GraduationCap className="h-5 w-5" style={{ color: categoryColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-semibold text-gray-900 leading-tight line-clamp-2">
              {course.title}
            </h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {course.category && (
                <span className="text-[11px] text-gray-500 capitalize">{course.category}</span>
              )}
              {course.level && (
                <span className="text-[11px] text-gray-400">· {course.level}</span>
              )}
              {course.estimated_hours > 0 && (
                <span className="text-[11px] text-gray-400">· {course.estimated_hours}h</span>
              )}
            </div>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          {course.is_required && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-red-50 text-red-600 border border-red-100 rounded-full px-2 py-0.5">
              <Star className="h-2.5 w-2.5" /> Required
            </span>
          )}
          {course.compliance_type && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-100 rounded-full px-2 py-0.5">
              <ShieldCheck className="h-2.5 w-2.5" /> {course.compliance_type}
            </span>
          )}
          {done && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-green-50 text-green-600 border border-green-100 rounded-full px-2 py-0.5">
              <CheckCircle2 className="h-2.5 w-2.5" /> Completed
            </span>
          )}
          {overdue && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-red-50 text-red-600 border border-red-100 rounded-full px-2 py-0.5">
              <AlertCircle className="h-2.5 w-2.5" /> Overdue
            </span>
          )}
        </div>

        {/* Progress */}
        {enrollment && !done && (
          <div>
            <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1.5">
              <span>{progress}% complete</span>
              {enrollment.due_date && (
                <span className={cn('flex items-center gap-1', overdue ? 'text-red-500' : dueIn !== null && dueIn <= 7 ? 'text-amber-500' : '')}>
                  <Calendar className="h-3 w-3" />
                  {overdue ? 'Overdue' : `Due in ${dueIn}d`}
                </span>
              )}
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', overdue ? 'bg-red-400' : 'bg-orange-400')}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {done && enrollment?.completed_at && (
          <p className="text-[11px] text-gray-400 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            Completed {formatDate(enrollment.completed_at)}
          </p>
        )}

        {/* CTA */}
        <div className="mt-auto">
          {!enrollment ? (
            <button
              onClick={() => onEnroll(course.id)}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 h-8 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium transition-colors disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Start Course
            </button>
          ) : done ? (
            <button
              onClick={() => onOpen(course.id)}
              className="w-full flex items-center justify-center gap-2 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-[13px] font-medium transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Review Course
            </button>
          ) : (
            <button
              onClick={() => onOpen(course.id)}
              className="w-full flex items-center justify-center gap-2 h-8 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium transition-colors"
            >
              <Play className="h-3.5 w-3.5" />
              {progress > 0 ? 'Continue' : 'Start'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Certificate Card
// ─────────────────────────────────────────────────────────────

function CertCard({ cert, onView }: { cert: LMSCertificate; onView: (certId: string) => void }) {
  const expired = cert.expires_at && new Date(cert.expires_at) < new Date();
  const expiresIn = cert.expires_at ? daysUntil(cert.expires_at) : null;

  return (
    <div className={cn(
      'bg-white rounded-xl border p-4 flex items-start gap-4 shadow-sm',
      expired ? 'border-red-200' : expiresIn !== null && expiresIn <= 30 ? 'border-amber-200' : 'border-gray-100',
    )}>
      <div className="h-12 w-12 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
        <Award className="h-6 w-6 text-amber-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-gray-900 leading-tight">
          {(cert.course as any)?.title ?? 'Certificate'}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Issued {formatDate(cert.issued_at)}
          {cert.cert_number && ` · ${cert.cert_number}`}
        </p>
        {cert.expires_at && (
          <p className={cn(
            'text-[11px] mt-1 flex items-center gap-1',
            expired ? 'text-red-500' : expiresIn !== null && expiresIn <= 30 ? 'text-amber-500' : 'text-gray-400',
          )}>
            <Clock className="h-3 w-3" />
            {expired ? 'Expired' : `Expires ${formatDate(cert.expires_at)}`}
            {!expired && expiresIn !== null && expiresIn <= 30 && ` (${expiresIn} days)`}
          </p>
        )}
      </div>
      <button
        onClick={() => onView(cert.id)}
        className="shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-[12px] font-medium transition-colors border border-amber-100"
      >
        <Download className="h-3.5 w-3.5" />
        View
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Learning Path Card
// ─────────────────────────────────────────────────────────────

function PathCard({
  path, onEnroll, enrolling,
}: {
  path: LearningPath;
  onEnroll: (pathId: string) => void;
  enrolling?: boolean;
}) {
  const enrolled = !!path.enrollment;
  const done     = !!path.enrollment?.completed_at;
  const progress = path.enrollment?.progress_pct ?? 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
      <div className="h-2 w-full" style={{ backgroundColor: path.cover_color }} />
      <div className="p-4 flex-1 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div
            className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${path.cover_color}20` }}
          >
            <Route className="h-5 w-5" style={{ color: path.cover_color }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-semibold text-gray-900 leading-tight">{path.title}</h3>
            {path.description && (
              <p className="text-[12px] text-gray-500 mt-0.5 line-clamp-2">{path.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-[12px] text-gray-500">
          <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" /> {path.course_count} courses</span>
          {path.role_target && <span className="capitalize text-gray-400">· {path.role_target}</span>}
        </div>

        {enrolled && !done && (
          <div>
            <div className="flex justify-between text-[11px] text-gray-400 mb-1.5">
              <span>{progress}% complete</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-indigo-400 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {done && <p className="text-[11px] text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Path Completed</p>}

        <div className="mt-auto">
          {!enrolled ? (
            <button
              onClick={() => onEnroll(path.id)}
              disabled={enrolling}
              className="w-full h-8 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-[13px] font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {enrolling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Enroll in Path
            </button>
          ) : (
            <button className="w-full h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-[13px] font-medium transition-colors">
              View Progress
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Shell
// ─────────────────────────────────────────────────────────────

interface LMSShellProps {
  userId: string;
  orgId: string;
  isAdmin: boolean;
  hospitals: Array<{ id: string; name: string; color: string | null }>;
}

export function LMSShell({ userId, orgId, isAdmin, hospitals }: LMSShellProps) {
  const [activeTab, setActiveTab] = useState<Tab>('my-learning');
  const [loading, setLoading]     = useState(true);
  const [enrolling, setEnrolling] = useState<Set<string>>(new Set());

  // Data state
  const [enrollments, setEnrollments]       = useState<CourseEnrollment[]>([]);
  const [courses, setCourses]               = useState<Record<string, LMSCourse>>({});
  const [certificates, setCertificates]     = useState<LMSCertificate[]>([]);
  const [assignments, setAssignments]       = useState<any[]>([]);
  const [learningPaths, setLearningPaths]   = useState<LearningPath[]>([]);

  // Viewer state
  const [viewingCourse, setViewingCourse]   = useState<LMSCourse | null>(null);
  const [viewerLoading, setViewerLoading]   = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const result = await getMyLearningData();
    if (result.success) {
      setEnrollments(result.data.enrollments);
      setCourses(result.data.courses);
      setCertificates(result.data.certificates);
      setAssignments(result.data.assignments);
      setLearningPaths(result.data.learningPaths);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Derived data
  const enrollmentMap = Object.fromEntries(enrollments.map(e => [e.course_id, e]));

  const activeCourses    = enrollments.filter(e => !e.completed_at);
  const completedCourses = enrollments.filter(e => e.completed_at);
  const overdueItems     = activeCourses.filter(e => isOverdue(e));
  const complianceCourses = enrollments.filter(e => courses[e.course_id]?.compliance_type);

  // Stats
  const stats = {
    enrolled:  enrollments.length,
    active:    activeCourses.length,
    completed: completedCourses.length,
    certs:     certificates.length,
    overdue:   overdueItems.length,
    avg:       activeCourses.length > 0
      ? Math.round(activeCourses.reduce((s, e) => s + e.progress_pct, 0) / activeCourses.length)
      : 0,
  };

  // Open course viewer
  const openCourse = async (courseId: string) => {
    setViewerLoading(true);
    const result = await getCourseForViewing(courseId);
    if (result.success) setViewingCourse(result.data);
    setViewerLoading(false);
  };

  // Enroll in course
  const handleEnroll = async (courseId: string) => {
    setEnrolling(prev => new Set(prev).add(courseId));
    const result = await enrollInCourse(courseId);
    if (result.success) {
      setEnrollments(prev => {
        const exists = prev.find(e => e.course_id === courseId);
        return exists ? prev : [...prev, result.data];
      });
      await openCourse(courseId);
    }
    setEnrolling(prev => { const n = new Set(prev); n.delete(courseId); return n; });
  };

  // Enroll in learning path
  const handlePathEnroll = async (pathId: string) => {
    const result = await enrollInLearningPath(pathId);
    if (result.success) {
      setLearningPaths(prev => prev.map(p =>
        p.id === pathId ? { ...p, enrollment: { id: '', progress_pct: 0, completed_at: null, enrolled_at: new Date().toISOString() } } : p
      ));
    }
  };

  // Certificate view
  const viewCertificate = (certId: string) => {
    window.open(`/training/certificate/${certId}`, '_blank');
  };

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; badge?: number; adminOnly?: boolean }> = [
    { id: 'my-learning',     label: 'My Learning',    icon: <BookOpen   className="h-4 w-4" />, badge: stats.active    },
    { id: 'assigned',        label: 'Assigned',        icon: <Calendar   className="h-4 w-4" />, badge: assignments.length },
    { id: 'completed',       label: 'Completed',       icon: <CheckCircle2 className="h-4 w-4" /> },
    { id: 'certifications',  label: 'Certifications',  icon: <Award      className="h-4 w-4" />, badge: stats.certs    },
    { id: 'compliance',      label: 'Compliance',      icon: <ShieldCheck className="h-4 w-4" />, badge: overdueItems.length || undefined },
    { id: 'paths',           label: 'Learning Paths',  icon: <Route      className="h-4 w-4" /> },
    ...(isAdmin ? [{ id: 'admin' as Tab, label: 'Admin',  icon: <Settings2 className="h-4 w-4" />, adminOnly: true }] : []),
  ];

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-3 py-24">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        <p className="text-[14px] text-gray-500">Loading your learning dashboard…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Tab Bar ── */}
      <div className="flex items-center gap-1 px-6 border-b border-gray-200 bg-white shrink-0 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-3 py-3.5 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200',
              tab.adminOnly && 'ml-auto',
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span className={cn(
                'text-[10px] font-bold rounded-full min-w-4.5 h-4.5 flex items-center justify-center px-1',
                tab.id === 'compliance' && overdueItems.length > 0
                  ? 'bg-red-100 text-red-600'
                  : 'bg-orange-100 text-orange-600',
              )}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-6">

          {/* MY LEARNING */}
          {activeTab === 'my-learning' && (
            <div className="space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="In Progress"  value={stats.active}    icon={<Play className="h-5 w-5 text-orange-600" />}  color="bg-orange-50"  />
                <StatCard label="Completed"    value={stats.completed} icon={<Trophy className="h-5 w-5 text-green-600" />} color="bg-green-50"   />
                <StatCard label="Certificates" value={stats.certs}     icon={<Award className="h-5 w-5 text-amber-600" />}  color="bg-amber-50"   />
                <StatCard label="Overdue"      value={stats.overdue}   icon={<AlertCircle className="h-5 w-5 text-red-600" />} color="bg-red-50"  />
              </div>

              {/* Overall progress */}
              {activeCourses.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[13px] font-semibold text-gray-700">Overall Learning Progress</p>
                    <p className="text-[13px] font-bold text-orange-600">{stats.avg}%</p>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-orange-400 to-amber-400 rounded-full transition-all" style={{ width: `${stats.avg}%` }} />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5">{activeCourses.length} course{activeCourses.length !== 1 ? 's' : ''} in progress</p>
                </div>
              )}

              {/* Overdue alert */}
              {overdueItems.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[13px] font-semibold text-red-700">
                      {overdueItems.length} overdue course{overdueItems.length !== 1 ? 's' : ''}
                    </p>
                    <p className="text-[12px] text-red-600 mt-0.5">
                      {overdueItems.map(e => courses[e.course_id]?.title).filter(Boolean).join(', ')}
                    </p>
                  </div>
                </div>
              )}

              {/* Active courses */}
              {activeCourses.length === 0 && completedCourses.length === 0 ? (
                <div className="text-center py-20">
                  <GraduationCap className="h-16 w-16 text-gray-200 mx-auto mb-4" />
                  <p className="text-[16px] font-semibold text-gray-700">No courses yet</p>
                  <p className="text-[13px] text-gray-400 mt-1">Check the Assigned tab or browse Learning Paths to get started</p>
                </div>
              ) : (
                <>
                  {activeCourses.length > 0 && (
                    <div>
                      <h3 className="text-[13px] font-bold uppercase tracking-widest text-gray-400 mb-3">Continue Learning</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {activeCourses.map(e => (
                          <CourseCard
                            key={e.id}
                            course={courses[e.course_id] ?? ({ id: e.course_id, title: 'Loading…' } as any)}
                            enrollment={e}
                            onOpen={openCourse}
                            onEnroll={handleEnroll}
                            loading={enrolling.has(e.course_id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {completedCourses.length > 0 && (
                    <div>
                      <h3 className="text-[13px] font-bold uppercase tracking-widest text-gray-400 mb-3">Recently Completed</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {completedCourses.slice(0, 6).map(e => (
                          <CourseCard
                            key={e.id}
                            course={courses[e.course_id] ?? ({ id: e.course_id, title: 'Loading…' } as any)}
                            enrollment={e}
                            onOpen={openCourse}
                            onEnroll={handleEnroll}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ASSIGNED */}
          {activeTab === 'assigned' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] font-semibold text-gray-900">Assigned Courses</h2>
                <p className="text-[12px] text-gray-400">{assignments.length} pending</p>
              </div>
              {assignments.length === 0 ? (
                <div className="text-center py-20">
                  <Calendar className="h-16 w-16 text-gray-200 mx-auto mb-4" />
                  <p className="text-[15px] font-semibold text-gray-600">No pending assignments</p>
                  <p className="text-[13px] text-gray-400 mt-1">You're all caught up!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {assignments.map((a: any) => {
                    const course = (Array.isArray(a.course) ? a.course[0] : a.course) as LMSCourse;
                    return (
                      <CourseCard
                        key={a.id}
                        course={course ?? { id: a.course_id, title: 'Unknown Course' } as any}
                        enrollment={null}
                        onOpen={openCourse}
                        onEnroll={handleEnroll}
                        loading={enrolling.has(a.course_id)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* COMPLETED */}
          {activeTab === 'completed' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] font-semibold text-gray-900">Completed Courses</h2>
                <p className="text-[12px] text-gray-400">{completedCourses.length} courses</p>
              </div>
              {completedCourses.length === 0 ? (
                <div className="text-center py-20">
                  <CheckCircle2 className="h-16 w-16 text-gray-200 mx-auto mb-4" />
                  <p className="text-[15px] font-semibold text-gray-600">No completed courses yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {completedCourses.map(e => (
                    <CourseCard
                      key={e.id}
                      course={courses[e.course_id] ?? ({ id: e.course_id, title: 'Loading…' } as any)}
                      enrollment={e}
                      onOpen={openCourse}
                      onEnroll={handleEnroll}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CERTIFICATIONS */}
          {activeTab === 'certifications' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] font-semibold text-gray-900">My Certifications</h2>
                <p className="text-[12px] text-gray-400">{certificates.length} certificate{certificates.length !== 1 ? 's' : ''}</p>
              </div>
              {certificates.length === 0 ? (
                <div className="text-center py-20">
                  <Award className="h-16 w-16 text-gray-200 mx-auto mb-4" />
                  <p className="text-[15px] font-semibold text-gray-600">No certificates yet</p>
                  <p className="text-[13px] text-gray-400 mt-1">Complete a course to earn your first certificate</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {certificates.map(cert => (
                    <CertCard key={cert.id} cert={cert} onView={viewCertificate} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* COMPLIANCE */}
          {activeTab === 'compliance' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] font-semibold text-gray-900">Compliance Training</h2>
              </div>

              {/* Summary row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {COMPLIANCE_TYPES.map(type => {
                  const items = complianceCourses.filter(e => courses[e.course_id]?.compliance_type === type);
                  if (items.length === 0) return null;
                  const done = items.filter(e => e.completed_at).length;
                  return (
                    <div key={type} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[12px] font-semibold text-gray-700">{type}</span>
                        <ShieldCheck className={cn('h-4 w-4', done === items.length ? 'text-green-500' : 'text-amber-500')} />
                      </div>
                      <p className="text-[22px] font-bold text-gray-900">{done}/{items.length}</p>
                      <p className="text-[11px] text-gray-400">completed</p>
                    </div>
                  );
                }).filter(Boolean)}
              </div>

              {/* Compliance course list */}
              {complianceCourses.length === 0 ? (
                <div className="text-center py-20">
                  <ShieldCheck className="h-16 w-16 text-gray-200 mx-auto mb-4" />
                  <p className="text-[15px] font-semibold text-gray-600">No compliance courses assigned</p>
                  <p className="text-[13px] text-gray-400 mt-1">Your administrator will assign required compliance training</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left text-[11px] font-bold uppercase tracking-widest text-gray-400 px-4 py-3">Course</th>
                        <th className="text-left text-[11px] font-bold uppercase tracking-widest text-gray-400 px-4 py-3">Type</th>
                        <th className="text-left text-[11px] font-bold uppercase tracking-widest text-gray-400 px-4 py-3">Due Date</th>
                        <th className="text-left text-[11px] font-bold uppercase tracking-widest text-gray-400 px-4 py-3">Completed</th>
                        <th className="text-left text-[11px] font-bold uppercase tracking-widest text-gray-400 px-4 py-3">Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {complianceCourses.map(e => {
                        const course = courses[e.course_id];
                        const overdue = isOverdue(e);
                        const cert = certificates.find(c => c.course_id === e.course_id);
                        return (
                          <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50 last:border-0">
                            <td className="px-4 py-3">
                              <p className="text-[13px] font-medium text-gray-900">{course?.title ?? '—'}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-100 rounded-full px-2 py-0.5">
                                <ShieldCheck className="h-3 w-3" />
                                {course?.compliance_type ?? '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[12px] text-gray-500">{formatDate(e.due_date)}</td>
                            <td className="px-4 py-3 text-[12px] text-gray-500">{formatDate(e.completed_at)}</td>
                            <td className="px-4 py-3">
                              {e.completed_at ? (
                                <span className="inline-flex items-center gap-1 text-[11px] text-green-700 bg-green-50 rounded-full px-2 py-0.5 border border-green-100">
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
                                <button
                                  onClick={() => viewCertificate(cert.id)}
                                  className="text-[11px] text-amber-600 hover:text-amber-700 flex items-center gap-1 ml-auto"
                                >
                                  <Award className="h-3 w-3" /> Cert
                                </button>
                              ) : (
                                <button
                                  onClick={() => openCourse(e.course_id)}
                                  className="text-[11px] text-orange-600 hover:text-orange-700 flex items-center gap-1 ml-auto"
                                >
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

          {/* LEARNING PATHS */}
          {activeTab === 'paths' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[16px] font-semibold text-gray-900">Learning Paths</h2>
                <p className="text-[12px] text-gray-400">{learningPaths.length} paths available</p>
              </div>
              {learningPaths.length === 0 ? (
                <div className="text-center py-20">
                  <Route className="h-16 w-16 text-gray-200 mx-auto mb-4" />
                  <p className="text-[15px] font-semibold text-gray-600">No learning paths yet</p>
                  <p className="text-[13px] text-gray-400 mt-1">Ask your administrator to create onboarding paths</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {learningPaths.map(path => (
                    <PathCard
                      key={path.id}
                      path={path}
                      onEnroll={handlePathEnroll}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ADMIN */}
          {activeTab === 'admin' && isAdmin && (
            <AdminLMS orgId={orgId} hospitals={hospitals} />
          )}

        </div>
      </div>

      {/* ── Course Viewer Overlay ── */}
      {viewerLoading && (
        <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-8 flex items-center gap-4 shadow-xl">
            <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
            <p className="text-[15px] font-medium text-gray-700">Loading course…</p>
          </div>
        </div>
      )}

      {viewingCourse && (
        <CourseViewer
          course={viewingCourse}
          userId={userId}
          onClose={() => { setViewingCourse(null); loadData(); }}
          onProgressUpdate={() => loadData()}
        />
      )}
    </div>
  );
}
