'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, CheckCircle2, AlertCircle, Loader2, RefreshCw } from 'lucide-react';

interface Props {
  hospitalCount: number;
  target: number;
}

export function SeedHospitalsButton({ hospitalCount, target }: Props) {
  const router = useRouter();
  const [status,  setStatus]  = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [count,   setCount]   = useState(hospitalCount);

  const isComplete = count >= target;

  const handleSeed = async () => {
    if (!confirm('This will create 3 demo hospitals with departments, calendar events, and channels. Continue?')) return;
    setStatus('loading');
    setMessage('');
    try {
      const res  = await fetch('/api/v1/admin/seed-hospitals', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setStatus('done');
        setMessage(json.message);
        setCount(target);
        router.refresh();
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
          <p className="text-sm text-slate-600">Demo Hospitals</p>
          <p className="text-xs text-slate-400 mt-0.5">{count} in database · {target} defined</p>
        </div>
        {isComplete ? (
          <div className="flex items-center gap-2 h-9 px-4 text-sm font-semibold text-green-700 bg-green-50 rounded-xl border border-green-200">
            <CheckCircle2 className="h-4 w-4" /> Already Seeded
          </div>
        ) : (
          <button
            onClick={handleSeed}
            disabled={status === 'loading'}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50"
          >
            {status === 'loading'
              ? <><Loader2 className="h-4 w-4 animate-spin" />Seeding…</>
              : <><Building2 className="h-4 w-4" />Seed Hospitals</>
            }
          </button>
        )}
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
      {isComplete && (
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <RefreshCw className="h-3 w-3" />
          Hospital Hub will automatically show all 3 hospitals
        </div>
      )}
    </div>
  );
}
