'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock, CheckCircle, XCircle, AlertTriangle,
  Calendar, Plane, ShoppingCart, GraduationCap, FileText, Wrench,
  Plus, ChevronRight, X, ClipboardList,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';
import { cancelRequest } from '@/lib/actions/requests';
import type { RequestSummary, RequestType, RequestStatus } from '@/lib/actions/requests';
import NewRequestDialog from './NewRequestDialog';

// ─── Status Badge ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<RequestStatus, { label: string; cls: string; icon: React.ElementType }> = {
  pending:   { label: 'Pending',   cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',  icon: Clock },
  approved:  { label: 'Approved',  cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',  icon: CheckCircle },
  rejected:  { label: 'Rejected',  cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',          icon: XCircle },
  escalated: { label: 'Escalated', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: AlertTriangle },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',         icon: X },
  completed: { label: 'Completed', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',      icon: CheckCircle },
};

function StatusBadge({ status }: { status: RequestStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cfg.cls)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

// ─── Type Icon ─────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<RequestType, React.ElementType> = {
  meeting: Calendar, leave: Plane, purchase: ShoppingCart,
  training: GraduationCap, document_verification: FileText, equipment: Wrench,
};

const TYPE_LABELS: Record<RequestType, string> = {
  meeting: 'Meeting', leave: 'Leave', purchase: 'Purchase',
  training: 'Training', document_verification: 'Document', equipment: 'Equipment',
};

const TYPE_COLORS: Record<RequestType, string> = {
  meeting: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  leave: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  purchase: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  training: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  document_verification: 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
  equipment: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400',
};

// ─── Request Row ───────────────────────────────────────────────────────────

function RequestRow({ request, onCancel }: { request: RequestSummary; onCancel: (id: string) => void }) {
  const router = useRouter();
  const Icon = TYPE_ICONS[request.request_type];
  const date = new Date(request.created_at);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div
      className="group flex items-center gap-4 px-4 py-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all cursor-pointer"
      onClick={() => router.push(`/approvals/${request.id}`)}
    >
      {/* Type icon */}
      <div className={cn('flex items-center justify-center h-9 w-9 rounded-lg shrink-0', TYPE_COLORS[request.request_type])}>
        <Icon className="h-4 w-4" />
      </div>

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{request.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-400">{TYPE_LABELS[request.request_type]}</span>
          <span className="text-xs text-gray-300 dark:text-gray-600">•</span>
          <span className="text-xs text-gray-400">{dateStr}</span>
          {request.rejection_reason && (
            <>
              <span className="text-xs text-gray-300 dark:text-gray-600">•</span>
              <span className="text-xs text-red-500 truncate max-w-48">{request.rejection_reason}</span>
            </>
          )}
        </div>
      </div>

      {/* Status */}
      <StatusBadge status={request.status} />

      {/* Cancel */}
      {request.status === 'pending' && (
        <button
          className="hidden group-hover:flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          onClick={e => { e.stopPropagation(); onCancel(request.id); }}
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </button>
      )}

      <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600 shrink-0" />
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

const STATUS_FILTERS: { id: RequestStatus | 'all'; label: string }[] = [
  { id: 'all',      label: 'All' },
  { id: 'pending',  label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'cancelled', label: 'Cancelled' },
];

interface Props {
  requests: RequestSummary[];
}

export default function MyRequestsView({ requests }: Props) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<RequestType | 'all'>('all');
  const [isPending, startTransition] = useTransition();

  const filtered = requests.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (typeFilter !== 'all' && r.request_type !== typeFilter) return false;
    return true;
  });

  async function handleCancel(id: string) {
    if (!confirm('Cancel this request?')) return;
    startTransition(async () => {
      const result = await cancelRequest(id);
      if (result.success) router.refresh();
    });
  }

  const counts: Partial<Record<RequestStatus | 'all', number>> = { all: requests.length };
  requests.forEach(r => { counts[r.status] = (counts[r.status] ?? 0) + 1; });

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Requests"
        description="Track and manage your submitted requests"
        color="navy"
        variant="banner"
        icon={<ClipboardList className="h-7 w-7" />}
        action={
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg text-sm font-medium transition-colors border border-white/20"
          >
            <Plus className="h-4 w-4" />
            New Request
          </button>
        }
      />

      {/* Stat chips */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium transition-colors border',
              statusFilter === f.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300',
            )}
          >
            {f.label}
            {counts[f.id] != null && (
              <span className={cn('ml-1.5 text-xs', statusFilter === f.id ? 'text-blue-200' : 'text-gray-400')}>
                {counts[f.id]}
              </span>
            )}
          </button>
        ))}

        {/* Type filter */}
        <select
          className="ml-auto border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as RequestType | 'all')}
        >
          <option value="all">All Types</option>
          {(Object.keys(TYPE_LABELS) as RequestType[]).map(t => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {/* Request list */}
      <div className="space-y-2">
        {filtered.length > 0 ? (
          filtered.map(req => (
            <RequestRow key={req.id} request={req} onCancel={handleCancel} />
          ))
        ) : (
          <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
            <Clock className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
            <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-1">No requests found</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {statusFilter === 'all' && typeFilter === 'all'
                ? "You haven't submitted any requests yet."
                : 'No requests match your current filters.'}
            </p>
            {statusFilter === 'all' && typeFilter === 'all' && (
              <button
                onClick={() => setDialogOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Submit Your First Request
              </button>
            )}
          </div>
        )}
      </div>

      <NewRequestDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
