'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  MessageSquare, Building2, Users, Hash, Plus, Send, Search,
  X, Loader2, ChevronDown, ChevronRight, MoreHorizontal,
  Lock, Trash2, Layers, Network, FolderKanban, Crown,
  UserPlus, Globe, CheckCircle2, Info,
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  getMessages, sendMessage as sendAction, deleteMessage as deleteAction,
  createChannel, getCommunicationSetupData,
  type Channel, type Message, type MessageAuthor,
} from '@/lib/actions/communication';

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#8B5CF6','#3B82F6','#10B981','#F59E0B','#EF4444','#06B6D4','#EC4899','#6366F1'];

function avatarColor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function authorName(a: MessageAuthor | null) {
  if (!a) return 'Unknown';
  return [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Unknown';
}

function authorInitials(a: MessageAuthor | null) {
  if (!a) return '?';
  return ((a.first_name?.[0] ?? '') + (a.last_name?.[0] ?? '')).toUpperCase() || '?';
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
     new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000
  );
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function isSameDay(a: string, b: string) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

// Group messages: same author within 5 min = one group
interface MessageGroup { key: string; userId: string; author: MessageAuthor | null; messages: Message[] }

function groupMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const msg of messages) {
    const last    = groups[groups.length - 1];
    const lastMsg = last?.messages[last.messages.length - 1];
    const sameAuthor  = last?.userId === msg.user_id;
    const closeInTime = lastMsg && (new Date(msg.created_at).getTime() - new Date(lastMsg.created_at).getTime()) < 5 * 60_000;
    if (sameAuthor && closeInTime) { last.messages.push(msg); }
    else groups.push({ key: msg.id, userId: msg.user_id, author: msg.author, messages: [msg] });
  }
  return groups;
}

// ── Avatar component ──────────────────────────────────────────────────────────
function Avatar({ author, userId, size = 'md' }: { author: MessageAuthor | null; userId: string; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'w-6 h-6 text-[9px]' : size === 'lg' ? 'w-10 h-10 text-[13px]' : 'w-8 h-8 text-[11px]';
  if (author?.avatar_url) return <img src={author.avatar_url} alt={authorName(author)} className={`${dim} rounded-xl object-cover shrink-0`} />;
  return (
    <div className={`${dim} rounded-xl flex items-center justify-center font-bold text-white shrink-0`}
      style={{ backgroundColor: avatarColor(userId) }}>
      {authorInitials(author)}
    </div>
  );
}

// ── Communication type definitions ────────────────────────────────────────────
type CommType = 'department' | 'hospital' | 'project' | 'leadership' | 'group' | 'direct';
type AccessScope = 'everyone' | 'department' | 'hospital' | 'members';

interface CommTypeOption {
  id: CommType;
  label: string;
  description: string;
  Icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  channelType: 'public' | 'private';
}

const COMM_TYPES: CommTypeOption[] = [
  {
    id: 'department',
    label: 'Department Channel',
    description: 'Dedicated space for a clinical or operational department',
    Icon: Layers,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    channelType: 'public',
  },
  {
    id: 'hospital',
    label: 'Hospital Channel',
    description: 'Cross-department communication for an entire hospital site',
    Icon: Building2,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    channelType: 'public',
  },
  {
    id: 'project',
    label: 'Project Channel',
    description: 'Time-bound workspace for a specific initiative or project',
    Icon: FolderKanban,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    channelType: 'private',
  },
  {
    id: 'leadership',
    label: 'Leadership Channel',
    description: 'Restricted space for management and leadership teams',
    Icon: Crown,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    channelType: 'private',
  },
  {
    id: 'group',
    label: 'Custom Group',
    description: 'Ad-hoc group for any cross-functional team or committee',
    Icon: Users,
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    channelType: 'private',
  },
  {
    id: 'direct',
    label: 'Direct Communication',
    description: 'Private one-on-one or small-team direct messaging',
    Icon: Network,
    color: 'text-slate-600',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    channelType: 'private',
  },
];

const ACCESS_SCOPES: Array<{ id: AccessScope; label: string; description: string; Icon: React.ElementType }> = [
  { id: 'everyone',   label: 'Everyone',           description: 'All staff across all hospitals can participate',   Icon: Globe },
  { id: 'department', label: 'Specific Department', description: 'Restricted to members of a selected department',   Icon: Layers },
  { id: 'hospital',   label: 'Specific Hospital',   description: 'Restricted to staff at one hospital site',         Icon: Building2 },
  { id: 'members',    label: 'Selected Members Only', description: 'Hand-pick individual participants',              Icon: UserPlus },
];

// Fetched at runtime — no static lists

interface CreateCommunicationModalProps {
  onClose: () => void;
  onCreate: (name: string, desc: string, type: 'public' | 'private') => Promise<void>;
  creating: boolean;
  error: string | null;
}

function CreateCommunicationModal({ onClose, onCreate, creating, error }: CreateCommunicationModalProps) {
  const [step, setStep]               = useState<1 | 2>(1);
  const [commType, setCommType]       = useState<CommType | null>(null);
  const [accessScope, setAccessScope] = useState<AccessScope>('everyone');
  const [selectedDept, setDept]       = useState('');
  const [selectedHosp, setHosp]       = useState('');
  const [commName, setCommName]       = useState('');
  const [commDesc, setCommDesc]       = useState('');
  const [membersText, setMembersText] = useState('');
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [hospitals, setHospitals]     = useState<Array<{ id: string; name: string }>>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);

  const selectedType = commType ? COMM_TYPES.find(t => t.id === commType) : null;

  // Fetch real departments + hospitals when step 2 opens
  useEffect(() => {
    if (step !== 2) return;
    setLoadingMeta(true);
    getCommunicationSetupData().then(r => {
      if (r.success) {
        setDepartments(r.data.departments);
        setHospitals(r.data.hospitals);
      }
      setLoadingMeta(false);
    });
  }, [step]);

  // Auto-suggest name when dept / hosp selected and name is still empty
  useEffect(() => {
    if (!commType) return;
    if (accessScope === 'department' && selectedDept && !commName) {
      const dept = departments.find(d => d.id === selectedDept);
      if (dept) setCommName(dept.name);
    } else if (accessScope === 'hospital' && selectedHosp && !commName) {
      const hosp = hospitals.find(h => h.id === selectedHosp);
      if (hosp) setCommName(hosp.name);
    }
  }, [commType, accessScope, selectedDept, selectedHosp, departments, hospitals]);

  const selectedDeptName = departments.find(d => d.id === selectedDept)?.name ?? '';
  const selectedHospName = hospitals.find(h => h.id === selectedHosp)?.name ?? '';

  // Access summary
  const accessSummary = (() => {
    if (accessScope === 'everyone') return 'All staff organisation-wide can see and post messages.';
    if (accessScope === 'department') return selectedDeptName ? `Only members of the ${selectedDeptName} department can participate.` : 'Only members of the selected department can participate.';
    if (accessScope === 'hospital') return selectedHospName ? `Only staff at ${selectedHospName} can participate.` : 'Only staff at the selected hospital can participate.';
    if (accessScope === 'members') return 'Participation is limited to individually selected members.';
    return '';
  })();

  const memberCount = (() => {
    if (accessScope === 'everyone') return `${hospitals.length > 0 ? `${hospitals.length} hospital${hospitals.length > 1 ? 's' : ''}` : 'All'} · All staff`;
    if (accessScope === 'department') return selectedDeptName ? 'Dept. members only' : '—';
    if (accessScope === 'hospital') return selectedHospName ? 'Hospital staff only' : '—';
    if (accessScope === 'members') {
      const n = membersText.split(',').map(s => s.trim()).filter(Boolean).length;
      return n > 0 ? `${n} selected` : '0 selected';
    }
    return '—';
  })();

  const canProceed = commType !== null;
  const canCreate  = commName.trim().length > 0 && (
    (accessScope === 'department' ? selectedDept !== '' : true) &&
    (accessScope === 'hospital'   ? selectedHosp !== '' : true)
  );

  const handleSubmit = async () => {
    if (!commName.trim() || !selectedType) return;
    const slug = commName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await onCreate(slug, commDesc.trim(), selectedType.channelType);
  };

  const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/15 focus:border-[#1e3a5f] transition-all';
  const labelCls = 'block text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div className="shrink-0 px-8 pt-7 pb-5 border-b border-slate-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#1e3a5f]/50 mb-1">VetCentral Communications</p>
              <h2 className="text-[22px] font-bold text-slate-900 leading-tight">New Communication</h2>
              <p className="text-[13px] text-slate-500 mt-1">Configure a structured channel for your team or department.</p>
            </div>
            <button onClick={onClose}
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-all mt-0.5">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Step tabs */}
          <div className="flex items-center gap-1 mt-5">
            {([1, 2] as const).map(s => (
              <button key={s} type="button" onClick={() => { if (s === 2 && !canProceed) return; setStep(s); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold transition-all ${
                  step === s ? 'bg-[#1e3a5f] text-white' : canProceed || s === 1 ? 'text-slate-500 hover:bg-slate-100' : 'text-slate-300 cursor-not-allowed'
                }`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${step === s ? 'bg-white/20' : step > s ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100'}`}>
                  {step > s ? <CheckCircle2 className="h-3 w-3" /> : s}
                </span>
                {s === 1 ? 'Communication Type' : 'Details & Access'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
          <form onSubmit={e => { e.preventDefault(); handleSubmit(); }}>

            {/* STEP 1 — Communication Type ──────────────────────────────────── */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <p className={labelCls}>Communication Type</p>
                  <p className="text-[12px] text-slate-400 mb-4">Select the type that best describes the purpose of this communication.</p>
                  <div className="grid grid-cols-2 gap-3">
                    {COMM_TYPES.map(ct => {
                      const { Icon } = ct;
                      const isSelected = commType === ct.id;
                      return (
                        <button key={ct.id} type="button" onClick={() => setCommType(ct.id)}
                          className={`group relative flex items-start gap-3.5 p-4 rounded-xl border-2 text-left transition-all ${
                            isSelected
                              ? `border-[#1e3a5f] bg-[#1e3a5f]/[0.03]`
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/80'
                          }`}>
                          {isSelected && (
                            <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[#1e3a5f] flex items-center justify-center">
                              <CheckCircle2 className="h-3 w-3 text-white" />
                            </div>
                          )}
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-[#1e3a5f]' : ct.bg}`}>
                            <Icon className={`h-[18px] w-[18px] ${isSelected ? 'text-white' : ct.color}`} />
                          </div>
                          <div className="flex-1 min-w-0 pr-4">
                            <p className={`text-[13px] font-bold leading-tight ${isSelected ? 'text-[#1e3a5f]' : 'text-slate-800'}`}>{ct.label}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{ct.description}</p>
                            <div className={`inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                              ct.channelType === 'public' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {ct.channelType === 'public' ? <Globe className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
                              {ct.channelType === 'public' ? 'Discoverable' : 'Restricted'}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2 — Details & Access ────────────────────────────────────── */}
            {step === 2 && selectedType && (
              <div className="space-y-6">

                {/* Selected type badge */}
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${selectedType.border} ${selectedType.bg}`}>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center bg-white border ${selectedType.border}`}>
                    <selectedType.Icon className={`h-3.5 w-3.5 ${selectedType.color}`} />
                  </div>
                  <div>
                    <p className={`text-[12px] font-bold ${selectedType.color}`}>{selectedType.label}</p>
                    <p className="text-[11px] text-slate-500">{selectedType.description}</p>
                  </div>
                  <button type="button" onClick={() => setStep(1)}
                    className="ml-auto text-[11px] font-semibold text-slate-400 hover:text-slate-600 underline underline-offset-2">
                    Change
                  </button>
                </div>

                {/* Communication Name */}
                <div>
                  <label className={labelCls}>Communication Name <span className="normal-case font-normal text-slate-400">— required</span></label>
                  <input autoFocus value={commName} onChange={e => setCommName(e.target.value)}
                    placeholder={
                      commType === 'department' ? 'e.g. Surgery Team' :
                      commType === 'hospital'   ? 'e.g. Central Hospital' :
                      commType === 'project'    ? 'e.g. EMR Migration 2026' :
                      commType === 'leadership' ? 'e.g. Clinical Directors' :
                      commType === 'group'      ? 'e.g. Infection Control Committee' :
                                                  'e.g. Dr. Smith & Nursing Team'
                    }
                    className={inputCls} />
                  {commName.trim() && (
                    <p className="text-[11px] text-slate-400 mt-1.5 px-1">
                      Identifier: <span className="font-mono text-slate-600">{commName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}</span>
                    </p>
                  )}
                </div>

                {/* Purpose */}
                <div>
                  <label className={labelCls}>Purpose / Description <span className="normal-case font-normal text-slate-400">— optional</span></label>
                  <textarea value={commDesc} onChange={e => setCommDesc(e.target.value)} rows={2}
                    placeholder="Briefly describe the purpose and scope of this communication channel…"
                    className={`${inputCls} resize-none`} />
                </div>

                {/* Access Control */}
                <div>
                  <label className={labelCls}>Who Can Participate</label>
                  <div className="grid grid-cols-2 gap-2.5">
                    {ACCESS_SCOPES.map(scope => {
                      const { Icon } = scope;
                      const isSel = accessScope === scope.id;
                      return (
                        <button key={scope.id} type="button" onClick={() => setAccessScope(scope.id)}
                          className={`flex items-start gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                            isSel ? 'border-[#1e3a5f] bg-[#1e3a5f]/[0.03]' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}>
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isSel ? 'bg-[#1e3a5f]' : 'bg-slate-100'}`}>
                            <Icon className={`h-3.5 w-3.5 ${isSel ? 'text-white' : 'text-slate-500'}`} />
                          </div>
                          <div>
                            <p className={`text-[12px] font-bold leading-tight ${isSel ? 'text-[#1e3a5f]' : 'text-slate-700'}`}>{scope.label}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{scope.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Dynamic: Department */}
                {accessScope === 'department' && (
                  <div>
                    <label className={labelCls}>Department</label>
                    <div className="relative">
                      <select value={selectedDept} onChange={e => setDept(e.target.value)}
                        className={`${inputCls} appearance-none pr-10`}>
                        <option value="">— Select Department —</option>
                        {loadingMeta
                          ? <option disabled>Loading…</option>
                          : departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)
                        }
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* Dynamic: Hospital */}
                {accessScope === 'hospital' && (
                  <div>
                    <label className={labelCls}>Hospital Site</label>
                    <div className="relative">
                      <select value={selectedHosp} onChange={e => setHosp(e.target.value)}
                        className={`${inputCls} appearance-none pr-10`}>
                        <option value="">— Select Hospital —</option>
                        {loadingMeta
                          ? <option disabled>Loading…</option>
                          : hospitals.map(h => <option key={h.id} value={h.id}>{h.name}</option>)
                        }
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* Dynamic: Members */}
                {accessScope === 'members' && (
                  <div>
                    <label className={labelCls}>Add Members <span className="normal-case font-normal text-slate-400">— enter names or email addresses</span></label>
                    <textarea value={membersText} onChange={e => setMembersText(e.target.value)} rows={3}
                      placeholder="Dr. Sarah Ahmed, john.smith@vetcentral.com, Nursing Lead…"
                      className={`${inputCls} resize-none`} />
                    <p className="text-[11px] text-slate-400 mt-1 px-1">Separate multiple entries with commas. Members will be invited when the channel is created.</p>
                  </div>
                )}

                {/* Access Summary Preview */}
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                    <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Access Summary</p>
                  </div>
                  <div className="px-4 py-4 bg-white grid grid-cols-2 gap-x-6 gap-y-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Communication Type</p>
                      <div className="flex items-center gap-1.5">
                        <selectedType.Icon className={`h-3.5 w-3.5 ${selectedType.color}`} />
                        <p className="text-[13px] font-semibold text-slate-800">{selectedType.label}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Visibility</p>
                      <div className="flex items-center gap-1.5">
                        {selectedType.channelType === 'public'
                          ? <><Globe className="h-3.5 w-3.5 text-emerald-500" /><p className="text-[13px] font-semibold text-slate-800">Discoverable by all staff</p></>
                          : <><Lock className="h-3.5 w-3.5 text-amber-500" /><p className="text-[13px] font-semibold text-slate-800">Invite-only / Restricted</p></>
                        }
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Participation</p>
                      <p className="text-[13px] font-semibold text-slate-800">{
                        accessScope === 'everyone'   ? 'All staff' :
                        accessScope === 'department' ? (selectedDeptName || 'Selected department') :
                        accessScope === 'hospital'   ? (selectedHospName || 'Selected hospital') :
                                                       'Selected members'
                      }</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Est. Member Count</p>
                      <p className="text-[13px] font-semibold text-slate-800">{memberCount}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Who Can See Messages</p>
                      <p className="text-[12px] text-slate-600 leading-snug">{accessSummary}</p>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <X className="h-4 w-4 text-red-500 shrink-0" />
                    <p className="text-[12px] text-red-600">{error}</p>
                  </div>
                )}
              </div>
            )}
          </form>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────────── */}
        <div className="shrink-0 px-8 py-5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3">
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all">
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {step === 1 && (
              <button type="button" disabled={!canProceed}
                onClick={() => setStep(2)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#1e3a5f] hover:bg-[#16304f] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold transition-all">
                Continue
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
            {step === 2 && (
              <>
                <button type="button" onClick={() => setStep(1)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-600 hover:bg-slate-50 transition-all">
                  Back
                </button>
                <button type="button" disabled={!commName.trim() || creating}
                  onClick={() => handleSubmit()}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#1e3a5f] hover:bg-[#16304f] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold transition-all">
                  {creating
                    ? <><Loader2 className="h-4 w-4 animate-spin" />Creating…</>
                    : <><CheckCircle2 className="h-4 w-4" />Create Communication</>
                  }
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
interface MessagesShellProps {
  initialChannels: Channel[];
  currentUserId: string;
  currentUserName: string;
}

export function MessagesShell({ initialChannels, currentUserId, currentUserName }: MessagesShellProps) {
  // Only non-announcement channels
  const [channels] = useState<Channel[]>(
    initialChannels.filter(ch => ch.channel_type !== 'announcement')
  );

  const [activeChannelId, setActiveChannelId] = useState<string | null>(channels[0]?.id ?? null);
  const [messages, setMessages]           = useState<Message[]>([]);
  const [profileCache, setProfileCache]   = useState<Map<string, MessageAuthor>>(new Map());
  const [loadingMsgs, setLoadingMsgs]     = useState(false);
  const [input, setInput]                 = useState('');
  const [sending, setSending]             = useState(false);
  const [sendError, setSendError]         = useState<string | null>(null);
  const [hoveredMsgId, setHoveredMsgId]   = useState<string | null>(null);
  const [search, setSearch]               = useState('');
  const [showSearch, setShowSearch]       = useState(false);
  const [showCreate, setShowCreate]       = useState(false);
  const [creating, setCreating]           = useState(false);
  const [createError, setCreateError]     = useState<string | null>(null);
  const [allChannels, setAllChannels]     = useState<Channel[]>(channels);
  const [collapsed, setCollapsed]         = useState<Set<string>>(new Set());

  const bottomRef    = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);
  const atBottomRef  = useRef(true);

  // Channel groups
  const publicChs  = useMemo(() => allChannels.filter(c => c.channel_type === 'public'), [allChannels]);
  const privateChs = useMemo(() => allChannels.filter(c => c.channel_type === 'private'), [allChannels]);
  const activeChannel = useMemo(() => allChannels.find(c => c.id === activeChannelId) ?? null, [allChannels, activeChannelId]);

  const messageGroups = useMemo(() => {
    const filtered = search.trim()
      ? messages.filter(m => m.content.toLowerCase().includes(search.toLowerCase()))
      : messages;
    return groupMessages(filtered);
  }, [messages, search]);

  const userInitials = currentUserName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  // Scroll
  const scrollToBottom = useCallback((instant = false) => {
    if (instant || atBottomRef.current)
      bottomRef.current?.scrollIntoView({ behavior: instant ? 'instant' : 'smooth' } as ScrollIntoViewOptions);
  }, []);
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 80;
  }, []);

  // Load messages
  useEffect(() => {
    if (!activeChannelId) return;
    setLoadingMsgs(true); setMessages([]); atBottomRef.current = true;
    setSearch(''); setShowSearch(false);

    getMessages(activeChannelId).then(r => {
      if (r.success) {
        setMessages(r.data);
        setProfileCache(prev => {
          const next = new Map(prev);
          for (const m of r.data) if (m.author) next.set(m.user_id, m.author);
          return next;
        });
      }
      setLoadingMsgs(false);
    });
  }, [activeChannelId]);

  useEffect(() => { if (!loadingMsgs) scrollToBottom(true); }, [loadingMsgs]);
  useEffect(() => { scrollToBottom(); }, [messages.length]);

  // Realtime
  useEffect(() => {
    if (!activeChannelId) return;
    const supabase = createSupabaseBrowserClient();
    const sub = supabase
      .channel(`msg-${activeChannelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${activeChannelId}` },
        async payload => {
          const raw = payload.new as Record<string, unknown>;
          const userId = raw.user_id as string;
          let author = profileCache.get(userId) ?? null;
          if (!author) {
            const { data } = await supabase.from('profiles').select('id,first_name,last_name,avatar_url,job_title').eq('id', userId).single();
            if (data) { author = data as MessageAuthor; setProfileCache(prev => new Map(prev).set(userId, data as MessageAuthor)); }
          }
          const newMsg: Message = {
            id: raw.id as string, channel_id: raw.channel_id as string, user_id: userId,
            content: raw.content as string, content_type: 'text', parent_id: null,
            is_edited: false, is_deleted: false,
            created_at: raw.created_at as string, updated_at: raw.created_at as string, author,
          };
          setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
        })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [activeChannelId]);

  const handleSend = async () => {
    if (!input.trim() || !activeChannelId || sending) return;
    const text = input.trim();
    setInput(''); setSending(true); inputRef.current?.focus();
    const r = await sendAction(activeChannelId, text);
    if (r.success) {
      setSendError(null);
      setMessages(prev => prev.some(m => m.id === r.data.id) ? prev : [...prev, r.data]);
      if (r.data.author) setProfileCache(prev => new Map(prev).set(r.data.user_id, r.data.author!));
    } else {
      setSendError(r.error ?? 'Failed to send'); setInput(text);
    }
    setSending(false);
  };

  const handleDelete = async (msgId: string) => {
    const r = await deleteAction(msgId);
    if (r.success) setMessages(prev => prev.filter(m => m.id !== msgId));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleCreate = async (name: string, desc: string, type: 'public' | 'private') => {
    if (!name.trim() || creating) return;
    setCreating(true); setCreateError(null);
    const r = await createChannel(name.trim(), desc.trim() || null, type);
    if (r.success) {
      setAllChannels(prev => [...prev, r.data]);
      setActiveChannelId(r.data.id);
      setShowCreate(false);
    } else { setCreateError(r.error ?? 'Failed to create channel'); }
    setCreating(false);
  };

  const toggleSection = (id: string) => setCollapsed(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const switchChannel = (id: string) => {
    if (id === activeChannelId) return;
    setActiveChannelId(id); atBottomRef.current = true; inputRef.current?.focus();
  };

  // Channel list item
  function ChannelItem({ ch }: { ch: Channel }) {
    const isActive = ch.id === activeChannelId;
    return (
      <button onClick={() => switchChannel(ch.id)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs transition-all ${
          isActive ? 'bg-[#1e3a5f] text-white font-semibold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
        }`}>
        {ch.channel_type === 'private'
          ? <Lock className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
          : <Hash className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />}
        <span className="flex-1 truncate">{ch.name}</span>
      </button>
    );
  }

  function GroupHeader({ id, label }: { id: string; label: string }) {
    const isCollapsed = collapsed.has(id);
    return (
      <button onClick={() => toggleSection(id)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors">
        {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-white">

      {/* ── LEFT: Channel List ──────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 flex flex-col border-r border-slate-100 bg-white">

        <div className="px-4 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#1e3a5f] flex items-center justify-center shrink-0">
                <MessageSquare className="h-3.5 w-3.5 text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900 leading-tight">Messages</p>
                <p className="text-[10px] text-slate-400">Team Chat</p>
              </div>
            </div>
            <button onClick={() => setShowCreate(true)}
              className="h-6 w-6 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {publicChs.length > 0 && (
            <>
              <GroupHeader id="public" label="Channels" />
              {!collapsed.has('public') && publicChs.map(ch => <ChannelItem key={ch.id} ch={ch} />)}
            </>
          )}
          {privateChs.length > 0 && (
            <>
              <GroupHeader id="private" label="Private" />
              {!collapsed.has('private') && privateChs.map(ch => <ChannelItem key={ch.id} ch={ch} />)}
            </>
          )}
          <button onClick={() => setShowCreate(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-colors mt-1">
            <Plus className="h-3 w-3 shrink-0" /> New Channel
          </button>
        </nav>

        <div className="border-t border-slate-100 px-3 py-3 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
            style={{ backgroundColor: avatarColor(currentUserId) }}>
            {userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-700 truncate">{currentUserName}</p>
            <p className="text-[10px] text-slate-400">Active</p>
          </div>
        </div>
      </aside>

      {/* ── CENTER: Conversation ────────────────────────────────────────────── */}
      {activeChannel ? (
        <div className="flex-1 min-w-0 flex flex-col bg-white overflow-hidden">

          {/* Channel header */}
          <div className="shrink-0 flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 bg-white">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${activeChannel.channel_type === 'private' ? 'bg-purple-50' : 'bg-blue-50'}`}>
                {activeChannel.channel_type === 'private'
                  ? <Lock className="h-3.5 w-3.5 text-purple-500" />
                  : <Hash className="h-3.5 w-3.5 text-blue-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold text-slate-900 leading-tight truncate">{activeChannel.name}</p>
                {activeChannel.description && (
                  <p className="text-[11px] text-slate-400 truncate">{activeChannel.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => { setShowSearch(v => !v); setSearch(''); }}
                className={`p-2 rounded-lg transition-colors ${showSearch ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}>
                <Search className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Search bar */}
          {showSearch && (
            <div className="shrink-0 px-5 py-2 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
                <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                  placeholder={`Search in #${activeChannel.name}…`}
                  className="flex-1 text-sm outline-none text-slate-700 placeholder:text-slate-400" />
                {search && <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          )}

          {/* Messages — Teams-style list view */}
          <div ref={containerRef} onScroll={handleScroll}
            className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-0">

            {loadingMsgs ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                <p className="text-sm text-slate-400">Loading messages…</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                  <Hash className="h-7 w-7 text-blue-300" />
                </div>
                <p className="text-base font-semibold text-slate-600">#{activeChannel.name}</p>
                {activeChannel.description && <p className="text-sm text-slate-400 mt-1">{activeChannel.description}</p>}
                <p className="text-sm text-slate-400 mt-3">No messages yet. Start the conversation.</p>
              </div>
            ) : (
              messageGroups.map((group, gi) => {
                const prevGroup = messageGroups[gi - 1];
                const showDate  = !prevGroup ||
                  !isSameDay(prevGroup.messages[prevGroup.messages.length - 1].created_at, group.messages[0].created_at);
                const isOwn = group.userId === currentUserId;

                return (
                  <div key={group.key}>
                    {/* Day divider */}
                    {showDate && (
                      <div className="flex items-center gap-3 my-5">
                        <div className="flex-1 h-px bg-slate-100" />
                        <span className="text-[11px] font-semibold text-slate-400 bg-white border border-slate-200 rounded-full px-3 py-1 shrink-0">
                          {dayLabel(group.messages[0].created_at)}
                        </span>
                        <div className="flex-1 h-px bg-slate-100" />
                      </div>
                    )}

                    {/* Message group — Teams style: avatar left, full-width content */}
                    <div className="flex items-start gap-3 py-1 px-1 -mx-1 rounded-xl hover:bg-slate-50/70 group transition-all"
                      onMouseEnter={() => setHoveredMsgId(group.key)}
                      onMouseLeave={() => setHoveredMsgId(null)}>

                      {/* Avatar column */}
                      <div className="shrink-0 pt-0.5">
                        <Avatar author={group.author} userId={group.userId} />
                      </div>

                      {/* Content column */}
                      <div className="flex-1 min-w-0">
                        {/* Header: name + time */}
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className={`text-[13px] font-bold leading-none ${isOwn ? 'text-[#1e3a5f]' : 'text-slate-800'}`}>
                            {isOwn ? 'You' : authorName(group.author)}
                          </span>
                          {group.author?.job_title && !isOwn && (
                            <span className="text-[10px] text-slate-400 font-medium">{group.author.job_title}</span>
                          )}
                          <span className="text-[11px] text-slate-400 ml-auto shrink-0">
                            {formatTime(group.messages[0].created_at)}
                          </span>
                          {/* Hover actions */}
                          {hoveredMsgId === group.key && (
                            <div className="flex items-center gap-1 ml-2">
                              {isOwn && (
                                <button
                                  onClick={() => handleDelete(group.messages[group.messages.length - 1].id)}
                                  className="p-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Each message in the group */}
                        {group.messages.map(msg => (
                          <div key={msg.id} className="mb-0.5">
                            <p className="text-[13.5px] text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
                              {msg.content}
                              {msg.is_edited && <span className="text-[10px] text-slate-400 ml-1.5">(edited)</span>}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} className="h-1" />
          </div>

          {/* Send bar */}
          <div className="shrink-0 px-5 pb-5 pt-2 bg-white">
            {sendError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-2">
                <X className="h-3.5 w-3.5 text-red-500 shrink-0" />
                <p className="text-xs text-red-600 flex-1">{sendError}</p>
                <button onClick={() => setSendError(null)} className="text-red-400 hover:text-red-600"><X className="h-3 w-3" /></button>
              </div>
            )}

            <div className="flex items-end gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus-within:border-[#1e3a5f] focus-within:ring-2 focus-within:ring-[#1e3a5f]/10 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message #${activeChannel.name}…`}
                rows={1}
                style={{ resize: 'none' }}
                className="flex-1 bg-transparent text-[14px] text-slate-800 placeholder:text-slate-400 outline-none leading-relaxed"
                onInput={e => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className={`h-8 w-8 flex items-center justify-center rounded-xl transition-all shrink-0 ${
                  input.trim() && !sending ? 'bg-[#1e3a5f] text-white hover:bg-[#16304f]' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 px-1">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-white">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-base font-semibold text-slate-500">Select a channel</p>
            <p className="text-sm text-slate-400 mt-1">Choose a channel from the left to start messaging.</p>
          </div>
        </div>
      )}

      {/* ── Create Communication Modal ───────────────────────────────────────── */}
      {showCreate && (
        <CreateCommunicationModal
          onClose={() => { setShowCreate(false); setCreateError(null); }}
          onCreate={handleCreate}
          creating={creating}
          error={createError}
        />
      )}
    </div>
  );
}
