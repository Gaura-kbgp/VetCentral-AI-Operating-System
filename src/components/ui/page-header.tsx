import React from 'react';

// Color variants matching the VetCentral page design system
const BANNER_COLORS: Record<string, string> = {
  navy:   '#1e3a5f',
  orange: '#f97316',
  green:  '#22c55e',
  purple: '#5b21b6',
  violet: '#7c3aed',
  pink:   '#ec4899',
  red:    '#ef4444',
  slate:  '#475569',
  teal:   '#0d9488',
  blue:   '#2563eb',
};

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  color?: keyof typeof BANNER_COLORS | string;
}

export function PageHeader({
  title,
  description,
  action,
  icon,
  color = 'navy',
}: PageHeaderProps) {
  const bg = BANNER_COLORS[color] ?? color;

  return (
    <div
      className="-mx-6 -mt-6 mb-6 flex items-center justify-between px-8 py-7"
      style={{ backgroundColor: bg }}
    >
      <div className="flex items-center gap-4">
        {icon && (
          <span className="text-white opacity-90 shrink-0">{icon}</span>
        )}
        <div>
          <h1 className="text-[26px] font-bold text-white leading-tight tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {description}
            </p>
          )}
        </div>
      </div>

      {action && (
        <div className="shrink-0 ml-6">{action}</div>
      )}
    </div>
  );
}
