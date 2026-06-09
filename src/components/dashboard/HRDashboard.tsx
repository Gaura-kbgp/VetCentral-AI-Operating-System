import { createSupabaseAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import {
  UserPlus, Users, FileText, Shield, TrendingUp, CheckCircle2,
  AlertCircle, Clock, ArrowRight, ChevronRight, BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  userId: string;
  orgId: string;
  firstName: string;
  hospitalId: string | null;
}

const STAGE_COLORS: Record<string, string> = {
  pre_hire:       'bg-gray-100 text-gray-700',
  documents:      'bg-blue-100 text-blue-700',
  orientation:    'bg-indigo-100 text-indigo-700',
  training:       'bg-orange-100 text-orange-700',
  manager_review: 'bg-purple-100 text-purple-700',
};
const STAGE_LABEL: Record<string, string> = {
  pre_hire: 'Pre-Hire', documents: 'Documents', orientation: 'Orientation',
  training: 'Training', manager_review: 'Manager Review',
};

export default async function HRDashboard({ firstName, hospitalId }: Props) {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const in30   = new Date(now.getTime() + 30 * 86_400_000).toISOString();
  const in7    = new Date(now.getTime() + 7  * 86_400_000).toISOString();

  const baseOnboardingQuery = hospitalId
    ? admin.from('onboarding_records').select('id, employee_id, stage, status, progress_pct, created_at, start_date').eq('hospital_id', hospitalId)
    : admin.from('onboarding_records').select('id, employee_id, stage, status, progress_pct, created_at, start_date');

  const [
    newHiresRes, onboardingActiveRes, expiringCertsRes,
    enrollmentsRes, totalStaffRes,
  ] = await Promise.all([
    admin.from('profiles')
      .select('id, first_name, last_name, job_title, created_at')
      .gte('created_at', last30)
      .order('created_at', { ascending: false })
      .limit(8),
    baseOnboardingQuery.eq('status', 'active').order('created_at', { ascending: false }),
    admin.from('lms_certificates')
      .select('id, user_id, course_id, expires_at, issued_at')
      .lte('expires_at', in30)
      .gte('expires_at', now.toISOString())
      .eq('is_revoked', false)
      .order('expires_at')
      .limit(8),
    admin.from('course_enrollments').select('user_id, completed_at, due_date')
      .lt('due_date', in7)
      .is('completed_at', null),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ]);

  const newHires      = newHiresRes.data ?? [];
  const activeOnboard = onboardingActiveRes.data ?? [];
  const expiringCerts = expiringCertsRes.data ?? [];
  const overdueTraining = enrollmentsRes.data ?? [];

  // Pipeline counts by stage
  const pipeline = activeOnboard.reduce((acc: Record<string, number>, r) => {
    acc[r.stage] = (acc[r.stage] ?? 0) + 1; return acc;
  }, {});

  // Training compliance
  const allEnrollmentsRes = await admin.from('course_enrollments').select('user_id, completed_at');
  const enrollments = allEnrollmentsRes.data ?? [];
  const enrolled = new Set(enrollments.map(e => e.user_id)).size;
  const trained  = new Set(enrollments.filter(e => e.completed_at).map(e => e.user_id)).size;
  const trainingPct = enrolled > 0 ? Math.round((trained / enrolled) * 100) : 0;

  // Fetch names for certs + overdue training
  const certUserIds = [...new Set(expiringCerts.map(c => c.user_id))];
  const certCourseIds = [...new Set(expiringCerts.map(c => c.course_id))];
  const overdueUserIds = [...new Set(overdueTraining.map(e => e.user_id))];
  const allPersonIds = [...new Set([...certUserIds, ...overdueUserIds])];

  const [namesRes, coursesRes] = await Promise.all([
    allPersonIds.length ? admin.from('profiles').select('id, first_name, last_name').in('id', allPersonIds) : Promise.resolve({ data: [] }),
    certCourseIds.length ? admin.from('lms_courses').select('id, title').in('id', certCourseIds) : Promise.resolve({ data: [] }),
  ]);
  const nameMap   = Object.fromEntries((namesRes.data ?? []).map(p => [p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()]));
  const courseMap = Object.fromEntries((coursesRes.data ?? []).map(c => [c.id, c.title]));

  function timeAgo(iso: string) {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }
  function daysUntil(iso: string) {
    return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  }
  function fmtDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6 pb-8">

      {/* ── HR Header ───────────────────────────────────────── */}
      <div className="rounded-2xl p-6 text-white" style={{ background: 'linear-gradient(135deg, #9d174d 0%, #db2777 100%)' }}>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <p className="text-pink-200 text-[13px] font-medium mb-1">{greeting}, {firstName}</p>
            <h1 className="text-2xl font-bold">HR Operations</h1>
            <p className="text-pink-200 text-[13px] mt-1">Human Resources · Employee Lifecycle Management</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/hr" className="flex items-center gap-2 px-3.5 py-2 bg-white/15 hover:bg-white/25 border border-white/20 rounded-lg text-[13px] font-medium text-white transition-colors">
              <UserPlus className="h-3.5 w-3.5" /> New Employee
            </Link>
            <Link href="/onboarding" className="flex items-center gap-2 px-3.5 py-2 bg-white/15 hover:bg-white/25 border border-white/20 rounded-lg text-[13px] font-medium text-white transition-colors">
              <Users className="h-3.5 w-3.5" /> Onboarding
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[
            { label: 'Total Staff',        value: totalStaffRes.count ?? 0 },
            { label: 'New Hires (30d)',     value: newHires.length },
            { label: 'In Onboarding',      value: activeOnboard.length },
            { label: 'Training Compliance',value: `${trainingPct}%` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white/15 border border-white/15 rounded-xl p-3.5">
              <p className="text-2xl font-bold text-white leading-none">{value}</p>
              <p className="text-[11px] text-pink-200 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Risk Alerts ─────────────────────────────────────── */}
      {(expiringCerts.length > 0 || overdueTraining.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {expiringCerts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <p className="text-[13px] font-semibold text-amber-800">{expiringCerts.length} Certifications Expiring Soon</p>
              </div>
              <div className="space-y-2">
                {expiringCerts.slice(0, 3).map(cert => (
                  <div key={cert.id} className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-amber-900 truncate">{nameMap[cert.user_id] || '—'}</p>
                      <p className="text-[11px] text-amber-700">{courseMap[cert.course_id] ?? 'Certificate'}</p>
                    </div>
                    <span className={cn('shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ml-2',
                      daysUntil(cert.expires_at!) <= 7 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    )}>{daysUntil(cert.expires_at!)}d</span>
                  </div>
                ))}
              </div>
              <Link href="/training" className="mt-3 text-[12px] text-amber-700 hover:text-amber-800 font-medium flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}
          {overdueTraining.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <p className="text-[13px] font-semibold text-red-800">{overdueTraining.length} Overdue Training Assignments</p>
              </div>
              <div className="space-y-2">
                {overdueTraining.slice(0, 4).map((e, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <p className="text-[12px] text-red-800 truncate">{nameMap[e.user_id] || 'Unknown employee'}</p>
                    <span className="shrink-0 text-[11px] text-red-600 ml-2">Due {fmtDate(e.due_date)}</span>
                  </div>
                ))}
              </div>
              <Link href="/training" className="mt-3 text-[12px] text-red-600 hover:text-red-700 font-medium flex items-center gap-1">
                View training <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ── Onboarding Pipeline ──────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-pink-500" />
            <h3 className="text-[14px] font-semibold text-gray-900">Onboarding Pipeline</h3>
          </div>
          <Link href="/onboarding" className="text-[12px] text-blue-600 font-medium flex items-center gap-1">
            Manage <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Stage summary */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-5 border-b border-gray-100">
          {(['pre_hire','documents','orientation','training','manager_review'] as const).map(stage => (
            <div key={stage} className="text-center">
              <span className={cn('inline-block text-[11px] font-bold px-2 py-1 rounded-lg mb-1', STAGE_COLORS[stage])}>
                {pipeline[stage] ?? 0}
              </span>
              <p className="text-[10px] text-gray-400 leading-tight">{STAGE_LABEL[stage]}</p>
            </div>
          ))}
        </div>

        {/* Active onboardees */}
        {activeOnboard.length === 0 ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-300 mx-auto mb-2" />
            <p className="text-[14px] text-gray-400">No active onboarding records</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {activeOnboard.slice(0, 6).map(rec => (
              <Link key={rec.id} href={`/onboarding/${rec.employee_id}`}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-pink-50 flex items-center justify-center shrink-0">
                  <Users className="h-4 w-4 text-pink-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', STAGE_COLORS[rec.stage])}>
                      {STAGE_LABEL[rec.stage]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-pink-400 rounded-full" style={{ width: `${rec.progress_pct}%` }} />
                    </div>
                    <span className="text-[11px] text-gray-500 shrink-0">{rec.progress_pct}%</span>
                  </div>
                </div>
                {rec.start_date && (
                  <span className="text-[11px] text-gray-400 shrink-0">Starts {fmtDate(rec.start_date)}</span>
                )}
                <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── New Hires + Expiring Certs ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* New Hires */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-green-500" /><h3 className="text-[14px] font-semibold text-gray-900">New Hires · Last 30 Days</h3></div>
            <Link href="/hr" className="text-[12px] text-blue-600 font-medium">Directory</Link>
          </div>
          {newHires.length === 0 ? (
            <div className="py-10 text-center"><UserPlus className="h-10 w-10 text-gray-200 mx-auto mb-2" /><p className="text-[13px] text-gray-400">No new hires this month</p></div>
          ) : (
            <div className="divide-y divide-gray-50">
              {newHires.map(hire => (
                <div key={hire.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50">
                  <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-bold text-green-700">
                      {(hire.first_name?.[0] ?? '') + (hire.last_name?.[0] ?? '')}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900">{[hire.first_name, hire.last_name].filter(Boolean).join(' ')}</p>
                    <p className="text-[11px] text-gray-400">{hire.job_title ?? 'No title'}</p>
                  </div>
                  <span className="text-[11px] text-gray-400 shrink-0">{timeAgo(hire.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Expiring Certifications */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-amber-500" /><h3 className="text-[14px] font-semibold text-gray-900">Expiring Certifications</h3></div>
            <Link href="/training" className="text-[12px] text-blue-600 font-medium">Training</Link>
          </div>
          {expiringCerts.length === 0 ? (
            <div className="py-10 text-center"><CheckCircle2 className="h-10 w-10 text-green-300 mx-auto mb-2" /><p className="text-[13px] text-gray-400">No certs expiring in 30 days</p></div>
          ) : (
            <div className="divide-y divide-gray-50">
              {expiringCerts.map(cert => (
                <div key={cert.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{courseMap[cert.course_id] ?? 'Certificate'}</p>
                    <p className="text-[11px] text-gray-400">{nameMap[cert.user_id] || 'Unknown'} · Issued {fmtDate(cert.issued_at)}</p>
                  </div>
                  <span className={cn('shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full',
                    daysUntil(cert.expires_at!) <= 7 ? 'bg-red-100 text-red-700' : 'bg-amber-50 text-amber-700'
                  )}>{daysUntil(cert.expires_at!)}d left</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Actions ────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Create Employee',   href: '/hr',             Icon: UserPlus,   bg: 'bg-pink-600 hover:bg-pink-700' },
            { label: 'Start Onboarding',  href: '/onboarding',     Icon: Users,      bg: 'bg-indigo-600 hover:bg-indigo-700' },
            { label: 'Assign Training',   href: '/training',       Icon: TrendingUp, bg: 'bg-orange-600 hover:bg-orange-700' },
            { label: 'Verify Documents',  href: '/documents',      Icon: FileText,   bg: 'bg-teal-600 hover:bg-teal-700' },
            { label: 'Compliance View',   href: '/training',       Icon: Shield,     bg: 'bg-red-600 hover:bg-red-700' },
            { label: 'Knowledge Base',    href: '/knowledge-base', Icon: BookOpen,   bg: 'bg-gray-700 hover:bg-gray-800' },
          ].map(({ label, href, Icon, bg }) => (
            <Link key={href + label} href={href} className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-white text-[13px] font-medium transition-colors', bg)}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
