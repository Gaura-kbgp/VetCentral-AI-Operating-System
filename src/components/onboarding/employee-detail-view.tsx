'use client';

import { useState, useEffect } from 'react';
import {
  ArrowLeft, ExternalLink, Edit3, Save, X, UserMinus,
  CheckCircle, AlertCircle, RefreshCw, FileText, Shield,
  Package, Phone, Mail, MapPin, Trash2, Clock,
  Award, Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getWizardData, updateOnboardingRecord, cancelOnboardingRecord } from '@/lib/actions/onboarding-wizard';
import { WIZARD_STEPS } from '@/lib/actions/onboarding-wizard-types';
import { terminateEmployee } from '@/lib/actions/hiring';
import type { WizardData } from '@/lib/actions/onboarding-wizard-types';
import { initials, TerminateModal } from './hr-pipeline';

// ── Option lists ──────────────────────────────────────────────────────────────

const STAGE_OPTIONS = [
  { value: 'pre_hire',       label: 'Pre-Hire'       },
  { value: 'documents',      label: 'Documents'      },
  { value: 'orientation',    label: 'Orientation'    },
  { value: 'training',       label: 'Training'       },
  { value: 'manager_review', label: 'Manager Review' },
  { value: 'completed',      label: 'Completed'      },
];
const STATUS_OPTIONS = [
  { value: 'active',    label: 'Active'    },
  { value: 'on_hold',   label: 'On Hold'   },
  { value: 'completed', label: 'Completed' },
];
const EMP_TYPE_OPTIONS = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'contract',  label: 'Contract'  },
  { value: 'per_diem',  label: 'Per Diem'  },
];

// ── Small helpers ─────────────────────────────────────────────────────────────

function StatusBadge({ status, stage }: { status: string; stage: string }) {
  const isDone = status === 'completed' || stage === 'completed';
  const isHold = status === 'on_hold';
  return (
    <span className={cn('px-3 py-1 rounded-full text-xs font-bold',
      isDone ? 'bg-green-100 text-green-700' :
      isHold ? 'bg-amber-100 text-amber-700' :
               'bg-blue-100 text-blue-700')}>
      {isDone ? 'Completed' : isHold ? 'On Hold' : 'In Progress'}
    </span>
  );
}

function DocBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    approved: 'bg-green-100 text-green-700',
    pending:  'bg-amber-100 text-amber-700',
    rejected: 'bg-red-100 text-red-700',
    uploaded: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold capitalize', cfg[status] ?? 'bg-slate-100 text-slate-500')}>
      {status}
    </span>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-slate-800 capitalize">{value || '—'}</p>
    </div>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────

function EditModal({ data, onClose, onSaved }: {
  data: WizardData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    stage:           data.record.stage ?? '',
    status:          data.record.status ?? 'active',
    employment_type: data.record.employment_type ?? '',
    start_date:      data.record.start_date ? data.record.start_date.split('T')[0] : '',
    notes:           data.record.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr('');
    const res = await updateOnboardingRecord(data.record.id, {
      stage:           form.stage || undefined,
      status:          form.status || undefined,
      employment_type: form.employment_type || null,
      start_date:      form.start_date || null,
      notes:           form.notes || null,
    });
    setSaving(false);
    if (!res.success) { setErr(res.error ?? 'Failed to save'); return; }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm pt-8 px-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mb-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-blue-600" /> Edit Onboarding Record
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={save} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Stage</label>
              <select value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Employment Type</label>
              <select value={form.employment_type} onChange={e => setForm(f => ({ ...f, employment_type: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select —</option>
                {EMP_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Start Date</label>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">HR Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={4}
              placeholder="Internal HR notes about this employee's onboarding…"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          {err && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{err}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
              <Save className="w-4 h-4" />{saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── HR Stage + Wizard Step Progress Tracker ───────────────────────────────────

const HR_STAGES = [
  { key: 'pre_hire',       label: 'Pre-Hire',       desc: 'Offer accepted, paperwork initiated'     },
  { key: 'documents',      label: 'Documents',       desc: 'Collecting required documentation'       },
  { key: 'orientation',    label: 'Orientation',     desc: 'Introduction to team and facilities'     },
  { key: 'training',       label: 'Training',        desc: 'Role-specific training courses'          },
  { key: 'manager_review', label: 'Manager Review',  desc: 'Final review by department manager'      },
  { key: 'completed',      label: 'Completed',       desc: 'Onboarding fully complete — welcome!'    },
];

function StepTracker({ data }: { data: WizardData }) {
  const { record } = data;
  const isAllDone   = record.status === 'completed' || record.stage === 'completed';
  const stageIdx    = HR_STAGES.findIndex(s => s.key === record.stage);
  const wizardDone  = record.completed_steps.length > 0 || record.wizard_step > 0;

  return (
    <div className="space-y-6">

      {/* ── HR Pipeline Stages ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500" /> HR Pipeline Stages
          </h3>
          <span className="text-xs text-slate-400">Managed by HR</span>
        </div>
        <div className="relative">
          <div className="absolute left-[19px] top-5 bottom-5 w-0.5 bg-slate-100" />
          <div className="space-y-1">
            {HR_STAGES.map((stage, i) => {
              const done    = i < stageIdx || isAllDone;
              const current = i === stageIdx && !isAllDone;
              return (
                <div key={stage.key} className={cn('relative flex items-start gap-4 px-3 py-3 rounded-xl transition-colors',
                  current ? 'bg-blue-50 border border-blue-100' : done ? 'bg-green-50/40' : 'hover:bg-slate-50')}>
                  <div className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 border-2 transition-all',
                    done    ? 'bg-green-500 border-green-500 text-white' :
                    current ? 'bg-white border-blue-500' :
                              'bg-white border-slate-200')}>
                    {done
                      ? <CheckCircle className="w-5 h-5" />
                      : <span className={cn('text-xs font-bold', current ? 'text-blue-600' : 'text-slate-300')}>{i + 1}</span>}
                  </div>
                  <div className="flex-1 min-w-0 pt-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={cn('text-sm font-semibold', done ? 'text-green-700' : current ? 'text-blue-700' : 'text-slate-400')}>
                        {stage.label}
                      </p>
                      {current && <span className="px-2 py-0.5 bg-blue-600 text-white text-xs font-bold rounded-full">Current Stage</span>}
                      {done   && <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">Done</span>}
                    </div>
                    <p className={cn('text-xs mt-0.5', done ? 'text-green-600/70' : current ? 'text-blue-500/80' : 'text-slate-400')}>
                      {stage.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Employee Self-Service Wizard ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-violet-500" /> Employee Wizard Progress
          </h3>
          <span className="text-xs text-slate-400">Completed by employee</span>
        </div>

        {!wizardDone && !isAllDone ? (
          <div className="py-8 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl">
            <p className="text-slate-500 font-medium text-sm">Employee hasn&apos;t started the wizard yet</p>
            <a href={`/onboarding/${record.employee_id}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-3 text-xs text-blue-600 hover:underline font-medium">
              <ExternalLink className="w-3.5 h-3.5" /> Share wizard link with employee
            </a>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-[19px] top-5 bottom-5 w-0.5 bg-slate-100" />
            <div className="space-y-1">
              {WIZARD_STEPS.map((step, i) => {
                const done    = record.completed_steps.includes(step.key) || i < record.wizard_step || isAllDone;
                const current = i === record.wizard_step && !isAllDone;
                return (
                  <div key={step.key} className={cn('relative flex items-start gap-4 px-3 py-3 rounded-xl transition-colors',
                    current ? 'bg-violet-50 border border-violet-100' : done ? 'bg-green-50/40' : 'hover:bg-slate-50')}>
                    <div className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 border-2 transition-all',
                      done    ? 'bg-green-500 border-green-500 text-white' :
                      current ? 'bg-white border-violet-500' :
                                'bg-white border-slate-200')}>
                      {done
                        ? <CheckCircle className="w-5 h-5" />
                        : <span className={cn('text-xs font-bold', current ? 'text-violet-600' : 'text-slate-300')}>{i + 1}</span>}
                    </div>
                    <div className="flex-1 min-w-0 pt-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={cn('text-sm font-semibold', done ? 'text-green-700' : current ? 'text-violet-700' : 'text-slate-400')}>
                          {step.label}
                        </p>
                        {current && <span className="px-2 py-0.5 bg-violet-600 text-white text-xs font-bold rounded-full">In Progress</span>}
                        {done   && <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">Done</span>}
                      </div>
                      <p className={cn('text-xs mt-0.5', done ? 'text-green-600/70' : current ? 'text-violet-500/80' : 'text-slate-400')}>
                        {step.description}
                      </p>
                      {current && (
                        <p className="text-xs text-violet-500 mt-1 font-medium">Est. {step.estimatedMinutes} min</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab content components ────────────────────────────────────────────────────

function DocumentsTab({ data }: { data: WizardData }) {
  const docs = data.documents;
  const submitted = docs.filter(d => d.status !== 'pending').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">{docs.length} document{docs.length !== 1 ? 's' : ''} required</p>
        <span className={cn('text-sm font-bold', submitted === docs.length && docs.length > 0 ? 'text-green-600' : 'text-slate-500')}>
          {submitted}/{docs.length} submitted
        </span>
      </div>

      {/* Progress bar */}
      {docs.length > 0 && (
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${docs.length > 0 ? Math.round((submitted / docs.length) * 100) : 0}%` }} />
        </div>
      )}

      {docs.length > 0 ? docs.map(doc => (
        <div key={doc.id} className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl">
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
            doc.status === 'approved' ? 'bg-green-50' : doc.status === 'rejected' ? 'bg-red-50' : 'bg-blue-50')}>
            <FileText className={cn('w-5 h-5', doc.status === 'approved' ? 'text-green-500' : doc.status === 'rejected' ? 'text-red-400' : 'text-blue-500')} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">{doc.name}</p>
            <p className="text-xs text-slate-400 mt-0.5 capitalize">{doc.doc_type?.replace(/_/g, ' ')}</p>
            {doc.notes && <p className="text-xs text-amber-600 mt-1">{doc.notes}</p>}
          </div>
          <DocBadge status={doc.status} />
        </div>
      )) : (
        <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-2xl">
          <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No documents required yet</p>
        </div>
      )}
    </div>
  );
}

function TrainingTab({ data }: { data: WizardData }) {
  const tasks     = data.trainingTasks;
  const policies  = data.policies;
  const doneTasks = tasks.filter(t => t.status === 'completed').length;
  const signedPolicies = policies.filter(p => p.acknowledged).length;

  return (
    <div className="space-y-6">
      {/* Training tasks */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-slate-700">Training Tasks</h4>
          <span className={cn('text-sm font-bold', doneTasks === tasks.length && tasks.length > 0 ? 'text-green-600' : 'text-slate-500')}>
            {doneTasks}/{tasks.length} complete
          </span>
        </div>
        {tasks.length > 0 ? tasks.map(task => (
          <div key={task.id} className="flex items-start gap-3 p-4 bg-white border border-slate-200 rounded-xl mb-3">
            <div className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5',
              task.status === 'completed' ? 'bg-green-500' : 'bg-slate-100 border-2 border-slate-200')}>
              {task.status === 'completed' && <CheckCircle className="w-4 h-4 text-white" />}
            </div>
            <div className="flex-1">
              <p className={cn('text-sm font-semibold', task.status === 'completed' ? 'text-slate-500 line-through' : 'text-slate-800')}>
                {task.title}
              </p>
              {task.description && <p className="text-xs text-slate-400 mt-0.5">{task.description}</p>}
              {task.due_date && (
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Due {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
            <span className={cn('text-xs font-semibold px-2 py-1 rounded-full capitalize',
              task.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500')}>
              {task.status}
            </span>
          </div>
        )) : (
          <div className="py-8 text-center border-2 border-dashed border-slate-100 rounded-2xl">
            <p className="text-slate-400 text-sm">No training tasks assigned</p>
          </div>
        )}
      </div>

      {/* Policies */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-slate-700">Policy Acknowledgements</h4>
          <span className={cn('text-sm font-bold', signedPolicies === policies.length && policies.length > 0 ? 'text-green-600' : 'text-slate-500')}>
            {signedPolicies}/{policies.length} signed
          </span>
        </div>
        {policies.length > 0 ? policies.map(p => (
          <div key={p.id} className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl mb-3">
            <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0',
              p.acknowledged ? 'bg-green-100' : 'bg-slate-100')}>
              <Shield className={cn('w-4 h-4', p.acknowledged ? 'text-green-600' : 'text-slate-300')} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">{p.policy_name}</p>
              {p.acknowledged_at && (
                <p className="text-xs text-green-600 mt-0.5">
                  Signed {new Date(p.acknowledged_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
            <span className={cn('text-xs font-semibold px-2 py-1 rounded-full',
              p.acknowledged ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500')}>
              {p.acknowledged ? 'Signed' : 'Pending'}
            </span>
          </div>
        )) : (
          <div className="py-8 text-center border-2 border-dashed border-slate-100 rounded-2xl">
            <p className="text-slate-400 text-sm">No policies assigned</p>
          </div>
        )}
      </div>
    </div>
  );
}

function EquipmentTab({ data }: { data: WizardData }) {
  const equipment = data.equipment;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-bold text-slate-700">Assigned Equipment</h4>
        <span className="text-sm text-slate-400">{equipment.length} item{equipment.length !== 1 ? 's' : ''}</span>
      </div>
      {equipment.length > 0 ? equipment.map(eq => (
        <div key={eq.id} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl">
          <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center shrink-0">
            <Package className="w-5 h-5 text-violet-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">{eq.equipment_name}</p>
            <div className="flex items-center gap-3 mt-0.5">
              {eq.equipment_type && <p className="text-xs text-slate-400 capitalize">{eq.equipment_type.replace(/_/g, ' ')}</p>}
              {eq.serial_number && <p className="text-xs text-slate-400">S/N: {eq.serial_number}</p>}
            </div>
            {eq.assigned_date && (
              <p className="text-xs text-slate-400 mt-1">
                Assigned {new Date(eq.assigned_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </div>
          <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full capitalize',
            eq.status === 'assigned'  ? 'bg-blue-100 text-blue-700' :
            eq.status === 'returned'  ? 'bg-slate-100 text-slate-500' :
                                        'bg-green-100 text-green-700')}>
            {eq.status}
          </span>
        </div>
      )) : (
        <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-2xl">
          <Package className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No equipment assigned</p>
        </div>
      )}
    </div>
  );
}

function CredentialsTab({ data }: { data: WizardData }) {
  const vc = data.vetCredentials;

  if (!data.requiresVetCredentials) {
    return (
      <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-2xl">
        <Award className="w-10 h-10 text-slate-200 mx-auto mb-3" />
        <p className="text-slate-400 font-medium">No vet credentials required for this role</p>
      </div>
    );
  }

  if (!vc) {
    return (
      <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-2xl">
        <Award className="w-10 h-10 text-amber-200 mx-auto mb-3" />
        <p className="text-amber-600 font-medium">Credentials not yet submitted</p>
        <p className="text-slate-400 text-sm mt-1">Employee must complete the compliance step</p>
      </div>
    );
  }

  const fields = [
    { label: 'License Number',       value: vc.license_number ?? '—'  },
    { label: 'License State',        value: vc.license_state  ?? '—'  },
    { label: 'License Expiry',       value: vc.license_expiry ? new Date(vc.license_expiry).toLocaleDateString() : '—' },
    { label: 'DEA Number',           value: vc.dea_number     ?? '—'  },
    { label: 'DEA Expiry',           value: vc.dea_expiry ? new Date(vc.dea_expiry).toLocaleDateString() : '—' },
    { label: 'Verification Status',  value: vc.verification_status    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {fields.map(f => <InfoCard key={f.label} label={f.label} value={f.value} />)}
      </div>
      {vc.specializations.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Specializations</p>
          <div className="flex flex-wrap gap-2">
            {vc.specializations.map(s => (
              <span key={s} className="px-3 py-1 bg-violet-50 text-violet-700 text-xs font-semibold rounded-full capitalize">
                {s.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

type Tab = 'progress' | 'documents' | 'training' | 'equipment' | 'credentials';

export function EmployeeDetailView({ employeeId, onBack, onRefreshList }: {
  employeeId: string;
  onBack: () => void;
  onRefreshList: () => void;
}) {
  const [data, setData]             = useState<WizardData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState<Tab>('progress');
  const [showEdit, setShowEdit]     = useState(false);
  const [showTerminate, setShowTerminate] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  function load() {
    setLoading(true);
    getWizardData(employeeId).then(res => {
      setData(res.data);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, [employeeId]);

  async function doCancel() {
    if (!data) return;
    setCancelling(true);
    await cancelOnboardingRecord(data.record.id);
    setCancelling(false);
    onRefreshList();
    onBack();
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
        <p className="text-slate-400 text-sm">Loading employee details…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <AlertCircle className="w-10 h-10 text-red-300" />
        <p className="text-slate-500 font-medium">Could not load employee data</p>
        <button onClick={onBack} className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50">
          ← Back to Pipeline
        </button>
      </div>
    );
  }

  const { record, employee, hospital, manager } = data;
  const isCompleted = record.status === 'completed' || record.stage === 'completed';
  const doneTasks   = data.trainingTasks.filter(t => t.status === 'completed').length;
  const signedPols  = data.policies.filter(p => p.acknowledged).length;
  const submittedDocs = data.documents.filter(d => d.status !== 'pending').length;
  const fullName    = `${employee.first_name} ${employee.last_name}`;

  // Use HR stage as the primary progress driver — wizard_step is employee self-service
  // and starts at 0 even when HR has advanced the stage significantly
  const realPct = (() => {
    if (isCompleted) return 100;
    const stageIdx  = HR_STAGES.findIndex(s => s.key === record.stage);
    const stagePct  = stageIdx >= 0 ? Math.round((stageIdx / (HR_STAGES.length - 1)) * 100) : 0;
    const wizardPct = record.wizard_step > 0
      ? Math.round((record.wizard_step / (WIZARD_STEPS.length - 1)) * 100)
      : 0;
    return Math.max(stagePct, wizardPct, record.progress_pct);
  })();

  const hrStageIdx = HR_STAGES.findIndex(s => s.key === record.stage);

  const TABS: { key: Tab; label: string; count?: string }[] = [
    { key: 'progress',    label: 'Progress'     },
    { key: 'documents',   label: 'Documents',    count: `${submittedDocs}/${data.documents.length}`   },
    { key: 'training',    label: 'Training',     count: `${doneTasks}/${data.trainingTasks.length}`   },
    { key: 'equipment',   label: 'Equipment',    count: `${data.equipment.length}`                    },
    ...(data.requiresVetCredentials ? [{ key: 'credentials' as Tab, label: 'Credentials' }] : []),
  ];

  return (
    <div className="flex flex-col gap-6">

      {/* ── Breadcrumb back ── */}
      <div className="flex items-center gap-2">
        <button onClick={onBack}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 font-medium transition-colors group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to Pipeline
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-sm text-slate-700 font-semibold truncate">{fullName}</span>
      </div>

      {/* ── Hero card ── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        {/* Color band */}
        <div className="h-2 w-full" style={{ background: hospital?.color ?? '#3b82f6' }} />

        <div className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-5">
            {/* Avatar */}
            {employee.avatar_url ? (
              <img src={employee.avatar_url} alt={fullName}
                className="w-20 h-20 rounded-2xl object-cover ring-4 ring-slate-100 shrink-0" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold shrink-0 ring-4 ring-slate-100">
                {initials(fullName)}
              </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-start gap-3 mb-2">
                <h1 className="text-2xl font-bold text-slate-800 leading-tight">{fullName}</h1>
                <StatusBadge status={record.status} stage={record.stage} />
              </div>
              <p className="text-slate-500 text-sm mb-1">
                {employee.job_title ?? 'Employee'}
                {employee.department ? <span className="text-slate-400"> · {employee.department}</span> : null}
                {employee.role ? <span className="text-slate-400"> · <span className="capitalize">{employee.role.replace(/_/g, ' ')}</span></span> : null}
              </p>
              {hospital && (
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: hospital.color ?? '#6b7280' }} />
                  <span className="text-sm text-slate-600 font-medium">{hospital.name}</span>
                </div>
              )}
              {/* Contact row */}
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                {employee.email && (
                  <a href={`mailto:${employee.email}`} className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
                    <Mail className="w-3.5 h-3.5" />{employee.email}
                  </a>
                )}
                {hospital?.phone && (
                  <span className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Phone className="w-3.5 h-3.5" />{hospital.phone}
                  </span>
                )}
                {hospital?.address && (
                  <span className="flex items-center gap-1.5 text-xs text-slate-500">
                    <MapPin className="w-3.5 h-3.5" />{hospital.address}
                  </span>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap sm:flex-col gap-2 sm:items-end shrink-0">
              <button onClick={() => setShowEdit(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-semibold rounded-xl transition-colors">
                <Edit3 className="w-4 h-4" /> Edit Record
              </button>
              <a href={`/onboarding/${employeeId}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors">
                <ExternalLink className="w-4 h-4" /> Open Wizard
              </a>
              <button onClick={() => setShowTerminate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold rounded-xl transition-colors">
                <UserMinus className="w-4 h-4" /> Terminate
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-5 pt-5 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-700">Overall Progress</span>
                <span className="text-xs text-slate-400 capitalize">· Stage: {record.stage?.replace(/_/g, ' ')}</span>
              </div>
              <span className={cn('text-lg font-bold tabular-nums', realPct === 100 ? 'text-green-600' : 'text-blue-600')}>
                {realPct}%
              </span>
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${realPct}%`, background: realPct === 100 ? '#22c55e' : '#3b82f6' }} />
            </div>
            {/* HR Stage markers — 6 dots matching the 6 pipeline stages */}
            <div className="flex items-center justify-between mt-1.5 px-0.5">
              {HR_STAGES.map((stage, i) => {
                const done = i <= hrStageIdx || isCompleted;
                return (
                  <div key={stage.key} title={stage.label}
                    className={cn('w-2.5 h-2.5 rounded-full transition-all border-2',
                      done
                        ? i === hrStageIdx && !isCompleted
                          ? 'bg-blue-500 border-blue-500 scale-125'
                          : 'bg-blue-500 border-blue-500'
                        : 'bg-white border-slate-300'
                    )} />
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-1 px-0.5">
              {HR_STAGES.map((stage, i) => (
                <span key={stage.key}
                  className={cn('text-[9px] font-medium', i === hrStageIdx && !isCompleted ? 'text-blue-600' : i < hrStageIdx || isCompleted ? 'text-slate-400' : 'text-slate-300')}>
                  {stage.label.split(' ')[0]}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: 'HR Stage',
            value: `${hrStageIdx >= 0 ? hrStageIdx + 1 : 1}/${HR_STAGES.length}`,
            sub: isCompleted ? 'All stages done' : (HR_STAGES[hrStageIdx]?.label ?? 'Pre-Hire'),
            color: isCompleted ? 'text-green-600' : 'text-blue-600',
          },
          {
            label: 'Documents',
            value: `${submittedDocs}/${data.documents.length}`,
            sub: data.documents.length === 0 ? 'none required' : submittedDocs === data.documents.length ? 'all submitted' : 'submitted',
            color: submittedDocs === data.documents.length && data.documents.length > 0 ? 'text-green-600' : 'text-violet-600',
          },
          {
            label: 'Training',
            value: `${doneTasks}/${data.trainingTasks.length}`,
            sub: data.trainingTasks.length === 0 ? 'none assigned' : 'tasks complete',
            color: doneTasks === data.trainingTasks.length && data.trainingTasks.length > 0 ? 'text-green-600' : 'text-emerald-600',
          },
          {
            label: 'Policies Signed',
            value: `${signedPols}/${data.policies.length}`,
            sub: data.policies.length === 0 ? 'none assigned' : 'acknowledged',
            color: signedPols === data.policies.length && data.policies.length > 0 ? 'text-green-600' : 'text-amber-600',
          },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-4 border border-slate-200 bg-white">
            <p className="text-xs text-slate-400 font-medium mb-1">{s.label}</p>
            <p className={cn('text-2xl font-bold tabular-nums', s.color)}>{s.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Manager + HR notes ── */}
      {(manager || record.notes || record.employment_type || record.start_date) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {manager && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Reporting Manager</p>
              <div className="flex items-center gap-3">
                {manager.avatar_url ? (
                  <img src={manager.avatar_url} alt={`${manager.first_name} ${manager.last_name}`}
                    className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-sm font-bold">
                    {initials(`${manager.first_name} ${manager.last_name}`)}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-slate-800">{manager.first_name} {manager.last_name}</p>
                  <p className="text-xs text-slate-400">{manager.job_title ?? 'Manager'}</p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Onboarding Details</p>
            <div className="grid grid-cols-2 gap-2">
              {record.employment_type && (
                <InfoCard label="Employment Type" value={record.employment_type.replace(/_/g, ' ')} />
              )}
              {record.start_date && (
                <InfoCard label="Start Date" value={new Date(record.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
              )}
              <InfoCard label="Record Created" value={new Date(record.completed_at ?? '').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) !== 'Invalid Date'
                ? new Date(record.completed_at ?? '').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : '—'} />
            </div>
            {record.notes && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-slate-700 leading-relaxed">
                <p className="font-semibold text-amber-700 mb-1">HR Notes</p>
                {record.notes}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        {/* Tab bar */}
        <div className="flex border-b border-slate-100 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn('flex items-center gap-2 px-5 py-4 text-sm font-semibold whitespace-nowrap transition-colors border-b-2 shrink-0',
                tab === t.key ? 'border-blue-600 text-blue-600 bg-blue-50/40' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50')}>
              {t.label}
              {t.count !== undefined && (
                <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-bold',
                  tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500')}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-6">
          {tab === 'progress'    && <StepTracker data={data} />}
          {tab === 'documents'   && <DocumentsTab data={data} />}
          {tab === 'training'    && <TrainingTab data={data} />}
          {tab === 'equipment'   && <EquipmentTab data={data} />}
          {tab === 'credentials' && <CredentialsTab data={data} />}
        </div>
      </div>

      {/* ── Cancel onboarding ── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Danger Zone</p>
        {!confirmCancel ? (
          <button onClick={() => setConfirmCancel(true)}
            className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-xl transition-colors font-medium">
            <Trash2 className="w-4 h-4" /> Cancel Onboarding Record
          </button>
        ) : (
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-3 max-w-md">
            <p className="text-sm text-red-700 font-medium">
              Cancel the onboarding record for <strong>{fullName}</strong>? This removes them from the pipeline.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmCancel(false)}
                className="flex-1 py-2 border border-slate-200 rounded-xl text-sm font-semibold bg-white">Keep Record</button>
              <button onClick={doCancel} disabled={cancelling}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                {cancelling ? 'Cancelling…' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showEdit && (
        <EditModal
          data={data}
          onClose={() => setShowEdit(false)}
          onSaved={() => { load(); onRefreshList(); }}
        />
      )}
      {showTerminate && (
        <TerminateModal
          emp={{ employee_id: employeeId, employee_name: fullName }}
          onClose={() => setShowTerminate(false)}
          onDone={() => { setShowTerminate(false); onRefreshList(); onBack(); }}
        />
      )}
    </div>
  );
}
