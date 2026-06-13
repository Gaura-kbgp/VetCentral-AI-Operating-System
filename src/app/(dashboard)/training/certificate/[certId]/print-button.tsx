'use client';

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center gap-2 h-10 px-5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[14px] font-semibold transition-colors"
    >
      🖨 Print / Save as PDF
    </button>
  );
}
