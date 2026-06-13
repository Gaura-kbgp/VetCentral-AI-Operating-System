'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { format } from 'date-fns';
import {
  ArrowLeft, CheckCircle2, Clock, FileText, Upload, Shield,
  Loader2, ChevronRight, Users, GraduationCap, AlertCircle, Check, ExternalLink,
  ClipboardList, X, Eye, EyeOff, MoreVertical, UserX, Trash2, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  getOnboardingShellData, getOnboardingDetail,
  updateOnboardingStep, completeOnboarding,
} from '@/lib/actions/onboarding-steps';
import type { ShellRecord, OnboardingStep, StepType, StepStatus } from '@/lib/actions/onboarding-steps';
import { deleteUserProfile, setUserActiveManaged } from '@/lib/actions/users';
import type { AppRole } from '@/types/database';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const STEP_TYPE_META: Record<StepType, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  document_send:   { label: 'Send Document',    color: 'text-blue-600',   bg: 'bg-blue-50',   icon: FileText },
  employee_upload: { label: 'Employee Upload',  color: 'text-violet-600', bg: 'bg-violet-50', icon: Upload  },
  hr_action:       { label: 'HR Action',        color: 'text-emerald-600',bg: 'bg-emerald-50',icon: Check   },
  approval:        { label: 'Approval',         color: 'text-amber-600',  bg: 'bg-amber-50',  icon: Shield  },
};

const STATUS_META: Record<StepStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending:   { label: 'Pending',       color: 'text-slate-400', icon: Clock       },
  waiting:   { label: 'Waiting',       color: 'text-amber-500', icon: Clock       },
  completed: { label: 'Completed',     color: 'text-emerald-600',icon: CheckCircle2 },
  verified:  { label: 'Verified',      color: 'text-blue-600',  icon: CheckCircle2 },
  skipped:   { label: 'Skipped',       color: 'text-slate-400', icon: X           },
};

// ─────────────────────────────────────────────────────────────
// Main shell
// ─────────────────────────────────────────────────────────────

interface OnboardingShellProps {
  initialOngoing:   ShellRecord[];
  initialOnboarded: ShellRecord[];
  currentUserRole?: AppRole | null;
}

export default function OnboardingShell({ initialOngoing, initialOnboarded, currentUserRole }: OnboardingShellProps) {
  const [view, setView]           = useState<'list' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ongoing, setOngoing]     = useState<ShellRecord[]>(initialOngoing);
  const [onboarded, setOnboarded] = useState<ShellRecord[]>(initialOnboarded);

  function openDetail(id: string) { setSelectedId(id); setView('detail'); }
  function closeDetail()           { setView('list'); setSelectedId(null); }

  function handleCompleted(recordId: string) {
    const rec = ongoing.find(r => r.id === recordId);
    if (rec) {
      setOngoing(p => p.filter(r => r.id !== recordId));
      setOnboarded(p => [{ ...rec, status: 'completed', progress_pct: 100 }, ...p]);
    }
    closeDetail();
  }

  const canHRManage = currentUserRole
    ? ['super_admin','org_admin','hospital_admin','practice_manager','hr'].includes(currentUserRole)
    : false;

  if (view === 'detail' && selectedId) {
    return (
      <OnboardingDetail
        recordId={selectedId}
        onBack={closeDetail}
        onCompleted={handleCompleted}
      />
    );
  }

  return (
    <OnboardingList
      ongoing={ongoing}
      onboarded={onboarded}
      canHRManage={canHRManage}
      onSelect={openDetail}
      onRemove={(id) => {
        setOngoing(p => p.filter(r => r.id !== id));
        setOnboarded(p => p.filter(r => r.id !== id));
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// List view
// ─────────────────────────────────────────────────────────────

function OnboardingList({
  ongoing, onboarded, canHRManage, onSelect, onRemove,
}: {
  ongoing:      ShellRecord[];
  onboarded:    ShellRecord[];
  canHRManage:  boolean;
  onSelect:     (id: string) => void;
  onRemove:     (employeeId: string) => void;
}) {
  const [tab, setTab] = useState<'ongoing' | 'onboarded'>('ongoing');
  const list = tab === 'ongoing' ? ongoing : onboarded;

  return (
    <div className="space-y-5 mt-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Ongoing',   value: ongoing.length,   color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-100'   },
          { label: 'Onboarded', value: onboarded.length, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
          { label: 'Total',     value: ongoing.length + onboarded.length, color: 'text-slate-800', bg: 'bg-slate-50', border: 'border-slate-100' },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl border px-5 py-4 ${s.bg} ${s.border}`}>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{s.label}</p>
            <p className={`text-[28px] font-black mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([
          { id: 'ongoing'   as const, label: 'Ongoing Onboarding', count: ongoing.length,   Icon: GraduationCap },
          { id: 'onboarded' as const, label: 'Onboarded',          count: onboarded.length, Icon: Users         },
        ]).map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all ${
                active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <t.Icon className="h-3.5 w-3.5" />
              {t.label}
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                active ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'
              }`}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* Cards */}
      {list.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="h-14 w-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto">
            {tab === 'ongoing' ? <GraduationCap className="h-7 w-7 text-slate-300" /> : <Users className="h-7 w-7 text-slate-300" />}
          </div>
          <p className="text-slate-500 font-semibold">
            {tab === 'ongoing' ? 'No employees currently onboarding' : 'No onboarded employees yet'}
          </p>
          <p className="text-sm text-slate-400">
            {tab === 'ongoing' ? 'Send employees to onboarding from User Management → New Users.' : 'Employees move here after completing onboarding.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map(r => (
            <EmployeeCard
              key={r.id}
              record={r}
              showProgress={tab === 'ongoing'}
              onClick={() => tab === 'ongoing' && onSelect(r.id)}
              clickable={tab === 'ongoing'}
              canHRManage={canHRManage}
              onDeleted={() => onRemove(r.employee_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Employee card
// ─────────────────────────────────────────────────────────────

function EmployeeCard({ record: r, showProgress, onClick, clickable, canHRManage, onDeleted }: {
  record:       ShellRecord;
  showProgress: boolean;
  onClick:      () => void;
  clickable:    boolean;
  canHRManage:  boolean;
  onDeleted:    () => void;
}) {
  const [menuOpen, setMenuOpen]         = useState(false);
  const [confirmAction, setConfirmAction] = useState<'deactivate' | 'delete' | null>(null);
  const [working, startWorking]         = useTransition();
  const initials = r.employee_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  function handleAction(action: 'deactivate' | 'delete') {
    setMenuOpen(false);
    setConfirmAction(action);
  }

  function handleConfirm() {
    startWorking(async () => {
      if (confirmAction === 'delete') {
        const res = await deleteUserProfile(r.employee_id);
        if (res.success) { toast.success('Employee deleted'); onDeleted(); }
        else toast.error(res.error ?? 'Failed to delete');
      } else if (confirmAction === 'deactivate') {
        const res = await setUserActiveManaged(r.employee_id, false);
        if (res.success) { toast.success('Employee deactivated'); onDeleted(); }
        else toast.error(res.error ?? 'Failed to deactivate');
      }
      setConfirmAction(null);
    });
  }

  return (
    <>
      <div
        onClick={clickable ? onClick : undefined}
        className={`relative bg-white rounded-2xl border border-slate-100 p-5 shadow-sm transition-all ${
          clickable ? 'cursor-pointer hover:border-[#1e3a5f]/30 hover:shadow-md' : ''
        }`}
      >
        <div className="flex items-start gap-3 mb-4">
          <Avatar className="h-11 w-11 shrink-0">
            <AvatarImage src={r.employee_avatar ?? undefined} />
            <AvatarFallback className="bg-violet-100 text-violet-700 font-bold text-sm">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 text-sm truncate">{r.employee_name}</p>
            {r.employee_job_title && (
              <p className="text-xs text-slate-500 truncate">{r.employee_job_title}</p>
            )}
            {r.employee_email && (
              <p className="text-[11px] text-slate-400 truncate">{r.employee_email}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {clickable && !canHRManage && <ChevronRight className="h-4 w-4 text-slate-300 mt-1" />}
            {canHRManage && (
              <div className="relative" onClick={e => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setMenuOpen(p => !p)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-7 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-40">
                    <button
                      type="button"
                      onClick={() => handleAction('deactivate')}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 transition-colors"
                    >
                      <UserX className="h-3.5 w-3.5" /> Deactivate
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAction('delete')}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {r.hospital_name && (
          <div className="flex items-center gap-1.5 mb-3">
            <div className="h-2 w-2 rounded-full" style={{ background: r.hospital_color ?? '#94a3b8' }} />
            <span className="text-xs text-slate-500">{r.hospital_name}</span>
          </div>
        )}

        {showProgress && (
          <div className="space-y-1.5 mb-3">
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-slate-400">Progress</span>
              <span className={`text-[11px] font-bold ${
                r.progress_pct >= 100 ? 'text-emerald-600' :
                r.progress_pct >= 50  ? 'text-blue-600'   : 'text-amber-600'
              }`}>{r.progress_pct}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  r.progress_pct >= 100 ? 'bg-emerald-500' :
                  r.progress_pct >= 50  ? 'bg-blue-500'   : 'bg-amber-500'
                }`}
                style={{ width: `${r.progress_pct}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>{r.start_date ? `Started ${format(new Date(r.start_date), 'MMM d, yyyy')}` : `Added ${format(new Date(r.created_at), 'MMM d, yyyy')}`}</span>
          {!showProgress && (
            <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border-0">Onboarded</Badge>
          )}
        </div>
      </div>

      {/* Confirm modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                confirmAction === 'delete' ? 'bg-red-100' : 'bg-amber-100'
              }`}>
                <AlertTriangle className={`h-5 w-5 ${confirmAction === 'delete' ? 'text-red-600' : 'text-amber-600'}`} />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">
                  {confirmAction === 'delete' ? 'Delete Employee?' : 'Deactivate Employee?'}
                </p>
                <p className="text-xs text-slate-500">{r.employee_name}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              {confirmAction === 'delete'
                ? 'This will permanently remove this employee and all their data. This cannot be undone.'
                : 'This will prevent the employee from logging in. You can reactivate them later.'}
            </p>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmAction(null)}
                disabled={working}
              >
                Cancel
              </Button>
              <Button
                className={`flex-1 gap-1.5 ${confirmAction === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
                onClick={handleConfirm}
                disabled={working}
              >
                {working ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : confirmAction === 'delete' ? <Trash2 className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
                {confirmAction === 'delete' ? 'Delete' : 'Deactivate'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Detail view
// ─────────────────────────────────────────────────────────────

function OnboardingDetail({ recordId, onBack, onCompleted }: {
  recordId:    string;
  onBack:      () => void;
  onCompleted: (id: string) => void;
}) {
  const [record, setRecord]           = useState<ShellRecord | null>(null);
  const [steps,  setSteps]            = useState<OnboardingStep[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [completing, startCompleting] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getOnboardingDetail(recordId);
    if (res.record) {
      setRecord(res.record);
      setSteps(res.steps);
      if (res.error) toast.error(res.error);
    } else {
      toast.error(res.error ?? 'Failed to load');
    }
    setLoading(false);
  }, [recordId]);

  useEffect(() => { load(); }, [load]);

  const required  = steps.filter(s => s.is_required);
  const done      = required.filter(s => ['completed', 'verified', 'skipped'].includes(s.status));
  const progress  = required.length > 0 ? Math.round((done.length / required.length) * 100) : 0;
  const isComplete = progress >= 100;

  const activeStep = selectedStep ? steps.find(s => s.id === selectedStep) ?? null : null;

  function onStepUpdated(updated: OnboardingStep) {
    setSteps(prev => prev.map(s => s.id === updated.id ? updated : s));
  }

  function handleFinish() {
    startCompleting(async () => {
      const res = await completeOnboarding(recordId);
      if (res.success) {
        toast.success('Onboarding completed! Employee moved to All Users.');
        onCompleted(recordId);
      } else {
        toast.error(res.error ?? 'Failed to complete onboarding');
      }
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading onboarding detail…
      </div>
    );
  }

  if (!record) return null;

  const initials = record.employee_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="mt-4 space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors font-medium"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="h-5 w-px bg-slate-200" />
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={record.employee_avatar ?? undefined} />
            <AvatarFallback className="bg-violet-100 text-violet-700 font-bold">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-bold text-slate-900">{record.employee_name}</p>
            <div className="flex items-center gap-2 flex-wrap">
              {record.employee_job_title && (
                <span className="text-xs text-slate-500">{record.employee_job_title}</span>
              )}
              {record.hospital_name && (
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <div className="h-2 w-2 rounded-full" style={{ background: record.hospital_color ?? '#94a3b8' }} />
                  {record.hospital_name}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Progress pill */}
        <div className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border ${
          isComplete ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="relative h-8 w-8">
            <svg className="h-8 w-8 -rotate-90" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="13" fill="none" stroke="#e2e8f0" strokeWidth="4" />
              <circle
                cx="16" cy="16" r="13" fill="none"
                stroke={isComplete ? '#10b981' : progress >= 50 ? '#3b82f6' : '#f59e0b'}
                strokeWidth="4"
                strokeDasharray={`${(progress / 100) * 81.68} 81.68`}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-slate-700">
              {progress}%
            </span>
          </div>
          <div>
            <p className={`text-xs font-bold ${isComplete ? 'text-emerald-700' : 'text-slate-700'}`}>
              {isComplete ? 'Complete!' : `${done.length}/${required.length} steps`}
            </p>
            <p className="text-[10px] text-slate-400">Progress</p>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isComplete ? 'bg-emerald-500' : progress >= 50 ? 'bg-blue-500' : 'bg-amber-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Complete button */}
      {isComplete && record.status !== 'completed' && (
        <div className="flex items-center gap-4 px-5 py-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
          <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-emerald-800">All steps completed!</p>
            <p className="text-xs text-emerald-600">This employee is ready to be moved to the All Users list.</p>
          </div>
          <Button
            onClick={handleFinish}
            disabled={completing}
            className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 shrink-0"
          >
            {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            Send to All Users
          </Button>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Steps list — left */}
        <div className="lg:col-span-2 space-y-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Onboarding Steps</p>
          {steps.map((step, idx) => (
            <StepRow
              key={step.id}
              step={step}
              index={idx + 1}
              selected={selectedStep === step.id}
              onClick={() => setSelectedStep(step.id === selectedStep ? null : step.id)}
            />
          ))}
        </div>

        {/* Step action panel — right */}
        <div className="lg:col-span-3">
          {activeStep ? (
            <StepActionPanel
              step={activeStep}
              record={record}
              onStepUpdated={onStepUpdated}
              onClose={() => setSelectedStep(null)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl">
              <ClipboardList className="h-10 w-10 mb-3 text-slate-300" />
              <p className="font-semibold text-slate-500">Select a step</p>
              <p className="text-sm mt-1">Click a step on the left to view details and take action</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step row (left list)
// ─────────────────────────────────────────────────────────────

function StepRow({ step, index, selected, onClick }: {
  step:     OnboardingStep;
  index:    number;
  selected: boolean;
  onClick:  () => void;
}) {
  const meta = STEP_TYPE_META[step.step_type];
  const sMeta = STATUS_META[step.status];
  const Icon = meta.icon;
  const StatusIcon = sMeta.icon;
  const isDone = ['completed', 'verified'].includes(step.status);
  const isSkipped = step.status === 'skipped';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
        selected
          ? 'border-[#1e3a5f] bg-blue-50/60 shadow-sm'
          : isDone
            ? 'border-emerald-100 bg-emerald-50/40 hover:border-emerald-200'
            : isSkipped
              ? 'border-slate-100 bg-slate-50 opacity-60 hover:opacity-80'
              : 'border-slate-100 bg-white hover:border-slate-200'
      }`}
    >
      {/* Step number / status icon */}
      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
        isDone    ? 'bg-emerald-100 text-emerald-600' :
        isSkipped ? 'bg-slate-100 text-slate-400'     :
        selected  ? 'bg-[#1e3a5f] text-white'         :
                    'bg-slate-100 text-slate-500'
      }`}>
        {isDone ? <StatusIcon className="h-4 w-4" /> : index}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${isDone ? 'text-emerald-800' : isSkipped ? 'text-slate-400' : 'text-slate-900'}`}>
          {step.title}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Icon className={`h-3 w-3 shrink-0 ${meta.color}`} />
          <span className={`text-[10px] font-medium ${sMeta.color}`}>{sMeta.label}</span>
        </div>
      </div>

      {selected && <ChevronRight className="h-4 w-4 text-[#1e3a5f] shrink-0" />}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Step action panel (right side)
// ─────────────────────────────────────────────────────────────

function StepActionPanel({ step, record, onStepUpdated, onClose }: {
  step:           OnboardingStep;
  record:         ShellRecord;
  onStepUpdated:  (s: OnboardingStep) => void;
  onClose:        () => void;
}) {
  const meta   = STEP_TYPE_META[step.step_type];
  const Icon   = meta.icon;
  const isDone = ['completed', 'verified'].includes(step.status);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Panel header */}
      <div className={`px-5 py-4 ${meta.bg} border-b border-slate-100 flex items-center gap-3`}>
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${meta.bg}`}>
          <Icon className={`h-4.5 w-4.5 ${meta.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900">{step.title}</p>
          <p className="text-xs text-slate-500">{step.description}</p>
        </div>
        <button type="button" onClick={onClose} className="text-slate-300 hover:text-slate-500 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-5 py-5">
        {step.step_type === 'document_send' && (
          <DocumentSendPanel step={step} record={record} onUpdated={onStepUpdated} />
        )}
        {step.step_type === 'employee_upload' && (
          <EmployeeUploadPanel step={step} onUpdated={onStepUpdated} />
        )}
        {step.step_type === 'hr_action' && (
          <HrActionPanel step={step} onUpdated={onStepUpdated} />
        )}
        {step.step_type === 'approval' && (
          <ApprovalPanel step={step} onUpdated={onStepUpdated} />
        )}

        {/* Completion info */}
        {isDone && (
          <div className="mt-4 flex items-center gap-2 px-3.5 py-2.5 bg-emerald-50 rounded-xl border border-emerald-100 text-xs text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>
              {step.status === 'verified' ? 'Verified' : 'Completed'}
              {step.completed_by_name ? ` by ${step.completed_by_name}` : ''}
              {step.completed_at ? ` on ${format(new Date(step.completed_at), 'MMM d, yyyy')}` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Document Send panel (offer letter, joining letter)
// ─────────────────────────────────────────────────────────────

function DocumentSendPanel({ step, record, onUpdated }: {
  step:      OnboardingStep;
  record:    ShellRecord;
  onUpdated: (s: OnboardingStep) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm]      = useState(step.status === 'pending');
  const [notes, setNotes]            = useState(step.notes ?? '');
  const [formData, setFormData]      = useState<Record<string, string>>({
    employee_name:    record.employee_name,
    employee_address: step.form_data?.employee_address ?? '',
    position:         step.form_data?.position ?? record.employee_job_title ?? '',
    department:       step.form_data?.department ?? record.employee_department ?? '',
    start_date:       step.form_data?.start_date ?? record.start_date ?? '',
    salary:           step.form_data?.salary ?? '',
    additional_terms: step.form_data?.additional_terms ?? '',
  });

  const set = (key: string, val: string) => setFormData(p => ({ ...p, [key]: val }));

  function handleSend() {
    startTransition(async () => {
      const res = await updateOnboardingStep(step.id, {
        status:    'waiting',
        notes,
        form_data: formData,
      });
      if (res.success) {
        toast.success('Letter marked as sent — waiting for employee signature');
        onUpdated({ ...step, status: 'waiting', notes, form_data: formData });
        setShowForm(false);
      } else {
        toast.error(res.error ?? 'Failed');
      }
    });
  }

  if (step.status === 'waiting' && !showForm) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 rounded-xl border border-amber-100 text-sm text-amber-700">
          <Clock className="h-4 w-4 shrink-0" />
          <span>Letter sent — waiting for employee to sign and return.</span>
        </div>
        {/* Summary of form data */}
        <div className="space-y-2 text-sm">
          {Object.entries(step.form_data ?? {}).filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-slate-400 capitalize w-32 shrink-0">{k.replace(/_/g, ' ')}:</span>
              <span className="text-slate-700 font-medium">{v}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>Edit & Resend</Button>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={isPending}
            onClick={() => startTransition(async () => {
              const res = await updateOnboardingStep(step.id, { status: 'completed', notes: step.notes ?? '' });
              if (res.success) { toast.success('Marked as completed'); onUpdated({ ...step, status: 'completed' }); }
              else toast.error(res.error ?? 'Failed');
            })}
          >
            <Check className="h-3.5 w-3.5 mr-1" /> Mark as Returned
          </Button>
        </div>
      </div>
    );
  }

  if (step.status === 'completed' || step.status === 'verified') {
    return (
      <div className="text-sm text-slate-500 space-y-2">
        <p className="font-medium text-slate-700">Document letter completed.</p>
        {Object.entries(step.form_data ?? {}).filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="text-slate-400 capitalize w-32 shrink-0">{k.replace(/_/g, ' ')}:</span>
            <span className="text-slate-700">{v}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Letter Details</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Employee Name</Label>
          <Input value={formData.employee_name} onChange={e => set('employee_name', e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Position</Label>
          <Input value={formData.position} onChange={e => set('position', e.target.value)} placeholder="Job title" className="h-8 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Department</Label>
          <Input value={formData.department} onChange={e => set('department', e.target.value)} placeholder="Department" className="h-8 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Start Date</Label>
          <Input type="date" value={formData.start_date} onChange={e => set('start_date', e.target.value)} className="h-8 text-sm" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Employee Address</Label>
        <textarea
          value={formData.employee_address}
          onChange={e => set('employee_address', e.target.value)}
          placeholder="Full address…"
          rows={2}
          className="w-full text-sm rounded-lg border border-input px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring/50"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Salary / Package <span className="text-slate-400">(optional)</span></Label>
          <Input value={formData.salary} onChange={e => set('salary', e.target.value)} placeholder="e.g. $50,000/yr" className="h-8 text-sm" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Additional Terms <span className="text-slate-400">(optional)</span></Label>
        <textarea
          value={formData.additional_terms}
          onChange={e => set('additional_terms', e.target.value)}
          placeholder="Any additional terms or notes…"
          rows={2}
          className="w-full text-sm rounded-lg border border-input px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring/50"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Notes</Label>
        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes…" className="h-8 text-sm" />
      </div>

      <Button onClick={handleSend} disabled={isPending} className="w-full bg-[#1e3a5f] hover:bg-[#162d4f] gap-2">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        Mark as Sent — Waiting for Signature
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Employee Upload panel
// ─────────────────────────────────────────────────────────────

function EmployeeUploadPanel({ step, onUpdated }: {
  step:      OnboardingStep;
  onUpdated: (s: OnboardingStep) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [docUrl, setDocUrl]          = useState(step.document_url ?? '');
  const [docName, setDocName]        = useState(step.document_name ?? '');
  const [notes, setNotes]            = useState(step.notes ?? '');
  const [showPdf, setShowPdf]        = useState(false);

  function handleSubmit() {
    startTransition(async () => {
      const res = await updateOnboardingStep(step.id, {
        status:        'completed',
        document_url:  docUrl || undefined,
        document_name: docName || undefined,
        notes:         notes || undefined,
      });
      if (res.success) {
        toast.success('Document received and marked as completed');
        onUpdated({ ...step, status: 'completed', document_url: docUrl, document_name: docName, notes });
      } else {
        toast.error(res.error ?? 'Failed');
      }
    });
  }

  function handleVerify() {
    startTransition(async () => {
      const res = await updateOnboardingStep(step.id, { status: 'verified', notes: notes || undefined });
      if (res.success) {
        toast.success('Document verified');
        onUpdated({ ...step, status: 'verified', notes });
      } else {
        toast.error(res.error ?? 'Failed');
      }
    });
  }

  if (step.status === 'pending') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-4 py-3 bg-violet-50 rounded-xl border border-violet-100 text-sm text-violet-700">
          <Upload className="h-4 w-4 shrink-0" />
          <span>Waiting for employee to upload the signed document.</span>
        </div>
        <p className="text-xs text-slate-500">If the employee brought a physical copy, you can mark it as received below.</p>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Document URL <span className="text-slate-400">(paste link if available)</span></Label>
            <Input value={docUrl} onChange={e => setDocUrl(e.target.value)} placeholder="https://…" className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Document Name</Label>
            <Input value={docName} onChange={e => setDocName(e.target.value)} placeholder="e.g. Signed Offer Letter.pdf" className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes…" className="h-8 text-sm" />
          </div>
        </div>

        <Button onClick={handleSubmit} disabled={isPending} className="w-full bg-violet-600 hover:bg-violet-700 gap-2">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Mark as Received
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {step.document_url ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl border border-slate-100">
            <FileText className="h-5 w-5 text-slate-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{step.document_name || 'Uploaded Document'}</p>
              <p className="text-xs text-slate-400 truncate">{step.document_url}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPdf(p => !p)}
                className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors text-slate-500"
              >
                {showPdf ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <a
                href={step.document_url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors text-slate-500"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>

          {showPdf && (
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
              <iframe
                src={step.document_url}
                className="w-full h-80"
                title={step.document_name ?? 'Document'}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 rounded-xl border border-amber-100 text-sm text-amber-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Document received (no URL attached).</span>
        </div>
      )}

      {step.status === 'completed' && (
        <Button
          onClick={handleVerify}
          disabled={isPending}
          className="w-full bg-blue-600 hover:bg-blue-700 gap-2"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
          Verify & Approve Document
        </Button>
      )}

      {step.notes && (
        <p className="text-xs text-slate-500 italic">Note: {step.notes}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HR Action panel
// ─────────────────────────────────────────────────────────────

function HrActionPanel({ step, onUpdated }: {
  step:      OnboardingStep;
  onUpdated: (s: OnboardingStep) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes]            = useState(step.notes ?? '');

  if (step.status === 'completed' || step.status === 'verified') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 rounded-xl border border-emerald-100 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Action completed{step.notes ? `: ${step.notes}` : '.'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Notes <span className="text-slate-400">(optional)</span></Label>
        <Input
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Add a note about this action…"
          className="h-8 text-sm"
        />
      </div>

      <div className="flex gap-2">
        <Button
          onClick={() => startTransition(async () => {
            const res = await updateOnboardingStep(step.id, { status: 'completed', notes: notes || undefined });
            if (res.success) { toast.success('Step completed'); onUpdated({ ...step, status: 'completed', notes }); }
            else toast.error(res.error ?? 'Failed');
          })}
          disabled={isPending}
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-2"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Mark as Done
        </Button>
        <Button
          variant="outline"
          onClick={() => startTransition(async () => {
            const res = await updateOnboardingStep(step.id, { status: 'skipped', notes: notes || undefined });
            if (res.success) { toast.success('Step skipped'); onUpdated({ ...step, status: 'skipped', notes }); }
            else toast.error(res.error ?? 'Failed');
          })}
          disabled={isPending}
          className="text-slate-400 hover:text-slate-600"
        >
          Skip
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Approval panel
// ─────────────────────────────────────────────────────────────

function ApprovalPanel({ step, onUpdated }: {
  step:      OnboardingStep;
  onUpdated: (s: OnboardingStep) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes]            = useState(step.notes ?? '');

  if (step.status === 'verified' || step.status === 'completed') {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 rounded-xl border border-blue-100 text-sm text-blue-700">
        <Shield className="h-4 w-4 shrink-0" />
        <span>Approved{step.notes ? `: ${step.notes}` : '.'}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="px-4 py-3 bg-amber-50 rounded-xl border border-amber-100 text-sm text-amber-700">
        Review all previous steps and approve the complete onboarding package.
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Approval Notes</Label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Add approval notes…"
          rows={3}
          className="w-full text-sm rounded-lg border border-input px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring/50"
        />
      </div>
      <Button
        onClick={() => startTransition(async () => {
          const res = await updateOnboardingStep(step.id, { status: 'verified', notes: notes || undefined });
          if (res.success) { toast.success('Onboarding approved!'); onUpdated({ ...step, status: 'verified', notes }); }
          else toast.error(res.error ?? 'Failed');
        })}
        disabled={isPending}
        className="w-full bg-[#1e3a5f] hover:bg-[#162d4f] gap-2"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
        Approve Onboarding
      </Button>
    </div>
  );
}
