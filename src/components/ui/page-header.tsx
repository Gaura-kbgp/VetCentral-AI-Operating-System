import React from 'react';

const ACCENT_COLORS: Record<string, string> = {
  navy:   '#1e3a5f',
  orange: '#f97316',
  green:   '#059669',
  emerald: '#059669',
  purple: '#5b21b6',
  violet: '#1e3a5f',
  pink:   '#ec4899',
  red:    '#ef4444',
  slate:  '#475569',
  teal:   '#0d9488',
  blue:   '#1e3a5f',
  indigo: '#1e3a5f',
};

const ICON_BG: Record<string, string> = {
  navy:   '#eef2ff',
  orange: '#fff7ed',
  green:   '#d1fae5',
  emerald: '#d1fae5',
  purple: '#f5f3ff',
  violet: '#f5f3ff',
  pink:   '#fdf2f8',
  red:    '#fef2f2',
  slate:  '#f8fafc',
  teal:   '#f0fdfa',
  blue:   '#eff6ff',
  indigo: '#eef2ff',
};

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  color?: keyof typeof ACCENT_COLORS | string;
  variant?: 'default' | 'banner';
}

export function PageHeader({
  title,
  description,
  action,
  icon,
  color = 'navy',
  variant = 'default',
}: PageHeaderProps) {
  const accent = ACCENT_COLORS[color] ?? color;
  const iconBg = ICON_BG[color] ?? '#f8fafc';

  if (variant === 'banner') {
    return (
      <div
        className="-mx-6 -mt-6 mb-6 px-8 py-7 flex items-center justify-between shrink-0"
        style={{ backgroundColor: accent }}
      >
        <div className="flex items-center gap-4">
          {icon && (
            <div className="text-white opacity-90">
              {icon}
            </div>
          )}
          <div>
            <h1 className="text-[26px] font-bold text-white leading-tight tracking-tight">
              {title}
            </h1>
            {description && (
              <p className="text-white/75 text-[14px] mt-0.5 leading-snug">{description}</p>
            )}
          </div>
        </div>
        {action && (
          <div className="shrink-0 ml-6">{action}</div>
        )}
      </div>
    );
  }

  return (
    <div className="-mx-6 -mt-6 mb-6 bg-white border-b border-slate-200/80 px-8 py-5 flex items-center justify-between shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-4">
        {/* Colored accent bar */}
        <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: accent }} />

        {/* Icon pill */}
        {icon && (
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: iconBg, color: accent }}
          >
            {icon}
          </div>
        )}

        <div>
          <h1
            className="text-[22px] font-bold text-gray-900 leading-tight tracking-tight"
            style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif' }}
          >
            {title}
          </h1>
          {description && (
            <p className="text-[13px] text-slate-500 mt-0.5 leading-snug">{description}</p>
          )}
        </div>
      </div>

      {action && (
        <div className="shrink-0 ml-6">{action}</div>
      )}
    </div>
  );
}
