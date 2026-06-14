'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  Briefcase, Users, Calendar, Star, Plus, X, Share2, Mail,
  Phone, Link, Download, FileText, Clock, MapPin, Video,
  CheckCircle, XCircle, RefreshCw, ChevronRight,
  Copy, Send, AlertCircle, UserMinus,
} from 'lucide-react';
import {
  getHiringData, createJobPosting, updateJobStatus, updateApplication,
  scheduleInterview, createHiringEvent, terminateEmployee,
  sendOfferLetter, markOfferSigned, sendNDA, markNDASigned,
  addHiringDocument, updateDocumentStatus,
} from '@/lib/actions/hiring';
import type { JobPosting, JobApplication, HiringEvent, Interview, HiringDocument } from '@/lib/actions/hiring';
import { cn } from '@/lib/utils';
import type { SectionProps } from './types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtSalary(min: number | null, max: number | null, type: string) {
  if (!min && !max) return 'Salary TBD';
  const isHourly = type === 'part_time';
  const fmt = (n: number) => isHourly ? `$${n}/hr` : `$${(n / 1000).toFixed(0)}k`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  return fmt(min ?? max ?? 0);
}
function initials(name: string) {
  return name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

// ── Config maps ───────────────────────────────────────────────────────────────

const JOB_STATUS: Record<string, { label: string; badge: string }> = {
  draft:        { label: 'Draft',         badge: 'bg-slate-100 text-slate-600'   },
  open:         { label: 'Open',          badge: 'bg-green-100 text-green-700'   },
  interviewing: { label: 'Interviewing',  badge: 'bg-blue-100 text-blue-700'     },
  offer_made:   { label: 'Offer Made',    badge: 'bg-purple-100 text-purple-700' },
  closed:       { label: 'Closed',        badge: 'bg-slate-100 text-slate-500'   },
};

const APP_STATUS: Record<string, { label: string; badge: string }> = {
  received:            { label: 'Received',            badge: 'bg-slate-100 text-slate-600'   },
  reviewing:           { label: 'Reviewing',           badge: 'bg-amber-100 text-amber-700'   },
  interview_scheduled: { label: 'Interview Scheduled', badge: 'bg-blue-100 text-blue-700'     },
  offer_made:          { label: 'Offer Made',          badge: 'bg-purple-100 text-purple-700' },
  hired:               { label: 'Hired',               badge: 'bg-green-100 text-green-700'   },
  rejected:            { label: 'Rejected',            badge: 'bg-red-100 text-red-600'       },
};

const EVENT_TYPE: Record<string, { label: string; color: string }> = {
  job_fair:       { label: 'Job Fair',        color: 'bg-blue-100 text-blue-700'     },
  interview_day:  { label: 'Interview Day',   color: 'bg-purple-100 text-purple-700' },
  open_house:     { label: 'Open House',      color: 'bg-green-100 text-green-700'   },
  virtual_hiring: { label: 'Virtual Hiring',  color: 'bg-indigo-100 text-indigo-700' },
};

const EMP_TYPE: Record<string, string> = {
  full_time: 'Full Time', part_time: 'Part Time', contract: 'Contract', per_diem: 'Per Diem',
};

// ── Stars rating ──────────────────────────────────────────────────────────────

function Stars({ value, onChange }: { value: number | null; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" onClick={() => onChange?.(i)}
          className={cn('transition-colors', onChange ? 'cursor-pointer' : 'cursor-default')}>
          <Star className={cn('w-4 h-4', i <= (value ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-200')} />
        </button>
      ))}
    </div>
  );
}

// ── Social share text ─────────────────────────────────────────────────────────

function generateJobShareText(job: JobPosting): string {
  const salary = fmtSalary(job.salary_min, job.salary_max, job.employment_type);
  return `🐾 We're Hiring! ${job.title} — ${job.hospital_name ?? 'VetCentral'}

📍 ${job.location ?? 'Arlington, VA'}
💼 ${EMP_TYPE[job.employment_type] ?? job.employment_type}
💰 ${salary}

${job.description ? job.description.slice(0, 200) + '...' : ''}

Join our team and make a difference in the lives of pets and their families!
Apply now via VetCentral HR Portal.

#Veterinary #Hiring #VetJobs #AnimalCare #NowHiring`;
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm pt-8 pb-8 px-4 overflow-y-auto">
      <div className={cn('bg-white rounded-2xl shadow-2xl w-full flex flex-col', wide ? 'max-w-2xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="font-bold text-slate-800 text-lg">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto max-h-[80vh]">{children}</div>
      </div>
    </div>
  );
}

// ── Form primitives ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  );
}
function Input(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cn('w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white', p.className)} />;
}
function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} rows={p.rows ?? 3} className={cn('w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-none', p.className)} />;
}
function Select(p: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cn('w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white', p.className)} />;
}

// ── Create Job Modal ──────────────────────────────────────────────────────────

function CreateJobModal({ hospitals, onClose, onCreated }: {
  hospitals: Array<{ id: string; name: string; color: string | null }>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    title: '', department: '', hospital_id: hospitals[0]?.id ?? '',
    employment_type: 'full_time', description: '', requirements: '', responsibilities: '',
    salary_min: '', salary_max: '', location: '', closes_at: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return setErr('Job title is required');
    setBusy(true);
    const res = await createJobPosting({
      ...form,
      salary_min: form.salary_min ? parseFloat(form.salary_min) : null,
      salary_max: form.salary_max ? parseFloat(form.salary_max) : null,
      hospital_id: form.hospital_id || undefined,
      closes_at:   form.closes_at   || undefined,
    });
    setBusy(false);
    if (!res.success) return setErr(res.error ?? 'Failed to create job');
    onCreated();
    onClose();
  }

  return (
    <Modal title="Post New Job" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Job Title *">
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Veterinary Technician" />
          </Field>
          <Field label="Department">
            <Input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="e.g. Clinical" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Hospital">
            <Select value={form.hospital_id} onChange={e => setForm(f => ({ ...f, hospital_id: e.target.value }))}>
              <option value="">All / Any Hospital</option>
              {hospitals.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </Select>
          </Field>
          <Field label="Employment Type">
            <Select value={form.employment_type} onChange={e => setForm(f => ({ ...f, employment_type: e.target.value }))}>
              <option value="full_time">Full Time</option>
              <option value="part_time">Part Time</option>
              <option value="contract">Contract</option>
              <option value="per_diem">Per Diem</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Min Salary ($)">
            <Input type="number" value={form.salary_min} onChange={e => setForm(f => ({ ...f, salary_min: e.target.value }))} placeholder="e.g. 50000" />
          </Field>
          <Field label="Max Salary ($)">
            <Input type="number" value={form.salary_max} onChange={e => setForm(f => ({ ...f, salary_max: e.target.value }))} placeholder="e.g. 70000" />
          </Field>
        </div>
        <Field label="Location">
          <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Arlington, VA" />
        </Field>
        <Field label="Description">
          <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="About the role..." rows={3} />
        </Field>
        <Field label="Requirements">
          <Textarea value={form.requirements} onChange={e => setForm(f => ({ ...f, requirements: e.target.value }))} placeholder="• Requirement 1&#10;• Requirement 2" rows={3} />
        </Field>
        <Field label="Responsibilities">
          <Textarea value={form.responsibilities} onChange={e => setForm(f => ({ ...f, responsibilities: e.target.value }))} placeholder="• Responsibility 1&#10;• Responsibility 2" rows={3} />
        </Field>
        <Field label="Closing Date">
          <Input type="date" value={form.closes_at} onChange={e => setForm(f => ({ ...f, closes_at: e.target.value }))} />
        </Field>
        {err && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{err}</p>}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={busy} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
            {busy ? 'Posting…' : 'Post Job'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Social Share Modal ────────────────────────────────────────────────────────

function ShareModal({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  function shareEmail() {
    window.open(`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`, '_blank');
  }
  function shareWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  return (
    <Modal title={`Share: ${title}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{text}</pre>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={copy} className="flex items-center justify-center gap-2 py-3 border-2 border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors">
            {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Text'}
          </button>
          <button onClick={shareWhatsApp} className="flex items-center justify-center gap-2 py-3 bg-[#25d366] text-white rounded-xl text-sm font-semibold hover:bg-[#1da851] transition-colors">
            <Send className="w-4 h-4" /> WhatsApp
          </button>
          <button onClick={shareEmail} className="flex items-center justify-center gap-2 py-3 bg-slate-700 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition-colors col-span-2">
            <Mail className="w-4 h-4" /> Share via Email
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Schedule Interview Modal ──────────────────────────────────────────────────

function ScheduleInterviewModal({ app, onClose, onScheduled }: {
  app: JobApplication; onClose: () => void; onScheduled: () => void;
}) {
  const [form, setForm] = useState({ scheduled_at: '', duration_minutes: '60', interview_type: 'video', location: '', virtual_link: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.scheduled_at) return setErr('Please select a date and time');
    setBusy(true);
    const res = await scheduleInterview({
      application_id:  app.id,
      scheduled_at:    new Date(form.scheduled_at).toISOString(),
      duration_minutes: parseInt(form.duration_minutes),
      interview_type:  form.interview_type,
      location:        form.location    || undefined,
      virtual_link:    form.virtual_link|| undefined,
      notes:           form.notes       || undefined,
    });
    setBusy(false);
    if (!res.success) return setErr(res.error ?? 'Failed to schedule');
    onScheduled();
    onClose();
  }

  return (
    <Modal title={`Schedule Interview — ${app.applicant_name}`} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="p-3 bg-blue-50 rounded-xl text-sm text-blue-700 flex items-center gap-2">
          <Briefcase className="w-4 h-4 shrink-0" />
          Applying for: <strong>{app.job_title}</strong>{app.hospital_name ? ` at ${app.hospital_name}` : ''}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date & Time *">
            <Input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} />
          </Field>
          <Field label="Duration">
            <Select value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">1 hour</option>
              <option value="90">1.5 hours</option>
              <option value="120">2 hours</option>
            </Select>
          </Field>
        </div>
        <Field label="Interview Type">
          <Select value={form.interview_type} onChange={e => setForm(f => ({ ...f, interview_type: e.target.value }))}>
            <option value="video">Video Call</option>
            <option value="phone">Phone Screen</option>
            <option value="in_person">In Person</option>
          </Select>
        </Field>
        {form.interview_type === 'in_person' && (
          <Field label="Location">
            <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. 123 Columbia Pike, Conference Room A" />
          </Field>
        )}
        {form.interview_type === 'video' && (
          <Field label="Video Link">
            <Input value={form.virtual_link} onChange={e => setForm(f => ({ ...f, virtual_link: e.target.value }))} placeholder="https://meet.google.com/..." />
          </Field>
        )}
        <Field label="Notes for Interviewer">
          <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Topics to cover, skills to assess..." />
        </Field>
        {err && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{err}</p>}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold">Cancel</button>
          <button type="submit" disabled={busy} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
            {busy ? 'Scheduling…' : 'Schedule Interview'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Offer Letter Modal ────────────────────────────────────────────────────────

function OfferLetterModal({ app, onClose }: { app: JobApplication; onClose: () => void }) {
  const [startDate, setStartDate] = useState('');
  const [salary, setSalary]       = useState('');
  return (
    <Modal title={`Offer Letter — ${app.applicant_name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="p-3 bg-green-50 rounded-xl text-sm text-green-700">
          Generate a printable offer letter for <strong>{app.applicant_name}</strong> for the <strong>{app.job_title}</strong> position.
        </div>
        <Field label="Start Date">
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </Field>
        <Field label="Compensation">
          <Input value={salary} onChange={e => setSalary(e.target.value)} placeholder="e.g. $65,000/year or $22/hour" />
        </Field>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold">Cancel</button>
          <button
            onClick={() => { generateOfferLetter(app, startDate, salary); onClose(); }}
            className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
          >
            <FileText className="w-4 h-4" /> Generate & Print
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Terminate Modal ───────────────────────────────────────────────────────────

function TerminateModal({ name, employeeId, onClose, onDone }: {
  name: string; employeeId: string; onClose: () => void; onDone: () => void;
}) {
  const [form, setForm] = useState({ reason: '', termination_type: 'voluntary', last_working_day: '', notes: '', rehire_eligible: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.reason.trim())    return setErr('Reason is required');
    if (!form.last_working_day) return setErr('Last working day is required');
    setBusy(true);
    const res = await terminateEmployee({ employee_id: employeeId, ...form });
    setBusy(false);
    if (!res.success) return setErr(res.error ?? 'Failed');
    onDone();
    onClose();
  }

  return (
    <Modal title={`Terminate — ${name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          This will deactivate <strong>{name}</strong>&apos;s account and cancel any active onboarding.
        </div>
        <Field label="Termination Type">
          <Select value={form.termination_type} onChange={e => setForm(f => ({ ...f, termination_type: e.target.value }))}>
            <option value="voluntary">Voluntary Resignation</option>
            <option value="involuntary">Involuntary (Dismissal)</option>
            <option value="layoff">Layoff / Reduction in Force</option>
            <option value="retirement">Retirement</option>
            <option value="contract_end">Contract End</option>
          </Select>
        </Field>
        <Field label="Reason *">
          <Textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Describe the reason for termination..." rows={3} />
        </Field>
        <Field label="Last Working Day *">
          <Input type="date" value={form.last_working_day} onChange={e => setForm(f => ({ ...f, last_working_day: e.target.value }))} />
        </Field>
        <Field label="Additional Notes">
          <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any additional context..." rows={2} />
        </Field>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={form.rehire_eligible} onChange={e => setForm(f => ({ ...f, rehire_eligible: e.target.checked }))}
            className="w-4 h-4 rounded border-slate-300 text-blue-600" />
          <span className="text-sm text-slate-700 font-medium">Eligible for rehire</span>
        </label>
        {err && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{err}</p>}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold">Cancel</button>
          <button type="submit" disabled={busy} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
            {busy ? 'Processing…' : 'Terminate Employee'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Create Hiring Event Modal ─────────────────────────────────────────────────

function CreateEventModal({ hospitals, onClose, onCreated }: {
  hospitals: Array<{ id: string; name: string; color: string | null }>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    title: '', description: '', event_type: 'job_fair', event_date: '', end_date: '',
    location: '', virtual_link: '', max_attendees: '', hospital_id: hospitals[0]?.id ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.event_date) return setErr('Title and date are required');
    setBusy(true);
    const res = await createHiringEvent({
      ...form,
      max_attendees: form.max_attendees ? parseInt(form.max_attendees) : null,
      hospital_id:   form.hospital_id   || undefined,
      end_date:      form.end_date      || undefined,
      virtual_link:  form.virtual_link  || undefined,
    });
    setBusy(false);
    if (!res.success) return setErr(res.error ?? 'Failed');
    onCreated();
    onClose();
  }

  return (
    <Modal title="Create Hiring Event" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Event Title *">
          <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Spring Career Fair 2026" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Event Type">
            <Select value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))}>
              <option value="job_fair">Job Fair</option>
              <option value="interview_day">Interview Day</option>
              <option value="open_house">Open House</option>
              <option value="virtual_hiring">Virtual Hiring</option>
            </Select>
          </Field>
          <Field label="Hospital">
            <Select value={form.hospital_id} onChange={e => setForm(f => ({ ...f, hospital_id: e.target.value }))}>
              <option value="">All Hospitals</option>
              {hospitals.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start Date & Time *">
            <Input type="datetime-local" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
          </Field>
          <Field label="End Date & Time">
            <Input type="datetime-local" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
          </Field>
        </div>
        <Field label="Location">
          <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Address or venue name" />
        </Field>
        <Field label="Virtual Link">
          <Input value={form.virtual_link} onChange={e => setForm(f => ({ ...f, virtual_link: e.target.value }))} placeholder="https://meet.google.com/..." />
        </Field>
        <Field label="Max Attendees">
          <Input type="number" value={form.max_attendees} onChange={e => setForm(f => ({ ...f, max_attendees: e.target.value }))} placeholder="e.g. 100" />
        </Field>
        <Field label="Description">
          <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What to expect at this event..." rows={3} />
        </Field>
        {err && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" />{err}</p>}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold">Cancel</button>
          <button type="submit" disabled={busy} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
            {busy ? 'Creating…' : 'Create Event'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Hiring wizard step config ──────────────────────────────────────────────────

const HIRING_STEPS = [
  { key: 'applied',            label: 'Application',     desc: 'Candidate applied for the position'            },
  { key: 'profile_submitted',  label: 'Profile Form',    desc: 'Personal information form completed'           },
  { key: 'docs_submitted',     label: 'Documents',       desc: 'ID proof, qualifications, employment proof'    },
  { key: 'interview_done',     label: 'Interview',       desc: 'Interview completed and assessed'              },
  { key: 'offer_sent',         label: 'Offer Sent',      desc: 'Employment offer letter sent to candidate'     },
  { key: 'offer_signed',       label: 'Offer Signed',    desc: 'Candidate has signed the offer letter'         },
  { key: 'nda_signed',         label: 'NDA Signed',      desc: 'Non-disclosure agreement signed'               },
  { key: 'hired',              label: 'Hired',           desc: 'Candidate officially joined the organisation'  },
];

const STEP_ORDER = HIRING_STEPS.map(s => s.key);

function hiringProgress(stage: string): number {
  const idx = STEP_ORDER.indexOf(stage);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / STEP_ORDER.length) * 100);
}

function stageFromApp(app: JobApplication): string {
  if (app.hiring_stage && app.hiring_stage !== 'applied') return app.hiring_stage;
  if (app.status === 'hired')               return 'hired';
  if (app.nda_signed_at)                    return 'nda_signed';
  if (app.offer_letter_signed_at)           return 'offer_signed';
  if (app.offer_letter_sent_at)             return 'offer_sent';
  if (app.status === 'interview_scheduled') return 'interview_scheduled';
  if (app.profile_submitted_at)             return 'profile_submitted';
  return 'applied';
}

// ── Offer letter generator ─────────────────────────────────────────────────────

function generateOfferLetter(app: JobApplication, startDate: string, salary: string) {
  const html = `<!DOCTYPE html><html><head><title>Offer Letter — ${app.applicant_name}</title>
<style>
  body{font-family:Georgia,serif;margin:60px;color:#1a1a1a;line-height:1.8;font-size:14px;}
  .logo{font-size:24px;font-weight:bold;color:#1e40af;margin-bottom:2px;letter-spacing:-0.5px;}
  .sub{color:#64748b;font-size:13px;}
  h2{text-align:center;font-size:17px;letter-spacing:3px;margin:36px 0 28px;text-transform:uppercase;color:#1e3a5f;border-bottom:2px solid #e2e8f0;padding-bottom:12px;}
  .block{margin:18px 0;}
  .info-grid{display:grid;grid-template-columns:180px 1fr;gap:6px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:20px 0;}
  .info-grid .label{font-size:12px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;}
  .info-grid .val{font-size:14px;color:#1e293b;font-weight:600;}
  .sig-area{margin-top:60px;display:grid;grid-template-columns:1fr 1fr;gap:40px;}
  .sig-box{border-top:2px solid #1e3a5f;padding-top:8px;}
  .sig-label{font-size:11px;color:#64748b;margin-top:4px;}
  .sig-name{font-size:13px;color:#1e293b;font-weight:600;}
  .acceptance{margin-top:50px;border-top:2px dashed #cbd5e1;padding-top:24px;}
  .acceptance h3{font-size:14px;color:#1e3a5f;margin-bottom:16px;}
  .footer{margin-top:60px;font-size:11px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:12px;}
  @media print{body{margin:20mm;}.acceptance{page-break-before:always;}}
</style></head><body>
<div class="logo">VetCentral</div>
<div class="sub">${app.hospital_name ?? 'Veterinary Hospital Group'}</div>
<div class="sub" style="margin-top:2px;">${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</div>

<div class="block" style="margin-top:24px;">
  <strong>${app.applicant_name}</strong><br>
  ${app.applicant_email}${app.applicant_phone ? '<br>' + app.applicant_phone : ''}
  ${(app.candidate_profile?.address || app.candidate_profile?.city) ? '<br>' + [app.candidate_profile?.address, app.candidate_profile?.city, app.candidate_profile?.state].filter(Boolean).join(', ') : ''}
</div>

<h2>Letter of Employment Offer</h2>

<div class="block">
  <p>Dear <strong>${app.applicant_name.split(' ')[0]}</strong>,</p>
  <p>Following our recent interview process, we are pleased to offer you the position of <strong>${app.job_title}</strong> at <strong>${app.hospital_name ?? 'VetCentral'}</strong>. We were impressed by your qualifications and believe you will be a valuable member of our team.</p>
</div>

<div class="info-grid">
  <span class="label">Position</span><span class="val">${app.job_title}</span>
  <span class="label">Organisation</span><span class="val">${app.hospital_name ?? 'VetCentral'}</span>
  <span class="label">Start Date</span><span class="val">${startDate ? new Date(startDate).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) : '[To Be Confirmed]'}</span>
  <span class="label">Compensation</span><span class="val">${salary || '[As Discussed]'}</span>
  <span class="label">Employment Type</span><span class="val">Full-Time, Permanent</span>
</div>

<div class="block">
  <p><strong>Benefits include:</strong> Health & dental insurance, paid time off, continuing education allowance, and employee wellness program.</p>
  <p>This offer is contingent upon:</p>
  <ul style="margin:8px 0;padding-left:20px;color:#475569;">
    <li>Satisfactory completion of a background check and reference verification</li>
    <li>Submission and verification of all required documentation (ID proof, qualifications, prior employment)</li>
    <li>Signing of the Non-Disclosure Agreement (NDA)</li>
  </ul>
</div>

<div class="block">
  <p>Please confirm your acceptance of this offer by signing and returning this letter within <strong>5 business days</strong>. A separate welcome package will be sent outlining your full benefits, policies, and first-day reporting instructions.</p>
  <p>We look forward to welcoming you to the VetCentral family!</p>
</div>

<div class="sig-area">
  <div class="sig-box">
    <div style="height:48px;"></div>
    <div class="sig-name">HR Department — VetCentral</div>
    <div class="sig-label">Authorised Signatory · Date: ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})}</div>
  </div>
  <div style=""></div>
</div>

<div class="acceptance">
  <h3>Candidate Acceptance</h3>
  <p style="color:#475569;font-size:13px;">I, <strong>${app.applicant_name}</strong>, have read, understood, and accept the above offer of employment under the terms and conditions stated.</p>
  <div class="sig-area">
    <div class="sig-box">
      <div style="height:48px;"></div>
      <div class="sig-name">${app.applicant_name}</div>
      <div class="sig-label">Candidate Signature &amp; Date</div>
    </div>
    <div class="sig-box">
      <div style="height:48px;"></div>
      <div class="sig-label">Date of Acceptance</div>
    </div>
  </div>
</div>

<div class="footer">VetCentral · Confidential Employment Offer · This document is intended solely for the named recipient</div>
</body></html>`;
  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 400); }
}

function generateNDA(app: JobApplication) {
  const html = `<!DOCTYPE html><html><head><title>NDA — ${app.applicant_name}</title>
<style>
  body{font-family:Arial,sans-serif;margin:60px;color:#1a1a1a;line-height:1.8;font-size:13px;}
  .logo{font-size:22px;font-weight:bold;color:#1e40af;margin-bottom:4px;}
  h2{text-align:center;font-size:16px;letter-spacing:2px;margin:32px 0;text-transform:uppercase;border-bottom:2px solid #1e3a5f;padding-bottom:10px;}
  .clause{margin:18px 0;}
  .clause h4{color:#1e3a5f;font-size:13px;margin-bottom:6px;}
  .sig-area{margin-top:60px;display:grid;grid-template-columns:1fr 1fr;gap:40px;}
  .sig-box{border-top:2px solid #1e3a5f;padding-top:8px;}
  .sig-label{font-size:11px;color:#64748b;margin-top:4px;}
  .sig-name{font-size:13px;font-weight:600;}
  @media print{body{margin:20mm;}}
</style></head><body>
<div class="logo">VetCentral</div>
<div style="color:#64748b;font-size:12px;">${app.hospital_name ?? 'Veterinary Hospital Group'} · ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</div>

<h2>Non-Disclosure &amp; Confidentiality Agreement</h2>

<div class="clause">
<p>This Non-Disclosure Agreement ("Agreement") is entered into between <strong>VetCentral / ${app.hospital_name ?? 'Veterinary Hospital Group'}</strong> ("Company") and <strong>${app.applicant_name}</strong> ("Employee"), effective upon signing.</p>
</div>

<div class="clause">
<h4>1. Confidential Information</h4>
<p>The Employee agrees to keep confidential all proprietary information including but not limited to: patient records and medical histories, client personal data, business processes, pricing, trade secrets, staff information, financial data, and any other information marked as confidential or reasonably understood to be confidential.</p>
</div>

<div class="clause">
<h4>2. Obligations</h4>
<p>The Employee shall: (a) not disclose Confidential Information to any third party without prior written consent; (b) use Confidential Information solely for performing job duties; (c) take all reasonable precautions to protect the confidentiality of such information; (d) notify the Company immediately upon becoming aware of any breach.</p>
</div>

<div class="clause">
<h4>3. Exclusions</h4>
<p>This Agreement does not apply to information that: (a) is or becomes publicly known through no breach of this Agreement; (b) was known to Employee prior to employment and not obtained under obligation of confidence; (c) is required to be disclosed by law or court order.</p>
</div>

<div class="clause">
<h4>4. Return of Information</h4>
<p>Upon termination of employment or upon request, the Employee shall promptly return or destroy all Confidential Information in any form, including electronic copies.</p>
</div>

<div class="clause">
<h4>5. Duration</h4>
<p>This Agreement remains in effect during employment and for a period of <strong>3 (three) years</strong> following termination of employment for any reason.</p>
</div>

<div class="clause">
<h4>6. Remedies</h4>
<p>Employee acknowledges that breach of this Agreement may cause irreparable harm and that the Company shall be entitled to seek injunctive relief and any other remedies available under applicable law, in addition to monetary damages.</p>
</div>

<div class="clause">
<h4>7. Governing Law</h4>
<p>This Agreement shall be governed by the laws of the jurisdiction in which the Employee is employed.</p>
</div>

<div class="sig-area">
  <div class="sig-box">
    <div style="height:48px;"></div>
    <div class="sig-name">VetCentral — Authorised Representative</div>
    <div class="sig-label">Signature &amp; Date</div>
  </div>
  <div class="sig-box">
    <div style="height:48px;"></div>
    <div class="sig-name">${app.applicant_name}</div>
    <div class="sig-label">Employee Signature &amp; Date</div>
  </div>
</div>
</body></html>`;
  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 400); }
}

// ── Document type config ───────────────────────────────────────────────────────

const DOC_TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  id_proof:             { label: 'ID Proof',             color: 'bg-blue-50 text-blue-700 border-blue-100',   icon: '🪪' },
  qualification:        { label: 'Qualification Cert.',  color: 'bg-green-50 text-green-700 border-green-100', icon: '🎓' },
  employment_proof:     { label: 'Employment Proof',     color: 'bg-amber-50 text-amber-700 border-amber-100', icon: '💼' },
  offer_letter_signed:  { label: 'Signed Offer Letter',  color: 'bg-purple-50 text-purple-700 border-purple-100', icon: '✍️' },
  nda_signed:          { label: 'Signed NDA',           color: 'bg-red-50 text-red-700 border-red-100',       icon: '🔒' },
  other:               { label: 'Other Document',       color: 'bg-slate-50 text-slate-600 border-slate-200', icon: '📄' },
};

const DOC_STATUS_COLOR: Record<string, string> = {
  pending:  'bg-slate-100 text-slate-600',
  received: 'bg-blue-100 text-blue-700',
  verified: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

// ── Applicant Profile Full-Screen Detail ──────────────────────────────────────

function ApplicantPanel({ app, onClose, onUpdate, onScheduleInterview, onTerminate }: {
  app: JobApplication;
  onClose: () => void;
  onUpdate: (patch: Partial<JobApplication>) => void;
  onScheduleInterview: () => void;
  onTerminate: () => void;
}) {
  type Tab = 'progress' | 'profile' | 'documents' | 'offer' | 'nda' | 'interview';
  const [tab, setTab]         = useState<Tab>('progress');
  const [notes, setNotes]     = useState(app.notes ?? '');
  const [saving, setSaving]   = useState(false);
  const [busy, setBusy]       = useState('');
  const [offerForm, setOfferForm] = useState({ salary: app.offer_letter_salary ?? '', startDate: app.offer_letter_start ?? '' });
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [newDoc, setNewDoc]   = useState({ docType: 'id_proof' as HiringDocument['doc_type'], name: '', notes: '' });

  const stage = stageFromApp(app);
  const pct   = hiringProgress(stage);
  const s     = APP_STATUS[app.status] ?? APP_STATUS.received;

  async function saveNotes() {
    setSaving(true);
    await updateApplication(app.id, { notes });
    onUpdate({ notes });
    setSaving(false);
  }
  async function changeStatus(status: string) {
    await updateApplication(app.id, { status });
    onUpdate({ status });
  }
  async function changeRating(rating: number) {
    await updateApplication(app.id, { rating });
    onUpdate({ rating });
  }
  async function handleSendOffer() {
    if (!offerForm.salary) return;
    setBusy('send_offer');
    await sendOfferLetter({ applicationId: app.id, salary: offerForm.salary, startDate: offerForm.startDate });
    onUpdate({ offer_letter_sent_at: new Date().toISOString(), offer_letter_salary: offerForm.salary, offer_letter_start: offerForm.startDate, status: 'offer_made', hiring_stage: 'offer_sent' });
    setBusy('');
  }
  async function handleMarkOfferSigned() {
    setBusy('offer_sign');
    await markOfferSigned(app.id);
    onUpdate({ offer_letter_signed_at: new Date().toISOString(), hiring_stage: 'offer_signed' });
    setBusy('');
  }
  async function handleSendNDA() {
    setBusy('nda_send');
    await sendNDA(app.id);
    onUpdate({ nda_sent_at: new Date().toISOString() });
    setBusy('');
  }
  async function handleMarkNDASigned() {
    setBusy('nda_sign');
    await markNDASigned(app.id);
    onUpdate({ nda_signed_at: new Date().toISOString(), hiring_stage: 'nda_signed' });
    setBusy('');
  }
  async function handleAddDoc() {
    if (!newDoc.name.trim()) return;
    setBusy('add_doc');
    await addHiringDocument({ applicationId: app.id, orgId: app.org_id, docType: newDoc.docType, name: newDoc.name, notes: newDoc.notes });
    onUpdate({ hiring_documents: [...(app.hiring_documents ?? []), { id: Date.now().toString(), application_id: app.id, doc_type: newDoc.docType, name: newDoc.name, status: 'received', storage_path: null, file_size: null, mime_type: null, notes: newDoc.notes || null, uploaded_by: null, created_at: new Date().toISOString() }] });
    setNewDoc({ docType: 'id_proof', name: '', notes: '' });
    setShowAddDoc(false);
    setBusy('');
  }
  async function handleDocStatus(docId: string, status: HiringDocument['status']) {
    await updateDocumentStatus(docId, status);
    onUpdate({ hiring_documents: (app.hiring_documents ?? []).map(d => d.id === docId ? { ...d, status } : d) });
  }

  const cp = app.candidate_profile ?? {};
  const docs = app.hiring_documents ?? [];

  const TABS: { key: Tab; label: string; badge?: string }[] = [
    { key: 'progress',   label: 'Progress'    },
    { key: 'profile',    label: 'Profile Form' },
    { key: 'documents',  label: 'Documents',   badge: docs.length > 0 ? String(docs.length) : undefined },
    { key: 'offer',      label: 'Offer Letter' },
    { key: 'nda',        label: 'NDA'          },
    { key: 'interview',  label: 'Interview'    },
  ];

  return (
    <div className="absolute inset-y-0 right-0 w-full max-w-2xl bg-white border-l border-slate-200 shadow-2xl flex flex-col z-40">
      {/* ── Header ── */}
      <div className="shrink-0 px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-blue-50/30">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
              {initials(app.applicant_name)}
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-lg leading-tight">{app.applicant_name}</h3>
              <p className="text-sm text-slate-500">{app.job_title}</p>
              {app.hospital_name && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: app.hospital_color ?? '#6b7280' }} />
                  <span className="text-xs text-slate-500">{app.hospital_name}</span>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Hiring Progress</span>
            <span className="text-xs font-bold text-blue-700">{pct}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Status + rating row */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <select value={app.status} onChange={e => changeStatus(e.target.value)}
            className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer', s.badge)}>
            {Object.entries(APP_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <Stars value={app.rating} onChange={changeRating} />
          <span className="text-xs text-slate-400 ml-auto">Applied {fmtDate(app.applied_at)}</span>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 mt-3 flex-wrap">
          <button onClick={onScheduleInterview}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">
            <Calendar className="w-3.5 h-3.5" /> Schedule Interview
          </button>
          <button onClick={() => { setTab('offer'); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700">
            <FileText className="w-3.5 h-3.5" /> Offer Letter
          </button>
          <button onClick={() => changeStatus(app.status === 'rejected' ? 'received' : 'rejected')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg',
              app.status === 'rejected' ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-red-50 text-red-600 hover:bg-red-100')}>
            <XCircle className="w-3.5 h-3.5" />
            {app.status === 'rejected' ? 'Unreject' : 'Reject'}
          </button>
          {app.status === 'hired' && (
            <button onClick={onTerminate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-200">
              <UserMinus className="w-3.5 h-3.5" /> Terminate
            </button>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="shrink-0 flex border-b border-slate-100 px-3 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('flex items-center gap-1.5 px-3 py-3 text-xs font-semibold whitespace-nowrap transition-colors border-b-2',
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700')}>
            {t.label}
            {t.badge && <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">

        {/* ── PROGRESS TAB ── */}
        {tab === 'progress' && (
          <div className="p-5 space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Hiring Pipeline Steps</h4>
            <div className="space-y-2">
              {HIRING_STEPS.map((step, idx) => {
                const stageIdx  = STEP_ORDER.indexOf(stage);
                const thisIdx   = idx;
                const isDone    = thisIdx <= stageIdx;
                const isCurrent = thisIdx === stageIdx + 1;
                return (
                  <div key={step.key} className={cn(
                    'flex items-center gap-4 p-3.5 rounded-xl border transition-all',
                    isDone    ? 'bg-emerald-50 border-emerald-100'  :
                    isCurrent ? 'bg-blue-50 border-blue-200 shadow-sm' :
                    'bg-white border-slate-100',
                  )}>
                    <div className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold',
                      isDone    ? 'bg-emerald-500 text-white' :
                      isCurrent ? 'bg-blue-500 text-white'   :
                      'bg-slate-100 text-slate-400',
                    )}>
                      {isDone ? <CheckCircle className="w-4 h-4" /> : <span>{idx + 1}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-semibold', isDone ? 'text-emerald-800' : isCurrent ? 'text-blue-800' : 'text-slate-500')}>
                        {step.label}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">{step.desc}</p>
                    </div>
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full',
                      isDone    ? 'bg-emerald-100 text-emerald-700' :
                      isCurrent ? 'bg-blue-100 text-blue-700'       :
                      'bg-slate-100 text-slate-400')}>
                      {isDone ? 'Done' : isCurrent ? 'Next' : 'Pending'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Cover letter */}
            {app.cover_letter && (
              <div className="mt-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Cover Letter</h4>
                <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap border border-slate-100 max-h-40 overflow-y-auto">
                  {app.cover_letter}
                </div>
              </div>
            )}

            {/* HR notes */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">HR Notes</h4>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes about this candidate..." rows={3} />
              <button onClick={saveNotes} disabled={saving || notes === (app.notes ?? '')}
                className="mt-2 px-4 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-700 disabled:opacity-40 transition-colors">
                {saving ? 'Saving…' : 'Save Notes'}
              </button>
            </div>
          </div>
        )}

        {/* ── PROFILE FORM TAB ── */}
        {tab === 'profile' && (
          <div className="p-5 space-y-5">
            {/* Application data */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Contact Information</h4>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Full Name',   value: app.applicant_name },
                  { label: 'Email',       value: app.applicant_email },
                  { label: 'Phone',       value: app.applicant_phone ?? cp.phone ?? '—' },
                  { label: 'LinkedIn',    value: app.linkedin_url ?? '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
                    <p className="text-sm font-medium text-slate-800 break-all">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Address */}
            {(cp.address || cp.city) && (
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Address</h4>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-sm text-slate-800">{[cp.address, cp.city, cp.state, cp.zip].filter(Boolean).join(', ')}</p>
                </div>
              </div>
            )}

            {/* Employment details */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Professional Background</h4>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Experience',        value: app.years_experience ? `${app.years_experience} years` : '—' },
                  { label: 'Education Level',   value: app.education_level ?? '—' },
                  { label: 'Current Employer',  value: cp.current_employer ?? '—' },
                  { label: 'Notice Period',     value: cp.notice_period ?? '—' },
                  { label: 'Availability',      value: cp.availability ?? '—' },
                  { label: 'Expected Salary',   value: cp.expected_salary ?? '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
                    <p className="text-sm font-medium text-slate-800">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Emergency contact */}
            {cp.emergency_name && (
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Emergency Contact</h4>
                <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 space-y-1">
                  <p className="text-sm font-semibold text-slate-800">{cp.emergency_name}</p>
                  <p className="text-xs text-slate-600">{cp.emergency_relationship} · {cp.emergency_phone}</p>
                </div>
              </div>
            )}

            {/* Qualifications */}
            {app.qualifications.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Qualifications</h4>
                <div className="space-y-2">
                  {app.qualifications.map((q, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-green-50 border border-green-100 rounded-xl">
                      <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{q.name}</p>
                        <p className="text-xs text-slate-500">{q.issuer} · {q.year}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!app.profile_submitted_at && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Candidate has not yet completed the profile information form.
              </div>
            )}
          </div>
        )}

        {/* ── DOCUMENTS TAB ── */}
        {tab === 'documents' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Submitted Documents</h4>
              <button onClick={() => setShowAddDoc(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">
                <Plus className="w-3.5 h-3.5" /> Add Document
              </button>
            </div>

            {/* Required document types */}
            {(['id_proof','qualification','employment_proof'] as const).map(dt => {
              const received = docs.filter(d => d.doc_type === dt);
              const meta = DOC_TYPE_META[dt];
              return (
                <div key={dt}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border', meta.color)}>
                      {meta.icon} {meta.label}
                    </span>
                    {received.length === 0 && (
                      <span className="text-xs text-amber-600 font-medium">Not received</span>
                    )}
                    {received.length > 0 && (
                      <span className="text-xs text-emerald-600 font-medium">{received.length} received</span>
                    )}
                  </div>
                  {received.length === 0 && (
                    <div className="p-3 border-2 border-dashed border-slate-200 rounded-xl text-center">
                      <p className="text-xs text-slate-400">No {meta.label} submitted yet</p>
                    </div>
                  )}
                  {received.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 p-3.5 border border-slate-200 rounded-xl bg-white mb-2">
                      <div className="w-9 h-9 bg-slate-50 rounded-xl flex items-center justify-center shrink-0 text-base">{meta.icon}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{doc.name}</p>
                        <p className="text-xs text-slate-400">{fmtDate(doc.created_at)}{doc.notes ? ` · ${doc.notes}` : ''}</p>
                      </div>
                      <select value={doc.status} onChange={e => handleDocStatus(doc.id, e.target.value as HiringDocument['status'])}
                        className={cn('text-[10px] font-bold px-2 py-1 rounded-full border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer', DOC_STATUS_COLOR[doc.status])}>
                        <option value="pending">Pending</option>
                        <option value="received">Received</option>
                        <option value="verified">Verified</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>
                  ))}
                </div>
              );
            })}

            {/* Resume */}
            <div>
              <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border mb-2', 'bg-slate-50 text-slate-600 border-slate-200')}>
                📄 Resume / CV
              </span>
              {app.resume_filename ? (
                <div className="flex items-center gap-3 p-3.5 border border-slate-200 rounded-xl">
                  <FileText className="w-5 h-5 text-red-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{app.resume_filename}</p>
                    <p className="text-xs text-slate-400">Resume / CV</p>
                  </div>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-semibold rounded-lg hover:bg-blue-100">
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                </div>
              ) : (
                <div className="p-4 border-2 border-dashed border-slate-200 rounded-xl text-center">
                  <p className="text-xs text-slate-400">No resume uploaded</p>
                </div>
              )}
            </div>

            {/* Other docs */}
            {docs.filter(d => !['id_proof','qualification','employment_proof'].includes(d.doc_type)).map(doc => {
              const meta = DOC_TYPE_META[doc.doc_type] ?? DOC_TYPE_META.other;
              return (
                <div key={doc.id} className="flex items-center gap-3 p-3.5 border border-slate-200 rounded-xl">
                  <div className="w-9 h-9 bg-slate-50 rounded-xl flex items-center justify-center text-base">{meta.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{doc.name}</p>
                    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', meta.color)}>{meta.label}</span>
                  </div>
                  <select value={doc.status} onChange={e => handleDocStatus(doc.id, e.target.value as HiringDocument['status'])}
                    className={cn('text-[10px] font-bold px-2 py-1 rounded-full border-0 cursor-pointer', DOC_STATUS_COLOR[doc.status])}>
                    <option value="pending">Pending</option>
                    <option value="received">Received</option>
                    <option value="verified">Verified</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              );
            })}

            {/* Add doc modal */}
            {showAddDoc && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
                <h5 className="text-sm font-bold text-slate-700">Add Document Record</h5>
                <Field label="Document Type">
                  <Select value={newDoc.docType} onChange={e => setNewDoc(d => ({ ...d, docType: e.target.value as HiringDocument['doc_type'] }))}>
                    {Object.entries(DOC_TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </Select>
                </Field>
                <Field label="Document Name / Description">
                  <Input value={newDoc.name} onChange={e => setNewDoc(d => ({ ...d, name: e.target.value }))} placeholder="e.g. Vet License Certificate, Passport, Degree Certificate" />
                </Field>
                <Field label="Notes (optional)">
                  <Input value={newDoc.notes} onChange={e => setNewDoc(d => ({ ...d, notes: e.target.value }))} placeholder="e.g. Expiry date, issuer..." />
                </Field>
                <div className="flex gap-2">
                  <button onClick={() => setShowAddDoc(false)} className="flex-1 py-2 border border-slate-200 rounded-xl text-xs font-semibold">Cancel</button>
                  <button onClick={handleAddDoc} disabled={!newDoc.name.trim() || busy === 'add_doc'}
                    className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold disabled:opacity-50">
                    {busy === 'add_doc' ? 'Adding…' : 'Add Document'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── OFFER LETTER TAB ── */}
        {tab === 'offer' && (
          <div className="p-5 space-y-5">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Offer Letter</h4>

            {/* Status timeline */}
            <div className="space-y-2">
              {[
                { label: 'Offer Letter Prepared',  done: true,                        date: null },
                { label: 'Offer Letter Sent',      done: !!app.offer_letter_sent_at,  date: app.offer_letter_sent_at },
                { label: 'Offer Letter Signed',    done: !!app.offer_letter_signed_at,date: app.offer_letter_signed_at },
              ].map((step, i) => (
                <div key={i} className={cn('flex items-center gap-3 p-3 rounded-xl', step.done ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50 border border-slate-100')}>
                  <div className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0',step.done?'bg-emerald-500':'bg-slate-200')}>
                    {step.done ? <CheckCircle className="w-3.5 h-3.5 text-white" /> : <span className="text-[10px] font-bold text-slate-400">{i+1}</span>}
                  </div>
                  <p className={cn('text-sm font-medium flex-1', step.done?'text-emerald-800':'text-slate-400')}>{step.label}</p>
                  {step.date && <span className="text-xs text-slate-400">{fmtDate(step.date)}</span>}
                </div>
              ))}
            </div>

            {/* Offer details */}
            {app.offer_letter_sent_at && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Offer Details</h5>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Salary / Compensation</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{app.offer_letter_salary ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Start Date</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{app.offer_letter_start ? fmtDate(app.offer_letter_start) : '—'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Send / generate offer */}
            {!app.offer_letter_sent_at && (
              <div className="space-y-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <h5 className="text-sm font-bold text-slate-700">Prepare & Send Offer Letter</h5>
                <Field label="Compensation / Salary">
                  <Input value={offerForm.salary} onChange={e => setOfferForm(f => ({ ...f, salary: e.target.value }))} placeholder="e.g. $65,000/year or $28/hour" />
                </Field>
                <Field label="Start Date">
                  <Input type="date" value={offerForm.startDate} onChange={e => setOfferForm(f => ({ ...f, startDate: e.target.value }))} />
                </Field>
                <div className="flex gap-2">
                  <button onClick={() => generateOfferLetter(app, offerForm.startDate, offerForm.salary)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-slate-200 bg-white text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50">
                    <Download className="w-3.5 h-3.5" /> Preview & Print
                  </button>
                  <button onClick={handleSendOffer} disabled={!offerForm.salary || busy === 'send_offer'}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50">
                    <Send className="w-3.5 h-3.5" /> {busy === 'send_offer' ? 'Sending…' : 'Mark as Sent'}
                  </button>
                </div>
              </div>
            )}

            {/* Download existing offer */}
            {app.offer_letter_sent_at && (
              <button onClick={() => generateOfferLetter(app, app.offer_letter_start ?? '', app.offer_letter_salary ?? '')}
                className="w-full flex items-center justify-center gap-2 py-3 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50">
                <Download className="w-4 h-4 text-slate-500" /> Download Offer Letter (PDF)
              </button>
            )}

            {/* Mark signed */}
            {app.offer_letter_sent_at && !app.offer_letter_signed_at && (
              <button onClick={handleMarkOfferSigned} disabled={busy === 'offer_sign'}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                <CheckCircle className="w-4 h-4" /> {busy === 'offer_sign' ? 'Updating…' : 'Mark Offer as Signed'}
              </button>
            )}
            {app.offer_letter_signed_at && (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Offer Letter Signed</p>
                  <p className="text-xs text-emerald-600">{fmtDate(app.offer_letter_signed_at)}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── NDA TAB ── */}
        {tab === 'nda' && (
          <div className="p-5 space-y-5">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Non-Disclosure Agreement</h4>

            {/* Status */}
            <div className="space-y-2">
              {[
                { label: 'NDA Prepared',  done: true,               date: null },
                { label: 'NDA Sent',      done: !!app.nda_sent_at,  date: app.nda_sent_at },
                { label: 'NDA Signed',    done: !!app.nda_signed_at,date: app.nda_signed_at },
              ].map((step, i) => (
                <div key={i} className={cn('flex items-center gap-3 p-3 rounded-xl', step.done ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50 border border-slate-100')}>
                  <div className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0',step.done?'bg-emerald-500':'bg-slate-200')}>
                    {step.done ? <CheckCircle className="w-3.5 h-3.5 text-white" /> : <span className="text-[10px] font-bold text-slate-400">{i+1}</span>}
                  </div>
                  <p className={cn('text-sm font-medium flex-1',step.done?'text-emerald-800':'text-slate-400')}>{step.label}</p>
                  {step.date && <span className="text-xs text-slate-400">{fmtDate(step.date)}</span>}
                </div>
              ))}
            </div>

            {/* NDA content preview */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">NDA Summary</h5>
              <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
                <li>Covers all patient records, client data, and business processes</li>
                <li>Obligation to not disclose to any third party without written consent</li>
                <li>Remains in effect during employment and <strong>3 years</strong> after termination</li>
                <li>Breach may result in legal action and injunctive relief</li>
              </ul>
            </div>

            {/* Download */}
            <button onClick={() => generateNDA(app)}
              className="w-full flex items-center justify-center gap-2 py-3 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50">
              <Download className="w-4 h-4 text-slate-500" /> Preview & Print NDA
            </button>

            {/* Send NDA */}
            {!app.nda_sent_at && (
              <button onClick={handleSendNDA} disabled={busy === 'nda_send'}
                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                <Send className="w-4 h-4" /> {busy === 'nda_send' ? 'Updating…' : 'Mark NDA as Sent'}
              </button>
            )}

            {/* Mark signed */}
            {app.nda_sent_at && !app.nda_signed_at && (
              <button onClick={handleMarkNDASigned} disabled={busy === 'nda_sign'}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                <CheckCircle className="w-4 h-4" /> {busy === 'nda_sign' ? 'Updating…' : 'Mark NDA as Signed'}
              </button>
            )}
            {app.nda_signed_at && (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">NDA Signed by Candidate</p>
                  <p className="text-xs text-emerald-600">{fmtDate(app.nda_signed_at)}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── INTERVIEW TAB ── */}
        {tab === 'interview' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Interview Schedule</h4>
              <button onClick={onScheduleInterview}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">
                <Plus className="w-3.5 h-3.5" /> Schedule
              </button>
            </div>
            {app.status === 'interview_scheduled' ? (
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                <div className="flex items-center gap-2 text-blue-700 font-semibold text-sm mb-1">
                  <Calendar className="w-4 h-4" /> Interview Scheduled
                </div>
                <p className="text-xs text-blue-600">Check the Interviews main tab for full details.</p>
              </div>
            ) : (
              <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl">
                <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400 mb-3">No interview scheduled yet</p>
                <button onClick={onScheduleInterview}
                  className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">
                  Schedule Now
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ── Jobs Tab ──────────────────────────────────────────────────────────────────

function JobsTab({ jobs, onShare, onViewApplicants, onRefresh }: {
  jobs: JobPosting[];
  onShare: (job: JobPosting) => void;
  onViewApplicants: (jobId: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-4">
      {jobs.map(job => {
        const st = JOB_STATUS[job.status] ?? JOB_STATUS.open;
        return (
          <div key={job.id} className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3 hover:border-blue-300 hover:shadow-sm transition-all">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-bold text-slate-800 leading-tight">{job.title}</h3>
                {job.hospital_name && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: job.hospital_color ?? '#6b7280' }} />
                    <span className="text-xs text-slate-500 truncate">{job.hospital_name}</span>
                  </div>
                )}
              </div>
              <span className={cn('shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold', st.badge)}>{st.label}</span>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              {job.department && <span className="px-2 py-1 bg-slate-100 rounded-lg text-slate-600">{job.department}</span>}
              <span className="px-2 py-1 bg-slate-100 rounded-lg text-slate-600">{EMP_TYPE[job.employment_type] ?? job.employment_type}</span>
              {job.location && (
                <span className="px-2 py-1 bg-slate-100 rounded-lg text-slate-600 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{job.location}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-700">{fmtSalary(job.salary_min, job.salary_max, job.employment_type)}</span>
              {job.posted_at && <span className="text-slate-400 text-xs">{fmtDate(job.posted_at)}</span>}
            </div>

            {job.description && <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{job.description}</p>}

            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
              <button onClick={() => onViewApplicants(job.id)}
                className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800">
                <Users className="w-3.5 h-3.5" />
                {job.applicant_count} applicant{job.applicant_count !== 1 ? 's' : ''}
                <ChevronRight className="w-3 h-3" />
              </button>
              <div className="flex gap-1.5">
                <button onClick={() => onShare(job)}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Share">
                  <Share2 className="w-4 h-4" />
                </button>
                <select
                  value={job.status}
                  onChange={async e => { await updateJobStatus(job.id, e.target.value); onRefresh(); }}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {Object.entries(JOB_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        );
      })}
      {jobs.length === 0 && (
        <div className="col-span-3 py-16 text-center">
          <Briefcase className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No job postings yet</p>
        </div>
      )}
    </div>
  );
}

// ── Applicants Tab ────────────────────────────────────────────────────────────

function ApplicantsTab({ applications, jobs, filterJobId, onSelectApp }: {
  applications: JobApplication[];
  jobs: JobPosting[];
  filterJobId: string;
  onSelectApp: (app: JobApplication) => void;
}) {
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [jobFilter, setJobFilter]   = useState(filterJobId);

  const visible = applications.filter(a => {
    const matchJob    = jobFilter === 'all' || a.job_id === jobFilter;
    const matchStatus = statusFilter === 'all' || a.status === statusFilter;
    const q = search.toLowerCase();
    const matchQ = !search
      || a.applicant_name.toLowerCase().includes(q)
      || a.applicant_email.toLowerCase().includes(q)
      || a.job_title.toLowerCase().includes(q);
    return matchJob && matchStatus && matchQ;
  });

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search applicants…"
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        </div>
        <select value={jobFilter} onChange={e => setJobFilter(e.target.value)}
          className="border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="all">All Positions</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="all">All Status</option>
          {Object.entries(APP_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {['Applicant', 'Position', 'Hospital', 'Status', 'Rating', 'Applied'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {visible.map(app => {
              const s = APP_STATUS[app.status] ?? APP_STATUS.received;
              return (
                <tr key={app.id} onClick={() => onSelectApp(app)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {initials(app.applicant_name)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800 group-hover:text-blue-700 transition-colors">{app.applicant_name}</p>
                        <p className="text-xs text-slate-400">{app.applicant_email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 font-medium">{app.job_title}</td>
                  <td className="px-4 py-3">
                    {app.hospital_name && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: app.hospital_color ?? '#6b7280' }} />
                        <span className="text-xs text-slate-600 truncate max-w-28">{app.hospital_name}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('px-2.5 py-1 rounded-full text-xs font-semibold', s.badge)}>{s.label}</span>
                  </td>
                  <td className="px-4 py-3"><Stars value={app.rating} /></td>
                  <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(app.applied_at)}</td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-14 text-center text-slate-400 text-sm">
                  No applicants match your filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Events Tab ────────────────────────────────────────────────────────────────

function EventsTab({ events, onShare }: {
  events: HiringEvent[];
  onShare: (text: string, title: string) => void;
}) {
  function shareEvent(ev: HiringEvent) {
    const text = `📅 ${ev.title}\n\n🗓 ${fmtDateTime(ev.event_date)}\n📍 ${ev.location ?? 'Online'}\n\n${ev.description ?? ''}\n\n#Hiring #CareerFair #VetJobs`;
    onShare(text, ev.title);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
      {events.map(ev => {
        const et   = EVENT_TYPE[ev.event_type] ?? EVENT_TYPE.job_fair;
        const isPast = new Date(ev.event_date) < new Date();
        return (
          <div key={ev.id} className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full', et.color)}>{et.label}</span>
                <h3 className="font-bold text-slate-800 mt-2 leading-tight">{ev.title}</h3>
              </div>
              <span className={cn('shrink-0 text-xs px-2.5 py-1 rounded-full font-semibold',
                ev.status === 'upcoming'  ? 'bg-green-100 text-green-700'  :
                ev.status === 'completed' ? 'bg-slate-100 text-slate-500'  : 'bg-amber-100 text-amber-700')}>
                {ev.status.charAt(0).toUpperCase() + ev.status.slice(1)}
              </span>
            </div>

            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                {fmtDateTime(ev.event_date)}{ev.end_date ? ` – ${fmtDateTime(ev.end_date)}` : ''}
              </div>
              {ev.location && (
                <div className="flex items-center gap-2 text-slate-600">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0" />{ev.location}
                </div>
              )}
              {ev.virtual_link && (
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-slate-400 shrink-0" />
                  <a href={ev.virtual_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm truncate">{ev.virtual_link}</a>
                </div>
              )}
              {ev.max_attendees && (
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <Users className="w-3.5 h-3.5 text-slate-400" />Max {ev.max_attendees} attendees
                </div>
              )}
            </div>

            {ev.description && <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">{ev.description}</p>}
            {ev.hospital_name && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: ev.hospital_color ?? '#6b7280' }} />
                <span className="text-xs text-slate-500">{ev.hospital_name}</span>
              </div>
            )}

            <div className="flex gap-2 pt-1 border-t border-slate-100">
              <button onClick={() => shareEvent(ev)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                <Share2 className="w-3.5 h-3.5" /> Share
              </button>
              {!isPast && ev.virtual_link && (
                <a href={ev.virtual_link} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-colors">
                  <Video className="w-3.5 h-3.5" /> Join
                </a>
              )}
            </div>
          </div>
        );
      })}
      {events.length === 0 && (
        <div className="col-span-2 py-16 text-center">
          <Calendar className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No hiring events yet</p>
        </div>
      )}
    </div>
  );
}

// ── Interviews Tab ────────────────────────────────────────────────────────────

function InterviewsTab({ interviews }: { interviews: Interview[] }) {
  const upcoming = interviews.filter(i => i.status === 'scheduled' && new Date(i.scheduled_at) >= new Date());
  const past     = interviews.filter(i => i.status !== 'scheduled' || new Date(i.scheduled_at) < new Date());

  function Card({ iv }: { iv: Interview }) {
    const icon = iv.interview_type === 'video'  ? <Video className="w-4 h-4" />
               : iv.interview_type === 'phone'  ? <Phone className="w-4 h-4" />
               : <MapPin className="w-4 h-4" />;
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4">
        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 text-sm">{iv.applicant_name}</p>
          <p className="text-xs text-slate-500">{iv.job_title}</p>
          {iv.hospital_name && <p className="text-xs text-slate-400">{iv.hospital_name}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-slate-700">{fmtDateTime(iv.scheduled_at)}</p>
          <p className="text-xs text-slate-400">{iv.duration_minutes} min · {iv.interview_type.replace('_', ' ')}</p>
          {iv.location && <p className="text-xs text-slate-400 truncate max-w-32">{iv.location}</p>}
        </div>
        <span className={cn('shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold',
          iv.status === 'scheduled'  ? 'bg-blue-100 text-blue-700'  :
          iv.status === 'completed'  ? 'bg-green-100 text-green-700': 'bg-slate-100 text-slate-500')}>
          {iv.status.charAt(0).toUpperCase() + iv.status.slice(1)}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Upcoming ({upcoming.length})</h3>
        {upcoming.length > 0
          ? <div className="space-y-2">{upcoming.map(i => <Card key={i.id} iv={i} />)}</div>
          : <div className="py-10 text-center border-2 border-dashed border-slate-100 rounded-2xl">
              <Clock className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No upcoming interviews</p>
            </div>
        }
      </div>
      {past.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Past ({past.length})</h3>
          <div className="space-y-2 opacity-60">{past.map(i => <Card key={i.id} iv={i} />)}</div>
        </div>
      )}
    </div>
  );
}

// ── Modal state type ──────────────────────────────────────────────────────────

type ModalState =
  | null
  | { type: 'createJob'  }
  | { type: 'createEvent' }
  | { type: 'shareJob';   job: JobPosting }
  | { type: 'shareText';  text: string; title: string }
  | { type: 'interview';  app: JobApplication }
  | { type: 'offer';      app: JobApplication }
  | { type: 'terminate';  app: JobApplication };

// ── Main section export ───────────────────────────────────────────────────────

export function HiringSection({ userId }: SectionProps) {
  const [tab, setTab]                 = useState<'jobs' | 'applicants' | 'events' | 'interviews'>('jobs');
  const [jobs, setJobs]               = useState<JobPosting[]>([]);
  const [apps, setApps]               = useState<JobApplication[]>([]);
  const [events, setEvents]           = useState<HiringEvent[]>([]);
  const [interviews, setInterviews]   = useState<Interview[]>([]);
  const [hospitals, setHospitals]     = useState<Array<{ id: string; name: string; color: string | null }>>([]);
  const [loading, setLoading]         = useState(true);
  const [filterJobId, setFilterJobId] = useState('all');
  const [selectedApp, setSelectedApp] = useState<JobApplication | null>(null);
  const [modal, setModal]             = useState<ModalState>(null);
  const [, startTransition]           = useTransition();

  function load() {
    setLoading(true);
    startTransition(async () => {
      const res = await getHiringData();
      setJobs(res.jobs);
      setApps(res.applications);
      setEvents(res.events);
      setInterviews(res.interviews);
      setHospitals(res.hospitals);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  function viewApplicants(jobId: string) {
    setFilterJobId(jobId);
    setTab('applicants');
  }

  function updateApp(id: string, patch: Partial<JobApplication>) {
    setApps(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
    setSelectedApp(prev => (prev?.id === id ? { ...prev, ...patch } : prev));
  }

  const TABS = [
    { key: 'jobs'       as const, label: 'Job Postings',  count: jobs.filter(j => j.status !== 'closed').length        },
    { key: 'applicants' as const, label: 'Applicants',    count: apps.length                                           },
    { key: 'events'     as const, label: 'Hiring Events', count: events.filter(e => e.status === 'upcoming').length    },
    { key: 'interviews' as const, label: 'Interviews',    count: interviews.filter(i => i.status === 'scheduled').length},
  ];

  return (
    <div className="relative flex flex-col flex-1 min-h-0">

      {/* ── Stat cards ── */}
      <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Open Positions',      value: jobs.filter(j => j.status === 'open' || j.status === 'interviewing').length, icon: Briefcase, color: 'text-blue-600',   bg: 'bg-blue-50',   ring: 'ring-blue-100'   },
          { label: 'Total Applications',  value: apps.length,                                                                  icon: Users,     color: 'text-indigo-600', bg: 'bg-indigo-50', ring: 'ring-indigo-100' },
          { label: 'New / Unreviewed',    value: apps.filter(a => a.status === 'received').length,                             icon: Mail,      color: 'text-amber-600',  bg: 'bg-amber-50',  ring: 'ring-amber-100'  },
          { label: 'Upcoming Interviews', value: interviews.filter(i => i.status === 'scheduled' && new Date(i.scheduled_at) >= new Date()).length, icon: Calendar, color: 'text-green-600', bg: 'bg-green-50', ring: 'ring-green-100' },
        ].map(({ label, value, icon: Icon, color, bg, ring }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ring-4', bg, ring)}>
              <Icon className={cn('w-4.5 h-4.5', color)} />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-800 tabular-nums">{loading ? '—' : value}</p>
              <p className="text-xs text-slate-500 font-medium">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tab bar + actions ── */}
      <div className="shrink-0 flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn('flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all',
                tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
              {t.label}
              {t.count > 0 && (
                <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-bold',
                  tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600')}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={load} disabled={loading}
            className="p-2.5 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 bg-white transition-colors">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
          {tab === 'jobs' && (
            <button onClick={() => setModal({ type: 'createJob' })}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">
              <Plus className="w-4 h-4" /> Post Job
            </button>
          )}
          {tab === 'events' && (
            <button onClick={() => setModal({ type: 'createEvent' })}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">
              <Plus className="w-4 h-4" /> Create Event
            </button>
          )}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto relative">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <RefreshCw className="w-6 h-6 animate-spin text-slate-300" />
          </div>
        ) : (
          <>
            {tab === 'jobs'       && <JobsTab jobs={jobs} onShare={j => setModal({ type: 'shareJob', job: j })} onViewApplicants={viewApplicants} onRefresh={load} />}
            {tab === 'applicants' && <ApplicantsTab applications={apps} jobs={jobs} filterJobId={filterJobId} onSelectApp={app => setSelectedApp(app)} />}
            {tab === 'events'     && <EventsTab events={events} onShare={(t, tl) => setModal({ type: 'shareText', text: t, title: tl })} />}
            {tab === 'interviews' && <InterviewsTab interviews={interviews} />}
          </>
        )}
      </div>

      {/* ── Applicant slide panel ── */}
      {selectedApp && (
        <ApplicantPanel
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
          onUpdate={patch => updateApp(selectedApp.id, patch)}
          onScheduleInterview={() => setModal({ type: 'interview', app: selectedApp })}
          onTerminate={() => setModal({ type: 'terminate', app: selectedApp })}
        />
      )}

      {/* ── Modals ── */}
      {modal?.type === 'createJob'  && <CreateJobModal   hospitals={hospitals} onClose={() => setModal(null)} onCreated={load} />}
      {modal?.type === 'createEvent'&& <CreateEventModal hospitals={hospitals} onClose={() => setModal(null)} onCreated={load} />}
      {modal?.type === 'shareJob'   && <ShareModal title={modal.job.title} text={generateJobShareText(modal.job)} onClose={() => setModal(null)} />}
      {modal?.type === 'shareText'  && <ShareModal title={modal.title} text={modal.text} onClose={() => setModal(null)} />}
      {modal?.type === 'interview'  && <ScheduleInterviewModal app={modal.app} onClose={() => setModal(null)} onScheduled={load} />}
      {modal?.type === 'offer'      && <OfferLetterModal       app={modal.app} onClose={() => setModal(null)} />}
      {modal?.type === 'terminate'  && (
        <TerminateModal
          name={modal.app.applicant_name}
          employeeId={modal.app.id}
          onClose={() => setModal(null)}
          onDone={() => { setSelectedApp(null); load(); }}
        />
      )}
    </div>
  );
}
