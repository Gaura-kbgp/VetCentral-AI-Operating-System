'use client';

import { useState } from 'react';
import {
  Calendar, Users, ShoppingCart, BookOpen, FileCheck, Zap,
  CheckCircle, XCircle, AlertTriangle, Clock, MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RequestType } from '@/lib/actions/requests';
import { approveRequest, rejectRequest, escalateRequest } from '@/lib/actions/requests';
import { Button } from '@/components/ui/button';

interface Props {
  request: any;
  details: any;
  activity: any[];
  approvals: any[];
}

const REQUEST_ICONS: Record<RequestType, React.ElementType> = {
  meeting: Calendar,
  leave: Users,
  purchase: ShoppingCart,
  training: BookOpen,
  document_verification: FileCheck,
  equipment: Zap,
};

export default function RequestDetailView({ request, details, activity, approvals }: Props) {
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isEscalating, setIsEscalating] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');

  const Icon = REQUEST_ICONS[(request.request_type as RequestType)];

  const handleApprove = async () => {
    setIsApproving(true);
    const result = await approveRequest(request.id, approvalNotes);
    if (result.success) {
      // Show success message and refresh
      window.location.reload();
    }
    setIsApproving(false);
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      alert('Please provide a rejection reason');
      return;
    }
    setIsRejecting(true);
    const result = await rejectRequest(request.id, rejectionReason);
    if (result.success) {
      window.location.reload();
    }
    setIsRejecting(false);
  };

  const handleEscalate = async () => {
    if (!escalationReason.trim()) {
      alert('Please provide an escalation reason');
      return;
    }
    setIsEscalating(true);
    const result = await escalateRequest(request.id, escalationReason);
    if (result.success) {
      window.location.reload();
    }
    setIsEscalating(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Content */}
      <div className="lg:col-span-2 space-y-6">
        {/* Request Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-700">
              <Icon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{request.title}</h1>
              <div className="flex items-center gap-3 mt-3">
                <span className={cn(
                  'px-3 py-1 rounded-full text-sm font-medium',
                  {
                    'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300': request.status === 'pending',
                    'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300': request.status === 'approved',
                    'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300': request.status === 'rejected',
                    'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300': request.status === 'escalated',
                  },
                )}>
                  {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                </span>
                <span className={cn(
                  'px-3 py-1 rounded-full text-sm font-medium',
                  {
                    'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300': request.priority === 'low',
                    'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300': request.priority === 'medium',
                    'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300': request.priority === 'high',
                    'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300': request.priority === 'urgent',
                  },
                )}>
                  {request.priority.charAt(0).toUpperCase() + request.priority.slice(1)}
                </span>
              </div>
            </div>
          </div>

          {request.description && (
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Description</h3>
              <p className="text-gray-600 dark:text-gray-400">{request.description}</p>
            </div>
          )}
        </div>

        {/* Request-Specific Details */}
        {details && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Request Details</h2>
            <RequestDetailsContent request={request} details={details} />
          </div>
        )}

        {/* Activity Log */}
        {activity.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Activity History</h2>
            <div className="space-y-3">
              {activity.map(a => (
                <div key={a.id} className="flex gap-3 pb-3 border-b border-gray-200 dark:border-gray-700 last:border-0">
                  <div className="flex-shrink-0 mt-1">
                    <Clock className="h-4 w-4 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">
                      {a.activity_type}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(a.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sidebar - Actions */}
      <div className="space-y-4">
        {request.status === 'pending' && (
          <>
            {/* Approval Section */}
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <h3 className="font-semibold text-green-900 dark:text-green-100 mb-3 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Approve Request
              </h3>
              <textarea
                placeholder="Add approval notes (optional)"
                value={approvalNotes}
                onChange={e => setApprovalNotes(e.target.value)}
                className="w-full px-3 py-2 mb-3 rounded border border-green-300 dark:border-green-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-sm"
                rows={3}
              />
              <Button
                onClick={handleApprove}
                disabled={isApproving}
                size="sm"
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                {isApproving ? 'Approving...' : <>
                  <CheckCircle className="h-4 w-4" />
                  Approve
                </>}
              </Button>
            </div>

            {/* Rejection Section */}
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <h3 className="font-semibold text-red-900 dark:text-red-100 mb-3 flex items-center gap-2">
                <XCircle className="h-4 w-4" />
                Reject Request
              </h3>
              <textarea
                placeholder="Explain rejection reason..."
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                className="w-full px-3 py-2 mb-3 rounded border border-red-300 dark:border-red-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-sm"
                rows={3}
              />
              <Button
                onClick={handleReject}
                disabled={isRejecting}
                variant="destructive"
                size="sm"
                className="w-full"
              >
                {isRejecting ? 'Rejecting...' : <>
                  <XCircle className="h-4 w-4" />
                  Reject
                </>}
              </Button>
            </div>

            {/* Escalation Section */}
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
              <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Escalate Request
              </h3>
              <textarea
                placeholder="Why is this escalated?"
                value={escalationReason}
                onChange={e => setEscalationReason(e.target.value)}
                className="w-full px-3 py-2 mb-3 rounded border border-orange-300 dark:border-orange-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-sm"
                rows={3}
              />
              <Button
                onClick={handleEscalate}
                disabled={isEscalating}
                size="sm"
                className="w-full bg-orange-600 hover:bg-orange-700 text-white"
              >
                {isEscalating ? 'Escalating...' : <>
                  <AlertTriangle className="h-4 w-4" />
                  Escalate
                </>}
              </Button>
            </div>
          </>
        )}

        {/* Approval Chain */}
        {approvals.length > 0 && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Approval Chain</h3>
            <div className="space-y-2">
              {approvals.map(a => (
                <div key={a.id} className="text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    {a.status === 'approved' ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : a.status === 'rejected' ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <Clock className="h-4 w-4 text-gray-400" />
                    )}
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Step {a.step_number}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 ml-6">
                    {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Component to render request-type-specific details
function RequestDetailsContent({ request, details }: { request: any; details: any }) {
  switch (request.request_type) {
    case 'meeting':
      return (
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Type</p>
            <p className="font-medium text-gray-900 dark:text-gray-100 capitalize">{details.meeting_type}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Start</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {new Date(details.start_time).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">End</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {new Date(details.end_time).toLocaleString()}
              </p>
            </div>
          </div>
          {details.location && (
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Location</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{details.location}</p>
            </div>
          )}
        </div>
      );

    case 'leave':
      return (
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Type</p>
            <p className="font-medium text-gray-900 dark:text-gray-100 capitalize">{details.leave_type}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Start Date</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{details.start_date}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">End Date</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{details.end_date}</p>
            </div>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Duration</p>
            <p className="font-medium text-gray-900 dark:text-gray-100">{details.duration_days} days</p>
          </div>
        </div>
      );

    case 'purchase':
      return (
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Item</p>
            <p className="font-medium text-gray-900 dark:text-gray-100">{details.item_description}</p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Quantity</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{details.quantity}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Unit Price</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">${details.unit_price}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">${details.total_cost}</p>
            </div>
          </div>
          {details.vendor_name && (
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Vendor</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{details.vendor_name}</p>
            </div>
          )}
        </div>
      );

    default:
      return <p className="text-sm text-gray-600 dark:text-gray-400">Details not available</p>;
  }
}
