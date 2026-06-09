'use client';

import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface Props {
  label: string;
  value: number;
  icon: LucideIcon;
  isActive?: boolean;
  onClick?: () => void;
}

export default function MetricCard({ label, value, icon: Icon, isActive, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'p-4 rounded-lg border-2 text-left transition-all',
        isActive
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600',
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">{value}</p>
        </div>
        <Icon className={cn('h-6 w-6', isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400')} />
      </div>
    </button>
  );
}
