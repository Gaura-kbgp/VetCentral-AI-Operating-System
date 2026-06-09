import { Package } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';

export default function AssetsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Assets"
        description="Manage equipment and physical assets across hospitals"
        color="navy"
        icon={<Package className="h-7 w-7" />}
      />
      <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-16 text-center">
        <p className="text-slate-400 text-sm">Under construction — check the roadmap in docs/09-development-roadmap.md</p>
      </div>
    </div>
  );
}
