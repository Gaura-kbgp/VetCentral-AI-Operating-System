'use client';

import React, { useState, useTransition } from 'react';
import { X, RotateCcw, Clock, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { rollbackKBVersion } from '@/lib/actions/knowledge';
import type { KBVersion, KBDocument } from '@/types/app';

interface KBVersionHistoryProps {
  documentId: string;
  versions: KBVersion[];
  onRollback: (doc: KBDocument) => void;
  onClose: () => void;
}

function timeAgo(iso: string): string {
  const secs = (Date.now() - new Date(iso).getTime()) / 1000;
  if (secs < 60)    return 'just now';
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function KBVersionHistory({
  documentId, versions, onRollback, onClose,
}: KBVersionHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRollback = (version: KBVersion) => {
    if (!confirm(`Roll back to version ${version.version}? A new version will be created with the old content.`)) return;
    setRollingBackId(version.id);
    startTransition(async () => {
      const result = await rollbackKBVersion(documentId, version.id);
      setRollingBackId(null);
      if (result.success) {
        onRollback(result.data);
      }
    });
  };

  const latestVersion = versions[0]?.version ?? 1;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
        <h3 className="text-sm font-semibold text-slate-800">Version History</h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {versions.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">No versions found</p>
        ) : (
          versions.map((ver, i) => {
            const isLatest  = ver.version === latestVersion;
            const isExpanded = expandedId === ver.id;
            const isRolling  = rollingBackId === ver.id;

            return (
              <div
                key={ver.id}
                className="rounded-lg border border-slate-100 bg-white overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : ver.id)}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex flex-col items-center mt-0.5 shrink-0">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold
                      ${isLatest ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                      {ver.version}
                    </div>
                    {i < versions.length - 1 && (
                      <div className="w-px h-3 bg-slate-100 mt-1" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-medium text-slate-700 truncate flex-1">
                        {ver.change_summary ?? 'Updated'}
                      </span>
                      {isLatest && (
                        <span className="text-[9px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-1 py-0.5 rounded shrink-0">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {timeAgo(ver.created_at)}
                      </span>
                      {ver.author && (
                        <span>
                          {ver.author.first_name} {ver.author.last_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {isExpanded
                    ? <ChevronDown className="h-3 w-3 text-slate-400 shrink-0 mt-1" />
                    : <ChevronRight className="h-3 w-3 text-slate-400 shrink-0 mt-1" />
                  }
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 border-t border-slate-50">
                    {ver.content && (
                      <div className="mt-2 mb-3 max-h-40 overflow-y-auto">
                        <pre className="text-[10px] font-mono text-slate-500 bg-slate-50 rounded p-2 whitespace-pre-wrap break-words leading-relaxed">
                          {ver.content.slice(0, 600)}{ver.content.length > 600 ? '…' : ''}
                        </pre>
                      </div>
                    )}
                    {!isLatest && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRollback(ver)}
                        disabled={isPending}
                        className="w-full gap-1.5 text-xs h-7"
                      >
                        {isRolling
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <RotateCcw className="h-3 w-3" />
                        }
                        Restore this version
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
