'use client';

import { Search, X } from 'lucide-react';
import { useState } from 'react';
import type { RequestType } from '@/lib/actions/requests';

interface Props {
  selectedType: RequestType | 'all';
  onTypeChange: (type: RequestType | 'all') => void;
}

const REQUEST_TYPES: Array<{ value: RequestType | 'all'; label: string }> = [
  { value: 'all', label: 'All Types' },
  { value: 'meeting', label: 'Meetings' },
  { value: 'leave', label: 'Leave' },
  { value: 'purchase', label: 'Purchases' },
  { value: 'training', label: 'Training' },
  { value: 'document_verification', label: 'Documents' },
  { value: 'equipment', label: 'Equipment' },
];

export default function FilterBar({ selectedType, onTypeChange }: Props) {
  const [search, setSearch] = useState('');

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Search */}
      <div className="flex-1 min-w-xs relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search requests..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        )}
      </div>
    </div>
  );
}
