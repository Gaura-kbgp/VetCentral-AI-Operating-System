'use client';

import React, { useState } from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROLE_PERMISSIONS, PERMISSION_GROUPS, ROLE_META, ALL_ROLES } from '@/lib/permissions';
import type { AppRole } from '@/types/database';

// ─── Cell ─────────────────────────────────────────────────────────────────

function Cell({ granted, highlight }: { granted: boolean; highlight: boolean }) {
  return (
    <td className={cn(
      'px-2 py-2.5 text-center border-l border-gray-100 dark:border-gray-700/50 transition-colors',
      highlight && 'bg-blue-50 dark:bg-blue-900/10',
    )}>
      {granted ? (
        <Check className="h-3.5 w-3.5 text-green-500 mx-auto" />
      ) : (
        <Minus className="h-3 w-3 text-gray-200 dark:text-gray-700 mx-auto" />
      )}
    </td>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────

interface Props {
  /** If provided, only show this role's column (for user-facing view) */
  focusRole?: AppRole | null;
}

export default function PermissionMatrix({ focusRole }: Props) {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [hoveredRole, setHoveredRole] = useState<AppRole | null>(null);

  const displayRoles = focusRole ? [focusRole] : ALL_ROLES;
  const displayGroups = selectedGroup
    ? PERMISSION_GROUPS.filter(g => g.module === selectedGroup)
    : PERMISSION_GROUPS;

  return (
    <div className="space-y-4">
      {/* Module filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedGroup(null)}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
            selectedGroup === null
              ? 'bg-blue-600 text-white border-blue-600'
              : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300',
          )}
        >
          All Modules
        </button>
        {PERMISSION_GROUPS.map(g => (
          <button
            key={g.module}
            onClick={() => setSelectedGroup(selectedGroup === g.module ? null : g.module)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
              selectedGroup === g.module
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300',
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Matrix table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm min-w-max">
          <thead>
            {/* Role header */}
            <tr className="bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 w-48 sticky left-0 bg-gray-50 dark:bg-gray-800/80 z-10">
                Permission
              </th>
              {displayRoles.map(role => {
                const meta = ROLE_META[role];
                return (
                  <th
                    key={role}
                    className={cn(
                      'px-2 py-3 text-center border-l border-gray-100 dark:border-gray-700/50 cursor-pointer transition-colors',
                      hoveredRole === role && 'bg-blue-50 dark:bg-blue-900/10',
                    )}
                    onMouseEnter={() => setHoveredRole(role)}
                    onMouseLeave={() => setHoveredRole(null)}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
                      <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {meta.label}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="bg-white dark:bg-gray-900">
            {displayGroups.map((group) => (
              <React.Fragment key={group.module}>
                {/* Module section header */}
                <tr
                  className="bg-gray-50/80 dark:bg-gray-800/40 border-t border-gray-100 dark:border-gray-700"
                >
                  <td
                    colSpan={displayRoles.length + 1}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 sticky left-0"
                  >
                    {group.label}
                  </td>
                </tr>

                {/* Permission rows */}
                {group.permissions.map(perm => (
                  <tr
                    key={perm.key}
                    className="border-t border-gray-50 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                  >
                    <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-gray-400 sticky left-0 bg-white dark:bg-gray-900 z-10">
                      {perm.label}
                    </td>
                    {displayRoles.map(role => (
                      <Cell
                        key={role}
                        granted={ROLE_PERMISSIONS[role].includes(perm.key)}
                        highlight={hoveredRole === role}
                      />
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {!focusRole && (
        <p className="text-xs text-gray-400 dark:text-gray-600">
          Hover a role column to highlight it. Click a module chip to focus.
          Database-level RLS independently enforces these boundaries.
        </p>
      )}
    </div>
  );
}
