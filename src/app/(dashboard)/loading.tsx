export default function DashboardLoading() {
  return (
    <div className="space-y-6 pb-8 animate-pulse">

      {/* Hero skeleton */}
      <div className="-mx-6 -mt-6 h-56 rounded-none" style={{ backgroundColor: '#1e3a5f', opacity: 0.85 }}>
        <div className="flex flex-col items-center justify-center h-full gap-4 px-8">
          <div className="h-9 w-72 bg-white/20 rounded-lg" />
          <div className="h-4 w-96 bg-white/10 rounded" />
          <div className="w-full max-w-2xl h-14 bg-white/15 rounded-xl mt-2" />
          <div className="flex gap-3">
            {[1,2,3].map(i => <div key={i} className="h-7 w-28 bg-white/10 rounded-full" />)}
          </div>
        </div>
      </div>

      {/* Quick actions skeleton */}
      <div>
        <div className="h-6 w-36 bg-gray-200 rounded mb-4" />
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center gap-3">
              <div className="w-12 h-12 bg-slate-100 rounded-xl" />
              <div className="h-3 w-16 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Stats skeleton */}
      <div>
        <div className="h-6 w-24 bg-gray-200 rounded mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl px-5 py-5">
              <div className="h-8 w-12 bg-slate-100 rounded mb-2" />
              <div className="h-3 w-24 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Two-column skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1,2].map(i => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between">
              <div className="h-5 w-32 bg-slate-100 rounded" />
              <div className="h-4 w-16 bg-slate-100 rounded" />
            </div>
            {[1,2,3,4].map(j => (
              <div key={j} className="flex items-center gap-4 px-5 py-4 border-b border-gray-50">
                <div className="w-9 h-9 bg-slate-100 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-3/4 bg-slate-100 rounded" />
                  <div className="h-3 w-1/2 bg-slate-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Training progress skeleton */}
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-5">
        <div className="flex justify-between items-start mb-4">
          <div className="space-y-2">
            <div className="h-5 w-36 bg-slate-100 rounded" />
            <div className="h-8 w-16 bg-slate-100 rounded" />
            <div className="h-3 w-28 bg-slate-100 rounded" />
          </div>
          <div className="h-10 w-32 bg-orange-100 rounded-lg" />
        </div>
        <div className="w-full h-3 bg-gray-100 rounded-full" />
      </div>

    </div>
  );
}
