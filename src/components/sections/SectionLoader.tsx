import { Loader2 } from 'lucide-react';

export function SectionLoader() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="h-6 w-6 text-slate-300 animate-spin" />
    </div>
  );
}
