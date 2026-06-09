'use client';

import { useState } from 'react';
import { Clock, AlertTriangle, CheckCircle, TrendingUp, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardMetrics, RequestSummary, RequestType } from '@/lib/actions/requests';
import RequestCard from './RequestCard';
import MetricCard from './MetricCard';
import FilterBar from './FilterBar';

interface Props {
  metrics: DashboardMetrics;
  pending: RequestSummary[];
  overdue: RequestSummary[];
  escalated: RequestSummary[];
  completed: RequestSummary[];
}

type TabType = 'pending' | 'overdue' | 'escalated' | 'completed';

const TYPE_LABELS: Record<string, string> = {
  meeting: 'Meetings', leave: 'Leave', purchase: 'Purchases',
  training: 'Training', document_verification: 'Documents', equipment: 'Equipment',
};

export default function ApprovalDashboard({ metrics, pending, overdue, escalated, completed }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [selectedType, setSelectedType] = useState<RequestType | 'all'>('all');

  const tabs = [
    { id: 'pending',   label: 'Pending Approvals', count: metrics.pending_count,   icon: Clock },
    { id: 'overdue',   label: 'Overdue',           count: metrics.overdue_count,   icon: AlertTriangle },
    { id: 'escalated', label: 'Escalated',         count: metrics.escalated_count, icon: TrendingUp },
    { id: 'completed', label: 'Completed Today',   count: metrics.completed_today, icon: CheckCircle },
  ];

  function filterByType(list: RequestSummary[]) {
    return selectedType === 'all' ? list : list.filter(r => r.request_type === selectedType);
  }

  const listMap: Record<TabType, RequestSummary[]> = {
    pending:   filterByType(pending),
    overdue:   filterByType(overdue),
    escalated: filterByType(escalated),
    completed: filterByType(completed),
  };

  const currentList = listMap[activeTab];
  const isOverdueTab = activeTab === 'overdue';
  const isCompletedTab = activeTab === 'completed';

  return (
    <div className="space-y-6">
      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {tabs.map(tab => (
          <MetricCard
            key={tab.id}
            label={tab.label}
            value={tab.count}
            icon={tab.icon}
            isActive={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
          />
        ))}
      </div>

      {/* Pending by type breakdown */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Pending by Type</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {(Object.keys(TYPE_LABELS) as RequestType[]).map(type => (
            <div
              key={type}
              className={cn(
                'p-4 rounded-lg border-2 cursor-pointer transition-all',
                selectedType === type
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
              )}
              onClick={() => setSelectedType(selectedType === type ? 'all' : type)}
            >
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {metrics.pending_by_type[type] || 0}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">{TYPE_LABELS[type]}</div>
            </div>
          ))}
        </div>
      </div>

      <FilterBar selectedType={selectedType} onTypeChange={setSelectedType} />

      {/* List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {tabs.find(t => t.id === activeTab)?.label}
          </h2>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <span className="text-sm text-gray-600 dark:text-gray-400">{currentList.length} items</span>
          </div>
        </div>

        <div className="p-6">
          {currentList.length > 0 ? (
            <div className="space-y-3">
              {currentList.map(req => (
                <RequestCard
                  key={req.id}
                  request={req}
                  isOverdue={isOverdueTab}
                  showOutcome={isCompletedTab}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <CheckCircle className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
              <p className="text-gray-600 dark:text-gray-400">
                {activeTab === 'pending' ? 'All caught up — no pending requests' :
                 activeTab === 'overdue' ? 'No overdue requests' :
                 activeTab === 'escalated' ? 'No escalated requests' :
                 'Nothing completed today yet'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
