'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Building2, Users, Layers, FolderOpen, Calendar, GraduationCap,
  ClipboardList, MapPin, Phone, Clock, Search, ShieldCheck,
  AlertCircle, CheckCircle2, Activity, Sparkles, ArrowUpRight,
  MessageSquare, FileText, Star, BarChart3, TrendingUp,
  TrendingDown, ChevronRight, Zap, Bell, RefreshCw, Shield,
  LayoutGrid, Globe, Award,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type {
  OrgOverview, HospitalCard, CrossHospitalEvent, ViewRole,
} from '@/lib/actions/hospital-hub';

// ─────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────

function healthScore(c: HospitalCard): number {
  const compliance = c.complianceRate;
  const training   = Math.max(0, 100 - c.trainingDueCount * 15);
  const requests   = Math.max(0, 100 - c.openRequests * 8);
  const activity   = Math.min(100, c.eventsThisWeek * 20);
  return Math.round(compliance * 0.40 + training * 0.25 + requests * 0.20 + activity * 0.15);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin', org_admin: 'Org Admin',
  hospital_admin: 'Admin', practice_manager: 'Manager',
  doctor: 'Doctor', csr: 'CSR', va: 'VA', hr: 'HR',
  marketing: 'Marketing', it_admin: 'IT', viewer: 'Viewer',
  executive: 'Executive',
};

// ─────────────────────────────────────────────────────────────
// Health Score Ring
// ─────────────────────────────────────────────────────────────

function HealthRing({ score }: { score: number }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative h-12 w-12 shrink-0">
      <svg className="h-12 w-12 -rotate-90" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={r} strokeWidth="3.5" fill="none" stroke="#f1f5f9" />
        <circle
          cx="22" cy="22" r={r} strokeWidth="3.5" fill="none"
          stroke={color}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <p className="text-[11px] font-bold text-gray-900">{score}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Compliance Badge
// ─────────────────────────────────────────────────────────────

function ComplianceBadge({ rate }: { rate: number }) {
  const cls = rate >= 90
    ? 'text-green-700 bg-green-50 border-green-200'
    : rate >= 70
      ? 'text-amber-700 bg-amber-50 border-amber-200'
      : 'text-red-700 bg-red-50 border-red-200';
  const Icon = rate >= 90 ? CheckCircle2 : AlertCircle;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold border rounded-full px-2 py-0.5', cls)}>
      <Icon className="h-3 w-3" />{rate}%
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Org KPI bar
// ─────────────────────────────────────────────────────────────

function KPIBar({ overview, cards }: { overview: OrgOverview; cards: HospitalCard[] }) {
  const avgCompliance = cards.length
    ? Math.round(cards.reduce((s, c) => s + c.complianceRate, 0) / cards.length)
    : 0;

  const tiles = [
    { icon: Building2,    val: overview.totalHospitals,    label: 'Hospitals',      highlight: false },
    { icon: Users,        val: overview.totalEmployees,    label: 'Employees',      highlight: false },
    { icon: Layers,       val: overview.totalDepartments,  label: 'Departments',    highlight: false },
    { icon: FolderOpen,   val: overview.openTasks,         label: 'Open Tasks',     highlight: overview.openTasks > 0 },
    { icon: Calendar,     val: overview.upcomingEvents,    label: 'Events (7d)',    highlight: false },
    { icon: GraduationCap,val: overview.trainingDue,       label: 'Training Due',   highlight: overview.trainingDue > 0 },
    { icon: Shield,       val: `${avgCompliance}%`,        label: 'Avg Compliance', highlight: avgCompliance < 80 },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {tiles.map(t => (
        <div
          key={t.label}
          className={cn(
            'flex flex-col items-center justify-center px-4 py-3 rounded-xl min-w-22.5 flex-1 border',
            t.highlight
              ? 'bg-red-500/15 border-red-400/30 text-red-200'
              : 'bg-white/10 border-white/10 text-white',
          )}
        >
          <t.icon className={cn('h-4 w-4 mb-1', t.highlight ? 'text-red-300' : 'text-slate-300')} />
          <p className="text-[20px] font-bold leading-none">{t.val}</p>
          <p className="text-[10px] mt-0.5 opacity-70 text-center leading-tight">{t.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Hospital Switcher
// ─────────────────────────────────────────────────────────────

function HospitalSwitcher({
  cards, selected, onSelect, myHospitalIds, viewRole,
}: {
  cards: HospitalCard[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  myHospitalIds: string[];
  viewRole: ViewRole;
}) {
  const mySet = new Set(myHospitalIds);
  const visible = viewRole === 'executive' ? cards : cards.filter(c => mySet.has(c.id));

  if (visible.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-2xl p-1.5 shadow-sm overflow-x-auto">
      {viewRole === 'executive' && (
        <button
          onClick={() => onSelect(null)}
          className={cn(
            'flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-medium whitespace-nowrap transition-all',
            selected === null
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100',
          )}
        >
          <LayoutGrid className="h-3.5 w-3.5" /> All Hospitals
        </button>
      )}
      {visible.map(c => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={cn(
            'flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-medium whitespace-nowrap transition-all',
            selected === c.id
              ? 'text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100',
          )}
          style={selected === c.id ? { backgroundColor: c.color ?? '#1e293b' } : {}}
        >
          <div
            className={cn('h-2 w-2 rounded-full shrink-0', selected === c.id ? 'bg-white/60' : '')}
            style={selected !== c.id ? { backgroundColor: c.color ?? '#94a3b8' } : {}}
          />
          {c.name}
          {mySet.has(c.id) && viewRole === 'executive' && (
            <Star className="h-3 w-3 ml-0.5 opacity-60" />
          )}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Hospital Card (redesigned)
// ─────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { key: 'calendar',      label: 'Calendar',      icon: Calendar,      href: (id: string) => `/calendar?hospital=${id}` },
  { key: 'employees',     label: 'Employees',     icon: Users,         href: (id: string) => `/hospital/${id}?tab=employees` },
  { key: 'training',      label: 'Training',      icon: GraduationCap, href: (_id: string) => `/training` },
  { key: 'documents',     label: 'Documents',     icon: FileText,      href: (id: string) => `/hospital/${id}?tab=documents` },
  { key: 'analytics',     label: 'Analytics',     icon: BarChart3,     href: (id: string) => `/hospital/${id}?tab=analytics` },
  { key: 'communication', label: 'Comms',          icon: MessageSquare, href: (_id: string) => `/communication` },
];

function HospCard({ card, isMine }: { card: HospitalCard; isMine: boolean }) {
  const score = healthScore(card);
  const color = card.color ?? '#2563EB';
  const hasAlert = card.trainingDueCount > 0 || card.openRequests > 2 || card.complianceRate < 70;

  return (
    <div className={cn(
      'bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col group hover:shadow-md transition-all duration-200',
      isMine ? 'border-blue-200 ring-1 ring-blue-100' : 'border-gray-100',
      hasAlert ? 'ring-1 ring-red-100' : '',
    )}>
      <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${color}, ${color}99)` }} />

      <div className="p-5 flex flex-col gap-4 flex-1">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div
            className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${color}18`, border: `1.5px solid ${color}25` }}
          >
            <Building2 className="h-5 w-5" style={{ color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[14px] font-bold text-gray-900 leading-tight">{card.name}</h3>
              {isMine && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider bg-blue-500 text-white rounded-full px-1.5 py-0.5">
                  <Star className="h-2.5 w-2.5" /> Mine
                </span>
              )}
              {hasAlert && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider bg-red-500 text-white rounded-full px-1.5 py-0.5">
                  <AlertCircle className="h-2.5 w-2.5" /> Alert
                </span>
              )}
            </div>
            {card.address && (
              <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3 shrink-0" />{card.address}
              </p>
            )}
          </div>
          <Link
            href={`/hospital/${card.id}`}
            className="h-8 w-8 rounded-xl bg-gray-50 hover:bg-orange-50 border border-gray-100 hover:border-orange-200 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 shrink-0"
          >
            <ArrowUpRight className="h-4 w-4 text-gray-400 group-hover:text-orange-500" />
          </Link>
        </div>

        {/* Health score + compliance row */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <HealthRing score={score} />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Health</p>
              <p className="text-[11px] text-gray-500">
                {score >= 80 ? 'Excellent' : score >= 60 ? 'Fair' : 'Needs Attention'}
              </p>
            </div>
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold text-gray-500">Compliance</p>
              <ComplianceBadge rate={card.complianceRate} />
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', card.complianceRate >= 90 ? 'bg-green-400' : card.complianceRate >= 70 ? 'bg-amber-400' : 'bg-red-400')}
                style={{ width: `${card.complianceRate}%` }}
              />
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { icon: Users,         val: card.staffCount,       label: 'Employees',  alert: false                          },
            { icon: Layers,        val: card.departmentCount,  label: 'Depts',      alert: false                          },
            { icon: FolderOpen,    val: card.openRequests,     label: 'Requests',   alert: card.openRequests > 0          },
            { icon: GraduationCap, val: card.trainingDueCount, label: 'Training Due',alert: card.trainingDueCount > 0     },
            { icon: Calendar,      val: card.eventsThisWeek,   label: 'Events',     alert: false                          },
            { icon: Award,         val: `${card.complianceRate}%`, label: 'Compliant', alert: card.complianceRate < 70   },
          ].map(s => (
            <div
              key={s.label}
              className={cn('flex flex-col items-center py-2 px-1.5 rounded-xl', s.alert ? 'bg-red-50' : 'bg-gray-50')}
            >
              <s.icon className={cn('h-3.5 w-3.5 mb-0.5', s.alert ? 'text-red-500' : 'text-gray-400')} />
              <p className={cn('text-[13px] font-bold leading-none', s.alert ? 'text-red-600' : 'text-gray-800')}>{s.val}</p>
              <p className="text-[9px] text-gray-400 mt-0.5 text-center leading-tight">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Contact row */}
        {(card.phone || card.timezone) && (
          <div className="flex items-center gap-3 text-[11px] text-gray-400">
            {card.phone && (
              <a href={`tel:${card.phone}`} className="flex items-center gap-1 hover:text-gray-600">
                <Phone className="h-3 w-3" />{card.phone}
              </a>
            )}
            {card.timezone && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />{card.timezone.split('/').pop()?.replace('_', ' ')}
              </span>
            )}
          </div>
        )}

        {/* Quick actions */}
        <div className="flex items-center gap-1.5 mt-auto pt-3 border-t border-gray-50 flex-wrap">
          {QUICK_ACTIONS.map(qa => (
            <Link
              key={qa.key}
              href={qa.href(card.id)}
              className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 border border-transparent hover:border-gray-200 transition-colors"
            >
              <qa.icon className="h-3.5 w-3.5" />{qa.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Executive Comparison Dashboard
// ─────────────────────────────────────────────────────────────

type SortKey = 'name' | 'staffCount' | 'complianceRate' | 'healthScore' | 'openRequests' | 'trainingDueCount';

function ExecutiveComparison({ cards }: { cards: HospitalCard[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('healthScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const sorted = useMemo(() => {
    return [...cards].sort((a, b) => {
      const av = sortKey === 'healthScore' ? healthScore(a) : (a as any)[sortKey];
      const bv = sortKey === 'healthScore' ? healthScore(b) : (b as any)[sortKey];
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [cards, sortKey, sortDir]);

  const cols: Array<{ key: SortKey; label: string; align?: string }> = [
    { key: 'name',             label: 'Hospital'         },
    { key: 'staffCount',       label: 'Staff',      align: 'right' },
    { key: 'complianceRate',   label: 'Compliance', align: 'right' },
    { key: 'trainingDueCount', label: 'Train. Due', align: 'right' },
    { key: 'openRequests',     label: 'Requests',   align: 'right' },
    { key: 'healthScore',      label: 'Health',     align: 'right' },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-slate-500" />
          <p className="text-[13px] font-bold text-gray-900">Executive Comparison</p>
        </div>
        <p className="text-[11px] text-gray-400">{cards.length} hospitals · click columns to sort</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {cols.map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={cn(
                    'px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-400 cursor-pointer hover:text-gray-700 select-none whitespace-nowrap',
                    col.align === 'right' ? 'text-right' : 'text-left',
                  )}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1 text-orange-500">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => {
              const score = healthScore(c);
              const color = c.color ?? '#2563EB';
              return (
                <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}18` }}>
                        <Building2 className="h-3.5 w-3.5" style={{ color }} />
                      </div>
                      <div>
                        <Link href={`/hospital/${c.id}`} className="text-[13px] font-semibold text-gray-900 hover:text-orange-600 transition-colors">
                          {c.name}
                        </Link>
                        {i === 0 && <p className="text-[9px] text-green-600 font-bold uppercase tracking-wider">Top Performer</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="text-[13px] font-semibold text-gray-700">{c.staffCount}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <ComplianceBadge rate={c.complianceRate} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className={cn('text-[13px] font-semibold', c.trainingDueCount > 0 ? 'text-red-600' : 'text-gray-400')}>
                      {c.trainingDueCount}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className={cn('text-[13px] font-semibold', c.openRequests > 2 ? 'text-amber-600' : 'text-gray-400')}>
                      {c.openRequests}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full', score >= 80 ? 'bg-green-400' : score >= 60 ? 'bg-amber-400' : 'bg-red-400')}
                          style={{ width: `${score}%` }}
                        />
                      </div>
                      <span className="text-[12px] font-bold text-gray-700 w-8 text-right">{score}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// AI Insights Panel
// ─────────────────────────────────────────────────────────────

interface AIInsight {
  type: 'positive' | 'warning' | 'action' | 'info';
  icon: React.ElementType;
  text: string;
}

function generateInsights(cards: HospitalCard[], overview: OrgOverview): AIInsight[] {
  if (cards.length === 0) return [];
  const insights: AIInsight[] = [];

  const scored = cards.map(c => ({ ...c, score: healthScore(c) })).sort((a, b) => b.score - a.score);
  const best  = scored[0];
  const worst = scored[scored.length - 1];

  insights.push({
    type: 'positive', icon: TrendingUp,
    text: `${best.name} leads with a health score of ${best.score} — strong compliance and low open tasks.`,
  });

  const lowCompliance = cards.filter(c => c.complianceRate < 70);
  if (lowCompliance.length > 0) {
    insights.push({
      type: 'warning', icon: Shield,
      text: `${lowCompliance.map(c => c.name).join(' & ')} ${lowCompliance.length > 1 ? 'have' : 'has'} training compliance below 70% — immediate action needed.`,
    });
  }

  const totalDue = cards.reduce((s, c) => s + c.trainingDueCount, 0);
  if (totalDue > 0) {
    insights.push({
      type: 'warning', icon: GraduationCap,
      text: `${totalDue} training enrollment${totalDue !== 1 ? 's' : ''} are coming due across the organization. Assign them before deadlines pass.`,
    });
  }

  const highReq = cards.filter(c => c.openRequests > 3);
  if (highReq.length > 0) {
    insights.push({
      type: 'action', icon: ClipboardList,
      text: `${highReq.map(c => c.name).join(' & ')} ${highReq.length > 1 ? 'have' : 'has'} high pending schedule requests. Review and approve to unblock staff.`,
    });
  }

  if (worst.score < 60) {
    insights.push({
      type: 'warning', icon: TrendingDown,
      text: `${worst.name} has the lowest operational health (${worst.score}). Focus area: compliance improvement and clearing open requests.`,
    });
  }

  insights.push({
    type: 'info', icon: Activity,
    text: `${overview.totalEmployees} total staff across ${overview.totalHospitals} hospitals. ${overview.upcomingEvents} events scheduled in the next 7 days.`,
  });

  return insights;
}

function AIInsightsPanel({ cards, overview }: { cards: HospitalCard[]; overview: OrgOverview }) {
  const insights = useMemo(() => generateInsights(cards, overview), [cards, overview]);

  const clsMap: Record<AIInsight['type'], string> = {
    positive: 'bg-green-50 border-green-200 text-green-700',
    warning:  'bg-amber-50 border-amber-200 text-amber-700',
    action:   'bg-blue-50 border-blue-200 text-blue-700',
    info:     'bg-slate-50 border-slate-200 text-slate-600',
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
        <Sparkles className="h-4 w-4 text-orange-500" />
        <p className="text-[13px] font-bold text-gray-900">AI Insights</p>
        <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
          Live Analysis
        </span>
      </div>
      <div className="p-4 space-y-2.5">
        {insights.map((ins, i) => (
          <div key={i} className={cn('flex items-start gap-2.5 px-3.5 py-3 rounded-xl border text-[12px] font-medium', clsMap[ins.type])}>
            <ins.icon className="h-4 w-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{ins.text}</p>
          </div>
        ))}
        <Link
          href="/ai-assistant"
          className="flex items-center justify-center gap-2 w-full h-9 mt-1 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-semibold transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5" /> Ask AI for deeper analysis
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Upcoming Events (cross-hospital)
// ─────────────────────────────────────────────────────────────

const EVENT_TYPE_COLORS: Record<string, string> = {
  meeting: '#3b82f6', training: '#f97316', pto: '#10b981',
  hospital_event: '#8b5cf6', town_hall: '#8b5cf6', onboarding: '#06b6d4',
  deadline: '#ef4444', other: '#6b7280',
};

function CrossHospitalEvents({ events }: { events: CrossHospitalEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-orange-500" />
          <p className="text-[13px] font-bold text-gray-900">Upcoming Events</p>
          <span className="text-[10px] text-gray-400 font-medium">— next 14 days across all hospitals</span>
        </div>
        <Link href="/calendar" className="text-[11px] text-orange-500 hover:text-orange-600 flex items-center gap-1">
          Master Calendar <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="divide-y divide-gray-50">
        {events.map(ev => {
          const typeColor = ev.color ?? EVENT_TYPE_COLORS[ev.event_type] ?? '#6b7280';
          const date = new Date(ev.start_time);
          const isToday = new Date().toDateString() === date.toDateString();
          return (
            <div key={ev.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors">
              {/* Date chip */}
              <div className="flex flex-col items-center justify-center h-11 w-11 rounded-xl shrink-0" style={{ backgroundColor: `${typeColor}15` }}>
                <p className="text-[10px] font-bold uppercase" style={{ color: typeColor }}>
                  {date.toLocaleDateString('en-US', { month: 'short' })}
                </p>
                <p className="text-[16px] font-bold leading-none" style={{ color: typeColor }}>
                  {date.getDate()}
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {isToday && <span className="text-[9px] font-bold uppercase tracking-wider text-green-600 bg-green-50 border border-green-100 rounded-full px-1.5 py-0.5">Today</span>}
                  <p className="text-[13px] font-semibold text-gray-900 truncate">{ev.title}</p>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {ev.is_all_day ? 'All day' : `${fmtTime(ev.start_time)} – ${fmtTime(ev.end_time)}`}
                  {ev.location && ` · ${ev.location}`}
                </p>
              </div>
              {/* Hospital tag */}
              <span
                className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border"
                style={{ backgroundColor: `${ev.hospitalColor}18`, color: ev.hospitalColor, borderColor: `${ev.hospitalColor}35` }}
              >
                {ev.hospitalName}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Compliance Monitoring
// ─────────────────────────────────────────────────────────────

function ComplianceMonitor({ cards }: { cards: HospitalCard[] }) {
  const sorted = [...cards].sort((a, b) => b.complianceRate - a.complianceRate);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
        <ShieldCheck className="h-4 w-4 text-blue-500" />
        <p className="text-[13px] font-bold text-gray-900">Compliance Monitoring</p>
      </div>
      <div className="p-5 space-y-4">
        {sorted.map(c => {
          const rate = c.complianceRate;
          const color = c.color ?? '#2563EB';
          const barColor = rate >= 90 ? '#22c55e' : rate >= 70 ? '#f59e0b' : '#ef4444';
          const status = rate >= 90 ? { label: 'Compliant', cls: 'text-green-600 bg-green-50' }
            : rate >= 70 ? { label: 'Attention', cls: 'text-amber-600 bg-amber-50' }
            : { label: 'Critical',  cls: 'text-red-600 bg-red-50' };

          return (
            <div key={c.id}>
              <div className="flex items-center gap-3 mb-1.5">
                <div className="h-6 w-6 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}18` }}>
                  <Building2 className="h-3 w-3" style={{ color }} />
                </div>
                <p className="text-[13px] font-semibold text-gray-800 flex-1">{c.name}</p>
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', status.cls)}>{status.label}</span>
                <p className="text-[13px] font-bold text-gray-800 w-10 text-right">{rate}%</p>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden ml-9">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${rate}%`, backgroundColor: barColor }}
                />
              </div>
              {c.trainingDueCount > 0 && (
                <p className="ml-9 mt-1 text-[10px] text-amber-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {c.trainingDueCount} training enrollment{c.trainingDueCount !== 1 ? 's' : ''} due
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Operational Alerts
// ─────────────────────────────────────────────────────────────

interface OpsAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  hospitalName: string;
  hospitalId: string;
  hospitalColor: string;
  message: string;
  action: { label: string; href: string };
}

function buildAlerts(cards: HospitalCard[]): OpsAlert[] {
  const alerts: OpsAlert[] = [];
  for (const c of cards) {
    if (c.complianceRate < 70) {
      alerts.push({
        id: `compliance-${c.id}`,
        severity: 'critical',
        hospitalName: c.name,
        hospitalId: c.id,
        hospitalColor: c.color ?? '#ef4444',
        message: `Compliance rate is ${c.complianceRate}% — below the 70% threshold. Required training must be completed.`,
        action: { label: 'View Training', href: `/hospital/${c.id}?tab=training` },
      });
    }
    if (c.trainingDueCount > 0) {
      alerts.push({
        id: `training-${c.id}`,
        severity: c.trainingDueCount > 3 ? 'warning' : 'info',
        hospitalName: c.name,
        hospitalId: c.id,
        hospitalColor: c.color ?? '#f59e0b',
        message: `${c.trainingDueCount} training enrollment${c.trainingDueCount !== 1 ? 's' : ''} coming due. Assign and complete before deadlines.`,
        action: { label: 'View Training', href: `/training` },
      });
    }
    if (c.openRequests > 3) {
      alerts.push({
        id: `requests-${c.id}`,
        severity: 'warning',
        hospitalName: c.name,
        hospitalId: c.id,
        hospitalColor: c.color ?? '#f59e0b',
        message: `${c.openRequests} pending schedule requests awaiting approval. Staff may be blocked.`,
        action: { label: 'Review Requests', href: `/schedule-requests` },
      });
    }
  }
  return alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });
}

function OperationalAlertsFeed({ cards }: { cards: HospitalCard[] }) {
  const alerts = useMemo(() => buildAlerts(cards), [cards]);

  if (alerts.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
        <div>
          <p className="text-[14px] font-semibold text-gray-800">All Systems Operational</p>
          <p className="text-[12px] text-gray-400">No alerts detected across any hospital.</p>
        </div>
      </div>
    );
  }

  const clsMap = {
    critical: { bg: 'bg-red-50 border-red-200',   icon: 'text-red-500',   dot: 'bg-red-500' },
    warning:  { bg: 'bg-amber-50 border-amber-200', icon: 'text-amber-500', dot: 'bg-amber-500' },
    info:     { bg: 'bg-blue-50 border-blue-200',   icon: 'text-blue-500',  dot: 'bg-blue-400' },
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
        <Bell className="h-4 w-4 text-red-500" />
        <p className="text-[13px] font-bold text-gray-900">Operational Alerts</p>
        <span className="ml-auto h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
          {alerts.length}
        </span>
      </div>
      <div className="divide-y divide-gray-50">
        {alerts.map(a => {
          const cls = clsMap[a.severity];
          return (
            <div key={a.id} className={cn('flex items-start gap-3.5 px-5 py-3.5 transition-colors hover:bg-gray-50')}>
              <div className={cn('h-2 w-2 rounded-full mt-1.5 shrink-0', cls.dot)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border"
                    style={{
                      backgroundColor: `${a.hospitalColor}15`,
                      color: a.hospitalColor,
                      borderColor: `${a.hospitalColor}30`,
                    }}
                  >
                    {a.hospitalName}
                  </span>
                  <span className={cn('text-[10px] font-bold uppercase tracking-wider', cls.icon)}>
                    {a.severity}
                  </span>
                </div>
                <p className="text-[12px] text-gray-700 leading-relaxed">{a.message}</p>
              </div>
              <Link
                href={a.action.href}
                className="shrink-0 text-[11px] font-semibold text-orange-500 hover:text-orange-600 whitespace-nowrap"
              >
                {a.action.label} →
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Hub Shell (root)
// ─────────────────────────────────────────────────────────────

interface HubShellProps {
  orgName: string;
  overview: OrgOverview | null;
  cards: HospitalCard[];
  crossEvents: CrossHospitalEvent[];
  myHospitalIds: string[];
  userId: string;
  viewRole: ViewRole;
}

export function HubShell({
  orgName, overview, cards, crossEvents, myHospitalIds, userId, viewRole,
}: HubShellProps) {
  const router = useRouter();
  const [search,       setSearch]       = useState('');
  const [selectedHosp, setSelectedHosp] = useState<string | null>(null);
  const [lastRefresh,  setLastRefresh]  = useState<Date | null>(null);
  const [isLive,       setIsLive]       = useState(false);

  // Set lastRefresh only after mount to avoid SSR/client time mismatch
  useEffect(() => { setLastRefresh(new Date()); }, []);

  const mySet = new Set(myHospitalIds);
  const isExecutive = viewRole === 'executive';
  const isManager   = viewRole === 'manager';

  // ── Supabase Realtime ──────────────────────────────────────
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel('hospital-hub-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitals' },          () => { router.refresh(); setLastRefresh(new Date()); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_hospital_roles' }, () => { router.refresh(); setLastRefresh(new Date()); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' },    () => { router.refresh(); setLastRefresh(new Date()); })
      .subscribe(status => setIsLive(status === 'SUBSCRIBED'));

    return () => { supabase.removeChannel(channel); };
  }, [router]);

  // ── Filtered cards for role ────────────────────────────────
  const roleCards = isExecutive ? cards : cards.filter(c => mySet.has(c.id));

  const filteredCards = roleCards.filter(c => {
    if (selectedHosp && c.id !== selectedHosp) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !(c.address ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const ov: OrgOverview = overview ?? {
    totalHospitals: 0, totalEmployees: 0, totalDepartments: 0,
    openRequests: 0, upcomingEvents: 0, trainingDue: 0, openTasks: 0,
  };

  const totalAlerts = buildAlerts(roleCards).filter(a => a.severity !== 'info').length;

  return (
    <div className="flex flex-col gap-5 pb-12">

      {/* ── Command Center Header ─────────────────────────── */}
      <div className="rounded-2xl bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 text-white px-6 py-6 shadow-xl">
        {/* Top row */}
        <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="h-8 w-8 rounded-xl bg-orange-500 flex items-center justify-center shadow-lg">
                <Building2 className="h-4.5 w-4.5 text-white" />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Operations Command Center</p>
              {/* Live indicator */}
              <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-1">
                <div className={cn('h-2 w-2 rounded-full', isLive ? 'bg-green-400 animate-pulse' : 'bg-slate-500')} />
                <p className="text-[10px] font-semibold text-slate-300">{isLive ? 'Live' : 'Connecting'}</p>
              </div>
            </div>
            <h1 className="text-[24px] font-bold text-white tracking-tight">{orgName}</h1>
            <p className="text-[12px] text-slate-400 mt-0.5">
              Multi-Hospital Management · {cards.length} locations{lastRefresh ? ` · Last updated ${lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {totalAlerts > 0 && (
              <div className="flex items-center gap-1.5 bg-red-500/20 border border-red-400/30 rounded-xl px-3 py-2 text-[12px] font-semibold text-red-300">
                <AlertCircle className="h-3.5 w-3.5" />
                {totalAlerts} alert{totalAlerts !== 1 ? 's' : ''} need attention
              </div>
            )}
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest bg-white/10 rounded-xl px-3 py-2">
              {ROLE_LABELS[viewRole] ?? viewRole} View
            </span>
            <button
              onClick={() => { router.refresh(); setLastRefresh(new Date()); }}
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-slate-300 text-[12px] font-medium transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            <Link
              href="/ai-assistant"
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-400/20 text-orange-300 text-[12px] font-medium transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" /> Ask AI
            </Link>
          </div>
        </div>

        {/* KPI bar */}
        {overview && <KPIBar overview={ov} cards={roleCards} />}
      </div>

      {/* ── Hospital Switcher ────────────────────────────────── */}
      <HospitalSwitcher
        cards={roleCards}
        selected={selectedHosp}
        onSelect={setSelectedHosp}
        myHospitalIds={myHospitalIds}
        viewRole={viewRole}
      />

      {/* ── Search bar ──────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search hospitals by name or location…"
            className="w-full h-10 pl-9 pr-4 border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white shadow-sm"
          />
        </div>
        <div className="h-10 px-4 flex items-center rounded-xl border border-gray-200 bg-white text-[13px] text-gray-500 shadow-sm">
          {filteredCards.length}/{roleCards.length} shown
        </div>
      </div>

      {/* ── Hospital Cards Grid ──────────────────────────────── */}
      {filteredCards.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <Building2 className="h-16 w-16 text-gray-200 mx-auto mb-4" />
          <p className="text-[16px] font-semibold text-gray-600">No hospitals match your search</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredCards.map(card => (
            <HospCard key={card.id} card={card} isMine={mySet.has(card.id)} />
          ))}
        </div>
      )}

      {/* ── Executive Sections (exec + manager) ─────────────── */}
      {(isExecutive || isManager) && (
        <>
          {/* Executive comparison — exec only */}
          {isExecutive && roleCards.length > 1 && (
            <ExecutiveComparison cards={roleCards} />
          )}

          {/* AI insights — exec only */}
          {isExecutive && overview && (
            <AIInsightsPanel cards={roleCards} overview={ov} />
          )}

          {/* Two-column layout for events + compliance */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {crossEvents.length > 0 && <CrossHospitalEvents events={crossEvents} />}
            {roleCards.length > 0 && <ComplianceMonitor cards={roleCards} />}
          </div>

          {/* Operational alerts */}
          <OperationalAlertsFeed cards={roleCards} />
        </>
      )}

      {/* ── Quick Nav Footer ─────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">Quick Navigation</p>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {[
            { href: '/training',      icon: GraduationCap, label: 'Training',        sub: 'Courses & LMS'         },
            { href: '/calendar',      icon: Calendar,      label: 'Master Calendar', sub: 'All hospital events'   },
            { href: '/communication', icon: MessageSquare, label: 'Communications',  sub: 'Channels & messages'   },
            { href: '/documents',     icon: FileText,      label: 'Documents',       sub: 'Knowledge base'        },
            { href: '/projects',      icon: Zap,           label: 'Projects',        sub: 'Tasks & milestones'    },
            { href: '/kpi',           icon: BarChart3,     label: 'KPI Analytics',   sub: 'Performance data'      },
          ].map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50/50 transition-all group text-center"
            >
              <div className="h-9 w-9 rounded-lg bg-orange-50 group-hover:bg-orange-100 flex items-center justify-center transition-colors">
                <item.icon className="h-4.5 w-4.5 text-orange-500" />
              </div>
              <div>
                <p className="text-[12px] font-semibold text-gray-800">{item.label}</p>
                <p className="text-[10px] text-gray-400">{item.sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
