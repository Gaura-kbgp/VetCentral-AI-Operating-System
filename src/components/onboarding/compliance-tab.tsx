'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Loader2, FileText, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getComplianceStatus } from '@/lib/actions/onboarding';
import type { ComplianceStatus } from '@/lib/actions/onboarding';

interface ComplianceTabProps {
  recordId: string;
}

export function ComplianceTab({ recordId }: ComplianceTabProps) {
  const [status, setStatus] = useState<ComplianceStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getComplianceStatus(recordId).then(res => {
      if (res.success) setStatus(res.data);
      setLoading(false);
    });
  }, [recordId]);

  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-teal-400 mx-auto" />
      </div>
    );
  }

  if (!status) {
    return <div className="text-center py-12 text-gray-500">Unable to load compliance status</div>;
  }

  const scoreColor =
    status.overallScore === 100 ? 'text-green-600'
    : status.overallScore >= 70 ? 'text-amber-600'
    : 'text-red-600';

  const scoreBg =
    status.overallScore === 100 ? 'bg-green-50'
    : status.overallScore >= 70 ? 'bg-amber-50'
    : 'bg-red-50';

  return (
    <div className="space-y-6">
      {/* Overall Compliance Score */}
      <div className={cn('rounded-2xl border-2 p-8 text-center', scoreBg)}>
        {status.overallScore === 100 ? (
          <div className="space-y-3">
            <div className="flex justify-center">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
            </div>
            <h2 className="text-[24px] font-bold text-green-900">All Clear!</h2>
            <p className="text-[14px] text-green-700">All onboarding requirements have been completed.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className={cn('text-[48px] font-bold', scoreColor)}>
              {status.overallScore}%
            </div>
            <h2 className={cn('text-[18px] font-bold', scoreColor)}>
              {status.status === 'at_risk' ? 'At Risk' : 'In Progress'}
            </h2>
            <p className="text-[13px] text-gray-600">
              {status.requiredVerified}/{status.requiredDocs} documents verified • {status.requiredCompleted}/{status.requiredTasks} required tasks done
            </p>
          </div>
        )}
      </div>

      {/* Document Compliance */}
      <div className="space-y-3">
        <h3 className="text-[14px] font-bold text-gray-900">Documents</h3>
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-gray-700">Required Documents</span>
            <span className={cn('text-[12px] font-bold', status.requiredVerified === status.requiredDocs ? 'text-green-600' : 'text-amber-600')}>
              {status.requiredVerified}/{status.requiredDocs}
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                status.requiredVerified === status.requiredDocs ? 'bg-green-500' : 'bg-amber-500'
              )}
              style={{ width: `${status.requiredDocs > 0 ? (status.requiredVerified / status.requiredDocs) * 100 : 100}%` }}
            />
          </div>
          <p className="text-[11px] text-gray-500">
            {status.totalDocs} total documents requested
          </p>
        </div>
      </div>

      {/* Task Compliance */}
      <div className="space-y-3">
        <h3 className="text-[14px] font-bold text-gray-900">Required Tasks</h3>
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-gray-700">Completion Status</span>
            <span className={cn('text-[12px] font-bold', status.requiredCompleted === status.requiredTasks ? 'text-green-600' : 'text-amber-600')}>
              {status.requiredCompleted}/{status.requiredTasks}
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                status.requiredCompleted === status.requiredTasks ? 'bg-green-500' : 'bg-amber-500'
              )}
              style={{ width: `${status.requiredTasks > 0 ? (status.requiredCompleted / status.requiredTasks) * 100 : 100}%` }}
            />
          </div>
          <p className="text-[11px] text-gray-500">
            {status.totalTasks} total tasks in checklist
          </p>
        </div>
      </div>

      {/* What's Next */}
      {status.overallScore < 100 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-[12px] font-bold text-amber-900 mb-2">Next Steps:</p>
              <ul className="text-[12px] text-amber-800 space-y-1">
                {status.requiredVerified < status.requiredDocs && (
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                    Upload {status.requiredDocs - status.requiredVerified} more document{status.requiredDocs - status.requiredVerified !== 1 ? 's' : ''}
                  </li>
                )}
                {status.requiredCompleted < status.requiredTasks && (
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                    Complete {status.requiredTasks - status.requiredCompleted} more task{status.requiredTasks - status.requiredCompleted !== 1 ? 's' : ''}
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Breakdown Card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3">Breakdown</h3>
        <div className="space-y-2 text-[12px]">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-gray-700">
              <FileText className="h-4 w-4 text-blue-500" />
              Documents
            </span>
            <span className="font-bold text-gray-900">{status.verifiedDocs}/{status.totalDocs}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-gray-700">
              <CheckSquare className="h-4 w-4 text-teal-500" />
              Tasks Completed
            </span>
            <span className="font-bold text-gray-900">{status.completedTasks}/{status.totalTasks}</span>
          </div>
          <div className="border-t border-gray-100 pt-2 mt-2 flex items-center justify-between">
            <span className="font-bold text-gray-700">Overall Score</span>
            <span className={cn('font-bold text-[14px]', scoreColor)}>{status.overallScore}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
