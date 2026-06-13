'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search, Calendar, Sparkles, BookOpen, GraduationCap,
  CheckSquare, Bell, BellRing, MessageSquare, ClipboardList, GitBranch,
  FolderKanban, BarChart2, Building2, Building, Users, FileText,
  ClipboardCheck, ArrowRight, Hash, UserPlus, UserCog,
  LayoutDashboard, ShieldCheck, LayoutGrid, ScrollText, SlidersHorizontal,
  Lock, Cpu, CircleUser, CircleHelp, Puzzle,
} from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { getSuggestions, type SearchItem } from '@/lib/nav-search';

const ICON_MAP: Record<string, React.ElementType> = {
  Calendar, Sparkles, BookOpen, GraduationCap, CheckSquare, Bell, BellRing,
  MessageSquare, ClipboardList, GitBranch, FolderKanban, BarChart2,
  Building2, Building, Users, FileText, ClipboardCheck, Hash, UserPlus, UserCog,
  LayoutDashboard, ShieldCheck, LayoutGrid, ScrollText, SlidersHorizontal,
  Lock, Cpu, CircleUser, CircleHelp, Puzzle,
};

const HOT_SUGGESTIONS = ['Master Calendar', 'CBC procedure', 'Employee handbook', 'OSHA requirements'];

// ── Component ─────────────────────────────────────────────────────────────────

export function DashboardSearchBar() {
  const [query, setQuery]           = useState('');
  const [suggestions, setSuggestions] = useState<SearchItem[]>([]);
  const [activeIdx, setActiveIdx]   = useState(-1);
  const [open, setOpen]             = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const navigate  = useAppStore((s) => s.navigate);

  // Recompute suggestions on every keystroke
  useEffect(() => {
    const results = getSuggestions(query);
    setSuggestions(results);
    setActiveIdx(-1);
    setOpen(results.length > 0);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const go = useCallback((item: SearchItem) => {
    navigate(item.section, item.subId ?? null);
    setQuery('');
    setOpen(false);
  }, [navigate]);

  const handleSearch = useCallback(() => {
    if (activeIdx >= 0 && suggestions[activeIdx]) {
      go(suggestions[activeIdx]);
      return;
    }
    const q = query.trim();
    if (!q) return;
    // If top suggestion is a strong match, go there; else fall back to knowledge-base
    if (suggestions.length > 0) {
      go(suggestions[0]);
    } else {
      navigate('knowledge-base', q);
      setQuery('');
      setOpen(false);
    }
  }, [activeIdx, suggestions, query, go, navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
    }
  };

  const sectionSuggestions = suggestions.filter(s => s.category === 'section');
  const contentSuggestions = suggestions.filter(s => s.category === 'content');

  return (
    <div className="max-w-2xl mx-auto" ref={wrapRef}>
      {/* Input row */}
      <div className={`flex items-center gap-3 bg-white rounded-xl px-5 py-4 shadow-lg transition-all ${open ? 'rounded-b-none shadow-none ring-2 ring-white/40' : 'hover:shadow-xl'}`}>
        <Search className="h-5 w-5 text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          placeholder="Search sections, SOPs, tasks, calendar…"
          className="flex-1 text-[15px] text-gray-800 placeholder:text-gray-400 bg-transparent outline-none"
          autoComplete="off"
        />
        <button
          onClick={handleSearch}
          disabled={!query.trim()}
          className="shrink-0 px-5 py-2 rounded-lg text-[14px] font-semibold text-white disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: '#1e3a5f' }}
        >
          Search
        </button>
      </div>

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <div className="bg-white rounded-b-xl shadow-2xl border-t border-gray-100 overflow-hidden">
          {sectionSuggestions.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Go to Section</p>
              {sectionSuggestions.map((item) => {
                const globalIdx = suggestions.indexOf(item);
                const isActive  = globalIdx === activeIdx;
                const Icon = ICON_MAP[item.iconKey] ?? Hash;
                return (
                  <button
                    key={item.id}
                    onMouseDown={() => go(item)}
                    onMouseEnter={() => setActiveIdx(globalIdx)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: item.iconBg }}>
                      <Icon className="h-4 w-4" style={{ color: item.iconColor }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-gray-800 leading-tight">{item.label}</p>
                      <p className="text-[11px] text-gray-400 truncate">{item.description}</p>
                    </div>
                    {isActive && <ArrowRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {contentSuggestions.length > 0 && (
            <div className={sectionSuggestions.length > 0 ? 'border-t border-gray-100' : ''}>
              <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Knowledge Base</p>
              {contentSuggestions.map((item) => {
                const globalIdx = suggestions.indexOf(item);
                const isActive  = globalIdx === activeIdx;
                return (
                  <button
                    key={item.id}
                    onMouseDown={() => go(item)}
                    onMouseEnter={() => setActiveIdx(globalIdx)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-slate-100">
                      <Hash className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-gray-800 leading-tight">{item.label}</p>
                      <p className="text-[11px] text-gray-400">Search in Knowledge Base</p>
                    </div>
                    {isActive && <ArrowRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 flex items-center gap-1.5">
            <span className="text-[10px] text-gray-400">↑↓ navigate</span>
            <span className="text-gray-300 mx-1">·</span>
            <span className="text-[10px] text-gray-400">↵ select</span>
            <span className="text-gray-300 mx-1">·</span>
            <span className="text-[10px] text-gray-400">esc close</span>
          </div>
        </div>
      )}

      {/* Hot suggestions (shown when input is empty) */}
      {!query && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <span className="text-white/50 text-[13px]">Try:</span>
          {HOT_SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => setQuery(s)}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full text-[12px] text-white/80 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
