'use client';

import { CheckSquare } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { ApprovalsClient } from '@/components/admin/approvals-client';
import { TableSkeleton } from './skeletons';
import { getApprovalsData } from '@/lib/actions/requests';
import type { SectionProps } from './types';

export function ApprovalsSection({ userId }: SectionProps) {
  const { data, error, refetch } = useQuery({
    queryKey: ['approvals-data', userId],
    queryFn: async () => {
      const res = await getApprovalsData();
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    staleTime: 0,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approval Center"
        description="Review and process requests across the organization"
        color="navy"
        variant="banner"
        icon={<CheckSquare className="h-7 w-7" />}
      />
      {error ? (
        <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-red-700 text-sm">
          Error loading requests: {(error as Error).message}
        </div>
      ) : data ? (
        <ApprovalsClient
          requests={data as Parameters<typeof ApprovalsClient>[0]['requests']}
          currentUserId={userId}
          onActionComplete={refetch}
        />
      ) : <TableSkeleton />}
    </div>
  );
}
