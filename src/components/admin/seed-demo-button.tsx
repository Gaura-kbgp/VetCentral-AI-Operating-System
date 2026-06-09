'use client';

import { useState } from 'react';
import { Users, CheckCircle2, AlertCircle, Loader2, Database } from 'lucide-react';

export function SeedDemoButton({ initialCount, total }: { initialCount: number; total: number }) {
  const [status, setStatus]   = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [count, setCount]     = useState(initialCount);

  const handleSeed = async () => {
    if (!confirm(`This will create ${total} demo employee accounts with password "Demo1234!". Continue?`)) return;
    setStatus('loading');
    setMessage('');
    try {
      const res  = await fetch('/api/v1/admin/seed', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setStatus('done');
        setMessage(json.message);
        setCount(c => c + (json.created ?? 0));
      } else {
        setStatus('error');
        setMessage(json.error ?? 'Seed failed');
      }
    } catch {
      setStatus('error');
      setMessage('Network error');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600">Demo Employees</p>
          <p className="text-xs text-slate-400 mt-0.5">{count} in database · {total} defined</p>
        </div>
        <button
          onClick={handleSeed}
          disabled={status === 'loading'}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50"
        >
          {status === 'loading'
            ? <><Loader2 className="h-4 w-4 animate-spin" />Seeding…</>
            : <><Database className="h-4 w-4" />Seed Demo Employees</>
          }
        </button>
      </div>
      {status === 'done' && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />{message}
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />{message}
        </div>
      )}
      {status !== 'idle' && status !== 'loading' && (
        <p className="text-xs text-slate-400">
          All demo accounts use password: <code className="bg-slate-100 px-1 rounded">Demo1234!</code>
        </p>
      )}
    </div>
  );
}
