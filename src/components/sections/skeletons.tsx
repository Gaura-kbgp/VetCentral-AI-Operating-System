// Animated skeleton shapes for every section type.
// Use these instead of the generic Loader2 spinner so navigation feels
// instant and content-aware during the initial fetch window.

function Bar({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`animate-pulse bg-slate-200 rounded-xl ${className ?? ''}`} style={style} />;
}

/** Navy banner + N list rows */
export function BannerListSkeleton({ rows = 5 }: { rows?: number }) {
  const heights = ['h-14', 'h-14', 'h-12', 'h-14', 'h-10', 'h-14', 'h-12'];
  return (
    <div className="space-y-4">
      <Bar className="h-20 w-full" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Bar key={i} className={heights[i % heights.length]} />
        ))}
      </div>
    </div>
  );
}

/** Navy banner + card grid */
export function BannerCardGridSkeleton({ cols = 3, cards = 6 }: { cols?: number; cards?: number }) {
  return (
    <div className="space-y-4">
      <Bar className="h-20 w-full" />
      <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
        {Array.from({ length: cards }).map((_, i) => (
          <Bar key={i} className="h-32" />
        ))}
      </div>
    </div>
  );
}

/** Calendar: banner + filter chips + toolbar + calendar grid */
export function CalendarSkeleton() {
  return (
    <div className="space-y-4">
      <Bar className="h-20 w-full" />
      <Bar className="h-14 w-full" />
      <Bar className="h-14 w-full" />
      <Bar className="h-10 w-full" />
      <Bar className="h-[460px] w-full" />
    </div>
  );
}

/** Chat-style layout for AI assistant */
export function ChatSkeleton() {
  return (
    <div className="flex flex-col h-full gap-3 p-2">
      <Bar className="h-20 w-full" />
      <div className="flex-1 space-y-4 py-4">
        {[['70%','left'],['55%','right'],['80%','left'],['45%','right'],['65%','left']].map(([w, side], i) => (
          <div key={i} className={`flex ${side === 'right' ? 'justify-end' : ''}`}>
            <Bar className="h-12" style={{ width: w } as React.CSSProperties} />
          </div>
        ))}
      </div>
      <Bar className="h-12 w-full" />
    </div>
  );
}

/** Analytics: banner + KPI row + charts */
export function AnalyticsSkeleton() {
  return (
    <div className="space-y-4">
      <Bar className="h-20 w-full" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Bar key={i} className="h-24" />)}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Bar className="h-64" />
        <Bar className="h-64" />
      </div>
    </div>
  );
}

/** Tables (HR, Admin Users, Roles…) */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      <Bar className="h-20 w-full" />
      <Bar className="h-10 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Bar key={i} className="h-12" />
      ))}
    </div>
  );
}
