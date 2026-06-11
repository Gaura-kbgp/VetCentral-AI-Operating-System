'use client';

import { useQuery } from '@tanstack/react-query';
import { getMyRequests } from '@/lib/actions/requests';
import { RequestsPortalShell } from '@/components/communication/requests-portal-shell';
import { BannerListSkeleton } from './skeletons';
import type { SectionProps } from './types';

export function RequestsPortalSection({ userId }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['my-requests', userId],
    queryFn: async () => {
      const r = await getMyRequests();
      return r.success ? r.data : [];
    },
  });

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {data != null ? (
        <RequestsPortalShell initialRequests={data} />
      ) : <BannerListSkeleton />}
    </div>
  );
}
