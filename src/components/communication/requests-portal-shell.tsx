'use client';

import { useState } from 'react';
import {
  CalendarDays, Package, GraduationCap, FileText, Clock, CheckCircle2,
  XCircle, AlertCircle, ChevronRight, Loader2, X, Send, Inbox,
} from 'lucide-react';
import {
  createLeaveRequest, createEquipmentRequest, createTrainingRequest,
  createDocumentRequest, getMyRequests, type RequestSummary,
} from '@/lib/actions/requests';

// ── Types ──────────────────────────────────────────────────────────────────────
// DB check: 'vacation' | 'sick' | 'personal' | 'bereavement' | 'parental' | 'unpaid' | 'other'
type LeaveType = 'vacation' | 'sick' | 'personal' | 'bereavement' | 'parental' | 'unpaid' | 'other';
type Priority  = 'low' | 'medium' | 'high' | 'urgent';

type PortalRequest = RequestSummary;

type RequestModal =
  | { kind: 'leave' }
  | { kind: 'equipment' }
  | { kind: 'training' }
  | { kind: 'document' };

// ── Helpers ───────────────────────────────────────────────────────────────────
const REQUEST_TILES = [
  {
    kind: 'leave' as const,
    label: 'Leave Request',
    desc: 'Annual, sick, emergency, or other leave types',
    Icon: CalendarDays,
    color: '#3B82F6',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
    iconBg: 'bg-blue-100',
  },
  {
    kind: 'equipment' as const,
    label: 'Equipment Request',
    desc: 'Request equipment, supplies, or hardware',
    Icon: Package,
    color: '#10B981',
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
    iconBg: 'bg-emerald-100',
  },
  {
    kind: 'training' as const,
    label: 'Training Request',
    desc: 'Request access to courses or certification',
    Icon: GraduationCap,
    color: '#8B5CF6',
    bg: 'bg-purple-50',
    border: 'border-purple-100',
    iconBg: 'bg-purple-100',
  },
  {
    kind: 'document' as const,
    label: 'Document Request',
    desc: 'Employment letters, certificates, verifications',
    Icon: FileText,
    color: '#F59E0B',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
    iconBg: 'bg-amber-100',
  },
];

const STATUS_META: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  pending:      { label: 'Pending',      color: 'text-amber-600 bg-amber-50 border-amber-200',        Icon: Clock },
  approved:     { label: 'Approved',     color: 'text-emerald-600 bg-emerald-50 border-emerald-200',  Icon: CheckCircle2 },
  completed:    { label: 'Completed',    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',  Icon: CheckCircle2 },
  rejected:     { label: 'Rejected',     color: 'text-red-600 bg-red-50 border-red-200',              Icon: XCircle },
  escalated:    { label: 'Escalated',    color: 'text-orange-600 bg-orange-50 border-orange-200',     Icon: AlertCircle },
  cancelled:    { label: 'Cancelled',    color: 'text-slate-500 bg-slate-50 border-slate-200',        Icon: XCircle },
};

const TYPE_LABELS: Record<string, string> = {
  leave: 'Leave', equipment: 'Equipment', training: 'Training',
  document_verification: 'Document', purchase: 'Purchase', meeting: 'Meeting',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function typeIcon(type: string): React.ElementType {
  if (type === 'leave') return CalendarDays;
  if (type === 'equipment') return Package;
  if (type === 'training') return GraduationCap;
  return FileText;
}

// ── Leave Form ────────────────────────────────────────────────────────────────
function LeaveForm({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [leaveType, setLeaveType]   = useState<LeaveType>('vacation');
  const [startDate, setStartDate]   = useState('');
  const [endDate, setEndDate]       = useState('');
  const [reason, setReason]         = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // Values must match DB check constraint: vacation|sick|personal|bereavement|parental|unpaid|other
  const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
    { value: 'vacation',    label: 'Annual / Vacation' },
    { value: 'sick',        label: 'Sick Leave' },
    { value: 'personal',    label: 'Personal Leave' },
    { value: 'bereavement', label: 'Bereavement Leave' },
    { value: 'parental',    label: 'Parental Leave' },
    { value: 'unpaid',      label: 'Unpaid Leave' },
    { value: 'other',       label: 'Other' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate || !reason.trim()) { setError('All fields are required.'); return; }
    setSubmitting(true); setError(null);
    const r = await createLeaveRequest({
      leave_type: leaveType, start_date: startDate, end_date: endDate, reason: reason.trim(),
    });
    if (r.success) { onSuccess(); }
    else { setError(r.error ?? 'Failed to submit request.'); setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Leave Type</label>
        <div className="grid grid-cols-2 gap-2">
          {LEAVE_TYPES.map(lt => (
            <button key={lt.value} type="button" onClick={() => setLeaveType(lt.value)}
              className={`px-3 py-2 rounded-xl border text-xs font-medium text-left transition-all ${
                leaveType === lt.value ? 'border-[#1e3a5f] bg-blue-50 text-[#1e3a5f]' : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}>
              {lt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Start Date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition-all" />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">End Date</label>
          <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition-all" />
        </div>
      </div>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Reason / Notes</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4}
          placeholder="Please provide a reason for your leave request…"
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition-all resize-none" />
      </div>
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose}
          className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={submitting}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1e3a5f] hover:bg-[#16304f] disabled:opacity-50 text-white text-sm font-semibold transition-colors">
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</> : <><Send className="h-4 w-4" />Submit Request</>}
        </button>
      </div>
    </form>
  );
}

// ── Equipment Form ────────────────────────────────────────────────────────────
function EquipmentForm({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [itemName, setItemName]     = useState('');
  const [itemType, setItemType]     = useState('medical_equipment');
  const [quantity, setQuantity]     = useState('1');
  const [priority, setPriority]     = useState<Priority>('medium');
  const [justification, setJust]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const PRIORITIES: { value: Priority; label: string; color: string }[] = [
    { value: 'low',    label: 'Low',    color: 'border-slate-200 text-slate-600' },
    { value: 'medium', label: 'Medium', color: 'border-amber-200 text-amber-700' },
    { value: 'high',   label: 'High',   color: 'border-orange-200 text-orange-700' },
    { value: 'urgent', label: 'Urgent', color: 'border-red-200 text-red-600' },
  ];

  // Values must match DB check constraint: computer|phone|software|furniture|medical_equipment|vehicle|other
  const EQUIP_TYPES: Array<{ value: string; label: string }> = [
    { value: 'medical_equipment', label: 'Medical Equipment' },
    { value: 'computer',          label: 'Computer / Laptop' },
    { value: 'phone',             label: 'Phone / Tablet' },
    { value: 'software',          label: 'Software / Licence' },
    { value: 'furniture',         label: 'Furniture / Fittings' },
    { value: 'vehicle',           label: 'Vehicle' },
    { value: 'other',             label: 'Other' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim() || !itemType || !justification.trim()) {
      setError('Item name, type and justification are required.'); return;
    }
    setSubmitting(true); setError(null);
    const r = await createEquipmentRequest({
      equipment_name: itemName.trim(),
      equipment_type: itemType,
      quantity: parseInt(quantity) || 1,
      priority,
      business_justification: justification.trim(),
    });
    if (r.success) { onSuccess(); }
    else { setError(r.error ?? 'Failed to submit request.'); setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Item / Equipment Name</label>
        <input value={itemName} onChange={e => setItemName(e.target.value)} placeholder="e.g. Stethoscope, Laptop, Surgical gloves"
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition-all" />
      </div>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Equipment Type</label>
        <div className="grid grid-cols-3 gap-2">
          {EQUIP_TYPES.map(t => (
            <button key={t.value} type="button" onClick={() => setItemType(t.value)}
              className={`px-2 py-2 rounded-xl border text-[11px] font-medium text-center transition-all ${
                itemType === t.value ? 'border-[#1e3a5f] bg-blue-50 text-[#1e3a5f]' : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Quantity</label>
          <input type="number" min="1" max="999" value={quantity} onChange={e => setQuantity(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition-all" />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Priority</label>
          <div className="grid grid-cols-2 gap-1">
            {PRIORITIES.map(p => (
              <button key={p.value} type="button" onClick={() => setPriority(p.value)}
                className={`px-2 py-1.5 rounded-lg border text-[11px] font-semibold text-center transition-all ${
                  priority === p.value ? 'border-[#1e3a5f] bg-blue-50 text-[#1e3a5f]' : `${p.color} hover:border-slate-300`
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Business Justification</label>
        <textarea value={justification} onChange={e => setJust(e.target.value)} rows={3}
          placeholder="Describe why this equipment is needed…"
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition-all resize-none" />
      </div>
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose}
          className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={submitting}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1e3a5f] hover:bg-[#16304f] disabled:opacity-50 text-white text-sm font-semibold transition-colors">
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</> : <><Send className="h-4 w-4" />Submit Request</>}
        </button>
      </div>
    </form>
  );
}

// ── Training Form ─────────────────────────────────────────────────────────────
function TrainingForm({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  // Values must match DB check constraint: certification|workshop|conference|online_course|mentoring|other
  const TRAINING_TYPES: Array<{ value: string; label: string }> = [
    { value: 'online_course',  label: 'Online Course' },
    { value: 'workshop',       label: 'Workshop' },
    { value: 'conference',     label: 'Conference' },
    { value: 'certification',  label: 'Certification' },
    { value: 'mentoring',      label: 'Mentorship' },
    { value: 'other',          label: 'Other' },
  ];
  const [title, setTitle]           = useState('');
  const [trainingType, setTType]    = useState('online_course');
  const [provider, setProvider]     = useState('');
  const [startDate, setStartDate]   = useState('');
  const [endDate, setEndDate]       = useState('');
  const [objectives, setObjectives] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startDate || !endDate || !objectives.trim()) {
      setError('Course name, dates and learning objectives are required.'); return;
    }
    setSubmitting(true); setError(null);
    const r = await createTrainingRequest({
      training_title: title.trim(),
      training_type: trainingType,
      provider_name: provider.trim() || undefined,
      start_date: startDate,
      end_date: endDate,
      learning_objectives: objectives.trim(),
    });
    if (r.success) { onSuccess(); }
    else { setError(r.error ?? 'Failed to submit request.'); setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Course / Training Name</label>
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Advanced Veterinary Anaesthesia, CPR Certification"
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition-all" />
      </div>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Training Type</label>
        <div className="grid grid-cols-3 gap-2">
          {TRAINING_TYPES.map(t => (
            <button key={t.value} type="button" onClick={() => setTType(t.value)}
              className={`px-2 py-2 rounded-xl border text-[11px] font-medium text-center transition-all ${
                trainingType === t.value ? 'border-[#1e3a5f] bg-blue-50 text-[#1e3a5f]' : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Provider <span className="normal-case font-normal text-slate-400">(optional)</span></label>
        <input value={provider} onChange={e => setProvider(e.target.value)} placeholder="e.g. BVNA, Royal College of Veterinary Surgeons"
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition-all" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Start Date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition-all" />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">End Date</label>
          <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition-all" />
        </div>
      </div>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Learning Objectives</label>
        <textarea value={objectives} onChange={e => setObjectives(e.target.value)} rows={3}
          placeholder="What skills or knowledge will you gain? How does this benefit your role?"
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition-all resize-none" />
      </div>
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose}
          className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={submitting}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1e3a5f] hover:bg-[#16304f] disabled:opacity-50 text-white text-sm font-semibold transition-colors">
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</> : <><Send className="h-4 w-4" />Submit Request</>}
        </button>
      </div>
    </form>
  );
}

// ── Document Form ─────────────────────────────────────────────────────────────
// DB check constraint: document_type IN ('license','certification','diploma','identity','background_check','reference','other')
const DOC_TYPE_OPTIONS: Array<{ value: string; label: string; hint: string }> = [
  { value: 'license',          label: 'Professional License',    hint: 'e.g. Veterinary practice licence' },
  { value: 'certification',    label: 'Certification',           hint: 'e.g. CPR, specialist certificate' },
  { value: 'diploma',          label: 'Diploma / Degree',        hint: 'e.g. BVSc, nursing diploma' },
  { value: 'identity',         label: 'Identity Document',       hint: 'e.g. Passport, Emirates ID copy' },
  { value: 'background_check', label: 'Background Check',        hint: 'e.g. Police clearance, DBS check' },
  { value: 'reference',        label: 'Reference / Experience',  hint: 'e.g. Employment letter, experience certificate' },
  { value: 'other',            label: 'Other',                   hint: 'Any other document type' },
];

function DocumentForm({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [docType, setDocType]       = useState(DOC_TYPE_OPTIONS[0].value);
  const [docName, setDocName]       = useState('');
  const [issuedBy, setIssuedBy]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docName.trim()) { setError('Please specify the document name / purpose.'); return; }
    setSubmitting(true); setError(null);
    const r = await createDocumentRequest({
      document_type: docType,
      document_name: docName.trim(),
      document_url: 'pending',
      issued_by: issuedBy.trim() || undefined,
    });
    if (r.success) { onSuccess(); }
    else { setError(r.error ?? 'Failed to submit request.'); setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Document Type</label>
        <div className="grid grid-cols-2 gap-2">
          {DOC_TYPE_OPTIONS.map(opt => (
            <button key={opt.value} type="button" onClick={() => setDocType(opt.value)}
              className={`px-3 py-2.5 rounded-xl border text-left transition-all ${
                docType === opt.value ? 'border-[#1e3a5f] bg-blue-50 text-[#1e3a5f]' : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}>
              <p className={`text-xs font-semibold leading-tight ${docType === opt.value ? 'text-[#1e3a5f]' : 'text-slate-700'}`}>{opt.label}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{opt.hint}</p>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Document Name / Purpose</label>
        <input value={docName} onChange={e => setDocName(e.target.value)}
          placeholder="e.g. Visa application, Bank loan, Embassy submission"
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition-all" />
      </div>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Issued By <span className="normal-case font-normal text-slate-400">(optional)</span></label>
        <input value={issuedBy} onChange={e => setIssuedBy(e.target.value)}
          placeholder="e.g. HR Department, Hospital Administration"
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 focus:border-[#1e3a5f] transition-all" />
      </div>
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onClose}
          className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={submitting}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1e3a5f] hover:bg-[#16304f] disabled:opacity-50 text-white text-sm font-semibold transition-colors">
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</> : <><Send className="h-4 w-4" />Submit Request</>}
        </button>
      </div>
    </form>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
interface RequestsPortalShellProps {
  initialRequests: PortalRequest[];
}

export function RequestsPortalShell({ initialRequests }: RequestsPortalShellProps) {
  const [modal, setModal]           = useState<RequestModal | null>(null);
  const [requests, setRequests]     = useState<PortalRequest[]>(initialRequests);
  const [loadingReqs, setLoading]   = useState(false);
  const [successMsg, setSuccess]    = useState<string | null>(null);
  const [filterStatus, setFilter]   = useState<string>('all');

  const MODAL_LABELS: Record<RequestModal['kind'], string> = {
    leave: 'Leave Request', equipment: 'Equipment Request',
    training: 'Training Request', document: 'Document Request',
  };

  const MODAL_ICONS: Record<RequestModal['kind'], React.ElementType> = {
    leave: CalendarDays, equipment: Package, training: GraduationCap, document: FileText,
  };

  const handleSuccess = async (label: string) => {
    setModal(null);
    setSuccess(`${label} submitted successfully. You'll be notified when it's reviewed.`);
    setTimeout(() => setSuccess(null), 5000);
    // Refresh requests list
    setLoading(true);
    const r = await getMyRequests();
    if (r.success) setRequests(r.data);
    setLoading(false);
  };

  const filteredRequests = filterStatus === 'all'
    ? requests
    : filterStatus === 'pending'
      ? requests.filter(r => r.status === 'pending' || r.status === 'escalated')
      : filterStatus === 'approved'
        ? requests.filter(r => r.status === 'approved' || r.status === 'completed')
        : filterStatus === 'rejected'
          ? requests.filter(r => r.status === 'rejected' || r.status === 'cancelled')
          : requests.filter(r => r.status === filterStatus);

  const pendingCount  = requests.filter(r => r.status === 'pending' || r.status === 'escalated').length;
  const approvedCount = requests.filter(r => r.status === 'approved' || r.status === 'completed').length;
  const rejectedCount = requests.filter(r => r.status === 'rejected' || r.status === 'cancelled').length;

  const FILTER_OPTS: Array<{ value: string; label: string; count?: number }> = [
    { value: 'all',      label: 'All',      count: requests.length },
    { value: 'pending',  label: 'Pending',  count: pendingCount },
    { value: 'approved', label: 'Approved', count: approvedCount },
    { value: 'rejected', label: 'Rejected', count: rejectedCount },
  ];

  return (
    <div className="flex flex-col min-h-0 h-full overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-6 py-5 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1e3a5f] flex items-center justify-center shrink-0">
            <Inbox className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">My Requests</h1>
            <p className="text-[12px] text-slate-400">Submit and track your workplace requests</p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

          {/* Success toast */}
          {successMsg && (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              <p className="text-sm text-emerald-700 flex-1">{successMsg}</p>
              <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-emerald-600"><X className="h-4 w-4" /></button>
            </div>
          )}

          {/* Request type tiles */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">New Request</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {REQUEST_TILES.map(tile => {
                const { Icon } = tile;
                return (
                  <button key={tile.kind} onClick={() => setModal({ kind: tile.kind })}
                    className={`group flex flex-col items-start gap-3 p-4 rounded-2xl border-2 ${tile.bg} ${tile.border} hover:shadow-md hover:-translate-y-0.5 transition-all text-left`}>
                    <div className={`w-10 h-10 rounded-xl ${tile.iconBg} flex items-center justify-center`}>
                      <Icon className="h-5 w-5" style={{ color: tile.color }} />
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-slate-800 leading-tight">{tile.label}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{tile.desc}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition-transform mt-auto" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* My requests history */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">My Requests</p>
              <div className="flex items-center gap-1">
                {FILTER_OPTS.map(f => (
                  <button key={f.value} onClick={() => setFilter(f.value)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                      filterStatus === f.value ? 'bg-[#1e3a5f] text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                    }`}>
                    {f.label}
                    {f.count != null && f.count > 0 && (
                      <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${filterStatus === f.value ? 'bg-white/20' : 'bg-slate-200 text-slate-600'}`}>
                        {f.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {loadingReqs ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center bg-slate-50 rounded-2xl border border-slate-100">
                <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center mb-3">
                  <Inbox className="h-6 w-6 text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-500">No requests{filterStatus !== 'all' ? ` with status "${filterStatus}"` : ' yet'}</p>
                <p className="text-[12px] text-slate-400 mt-1">Use the tiles above to submit a new request.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredRequests.map(req => {
                  const meta   = STATUS_META[req.status] ?? STATUS_META.pending;
                  const TypeIcon = typeIcon(req.request_type);
                  return (
                    <div key={req.id}
                      className="flex items-center gap-4 bg-white border border-slate-100 rounded-2xl px-4 py-3.5 hover:shadow-sm hover:border-slate-200 transition-all">
                      <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                        <TypeIcon className="h-4 w-4 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[13px] font-semibold text-slate-800">
                            {req.title ?? (TYPE_LABELS[req.request_type] ?? req.request_type) + ' Request'}
                          </p>
                          {req.priority && req.priority !== 'medium' && (
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                              req.priority === 'urgent' ? 'bg-red-50 text-red-600' :
                              req.priority === 'high'   ? 'bg-orange-50 text-orange-600' :
                                                          'bg-slate-100 text-slate-500'
                            }`}>{req.priority}</span>
                          )}
                        </div>
                        {req.description && <p className="text-[12px] text-slate-400 truncate mt-0.5">{req.description}</p>}
                        <p className="text-[11px] text-slate-400 mt-0.5">{formatDate(req.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold ${meta.color}`}>
                          <meta.Icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Request Modal ────────────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b bg-[#1e3a5f] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                {(() => { const Icon = MODAL_ICONS[modal.kind]; return <Icon className="h-5 w-5 text-white/70" />; })()}
                <div>
                  <h3 className="text-base font-bold text-white">{MODAL_LABELS[modal.kind]}</h3>
                  <p className="text-[12px] text-white/60 mt-0.5">Fill in the details below and submit</p>
                </div>
              </div>
              <button onClick={() => setModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-6">
              {modal.kind === 'leave'     && <LeaveForm     onSuccess={() => handleSuccess(MODAL_LABELS.leave)}     onClose={() => setModal(null)} />}
              {modal.kind === 'equipment' && <EquipmentForm onSuccess={() => handleSuccess(MODAL_LABELS.equipment)} onClose={() => setModal(null)} />}
              {modal.kind === 'training'  && <TrainingForm  onSuccess={() => handleSuccess(MODAL_LABELS.training)}  onClose={() => setModal(null)} />}
              {modal.kind === 'document'  && <DocumentForm  onSuccess={() => handleSuccess(MODAL_LABELS.document)}  onClose={() => setModal(null)} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
