'use client';

import { useEffect, useState, useCallback } from 'react';
import { UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { HRPipeline } from '@/components/onboarding/hr-pipeline';
import { EmployeeDetailView } from '@/components/onboarding/employee-detail-view';
import { getHRPipelineData } from '@/lib/actions/onboarding-wizard';
import { BannerCardGridSkeleton } from './skeletons';
import type { PipelineEmployee } from '@/lib/actions/onboarding-wizard-types';
import type { SectionProps } from './types';

type HospitalItem = { name: string; color: string | null };

export function OnboardingSection({ userId }: SectionProps) {
  const [employees, setEmployees]         = useState<PipelineEmployee[] | null>(null);
  const [hospitals, setHospitals]         = useState<HospitalItem[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);

  const loadData = useCallback(() => {
    getHRPipelineData().then(res => {
      setEmployees(res.employees);
      if (res.hospitals.length > 0) setHospitals(res.hospitals);
    });
  }, []);

  useEffect(() => {
    let alive = true;
    getHRPipelineData().then(res => {
      if (!alive) return;
      setEmployees(res.employees);
      if (res.hospitals.length > 0) setHospitals(res.hospitals);
    });
    return () => { alive = false; };
  }, [userId]);

  if (selectedEmpId) {
    return (
      <EmployeeDetailView
        employeeId={selectedEmpId}
        onBack={() => setSelectedEmpId(null)}
        onRefreshList={loadData}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Employee Onboarding"
        description="Track and manage the onboarding journey for all new team members"
        color="navy"
        variant="banner"
        icon={<UserPlus className="h-7 w-7" />}
      />

      {employees !== null ? (
        <HRPipeline
          initialEmployees={employees}
          initialHospitals={hospitals}
          onViewEmployee={setSelectedEmpId}
        />
      ) : (
        <BannerCardGridSkeleton />
      )}
    </div>
  );
}
