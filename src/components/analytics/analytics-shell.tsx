'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import {
  Users, Building2, GraduationCap, ClipboardList, CheckCircle2,
  AlertTriangle, TrendingUp, Calendar, FolderKanban, Activity,
  Award, Clock, Target,
} from 'lucide-react';
import type {
  OrgKPIs, TrainingAnalytics, RequestAnalytics,
  HospitalHealthScore, ProjectAnalytics, EmployeeAnalytics,
} from '@/lib/actions/analytics';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface Props {
  kpis:        OrgKPIs;
  training:    TrainingAnalytics;
  requests:    RequestAnalytics;
  health:      HospitalHealthScore[];
  projects:    ProjectAnalytics;
  employees:   EmployeeAnalytics;
}

// ─────────────────────────────────────────────────────────────
// Micro Components
// ─────────────────────────────────────────────────────────────

function KPICard({
  label, value, sub, icon, color, trend,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; color: string; trend?: number;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
      <div className="rounded-xl p-3 flex-shrink-0" style={{ backgroundColor: `${color}15` }}>
        <div style={{ color }}>{icon}</div>
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
        <p className="text-sm font-medium text-slate-600 truncate">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      {trend !== undefined && (
        <div className={`ml-auto text-xs font-semibold px-2 py-1 rounded-full ${trend >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
          {trend >= 0 ? '+' : ''}{trend}%
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-bold text-slate-800 mb-4">{children}</h2>;
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 p-5 ${className}`}>
      {children}
    </div>
  );
}

function HealthBar({ score, color }: { score: number; color: string }) {
  const bg = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, backgroundColor: bg }} />
      </div>
      <span className="text-sm font-semibold tabular-nums" style={{ color: bg }}>{score}</span>
    </div>
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high:   '#f97316',
  medium: '#f59e0b',
  low:    '#22c55e',
};

const ROLE_LABELS: Record<string, string> = {
  doctor:           'Doctor',
  csr:              'CSR',
  va:               'Vet Assistant',
  practice_manager: 'Manager',
  hospital_admin:   'Hospital Admin',
  hr:               'HR',
  it_admin:         'IT Admin',
  super_admin:      'Super Admin',
  org_admin:        'Org Admin',
  marketing:        'Marketing',
  viewer:           'Viewer',
};

// ─────────────────────────────────────────────────────────────
// Main Shell
// ─────────────────────────────────────────────────────────────

export function AnalyticsShell({ kpis, training, requests, health, projects, employees }: Props) {
  const avgHealth = health.length
    ? Math.round(health.reduce((s, h) => s + h.score, 0) / health.length)
    : 0;

  return (
    <div className="space-y-8 pb-8">
      {/* ── KPI Summary ── */}
      <section>
        <SectionTitle>Organization Overview</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard
            label="Total Employees" value={kpis.totalEmployees}
            icon={<Users className="h-5 w-5" />} color="#2563EB"
            sub={`${kpis.totalHospitals} hospitals`}
          />
          <KPICard
            label="Training Compliance" value={`${kpis.trainingComplianceRate}%`}
            icon={<GraduationCap className="h-5 w-5" />}
            color={kpis.trainingComplianceRate >= 80 ? '#22c55e' : '#f59e0b'}
          />
          <KPICard
            label="Open Requests" value={kpis.openRequests}
            icon={<ClipboardList className="h-5 w-5" />} color="#f97316"
            sub="Pending approval"
          />
          <KPICard
            label="Avg Health Score" value={avgHealth}
            icon={<Activity className="h-5 w-5" />}
            color={avgHealth >= 80 ? '#22c55e' : '#f59e0b'}
            sub="Across all hospitals"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <KPICard
            label="Open Tasks" value={kpis.openTasks}
            icon={<CheckCircle2 className="h-5 w-5" />} color="#7C3AED"
          />
          <KPICard
            label="Upcoming Events" value={kpis.upcomingEvents}
            icon={<Calendar className="h-5 w-5" />} color="#0891B2"
            sub="Next 7 days"
          />
          <KPICard
            label="Departments" value={kpis.totalDepartments}
            icon={<Building2 className="h-5 w-5" />} color="#059669"
          />
          <KPICard
            label="Certifications Issued" value={training.certCount}
            icon={<Award className="h-5 w-5" />} color="#D97706"
          />
        </div>
      </section>

      {/* ── Hospital Health ── */}
      {health.length > 0 && (
        <section>
          <SectionTitle>Hospital Health Scores</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {health.map(h => (
              <Card key={h.hospitalId}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: h.color }} />
                  <p className="font-semibold text-slate-800 text-sm truncate">{h.hospitalName}</p>
                </div>
                <HealthBar score={h.score} color={h.color} />
                <div className="grid grid-cols-2 gap-3 mt-4 text-xs text-slate-500">
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{h.staffCount}</p>
                    <p>Staff Members</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{h.openRequests}</p>
                    <p>Open Requests</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{h.eventsThisMonth}</p>
                    <p>Events (30d)</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{h.openTasks}</p>
                    <p>Open Tasks</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ── Training ── */}
      <section>
        <SectionTitle>Training & Compliance</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <KPICard label="Total Enrollments" value={training.totalEnrollments} icon={<GraduationCap className="h-5 w-5" />} color="#2563EB" />
          <KPICard label="Completion Rate" value={`${training.completionRate}%`} icon={<Target className="h-5 w-5" />} color={training.completionRate >= 75 ? '#22c55e' : '#f59e0b'} />
          <KPICard label="Overdue" value={training.overdueCount} icon={<AlertTriangle className="h-5 w-5" />} color="#ef4444" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Completion by month */}
          <Card>
            <p className="text-sm font-semibold text-slate-700 mb-4">Completions — Last 6 Months</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={training.byMonth} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="completed" fill="#2563EB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          {/* By hospital */}
          {training.byHospital.length > 0 && (
            <Card>
              <p className="text-sm font-semibold text-slate-700 mb-4">Completion Rate by Hospital</p>
              <div className="space-y-3">
                {training.byHospital.map(h => (
                  <div key={h.hospitalId}>
                    <div className="flex justify-between text-xs text-slate-600 mb-1">
                      <span className="font-medium truncate pr-2">{h.hospitalName}</span>
                      <span className="font-semibold tabular-nums">{h.rate}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${h.rate}%`, backgroundColor: h.color }} />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{h.completed}/{h.enrolled} completed</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
        {/* Required courses */}
        {training.requiredCourses.length > 0 && (
          <Card className="mt-4">
            <p className="text-sm font-semibold text-slate-700 mb-4">Required Course Compliance</p>
            <div className="space-y-3">
              {training.requiredCourses.map(c => (
                <div key={c.id} className="flex items-center gap-4">
                  <p className="text-xs text-slate-700 font-medium w-48 truncate flex-shrink-0">{c.title}</p>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${c.rate}%`,
                        backgroundColor: c.rate >= 80 ? '#22c55e' : c.rate >= 50 ? '#f59e0b' : '#ef4444',
                      }}
                    />
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-slate-600 w-10 text-right">{c.rate}%</span>
                  <span className="text-xs text-slate-400 w-16 text-right">{c.completed}/{c.enrolled}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </section>

      {/* ── Requests & Projects ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Requests */}
        <section>
          <SectionTitle>Schedule Requests</SectionTitle>
          <Card>
            <div className="grid grid-cols-3 gap-4 mb-4">
              {[
                { label: 'Pending',  value: requests.pending,  color: '#f59e0b' },
                { label: 'Approved', value: requests.approved, color: '#22c55e' },
                { label: 'Denied',   value: requests.denied,   color: '#ef4444' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            {requests.avgResolutionDays > 0 && (
              <div className="flex items-center gap-2 text-xs text-slate-500 border-t border-slate-100 pt-3">
                <Clock className="h-3.5 w-3.5" />
                Avg resolution: <span className="font-semibold text-slate-700">{requests.avgResolutionDays} days</span>
              </div>
            )}
            {requests.byType.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">By Type</p>
                <div className="space-y-1.5">
                  {requests.byType.slice(0, 5).map(t => (
                    <div key={t.type} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 capitalize">{t.type.replace(/_/g, ' ')}</span>
                      <span className="font-semibold text-slate-800">{t.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </section>

        {/* Projects */}
        <section>
          <SectionTitle>Projects</SectionTitle>
          <Card>
            <div className="grid grid-cols-2 gap-4 mb-4">
              {[
                { label: 'To Do',       value: projects.todo,       color: '#6b7280' },
                { label: 'In Progress', value: projects.inProgress, color: '#2563EB' },
                { label: 'Completed',   value: projects.completed,  color: '#22c55e' },
                { label: 'Overdue',     value: projects.overdue,    color: '#ef4444' },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-xs text-slate-600">{s.label}</span>
                  <span className="ml-auto text-sm font-bold" style={{ color: s.color }}>{s.value}</span>
                </div>
              ))}
            </div>
            {projects.byPriority.length > 0 && (
              <>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 border-t border-slate-100 pt-3">By Priority</p>
                <div className="space-y-1.5">
                  {projects.byPriority.map(p => (
                    <div key={p.priority} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PRIORITY_COLORS[p.priority] ?? '#6b7280' }} />
                        <span className="capitalize text-slate-600">{p.priority}</span>
                      </span>
                      <span className="font-semibold text-slate-800">{p.count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </section>
      </div>

      {/* ── Employee Analytics ── */}
      <section>
        <SectionTitle>Employee Distribution</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <p className="text-sm font-semibold text-slate-700 mb-4">Staff by Role</p>
            {employees.byRole.length > 0 ? (
              <div className="space-y-2">
                {employees.byRole.slice(0, 8).map(r => (
                  <div key={r.role} className="flex items-center gap-3">
                    <span className="text-xs text-slate-600 w-28 truncate">{ROLE_LABELS[r.role] ?? r.role}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${Math.min(100, (r.count / (employees.total || 1)) * 100 * 3)}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-slate-700 w-6 text-right">{r.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-8">No employee data yet</p>
            )}
          </Card>
          <Card>
            <p className="text-sm font-semibold text-slate-700 mb-4">Staff by Hospital</p>
            {employees.byHospital.length > 0 ? (
              <>
                <div className="space-y-2 mb-4">
                  {employees.byHospital.map(h => (
                    <div key={h.hospitalName} className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: h.color }} />
                      <span className="text-xs text-slate-600 truncate flex-1">{h.hospitalName}</span>
                      <span className="text-xs font-semibold tabular-nums text-slate-700">{h.count}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-100 pt-3 flex justify-between text-xs">
                  <span className="text-slate-500">Total Active</span>
                  <span className="font-bold text-slate-800">{employees.active}</span>
                </div>
                {employees.recentJoins > 0 && (
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-slate-500">New (30d)</span>
                    <span className="font-bold text-green-600">+{employees.recentJoins}</span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-400 text-center py-8">No employee data yet</p>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}
