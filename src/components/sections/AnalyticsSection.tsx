'use client';

import { BarChart3 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import {
  getOrgKPIs, getTrainingAnalytics, getRequestAnalytics,
  getHospitalHealthScores, getProjectAnalytics, getEmployeeAnalytics,
} from '@/lib/actions/analytics';
import { AnalyticsShell } from '@/components/analytics/analytics-shell';
import { AnalyticsSkeleton } from './skeletons';
import type { SectionProps } from './types';

import type {
  OrgKPIs, TrainingAnalytics, RequestAnalytics,
  ProjectAnalytics, EmployeeAnalytics,
} from '@/lib/actions/analytics';

const DEFAULT_KPIs: OrgKPIs = {
  totalEmployees: 0, totalHospitals: 0, totalDepartments: 0,
  openRequests: 0, openTasks: 0, upcomingEvents: 0,
  trainingComplianceRate: 0, avgHospitalHealthScore: 0,
};
const DEFAULT_TRAINING: TrainingAnalytics = {
  totalEnrollments: 0, completedCount: 0, completionRate: 0,
  overdueCount: 0, certCount: 0, byHospital: [], byMonth: [], requiredCourses: [],
};
const DEFAULT_REQUESTS: RequestAnalytics = { total: 0, pending: 0, approved: 0, denied: 0, byType: [], avgResolutionDays: 0 };
const DEFAULT_PROJECTS: ProjectAnalytics = { total: 0, todo: 0, inProgress: 0, completed: 0, overdue: 0, byPriority: [], byHospital: [] };
const DEFAULT_EMPLOYEES: EmployeeAnalytics = { total: 0, active: 0, recentJoins: 0, byRole: [], byHospital: [] };

export function AnalyticsSection(_: SectionProps) {
  const { data } = useQuery({
    queryKey: ['analytics-data'],
    queryFn: async () => {
      const [kpisRes, trainingRes, requestsRes, healthRes, projectsRes, employeesRes] = await Promise.all([
        getOrgKPIs(), getTrainingAnalytics(), getRequestAnalytics(),
        getHospitalHealthScores(), getProjectAnalytics(), getEmployeeAnalytics(),
      ]);
      return {
        kpis:      kpisRes.success     ? kpisRes.data      : DEFAULT_KPIs,
        training:  trainingRes.success  ? trainingRes.data  : DEFAULT_TRAINING,
        requests:  requestsRes.success  ? requestsRes.data  : DEFAULT_REQUESTS,
        health:    healthRes.success    ? healthRes.data    : [],
        projects:  projectsRes.success  ? projectsRes.data  : DEFAULT_PROJECTS,
        employees: employeesRes.success ? employeesRes.data : DEFAULT_EMPLOYEES,
      };
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="KPIs & Analytics"
        description="Track performance metrics across all hospital locations"
        color="navy"
        variant="banner"
        icon={<BarChart3 className="h-7 w-7" />}
      />
      {data ? (
        <AnalyticsShell
          kpis={data.kpis}
          training={data.training}
          requests={data.requests}
          health={data.health as Parameters<typeof AnalyticsShell>[0]['health']}
          projects={data.projects}
          employees={data.employees}
        />
      ) : <AnalyticsSkeleton />}
    </div>
  );
}
