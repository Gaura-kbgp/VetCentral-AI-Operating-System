import { BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import {
  getOrgKPIs, getTrainingAnalytics, getRequestAnalytics,
  getHospitalHealthScores, getProjectAnalytics, getEmployeeAnalytics,
} from '@/lib/actions/analytics';
import { AnalyticsShell } from '@/components/analytics/analytics-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const metadata = { title: 'KPIs & Analytics — VetOS' };

export default async function KpiPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [kpisRes, trainingRes, requestsRes, healthRes, projectsRes, employeesRes] = await Promise.all([
    getOrgKPIs(),
    getTrainingAnalytics(),
    getRequestAnalytics(),
    getHospitalHealthScores(),
    getProjectAnalytics(),
    getEmployeeAnalytics(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="KPIs & Analytics"
        description="Track performance metrics across all hospital locations"
        color="navy"
        icon={<BarChart3 className="h-7 w-7" />}
      />
      <AnalyticsShell
        kpis={kpisRes.success ? kpisRes.data : {
          totalEmployees: 0, totalHospitals: 0, totalDepartments: 0,
          openRequests: 0, openTasks: 0, upcomingEvents: 0,
          trainingComplianceRate: 0, avgHospitalHealthScore: 0,
        }}
        training={trainingRes.success ? trainingRes.data : {
          totalEnrollments: 0, completedCount: 0, completionRate: 0,
          overdueCount: 0, certCount: 0, byHospital: [], byMonth: [], requiredCourses: [],
        }}
        requests={requestsRes.success ? requestsRes.data : {
          total: 0, pending: 0, approved: 0, denied: 0, byType: [], avgResolutionDays: 0,
        }}
        health={healthRes.success ? healthRes.data : []}
        projects={projectsRes.success ? projectsRes.data : {
          total: 0, todo: 0, inProgress: 0, completed: 0, overdue: 0, byPriority: [], byHospital: [],
        }}
        employees={employeesRes.success ? employeesRes.data : {
          total: 0, active: 0, recentJoins: 0, byRole: [], byHospital: [],
        }}
      />
    </div>
  );
}
