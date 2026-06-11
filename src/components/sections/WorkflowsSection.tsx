'use client';

import { useQuery } from '@tanstack/react-query';
import { getMyRequests } from '@/lib/actions/requests';
import MyRequestsView from '@/components/requests/MyRequestsView';
import { BannerListSkeleton } from './skeletons';
import type { SectionProps } from './types';

export function WorkflowsSection(_: SectionProps) {
  const { data } = useQuery({
    queryKey: ['workflows-data'],
    queryFn: async () => {
      const result = await getMyRequests();
      return result.success ? result.data : [];
    },
  });

  return (
    <div className="max-w-3xl mx-auto">
      {data ? (
        <MyRequestsView requests={data as Parameters<typeof MyRequestsView>[0]['requests']} />
      ) : <BannerListSkeleton />}
    </div>
  );
}
