'use client';

import { useState, useEffect } from 'react';
import { getMyRequests } from '@/lib/actions/requests';
import { getDirectInbox, getDirectSent } from '@/lib/actions/direct-requests';
import { RequestsPortalShell } from '@/components/communication/requests-portal-shell';
import type { RequestSummary } from '@/lib/actions/requests';
import type { DirectRequest } from '@/lib/actions/direct-requests';
import { BannerListSkeleton } from './skeletons';
import type { SectionProps } from './types';

export function RequestsPortalSection({ userId, role }: SectionProps) {
  const [requests, setRequests] = useState<RequestSummary[] | null>(null);
  const [inbox, setInbox] = useState<DirectRequest[]>([]);
  const [sent, setSent] = useState<DirectRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([getMyRequests(), getDirectInbox(), getDirectSent()]).then(([r1, r2, r3]) => {
      if (!alive) return;
      setRequests(r1.success ? r1.data : []);
      setInbox(r2.success ? r2.data : []);
      setSent(r3.success ? r3.data : []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [userId]);

  if (loading || requests === null) return <BannerListSkeleton />;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <RequestsPortalShell
        initialRequests={requests}
        initialInbox={inbox}
        initialSent={sent}
        role={role}
        currentUserId={userId}
      />
    </div>
  );
}
