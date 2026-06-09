'use client';

import Link from 'next/link';
import {
  Calendar, Users, ShoppingCart, BookOpen, FileCheck, Zap,
  AlertTriangle, ArrowRight, CheckCircle, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RequestSummary, RequestType } from '@/lib/actions/requests';

interface Props {
  request: RequestSummary;
  isOverdue?: boolean;
  showOutcome?: boolean;
}

const REQUEST_ICONS: Record<RequestType, React.ElementType> = {
  meeting: Calendar,
  leave: Users,
  purchase: ShoppingCart,
  training: BookOpen,
  document_verification: FileCheck,
  equipment: Zap,
};

const REQUEST_LABELS: Record<RequestType, string> = {
  meeting: 'Meeting Request',
  leave: 'Leave Request',
  purchase: 'Purchase Request',
  training: 'Training Request',
  document_verification: 'Document Verification',
  equipment: 'Equipment Request',
};

const PRIORITY_COLORS = {
  low: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  medium: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300',
  high: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300',
  urgent: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
};

export default function RequestCard({ request, isOverdue, showOutcome }: Props) {
  const Icon = REQUEST_ICONS[request.request_type];
  const label = REQUEST_LABELS[request.request_type];
  const createdDate = new Date(request.created_at);
  const daysOld = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <Link href={`/approvals/${request.id}`}>
      <div
        className={cn(
          'p-4 rounded-lg border-2 transition-all hover:shadow-md cursor-pointer',
          isOverdue
            ? 'border-red-300 dark:border-red-700/50 bg-red-50 dark:bg-red-900/10 hover:border-red-400 dark:hover:border-red-600'
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600',
        )}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <div className={cn(
              'p-2 rounded-lg flex-shrink-0',
              isOverdue ? 'bg-red-200 dark:bg-red-900/40' : 'bg-gray-100 dark:bg-gray-700',
            )}>
              <Icon className={cn(
                'h-5 w-5',
                isOverdue ? 'text-red-700 dark:text-red-400' : 'text-gray-600 dark:text-gray-400',
              )} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {request.title}
                </h3>
                {isOverdue && (
                  <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                )}
              </div>

              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs px-2 py-1 rounded text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700">
                  {label}
                </span>
                <span className={cn(
                  'text-xs px-2 py-1 rounded font-medium',
                  PRIORITY_COLORS[request.priority],
                )}>
                  {request.priority.charAt(0).toUpperCase() + request.priority.slice(1)}
                </span>
              </div>

              <div className="flex items-center gap-3 mt-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {daysOld === 0 ? 'Today' : daysOld === 1 ? 'Yesterday' : `${daysOld}d ago`}
                </p>
                {showOutcome && request.status === 'approved' && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                    <CheckCircle className="h-3 w-3" /> Approved
                  </span>
                )}
                {showOutcome && request.status === 'rejected' && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                    <XCircle className="h-3 w-3" /> Rejected
                    {request.rejection_reason && (
                      <span className="text-gray-400 font-normal truncate max-w-40"> — {request.rejection_reason}</span>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>

          <ArrowRight className="h-5 w-5 text-gray-400 dark:text-gray-600 flex-shrink-0 ml-2" />
        </div>
      </div>
    </Link>
  );
}
