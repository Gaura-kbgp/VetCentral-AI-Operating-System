'use client';

import { useState, useTransition } from 'react';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import {
  Select, SelectContent, SelectGroup, SelectItem,
  SelectLabel, SelectTrigger,
} from '@/components/ui/select';
import {
  UserPlus, Trash2, Plus, Mail, Send, Loader2,
  CheckCircle2, XCircle, Eye, EyeOff, Copy, CheckCheck,
  RefreshCw, Lock, KeyRound, ShieldAlert, Users,
} from 'lucide-react';
import { createEmployees } from '@/lib/actions/hr';
import type { BulkEmployeeInput, BulkPersonResult } from '@/lib/actions/hr';
import type { AppRole } from '@/types/database';

const ROLE_OPTIONS: { value: AppRole; label: string; group: string }[] = [
  { value: 'hospital_admin',   label: 'Hospital Admin',   group: 'Management'  },
  { value: 'practice_manager', label: 'Practice Manager', group: 'Management'  },
  { value: 'doctor',           label: 'Doctor',           group: 'Clinical'    },
  { value: 'hr',               label: 'HR',               group: 'Operations'  },
  { value: 'csr',              label: 'CSR',              group: 'Operations'  },
  { value: 'va',               label: 'VA',               group: 'Operations'  },
  { value: 'marketing',        label: 'Marketing',        group: 'Operations'  },
  { value: 'it_admin',         label: 'IT Admin',         group: 'Technical'   },
  { value: 'viewer',           label: 'Viewer',           group: 'Other'       },
];
const ROLE_GROUPS = ['Management', 'Clinical', 'Operations', 'Technical', 'Other'];

interface Hospital { id: string; name: string; color: string | null; }

interface Props {
  hospitals:  Hospital[];
  onCreated?: () => void;
}

type PersonRow = BulkEmployeeInput & { id: string; showPass: boolean };

function uid()    { return Math.random().toString(36).slice(2, 10); }
function genPass() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!';
  return Array.from({ length: 12 }, () => c[Math.floor(Math.random() * c.length)]).join('');
}

function emptyRow(hospitalId = '', role: AppRole | '' = ''): PersonRow {
  return {
    id: uid(), first_name: '', last_name: '', email: '',
    job_title: '', department: '', phone: '',
    hospital_id: hospitalId, role: (role || '') as AppRole,
    password: genPass(), showPass: false,
  };
}

export function NewEmployeeForm({ hospitals, onCreated }: Props) {
  const [rows, setRows]       = useState<PersonRow[]>([emptyRow(hospitals[0]?.id ?? '')]);
  const [sendEmails, setSendEmails] = useState(true);
  const [formError, setFormError]   = useState<string | null>(null);
  const [results, setResults] = useState<BulkPersonResult[] | null>(null);
  const [copied,  setCopied]  = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();

  // ── Row helpers ─────────────────────────────────────────────────────────────
  function updateRow(id: string, patch: Partial<PersonRow>) {
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  }
  function addRow() {
    const last = rows[rows.length - 1];
    setRows(rs => [...rs, emptyRow(last?.hospital_id ?? hospitals[0]?.id ?? '', last?.role ?? '')]);
  }
  function removeRow(id: string) {
    if (rows.length === 1) return;
    setRows(rs => rs.filter(r => r.id !== id));
  }

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(c => ({ ...c, [key]: true }));
    setTimeout(() => setCopied(c => ({ ...c, [key]: false })), 2000);
  }

  // ── Validation ───────────────────────────────────────────────────────────────
  function validate(): string | null {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const n = `Person ${i + 1}`;
      if (!r.first_name.trim())                          return `${n}: First name required`;
      if (!r.last_name.trim())                           return `${n}: Last name required`;
      if (!r.email.trim() || !r.email.includes('@'))     return `${n}: Valid email required`;
      if (!r.hospital_id)                                return `${n}: Hospital required`;
      if (!r.role)                                       return `${n}: Role required`;
      if (!r.password.trim() || r.password.length < 8)  return `${n}: Password ≥ 8 chars`;
    }
    const emails = rows.map(r => r.email.toLowerCase().trim());
    const dupes  = emails.filter((e, i) => emails.indexOf(e) !== i);
    if (dupes.length) return `Duplicate email: ${dupes[0]}`;
    return null;
  }

  function handleSubmit() {
    const err = validate();
    if (err) { setFormError(err); return; }
    setFormError(null);

    startTransition(async () => {
      const inputs: BulkEmployeeInput[] = rows.map(({ id: _id, showPass: _sp, ...rest }) => rest);
      const res = await createEmployees(inputs, sendEmails);
      setResults(res.results);
    });
  }

  // ── Results view ─────────────────────────────────────────────────────────────
  if (results) {
    const ok  = results.filter(r => r.success);
    const bad = results.filter(r => !r.success);

    return (
      <div className="space-y-6 max-w-3xl">
        {/* Summary banner */}
        <div className={`rounded-2xl p-5 flex items-center gap-4 ${
          bad.length === 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'
        }`}>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
            bad.length === 0 ? 'bg-emerald-100' : 'bg-amber-100'
          }`}>
            <Users className={`h-6 w-6 ${bad.length === 0 ? 'text-emerald-600' : 'text-amber-600'}`} />
          </div>
          <div>
            <p className="text-[15px] font-bold text-gray-900">
              {ok.length} of {results.length} account{results.length !== 1 ? 's' : ''} created
            </p>
            <p className="text-[13px] text-gray-500 mt-0.5">
              {ok.length > 0 && `${ok.length} created — onboarding auto-started. `}
              {sendEmails && ok.length > 0 && `${ok.filter(r => r.email_sent).length} emails sent. `}
              {bad.length > 0 && `${bad.length} failed.`}
            </p>
          </div>
        </div>

        {/* Per-person results */}
        <div className="space-y-3">
          {results.map((r, i) => (
            <div key={i} className={`rounded-2xl border ${
              r.success ? 'border-emerald-200 bg-white' : 'border-red-200 bg-red-50'
            } overflow-hidden`}>
              {/* Row header */}
              <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  r.success ? 'bg-emerald-100' : 'bg-red-100'
                }`}>
                  {r.success
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    : <XCircle      className="h-4 w-4 text-red-600" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900">
                    {r.full_name ?? `${r.input.first_name} ${r.input.last_name}`.trim()}
                  </p>
                  <p className="text-[11px] text-gray-500">{r.input.email}</p>
                </div>
                {r.success && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      {r.input.role.replace(/_/g, ' ')}
                    </span>
                    {r.email_sent && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
                        <Mail className="h-2.5 w-2.5" />Email sent
                      </span>
                    )}
                    {sendEmails && !r.email_sent && r.email_error && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1" title={r.email_error}>
                        <Mail className="h-2.5 w-2.5" />Email failed
                      </span>
                    )}
                  </div>
                )}
                {!r.success && (
                  <span className="text-[11px] text-red-600 font-medium">{r.error}</span>
                )}
              </div>

              {/* Credentials (success only) */}
              {r.success && (
                <div className="bg-gray-900 px-5 py-4">
                  <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Lock className="h-3 w-3" />Login Credentials — share privately
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Email */}
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Email</p>
                      <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                        <span className="flex-1 text-[12px] font-mono text-gray-100 truncate">{r.input.email}</span>
                        <button type="button" onClick={() => copyText(r.input.email, `${i}_email`)}
                          className="text-gray-400 hover:text-white transition-colors shrink-0">
                          {copied[`${i}_email`]
                            ? <CheckCheck className="h-3.5 w-3.5 text-emerald-400" />
                            : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                    {/* Password */}
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Password</p>
                      <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                        <span className="flex-1 text-[12px] font-mono text-yellow-300 truncate">{r.input.password}</span>
                        <button type="button" onClick={() => copyText(r.input.password, `${i}_pass`)}
                          className="text-gray-400 hover:text-white transition-colors shrink-0">
                          {copied[`${i}_pass`]
                            ? <CheckCheck className="h-3.5 w-3.5 text-emerald-400" />
                            : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  {/* Copy all button */}
                  <button
                    type="button"
                    onClick={() => copyText(`Name: ${r.full_name}\nEmail: ${r.input.email}\nPassword: ${r.input.password}`, `${i}_all`)}
                    className="mt-3 w-full flex items-center justify-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-[11px] font-semibold py-1.5 rounded-lg transition-colors"
                  >
                    {copied[`${i}_all`]
                      ? <><CheckCheck className="h-3 w-3 text-emerald-400" />Copied!</>
                      : <><Copy className="h-3 w-3" />Copy credentials</>}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button type="button" variant="outline" className="flex-1 h-10 text-[13px]"
            onClick={() => {
              setResults(null);
              setRows([emptyRow(hospitals[0]?.id ?? '')]);
              setFormError(null);
            }}>
            <Plus className="h-4 w-4 mr-1.5" />Add More Employees
          </Button>
          <Button type="button" className="flex-1 h-10 text-[13px]" onClick={() => onCreated?.()}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  // ── Creation form ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-8">

      {/* Header + email toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-bold text-gray-900">New Employee Accounts</h2>
          <p className="text-[12px] text-gray-500 mt-0.5">
            Create multiple accounts at once — each gets onboarding auto-started.
          </p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div
            role="switch"
            aria-checked={sendEmails}
            onClick={() => setSendEmails(s => !s)}
            className={`w-10 h-5 rounded-full transition-colors relative ${sendEmails ? 'bg-blue-600' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${sendEmails ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-[12px] font-semibold text-gray-600 flex items-center gap-1">
            <Mail className="h-3.5 w-3.5" />Send credentials by email
          </span>
        </label>
      </div>

      {/* Employee rows */}
      <div className="space-y-3">
        {rows.map((row, idx) => (
          <div key={row.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">

            {/* Row header */}
            <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100">
              <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-[12px] font-bold text-blue-700 shrink-0">
                {idx + 1}
              </div>
              <span className="text-[13px] font-semibold text-gray-600 flex-1">
                {row.first_name || row.last_name
                  ? `${row.first_name} ${row.last_name}`.trim()
                  : `Person ${idx + 1}`}
              </span>
              {rows.length > 1 && (
                <button type="button" onClick={() => removeRow(row.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Fields */}
            <div className="px-5 py-4 space-y-4">
              {/* Name */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    First Name <span className="text-red-500">*</span>
                  </Label>
                  <Input value={row.first_name}
                    onChange={e => updateRow(row.id, { first_name: e.target.value })}
                    placeholder="Jane" className="h-9 text-[13px]" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Last Name <span className="text-red-500">*</span>
                  </Label>
                  <Input value={row.last_name}
                    onChange={e => updateRow(row.id, { last_name: e.target.value })}
                    placeholder="Smith" className="h-9 text-[13px]" />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Work Email <span className="text-red-500">*</span>
                </Label>
                <Input value={row.email}
                  onChange={e => updateRow(row.id, { email: e.target.value })}
                  type="email" placeholder="jane.smith@hospital.com" className="h-9 text-[13px]" />
              </div>

              {/* Job title + department */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Job Title</Label>
                  <Input value={row.job_title ?? ''} onChange={e => updateRow(row.id, { job_title: e.target.value })}
                    placeholder="Vet Technician" className="h-9 text-[13px]" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Phone</Label>
                  <Input value={row.phone ?? ''} onChange={e => updateRow(row.id, { phone: e.target.value })}
                    type="tel" placeholder="+1 555 000 0000" className="h-9 text-[13px]" />
                </div>
              </div>

              {/* Hospital + Role */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Hospital <span className="text-red-500">*</span>
                  </Label>
                  <Select value={row.hospital_id} onValueChange={v => v && updateRow(row.id, { hospital_id: v })}>
                    <SelectTrigger className="h-9 text-[12px]">
                      <span className={row.hospital_id ? 'text-gray-900 text-[12px]' : 'text-gray-400 text-[12px]'}>
                        {row.hospital_id
                          ? (hospitals.find(h => h.id === row.hospital_id)?.name ?? 'Hospital')
                          : 'Select hospital'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {hospitals.map(h => (
                        <SelectItem key={h.id} value={h.id} className="text-[12px]">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: h.color ?? '#3B82F6' }} />
                            {h.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Role <span className="text-red-500">*</span>
                  </Label>
                  <Select value={row.role} onValueChange={v => v && updateRow(row.id, { role: v as AppRole })}>
                    <SelectTrigger className="h-9 text-[12px]">
                      <span className={row.role ? 'text-gray-900 text-[12px]' : 'text-gray-400 text-[12px]'}>
                        {row.role
                          ? (ROLE_OPTIONS.find(r => r.value === row.role)?.label ?? row.role)
                          : 'Select role'}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="min-w-44">
                      {ROLE_GROUPS.map(group => (
                        <SelectGroup key={group}>
                          <SelectLabel className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1">
                            {group}
                          </SelectLabel>
                          {ROLE_OPTIONS.filter(r => r.group === group).map(r => (
                            <SelectItem key={r.value} value={r.value} className="text-[12px]">{r.label}</SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                  <KeyRound className="h-3 w-3" />Temporary Password <span className="text-red-500">*</span>
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      value={row.password}
                      onChange={e => updateRow(row.id, { password: e.target.value })}
                      type={row.showPass ? 'text' : 'password'}
                      className="h-9 text-[12px] pr-9 font-mono"
                    />
                    <button type="button"
                      onClick={() => updateRow(row.id, { showPass: !row.showPass })}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {row.showPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-9 px-2.5 shrink-0"
                    onClick={() => updateRow(row.id, { password: genPass() })} title="Regenerate">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-9 px-2.5 shrink-0"
                    onClick={() => copyText(row.password, `copy_${row.id}`)} title="Copy">
                    {copied[`copy_${row.id}`]
                      ? <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />
                      : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add another person */}
      <button type="button" onClick={addRow}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 text-gray-400 hover:text-blue-600 text-[13px] font-semibold py-3 rounded-2xl transition-all">
        <Plus className="h-4 w-4" />Add Another Person
      </button>

      {/* Error */}
      {formError && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-[13px] text-red-700 font-medium">{formError}</p>
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-3 pt-1">
        <Button type="button" onClick={handleSubmit} disabled={isPending}
          className="flex-1 h-11 text-[14px] font-semibold gap-2">
          {isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Creating {rows.length} account{rows.length !== 1 ? 's' : ''}…</>
          ) : sendEmails ? (
            <><Send className="h-4 w-4" />Create & Email Credentials ({rows.length})</>
          ) : (
            <><UserPlus className="h-4 w-4" />Create {rows.length} Account{rows.length !== 1 ? 's' : ''}</>
          )}
        </Button>
      </div>

      {sendEmails && (
        <p className="text-[11px] text-gray-400 text-center -mt-2">
          <ShieldAlert className="h-3 w-3 inline mr-1" />
          Credentials will be emailed directly to each employee's work address
        </p>
      )}
    </div>
  );
}
