'use client';

// Web Speech API types not in default TS lib — declare minimal shapes needed
type SpeechRecognitionEvent = Event & { results: SpeechRecognitionResultList };
type SpeechRecognitionResultList = { 0: SpeechRecognitionResult; length: number };
type SpeechRecognitionResult = { 0: SpeechRecognitionAlternative; length: number };
type SpeechRecognitionAlternative = { transcript: string; confidence: number };
interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror:  ((e: Event) => void) | null;
  onend:    (() => void) | null;
  start():  void;
  stop():   void;
  abort():  void;
}
type SpeechRecognitionCtor = new () => ISpeechRecognition;

import { useState, useTransition, useRef, useEffect, useCallback } from 'react';
import {
  Check, ChevronRight, ChevronLeft, User, FileText, Phone,
  Shield, GraduationCap, Users, Star, Building2, Mail,
  Calendar, MapPin, Upload, Loader2, CheckCircle2, Clock,
  AlertCircle, Edit3, Lock, Info, Award, Video, ExternalLink,
  Download, ArrowRight, Sparkles, X, Mic, MicOff, Volume2, VolumeX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  savePersonalInfo, saveEmergencyContacts,
  acknowledgePolicy, completeWizardStep, completeOnboarding,
} from '@/lib/actions/onboarding-wizard';
import {
  WIZARD_STEPS, WIZARD_STEP_ORDER, VET_ROLES,
} from '@/lib/actions/onboarding-wizard-types';
import type {
  WizardData, WizardStepKey, PersonalInfo, EmergencyContact,
} from '@/lib/actions/onboarding-wizard-types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function initials(first: string, last: string) {
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase() || '?';
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtDateShort(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtRole(role: string | null) {
  if (!role) return 'Employee';
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function docStatusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:     { label: 'Pending Upload', cls: 'bg-slate-100 text-slate-500' },
    uploaded:    { label: 'Uploaded',       cls: 'bg-blue-50 text-blue-600'    },
    verified:    { label: 'Verified',       cls: 'bg-green-50 text-green-600'  },
    rejected:    { label: 'Rejected',       cls: 'bg-red-50 text-red-600'      },
    in_progress: { label: 'In Review',      cls: 'bg-amber-50 text-amber-600'  },
  };
  const m = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-500' };
  return (
    <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium', m.cls)}>
      {status === 'verified' && <Check className="w-3 h-3" />}
      {m.label}
    </span>
  );
}

// ── Reusable form field ───────────────────────────────────────────────────────

function Field({ label, required, children, hint }: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white transition-shadow';
const selectCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white';

// ── Save indicator ────────────────────────────────────────────────────────────

function SaveIndicator({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return null;
  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-all',
      state === 'saving' && 'bg-slate-100 text-slate-500',
      state === 'saved'  && 'bg-green-50 text-green-600',
      state === 'error'  && 'bg-red-50 text-red-600',
    )}>
      {state === 'saving' && <Loader2 className="w-3 h-3 animate-spin" />}
      {state === 'saved'  && <Check className="w-3 h-3" />}
      {state === 'error'  && <AlertCircle className="w-3 h-3" />}
      {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Error saving'}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Personal Information
// ─────────────────────────────────────────────────────────────────────────────

function StepPersonalInfo({ data, onSave, isPending }: {
  data: WizardData;
  onSave: (pi: PersonalInfo) => void;
  isPending: boolean;
}) {
  const saved = data.record.wizard_data?.personal_info;
  const isVet = VET_ROLES.includes(data.employee.role ?? '');
  const [pi, setPi] = useState<PersonalInfo>({
    preferred_name:  saved?.preferred_name ?? '',
    phone:           saved?.phone ?? '',
    dob:             saved?.dob ?? '',
    gender:          saved?.gender ?? '',
    address_line1:   saved?.address_line1 ?? '',
    address_line2:   saved?.address_line2 ?? '',
    city:            saved?.city ?? '',
    state:           saved?.state ?? '',
    zip:             saved?.zip ?? '',
    vet_license:     saved?.vet_license ?? data.vetCredentials?.license_number ?? '',
  });

  const canContinue = !!pi.phone && !!pi.address_line1 && !!pi.city && !!pi.state;

  return (
    <div className="space-y-5">
      {/* Personal details */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <User className="w-4 h-4 text-blue-600" />
          </div>
          <h3 className="font-semibold text-slate-800">Personal Details</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Preferred Name" hint="What would you like to be called?">
            <input type="text" value={pi.preferred_name} onChange={e => setPi(p => ({ ...p, preferred_name: e.target.value }))}
              placeholder="e.g. Dr. Smith" className={inputCls} />
          </Field>
          <Field label="Phone Number" required>
            <input type="tel" value={pi.phone} onChange={e => setPi(p => ({ ...p, phone: e.target.value }))}
              placeholder="(555) 000-0000" className={inputCls} />
          </Field>
          <Field label="Date of Birth">
            <input type="date" value={pi.dob} onChange={e => setPi(p => ({ ...p, dob: e.target.value }))}
              className={inputCls} />
          </Field>
          <Field label="Gender (optional)">
            <select value={pi.gender} onChange={e => setPi(p => ({ ...p, gender: e.target.value }))} className={selectCls}>
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="non_binary">Non-binary</option>
              <option value="other">Other</option>
            </select>
          </Field>
        </div>
      </div>

      {/* Home address */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
            <MapPin className="w-4 h-4 text-purple-600" />
          </div>
          <h3 className="font-semibold text-slate-800">Home Address</h3>
        </div>
        <div className="space-y-4">
          <Field label="Street Address" required>
            <input type="text" value={pi.address_line1} onChange={e => setPi(p => ({ ...p, address_line1: e.target.value }))}
              placeholder="123 Main Street" className={inputCls} />
          </Field>
          <Field label="Apt / Suite / Unit (optional)">
            <input type="text" value={pi.address_line2} onChange={e => setPi(p => ({ ...p, address_line2: e.target.value }))}
              placeholder="Apt 4B" className={inputCls} />
          </Field>
          <div className="grid grid-cols-6 gap-4">
            <div className="col-span-3">
              <Field label="City" required>
                <input type="text" value={pi.city} onChange={e => setPi(p => ({ ...p, city: e.target.value }))}
                  placeholder="Springfield" className={inputCls} />
              </Field>
            </div>
            <div className="col-span-1">
              <Field label="State" required>
                <input type="text" value={pi.state} onChange={e => setPi(p => ({ ...p, state: e.target.value }))}
                  placeholder="VA" maxLength={2} className={inputCls} />
              </Field>
            </div>
            <div className="col-span-2">
              <Field label="ZIP Code">
                <input type="text" value={pi.zip} onChange={e => setPi(p => ({ ...p, zip: e.target.value }))}
                  placeholder="22150" className={inputCls} />
              </Field>
            </div>
          </div>
        </div>
      </div>

      {/* Vet license (for vet roles) */}
      {isVet && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <Award className="w-4 h-4 text-amber-600" />
            </div>
            <h3 className="font-semibold text-slate-800">Veterinary License</h3>
          </div>
          <Field label="License Number" hint="You will provide full credential details in the Documents step">
            <input type="text" value={pi.vet_license ?? ''} onChange={e => setPi(p => ({ ...p, vet_license: e.target.value }))}
              placeholder="VT-12345" className={inputCls} />
          </Field>
        </div>
      )}

      {/* Continue */}
      <button
        onClick={() => onSave(pi)}
        disabled={isPending || !canContinue}
        className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Save &amp; Continue
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Documents
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED_DOCS = [
  { doc_type: 'resume',        name: 'Resume / CV',                  description: 'Your most recent resume or curriculum vitae',                 icon: FileText },
  { doc_type: 'id',            name: 'Government-Issued ID',         description: 'Passport, drivers license, or state ID card',                icon: User     },
  { doc_type: 'certification', name: 'Professional Certifications',  description: 'Veterinary license, certifications, or diplomas (if applicable)', icon: Award },
  { doc_type: 'contract',      name: 'Signed Employment Agreement',  description: 'Your signed offer letter or employment contract',            icon: Shield   },
  { doc_type: 'tax',           name: 'Tax Forms (W-4 / I-9)',        description: 'Federal tax withholding and employment eligibility forms',   icon: FileText },
  { doc_type: 'banking',       name: 'Direct Deposit Form',          description: 'Bank account information for payroll direct deposit',       icon: FileText },
];

function StepDocuments({ data, onNext, isPending }: {
  data: WizardData;
  onNext: () => void;
  isPending: boolean;
}) {
  const uploaded = data.documents.filter(d => d.status !== 'pending').length;
  const total = REQUIRED_DOCS.length;

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-700 leading-relaxed">
          Upload clear, legible copies of each document. HR will review and verify them before your start date.
          You can upload documents from the <strong>Documents</strong> section in the main menu.
        </p>
      </div>

      {/* Progress */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-slate-700">Documents Uploaded</span>
            <span className="text-sm font-bold text-slate-800">{uploaded} / {total}</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${(uploaded / total) * 100}%` }} />
          </div>
        </div>
        {uploaded === total && <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" />}
      </div>

      {/* Doc list */}
      <div className="space-y-3">
        {REQUIRED_DOCS.map(req => {
          const doc = data.documents.find(d => d.doc_type === req.doc_type);
          const status = doc?.status ?? 'pending';
          const Icon = req.icon;
          return (
            <div key={req.doc_type}
              className={cn(
                'bg-white rounded-2xl border p-4 transition-colors',
                status === 'verified' ? 'border-green-200 bg-green-50/30' :
                status !== 'pending'  ? 'border-blue-200'                  :
                                        'border-slate-200',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                    status === 'verified' ? 'bg-green-100' :
                    status !== 'pending'  ? 'bg-blue-100'  :
                                            'bg-slate-100',
                  )}>
                    <Icon className={cn(
                      'w-5 h-5',
                      status === 'verified' ? 'text-green-600' :
                      status !== 'pending'  ? 'text-blue-600'  :
                                              'text-slate-400',
                    )} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{req.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{req.description}</p>
                  </div>
                </div>
                {docStatusBadge(status)}
              </div>
              {status === 'pending' && (
                <div className="mt-3 ml-13 flex items-center gap-2">
                  <Upload className="w-3.5 h-3.5 text-slate-400" />
                  <p className="text-xs text-slate-400">Upload via Documents section in main navigation</p>
                </div>
              )}
              {status === 'rejected' && doc?.notes && (
                <p className="mt-2 ml-13 text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" /> {doc.notes}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={onNext} disabled={isPending}
        className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-sm">
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Continue
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Emergency Contacts
// ─────────────────────────────────────────────────────────────────────────────

function StepEmergencyContacts({ data, onSave, isPending }: {
  data: WizardData;
  onSave: (contacts: EmergencyContact[]) => void;
  isPending: boolean;
}) {
  const existing = data.record.wizard_data?.emergency_contacts;
  const legacy   = data.record.wizard_data?.emergency_contact;
  const firstSaved = existing?.[0] ?? (legacy ? legacy : null);
  const secondSaved = existing?.[1] ?? null;

  const blank: EmergencyContact = { name: '', relationship: '', phone: '', email: '' };
  const [primary, setPrimary]     = useState<EmergencyContact>(firstSaved  ?? blank);
  const [secondary, setSecondary] = useState<EmergencyContact>(secondSaved ?? blank);
  const [showSecondary, setShowSecondary] = useState(!!secondSaved?.name);

  const canContinue = !!primary.name && !!primary.relationship && !!primary.phone;

  function buildContacts(): EmergencyContact[] {
    const list: EmergencyContact[] = [primary];
    if (showSecondary && secondary.name) list.push(secondary);
    return list;
  }

  function ContactForm({ value, onChange, label }: {
    value: EmergencyContact;
    onChange: (v: EmergencyContact) => void;
    label: string;
  }) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center">
            <Phone className="w-4 h-4 text-rose-600" />
          </div>
          <h3 className="font-semibold text-slate-800">{label}</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full Name" required={label.includes('Primary')}>
            <input type="text" value={value.name} onChange={e => onChange({ ...value, name: e.target.value })}
              placeholder="Jane Doe" className={inputCls} />
          </Field>
          <Field label="Relationship" required={label.includes('Primary')}>
            <input type="text" value={value.relationship} onChange={e => onChange({ ...value, relationship: e.target.value })}
              placeholder="Spouse, Parent, Sibling…" className={inputCls} />
          </Field>
          <Field label="Phone Number" required={label.includes('Primary')}>
            <input type="tel" value={value.phone} onChange={e => onChange({ ...value, phone: e.target.value })}
              placeholder="(555) 000-0000" className={inputCls} />
          </Field>
          <Field label="Email (optional)">
            <input type="email" value={value.email} onChange={e => onChange({ ...value, email: e.target.value })}
              placeholder="jane@example.com" className={inputCls} />
          </Field>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ContactForm value={primary} onChange={setPrimary} label="Primary Emergency Contact" />

      {showSecondary ? (
        <div className="space-y-3">
          <ContactForm value={secondary} onChange={setSecondary} label="Secondary Emergency Contact (optional)" />
          <button onClick={() => setShowSecondary(false)} className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1">
            <X className="w-3.5 h-3.5" /> Remove secondary contact
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowSecondary(true)}
          className="w-full py-3 border-2 border-dashed border-slate-200 rounded-2xl text-sm text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors font-medium"
        >
          + Add Secondary Emergency Contact
        </button>
      )}

      <button
        onClick={() => onSave(buildContacts())}
        disabled={isPending || !canContinue}
        className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Save &amp; Continue
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Compliance Forms
// ─────────────────────────────────────────────────────────────────────────────

function StepCompliance({ data, onAck, onNext, isPending }: {
  data: WizardData;
  onAck: (key: string, sig: string) => void;
  onNext: () => void;
  isPending: boolean;
}) {
  const firstPending = data.policies.find(p => !p.acknowledged)?.policy_key ?? null;
  const [expanded, setExpanded] = useState<string | null>(firstPending);
  const [signatures, setSignatures] = useState<Record<string, string>>({});
  const allAcked = data.policies.length > 0 && data.policies.every(p => p.acknowledged);

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className={cn(
        'rounded-2xl p-4 flex items-center gap-3 border',
        allAcked ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200',
      )}>
        {allAcked
          ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
          : <Lock className="w-5 h-5 text-slate-400 shrink-0" />}
        <div>
          <p className={cn('text-sm font-semibold', allAcked ? 'text-green-800' : 'text-slate-700')}>
            {allAcked
              ? 'All policies acknowledged'
              : `${data.policies.filter(p => !p.acknowledged).length} of ${data.policies.length} remaining`}
          </p>
          <p className={cn('text-xs mt-0.5', allAcked ? 'text-green-600' : 'text-slate-400')}>
            {allAcked ? 'You may proceed to the next step' : 'Read each policy and sign with your full name'}
          </p>
        </div>
      </div>

      {/* Policy list */}
      <div className="space-y-3">
        {data.policies.map(policy => {
          const isOpen = expanded === policy.policy_key;
          const sig = signatures[policy.policy_key] ?? '';
          return (
            <div key={policy.policy_key}
              className={cn(
                'bg-white rounded-2xl border transition-all overflow-hidden',
                policy.acknowledged ? 'border-green-200'     :
                isOpen              ? 'border-blue-300 shadow-sm' :
                                      'border-slate-200',
              )}
            >
              <button
                onClick={() => setExpanded(isOpen ? null : policy.policy_key)}
                className="w-full flex items-center justify-between p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
                    policy.acknowledged ? 'bg-green-100' : 'bg-slate-100',
                  )}>
                    <Shield className={cn('w-4 h-4', policy.acknowledged ? 'text-green-600' : 'text-slate-400')} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{policy.policy_name}</p>
                    {policy.acknowledged && policy.acknowledged_at && (
                      <p className="text-xs text-green-600 mt-0.5">
                        Signed {fmtDateShort(policy.acknowledged_at)}
                        {policy.signature_text ? ` · ${policy.signature_text}` : ''}
                      </p>
                    )}
                  </div>
                </div>
                {policy.acknowledged
                  ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                  : <ChevronRight className={cn('w-4 h-4 text-slate-400 transition-transform shrink-0', isOpen && 'rotate-90')} />
                }
              </button>
              {isOpen && (
                <div className="px-4 pb-4 border-t border-slate-100">
                  <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 leading-relaxed mt-3 max-h-48 overflow-y-auto">
                    {policy.policy_content ?? 'Policy content not available. Please contact HR.'}
                  </div>
                  {!policy.acknowledged && (
                    <div className="mt-4 space-y-3">
                      <div>
                        <p className="text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
                          <Edit3 className="w-3 h-3" />
                          Digital Signature — type your full legal name to acknowledge
                        </p>
                        <input
                          type="text"
                          value={sig}
                          onChange={e => setSignatures(p => ({ ...p, [policy.policy_key]: e.target.value }))}
                          placeholder="Your full legal name"
                          className={inputCls}
                        />
                      </div>
                      <button
                        onClick={() => sig.trim().length >= 3 && onAck(policy.policy_key, sig.trim())}
                        disabled={isPending || sig.trim().length < 3}
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        I Acknowledge This Policy
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={onNext}
        disabled={isPending || !allAcked}
        className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Continue
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — Training
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_COURSES = [
  { id: 'd1', title: 'OSHA Safety Training',           description: 'Workplace health and safety standards',           duration: '45 min' },
  { id: 'd2', title: 'Animal Handling & Restraint',    description: 'Safe and humane animal handling techniques',      duration: '60 min' },
  { id: 'd3', title: 'Hospital SOP Training',          description: 'Standard operating procedures for your role',    duration: '30 min' },
  { id: 'd4', title: 'Emergency Response Training',    description: 'How to respond to medical and safety emergencies', duration: '40 min' },
];

function StepTraining({ data, onNext, isPending }: {
  data: WizardData;
  onNext: () => void;
  isPending: boolean;
}) {
  const tasks = data.trainingTasks.length > 0 ? data.trainingTasks : null;
  const completed = tasks ? tasks.filter(t => t.status === 'completed').length : 0;
  const total     = tasks ? tasks.length : DEFAULT_COURSES.length;

  return (
    <div className="space-y-5">
      {/* Progress */}
      {tasks && tasks.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-slate-700">Training Progress</span>
              <span className="text-sm font-bold text-slate-800">{completed}/{total} completed</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Courses */}
      <div className="space-y-3">
        {tasks ? tasks.map(task => (
          <div key={task.id} className={cn(
            'bg-white rounded-2xl border p-4 flex items-center gap-4',
            task.status === 'completed' ? 'border-green-200' : 'border-slate-200',
          )}>
            <div className={cn(
              'w-11 h-11 rounded-xl flex items-center justify-center shrink-0',
              task.status === 'completed' ? 'bg-green-100' : 'bg-indigo-50',
            )}>
              <GraduationCap className={cn('w-5 h-5', task.status === 'completed' ? 'text-green-600' : 'text-indigo-600')} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">{task.title}</p>
              {task.description && <p className="text-xs text-slate-500 mt-0.5 truncate">{task.description}</p>}
              {task.due_date && (
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Due {fmtDateShort(task.due_date)}
                </p>
              )}
            </div>
            {task.status === 'completed'
              ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              : <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full font-medium shrink-0">Pending</span>
            }
          </div>
        )) : DEFAULT_COURSES.map(course => (
          <div key={course.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">{course.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{course.description}</p>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {course.duration}
              </p>
            </div>
            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full font-medium shrink-0">Assigned</span>
          </div>
        ))}
      </div>

      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
        <p className="text-sm text-indigo-700">
          Access your full training library from the <strong>Training Academy</strong> in the main navigation.
          Complete all assigned courses before your first day.
        </p>
      </div>

      <button onClick={onNext} disabled={isPending}
        className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-sm">
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Continue
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 6 — Orientation
// ─────────────────────────────────────────────────────────────────────────────

function StepOrientation({ data, onNext, isPending }: {
  data: WizardData;
  onNext: () => void;
  isPending: boolean;
}) {
  const startDate  = data.record.start_date;
  const mgr        = data.manager;
  const hospital   = data.hospital;

  return (
    <div className="space-y-5">
      {startDate ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {/* Meeting banner */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Video className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-blue-200 font-medium uppercase tracking-wider">Orientation Meeting</p>
                <h3 className="font-bold text-lg">Welcome Orientation — {data.employee.first_name}</h3>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/10 rounded-xl p-3">
                <p className="text-xs text-blue-200 mb-1">Date</p>
                <p className="font-semibold">{fmtDate(startDate)}</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3">
                <p className="text-xs text-blue-200 mb-1">Time</p>
                <p className="font-semibold">9:00 AM</p>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="p-5 space-y-4">
            {mgr && (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {initials(mgr.first_name, mgr.last_name)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{mgr.first_name} {mgr.last_name}</p>
                  <p className="text-xs text-slate-500">{mgr.job_title ?? 'Your Manager'} · Meeting Host</p>
                </div>
              </div>
            )}
            {hospital && (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{hospital.name}</p>
                  {hospital.address && <p className="text-xs text-slate-500">{hospital.address}</p>}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-1">
              <button className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors font-medium">
                <Calendar className="w-4 h-4" />
                Add to Calendar
              </button>
              <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm transition-colors font-semibold">
                <ExternalLink className="w-4 h-4" />
                Join Meeting
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="font-semibold text-slate-700 mb-2">Orientation Being Scheduled</h3>
          <p className="text-sm text-slate-500 max-w-xs mx-auto">
            Your manager will schedule your orientation meeting and the details will appear here once confirmed.
          </p>
        </div>
      )}

      {/* What to expect */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h4 className="font-semibold text-slate-800 mb-4">What to expect at orientation</h4>
        <div className="space-y-3">
          {[
            { title: 'Hospital tour',          detail: 'Walk-through of all key areas and departments' },
            { title: 'Team introductions',     detail: 'Meet your colleagues and department leads'     },
            { title: 'Systems walkthrough',    detail: 'Access to tools, logins, and software'        },
            { title: 'Role & expectations',    detail: 'First week goals and performance overview'    },
          ].map(({ title, detail }) => (
            <div key={title} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-3 h-3 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">{title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button onClick={onNext} disabled={isPending}
        className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-sm">
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Continue
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 7 — Manager Review
// ─────────────────────────────────────────────────────────────────────────────

function StepManagerReview({ data, onNext, isPending }: {
  data: WizardData;
  onNext: () => void;
  isPending: boolean;
}) {
  const mgr             = data.manager;
  const docsUploaded    = data.documents.filter(d => d.status !== 'pending').length;
  const docsTotal       = Math.max(data.documents.length, REQUIRED_DOCS.length);
  const trainDone       = data.trainingTasks.filter(t => t.status === 'completed').length;
  const trainTotal      = data.trainingTasks.length;
  const policiesSigned  = data.policies.filter(p => p.acknowledged).length;
  const policiesTotal   = data.policies.length;

  const checklist = [
    { label: 'Documents submitted',   done: docsUploaded > 0,                              detail: `${docsUploaded}/${docsTotal} uploaded`           },
    { label: 'Training assigned',     done: data.trainingTasks.length > 0 || trainDone > 0, detail: trainTotal > 0 ? `${trainDone}/${trainTotal} completed` : 'Courses assigned' },
    { label: 'Compliance forms signed', done: policiesTotal > 0 && policiesSigned === policiesTotal, detail: `${policiesSigned}/${policiesTotal} acknowledged` },
    { label: 'Profile complete',      done: !!(data.record.wizard_data?.personal_info?.phone), detail: 'Personal information saved' },
  ];

  return (
    <div className="space-y-5">
      {/* Manager card */}
      {mgr ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Your Manager</p>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-lg font-bold shrink-0">
              {initials(mgr.first_name, mgr.last_name)}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-800">{mgr.first_name} {mgr.last_name}</h3>
              <p className="text-sm text-slate-500">{mgr.job_title ?? 'Manager'}</p>
              <a href={`mailto:${mgr.email}`} className="text-xs text-blue-600 hover:underline mt-1 flex items-center gap-1">
                <Mail className="w-3 h-3" /> {mgr.email}
              </a>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
          <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Manager will be assigned before your start date</p>
        </div>
      )}

      {/* Checklist */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Manager Review Checklist</p>
        <div className="space-y-3">
          {checklist.map(({ label, done, detail }) => (
            <div key={label} className="flex items-center gap-3">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
                done ? 'bg-green-100' : 'bg-slate-100',
              )}>
                {done
                  ? <Check className="w-3.5 h-3.5 text-green-600" />
                  : <Clock className="w-3.5 h-3.5 text-slate-400" />
                }
              </div>
              <div className="flex-1">
                <p className={cn('text-sm font-medium', done ? 'text-slate-800' : 'text-slate-500')}>{label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{detail}</p>
              </div>
              {done
                ? <span className="text-xs text-green-600 font-medium shrink-0">Done</span>
                : <span className="text-xs text-slate-400 font-medium shrink-0">Pending</span>
              }
            </div>
          ))}
        </div>
      </div>

      {/* Status */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Awaiting Manager Approval</p>
          <p className="text-sm text-amber-700 mt-0.5">
            Your manager will review your onboarding documents and mark you as approved. This usually happens within 1-2 business days.
          </p>
        </div>
      </div>

      <button onClick={onNext} disabled={isPending}
        className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-sm">
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Submit for Review
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 8 — Complete
// ─────────────────────────────────────────────────────────────────────────────

function StepComplete({ data, onFinish, isPending }: {
  data: WizardData;
  onFinish: () => void;
  isPending: boolean;
}) {
  const isAlreadyDone   = data.record.status === 'completed';
  const stepsCompleted  = data.record.completed_steps.length;
  const policiesSigned  = data.policies.filter(p => p.acknowledged).length;
  const docsUploaded    = data.documents.filter(d => d.status !== 'pending').length;

  if (isAlreadyDone) {
    return (
      <div className="space-y-5">
        <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl p-8 text-center text-white">
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-3xl font-bold mb-2">Onboarding Complete!</h2>
          <p className="text-green-100 text-lg">
            Welcome to <strong>{data.hospital?.name ?? 'the team'}</strong>, {data.employee.first_name}!
          </p>
          <p className="text-green-200 text-sm mt-2">
            Completed {fmtDate(data.record.completed_at)}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Steps Done',     value: `${stepsCompleted}/8` },
            { label: 'Policies Signed', value: String(policiesSigned) },
            { label: 'Docs Uploaded',  value: String(docsUploaded)   },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
              <p className="text-2xl font-bold text-slate-800 tabular-nums">{value}</p>
              <p className="text-xs text-slate-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
        <button className="w-full py-3.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2 transition-colors">
          <Download className="w-4 h-4" />
          Download Welcome Pack
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-3xl p-8 text-center text-white">
        <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-5">
          <Sparkles className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-3xl font-bold mb-2">Almost There!</h2>
        <p className="text-blue-100 text-lg">
          You have completed {stepsCompleted} of 8 steps. Submit to officially finalize your onboarding.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Steps Done',     value: `${stepsCompleted}/8` },
          { label: 'Policies Signed', value: `${policiesSigned}/${data.policies.length || '—'}` },
          { label: 'Docs Uploaded',  value: `${docsUploaded}/${Math.max(data.documents.length, REQUIRED_DOCS.length)}` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
            <p className="text-xl font-bold text-slate-800 tabular-nums">{value}</p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* What happens next */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h4 className="font-semibold text-slate-800 mb-4">What happens after you submit</h4>
        <div className="space-y-3">
          {[
            'HR reviews your submitted documents and credentials',
            'Your manager confirms orientation and equipment',
            'You receive a welcome email with all access credentials',
            'Start your assigned training courses in the Training Academy',
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-blue-600 text-xs font-bold">{i + 1}</span>
              </div>
              <p className="text-sm text-slate-600">{item}</p>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onFinish}
        disabled={isPending}
        className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-base shadow-lg shadow-green-200"
      >
        {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Star className="w-5 h-5" />}
        Complete My Onboarding
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Completion Celebration (full-screen after status = completed)
// ─────────────────────────────────────────────────────────────────────────────

function CompletionCelebration({ data }: { data: WizardData }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="relative">
          <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-green-200">
            <CheckCircle2 className="w-12 h-12 text-white" />
          </div>
        </div>
        <h1 className="text-4xl font-bold text-slate-800 mb-3">Welcome to the Team!</h1>
        <p className="text-slate-500 text-lg mb-2">
          Congratulations, <strong>{data.employee.first_name}</strong>!
        </p>
        <p className="text-slate-400 text-sm mb-8">
          Your onboarding at {data.hospital?.name ?? 'the hospital'} is officially complete.
        </p>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 text-left mb-6 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Your Next Steps</p>
          {[
            'Check your email for system access credentials',
            'Complete your assigned training courses',
            'Attend your scheduled orientation meeting',
            'Reach out to your manager with any questions',
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
              <ChevronRight className="w-4 h-4 text-blue-500 shrink-0" />
              <p className="text-sm text-slate-600">{step}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2 transition-colors">
            <Download className="w-4 h-4" />
            Welcome Pack
          </button>
          <button className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
            Go to Dashboard
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Voice Assistant Hook
// ─────────────────────────────────────────────────────────────────────────────

// Step narrations — what gets read aloud when you arrive at each step
const STEP_NARRATIONS: Record<string, string> = {
  personal_info:      'Step 1: Personal Information. Please fill in your contact details, address, and date of birth. All starred fields are required.',
  documents:          'Step 2: Documents. Upload your required onboarding documents including your employment contract, government ID, and tax forms. Click the upload button next to each document.',
  emergency_contacts: 'Step 3: Emergency Contacts. Please provide the name, relationship, and phone number for at least one emergency contact.',
  compliance:         'Step 4: Compliance Forms. Read each policy carefully, then type your name to sign and click Acknowledge. You must sign all policies to continue.',
  training:           'Step 5: Training. Review your assigned training courses. You will complete these in the Training Academy. Click Next when you are ready to proceed.',
  orientation:        'Step 6: Orientation. Review your scheduled orientation meetings and first week activities. Your manager and HR team will guide you through these sessions.',
  manager_review:     'Step 7: Manager Review. Your onboarding is almost complete. A summary of what you have submitted is shown here. Click Submit for Review to send to your manager.',
  complete:           'Final Step: You are nearly done! Review your completion summary and click Complete My Onboarding to officially finish.',
};

// Voice commands and what they do
const COMMANDS: Array<{ phrases: string[]; description: string; action: string }> = [
  { phrases: ['next', 'continue', 'go next', 'next step', 'move forward'],   description: 'Go to next step',     action: 'next'  },
  { phrases: ['back', 'go back', 'previous', 'previous step', 'go previous'], description: 'Go to previous step', action: 'back'  },
  { phrases: ['help', 'what can i say', 'commands', 'voice commands'],        description: 'List commands',       action: 'help'  },
  { phrases: ['read', 'read this', 'explain', 'what is this', 'describe'],    description: 'Read current step',   action: 'read'  },
  { phrases: ['stop', 'stop talking', 'quiet', 'silence', 'shush'],           description: 'Stop speaking',       action: 'stop'  },
  { phrases: ['progress', 'how far', 'how much', 'percentage', 'status'],     description: 'Read progress',       action: 'progress' },
];

interface VoiceAssistantState {
  enabled: boolean;
  listening: boolean;
  speaking: boolean;
  muted: boolean;
  transcript: string;
  lastCommand: string;
  showHelp: boolean;
  supported: boolean;
}

function useVoiceAssistant(opts: {
  stepKey: string;
  stepIndex: number;
  totalSteps: number;
  progress: number;
  employeeName: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const { stepKey, stepIndex, totalSteps, progress, employeeName, onNext, onBack } = opts;

  const [state, setState] = useState<VoiceAssistantState>({
    enabled:     false,
    listening:   false,
    speaking:    false,
    muted:       false,
    transcript:  '',
    lastCommand: '',
    showHelp:    false,
    supported:   typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window),
  });

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const synthRef       = useRef<typeof window['speechSynthesis'] | null>(null);

  // Speak text via Web Speech API
  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined') return;
    synthRef.current = window.speechSynthesis;
    synthRef.current.cancel();
    setState(s => ({ ...s, speaking: true }));
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate   = 0.95;
    utt.pitch  = 1;
    utt.volume = 1;
    const voices = synthRef.current.getVoices();
    const preferred = voices.find(v => v.lang.startsWith('en') && v.localService) ?? voices.find(v => v.lang.startsWith('en'));
    if (preferred) utt.voice = preferred;
    utt.onend = () => setState(s => ({ ...s, speaking: false }));
    utt.onerror = () => setState(s => ({ ...s, speaking: false }));
    synthRef.current.speak(utt);
  }, []);

  const stopSpeaking = useCallback(() => {
    synthRef.current?.cancel();
    setState(s => ({ ...s, speaking: false }));
  }, []);

  // Process a recognised voice command
  const processCommand = useCallback((transcript: string) => {
    const text = transcript.toLowerCase().trim();
    setState(s => ({ ...s, transcript: transcript, lastCommand: '' }));

    for (const cmd of COMMANDS) {
      if (cmd.phrases.some(p => text.includes(p))) {
        setState(s => ({ ...s, lastCommand: cmd.description }));
        switch (cmd.action) {
          case 'next':     speak('Moving to the next step.'); setTimeout(onNext, 800); break;
          case 'back':     speak('Going back to the previous step.'); setTimeout(onBack, 800); break;
          case 'read':     speak(STEP_NARRATIONS[stepKey] ?? 'No description available for this step.'); break;
          case 'stop':     stopSpeaking(); break;
          case 'progress': speak(`You are ${progress} percent complete. Step ${stepIndex + 1} of ${totalSteps}.`); break;
          case 'help': {
            setState(s => ({ ...s, showHelp: true }));
            speak('Available commands: Say next to advance, back to go to the previous step, read to hear instructions for this step, progress to hear your progress, or stop to silence me.');
            break;
          }
        }
        return;
      }
    }
    speak(`I didn't catch that. Say help to hear available commands.`);
  }, [stepKey, stepIndex, totalSteps, progress, onNext, onBack, speak, stopSpeaking]);

  // Start/stop listening
  const startListening = useCallback(() => {
    if (!state.supported) return;
    const w = window as typeof window & { webkitSpeechRecognition?: SpeechRecognitionCtor; SpeechRecognition?: SpeechRecognitionCtor };
    const Ctor = w.webkitSpeechRecognition ?? w.SpeechRecognition;
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.continuous     = false;
    recognition.interimResults = false;
    recognition.lang           = 'en-US';
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const result = e.results[0]?.[0]?.transcript ?? '';
      processCommand(result);
    };
    recognition.onend = () => setState(s => ({ ...s, listening: false }));
    recognition.onerror = () => setState(s => ({ ...s, listening: false }));
    recognition.start();
    recognitionRef.current = recognition;
    setState(s => ({ ...s, listening: true, transcript: '' }));
  }, [state.supported, processCommand]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setState(s => ({ ...s, listening: false }));
  }, []);

  // Greet when voice is first enabled
  const enable = useCallback(() => {
    setState(s => ({ ...s, enabled: true }));
    speak(`Hello ${employeeName}! Voice assistant is active. ${STEP_NARRATIONS[stepKey] ?? ''} Say help for available commands.`);
  }, [employeeName, stepKey, speak]);

  const disable = useCallback(() => {
    stopSpeaking();
    stopListening();
    setState(s => ({ ...s, enabled: false, listening: false, speaking: false, showHelp: false }));
  }, [stopSpeaking, stopListening]);

  // Auto-narrate when step changes (if enabled and not muted)
  const prevStepRef = useRef(stepKey);
  useEffect(() => {
    if (state.enabled && !state.muted && prevStepRef.current !== stepKey) {
      prevStepRef.current = stepKey;
      setTimeout(() => speak(STEP_NARRATIONS[stepKey] ?? ''), 400);
    }
  }, [stepKey, state.enabled, state.muted, speak]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      synthRef.current?.cancel();
    };
  }, []);

  return { state, enable, disable, startListening, stopListening, speak, stopSpeaking,
    toggleMute: () => setState(s => ({ ...s, muted: !s.muted })),
    dismissHelp: () => setState(s => ({ ...s, showHelp: false })),
  };
}

// ── Voice Assistant Floating UI ────────────────────────────────────────────────

function VoiceAssistantButton({ va }: { va: ReturnType<typeof useVoiceAssistant> }) {
  const { state, enable, disable, startListening, stopListening, toggleMute, dismissHelp } = va;

  if (!state.supported) return null;

  return (
    <>
      {/* Floating button */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">

        {/* Status bubble */}
        {state.enabled && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl px-4 py-3 max-w-xs animate-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <div className={cn(
                  'w-2 h-2 rounded-full',
                  state.listening ? 'bg-red-500 animate-pulse' :
                  state.speaking  ? 'bg-blue-500 animate-pulse' :
                  'bg-emerald-500'
                )} />
                <span className="text-xs font-semibold text-slate-700">
                  {state.listening ? 'Listening…' : state.speaking ? 'Speaking…' : 'Voice Active'}
                </span>
              </div>
              <button onClick={toggleMute} className="text-slate-400 hover:text-slate-600">
                {state.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            </div>
            {state.transcript && (
              <p className="text-xs text-slate-500 italic truncate">"{state.transcript}"</p>
            )}
            {state.lastCommand && (
              <p className="text-xs text-blue-600 font-medium mt-1">→ {state.lastCommand}</p>
            )}
          </div>
        )}

        {/* Help panel */}
        {state.showHelp && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-4 max-w-xs animate-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Voice Commands</p>
              <button onClick={dismissHelp} className="text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-2">
              {COMMANDS.map(cmd => (
                <div key={cmd.action} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-600">{cmd.description}</span>
                  <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                    "{cmd.phrases[0]}"
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main mic button */}
        <div className="flex items-center gap-2">
          {state.enabled && (
            <button
              onClick={state.listening ? stopListening : startListening}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold shadow-lg transition-all',
                state.listening
                  ? 'bg-red-500 text-white animate-pulse ring-4 ring-red-200'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              )}
            >
              {state.listening ? (
                <><MicOff className="w-4 h-4" /> Stop</>
              ) : (
                <><Mic className="w-4 h-4 text-blue-600" /> Speak</>
              )}
            </button>
          )}

          <button
            onClick={state.enabled ? disable : enable}
            title={state.enabled ? 'Disable voice assistant' : 'Enable voice assistant'}
            className={cn(
              'w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all',
              state.enabled
                ? 'bg-blue-600 text-white ring-4 ring-blue-200 hover:bg-blue-700'
                : 'bg-white border-2 border-slate-200 text-slate-400 hover:border-blue-400 hover:text-blue-600'
            )}
          >
            {state.enabled
              ? <Mic className="w-6 h-6" />
              : <MicOff className="w-6 h-6" />
            }
          </button>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Wizard — Employee-facing 8-step flow
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  initialData: WizardData;
}

export function OnboardingWizard({ initialData }: Props) {
  const [data, setData]           = useState<WizardData>(initialData);
  const [isPending, startT]       = useTransition();
  const [currentStepIdx, setStep] = useState(() =>
    Math.min(data.record.wizard_step ?? 0, WIZARD_STEPS.length - 1)
  );
  const [error, setError]         = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const contentRef                = useRef<HTMLDivElement>(null);

  const completedSteps = new Set(data.record.completed_steps ?? []);
  const progress       = Math.round((completedSteps.size / WIZARD_STEPS.length) * 100);
  const isCompleted    = data.record.status === 'completed';

  // Voice assistant
  const currentStepKey = WIZARD_STEP_ORDER[currentStepIdx] ?? 'personal_info';
  const voiceAssistant = useVoiceAssistant({
    stepKey:      currentStepKey,
    stepIndex:    currentStepIdx,
    totalSteps:   WIZARD_STEPS.length,
    progress,
    employeeName: data.employee.first_name,
    onNext:       () => { if (currentStepIdx < WIZARD_STEPS.length - 1) setStep(i => i + 1); },
    onBack:       () => { if (currentStepIdx > 0) setStep(i => i - 1); },
  });

  // Scroll to top of content on step change
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStepIdx]);

  function goToStep(idx: number) {
    if (idx < 0 || idx >= WIZARD_STEPS.length) return;
    if (idx > currentStepIdx) {
      const prevKey = WIZARD_STEP_ORDER[idx - 1];
      if (prevKey && !completedSteps.has(prevKey) && idx > 0) return;
    }
    setStep(idx);
    setError(null);
  }

  function showError(msg: string) {
    setError(msg);
    setTimeout(() => setError(null), 5000);
  }

  function advanceStep(stepKey: WizardStepKey) {
    const nextIdx = Math.min(currentStepIdx + 1, WIZARD_STEPS.length - 1);
    startT(async () => {
      setSaveState('saving');
      const res = await completeWizardStep(data.record.id, stepKey, nextIdx, false);
      if (!res.success) {
        setSaveState('error');
        showError(res.error ?? 'Failed to save progress.');
        return;
      }
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
      setData(prev => ({
        ...prev,
        record: {
          ...prev.record,
          completed_steps: Array.from(new Set([...prev.record.completed_steps, stepKey])),
          wizard_step: nextIdx,
          progress_pct: Math.min(Math.round(((completedSteps.size + 1) / WIZARD_STEPS.length) * 100), 99),
        },
      }));
      setStep(nextIdx);
    });
  }

  if (isCompleted) return <CompletionCelebration data={data} />;

  const stepMeta  = WIZARD_STEPS[currentStepIdx];
  const totalMins = WIZARD_STEPS
    .slice(currentStepIdx)
    .filter(s => !completedSteps.has(s.key))
    .reduce((sum, s) => sum + s.estimatedMinutes, 0);

  const fullName = `${data.employee.first_name} ${data.employee.last_name}`.trim();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* ── Employee Header ─────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            {data.employee.avatar_url ? (
              <img src={data.employee.avatar_url} alt={fullName}
                className="w-14 h-14 rounded-2xl object-cover shrink-0 ring-2 ring-slate-100" />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-lg font-bold shrink-0">
                {initials(data.employee.first_name, data.employee.last_name)}
              </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="text-lg font-bold text-slate-800 leading-tight">{fullName}</h1>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {fmtRole(data.employee.job_title ?? data.employee.role)}
                    {data.employee.department ? ` · ${data.employee.department}` : ''}
                  </p>
                </div>
                <SaveIndicator state={saveState} />
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                {data.hospital && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: data.hospital.color ?? '#3b82f6' }} />
                    {data.hospital.name}
                  </div>
                )}
                {data.manager && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Users className="w-3 h-3 text-slate-400" />
                    {data.manager.first_name} {data.manager.last_name}
                  </div>
                )}
                {data.record.start_date && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    Starts {fmtDate(data.record.start_date)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-500 font-medium">
                Step {currentStepIdx + 1} of {WIZARD_STEPS.length} — {stepMeta.label}
              </span>
              <span className="text-xs font-bold text-slate-700">{progress}% complete</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
            {totalMins > 0 && (
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                About {totalMins} min remaining
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Horizontal Step Navigation ──────────────────────────── */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex items-center overflow-x-auto scrollbar-none py-3 gap-1">
            {WIZARD_STEPS.map((step, idx) => {
              const isDone   = completedSteps.has(step.key);
              const isActive = idx === currentStepIdx;
              const canClick = isDone || isActive || (idx > 0 && completedSteps.has(WIZARD_STEP_ORDER[idx - 1]));

              return (
                <button
                  key={step.key}
                  onClick={() => canClick && goToStep(idx)}
                  disabled={!canClick}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all shrink-0',
                    isActive && 'bg-blue-600 text-white',
                    isDone && !isActive && 'text-green-700 hover:bg-green-50',
                    !isDone && !isActive && canClick && 'text-slate-500 hover:bg-slate-50',
                    !isDone && !isActive && !canClick && 'text-slate-300 cursor-not-allowed',
                  )}
                >
                  <div className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border shrink-0',
                    isActive && 'bg-white text-blue-600 border-white',
                    isDone && !isActive && 'bg-green-500 border-green-500 text-white',
                    !isDone && !isActive && 'border-current',
                  )}>
                    {isDone && !isActive ? <Check className="w-3 h-3" /> : idx + 1}
                  </div>
                  <span className="hidden sm:inline">{step.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Step Content ────────────────────────────────────────── */}
      <div ref={contentRef} className="flex-1">
        {/* Error banner */}
        {error && (
          <div className="max-w-3xl mx-auto px-4 mt-4">
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className="max-w-3xl mx-auto px-4 py-6 pb-16">
          {/* Step heading */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-800">{stepMeta.label}</h2>
            <p className="text-slate-500 mt-1">{stepMeta.description}</p>
          </div>

          {/* Render active step */}
          {WIZARD_STEP_ORDER[currentStepIdx] === 'personal_info' && (
            <StepPersonalInfo
              data={data}
              isPending={isPending}
              onSave={pi => {
                startT(async () => {
                  setSaveState('saving');
                  const res = await savePersonalInfo(data.record.id, pi);
                  if (!res.success) { setSaveState('error'); showError(res.error ?? 'Save failed.'); return; }
                  setData(prev => ({
                    ...prev,
                    record: { ...prev.record, wizard_data: { ...prev.record.wizard_data, personal_info: pi } },
                  }));
                  setSaveState('saved');
                  setTimeout(() => setSaveState('idle'), 2000);
                  advanceStep('personal_info');
                });
              }}
            />
          )}

          {WIZARD_STEP_ORDER[currentStepIdx] === 'documents' && (
            <StepDocuments data={data} isPending={isPending} onNext={() => advanceStep('documents')} />
          )}

          {WIZARD_STEP_ORDER[currentStepIdx] === 'emergency_contacts' && (
            <StepEmergencyContacts
              data={data}
              isPending={isPending}
              onSave={contacts => {
                startT(async () => {
                  setSaveState('saving');
                  const res = await saveEmergencyContacts(data.record.id, contacts);
                  if (!res.success) { setSaveState('error'); showError(res.error ?? 'Save failed.'); return; }
                  setData(prev => ({
                    ...prev,
                    record: { ...prev.record, wizard_data: { ...prev.record.wizard_data, emergency_contacts: contacts } },
                  }));
                  setSaveState('saved');
                  setTimeout(() => setSaveState('idle'), 2000);
                  advanceStep('emergency_contacts');
                });
              }}
            />
          )}

          {WIZARD_STEP_ORDER[currentStepIdx] === 'compliance' && (
            <StepCompliance
              data={data}
              isPending={isPending}
              onAck={(key, sig) => {
                startT(async () => {
                  const res = await acknowledgePolicy(data.record.id, key, sig);
                  if (!res.success) { showError(res.error ?? 'Save failed.'); return; }
                  setData(prev => ({
                    ...prev,
                    policies: prev.policies.map(p =>
                      p.policy_key === key
                        ? { ...p, acknowledged: true, signature_text: sig, acknowledged_at: new Date().toISOString() }
                        : p
                    ),
                  }));
                });
              }}
              onNext={() => advanceStep('compliance')}
            />
          )}

          {WIZARD_STEP_ORDER[currentStepIdx] === 'training' && (
            <StepTraining data={data} isPending={isPending} onNext={() => advanceStep('training')} />
          )}

          {WIZARD_STEP_ORDER[currentStepIdx] === 'orientation' && (
            <StepOrientation data={data} isPending={isPending} onNext={() => advanceStep('orientation')} />
          )}

          {WIZARD_STEP_ORDER[currentStepIdx] === 'manager_review' && (
            <StepManagerReview data={data} isPending={isPending} onNext={() => advanceStep('manager_review')} />
          )}

          {WIZARD_STEP_ORDER[currentStepIdx] === 'complete' && (
            <StepComplete
              data={data}
              isPending={isPending}
              onFinish={() => {
                startT(async () => {
                  const res = await completeOnboarding(data.record.id);
                  if (!res.success) { showError(res.error ?? 'Failed.'); return; }
                  setData(prev => ({ ...prev, record: { ...prev.record, status: 'completed', progress_pct: 100 } }));
                });
              }}
            />
          )}

          {/* Back button */}
          {currentStepIdx > 0 && currentStepKey !== 'complete' && (
            <button
              onClick={() => goToStep(currentStepIdx - 1)}
              className="mt-4 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors font-medium"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to {WIZARD_STEPS[currentStepIdx - 1]?.label}
            </button>
          )}
        </div>
      </div>

      {/* ── Voice Assistant floating button ─────────────────────── */}
      <VoiceAssistantButton va={voiceAssistant} />
    </div>
  );
}
