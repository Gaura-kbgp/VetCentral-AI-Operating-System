'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BackButtonProps {
  fallbackHref?: string;
  label?: string;
  className?: string;
}

export function BackButton({
  fallbackHref = '/dashboard',
  label = 'Back',
  className,
}: BackButtonProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className={cn(
        'inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700 transition-colors',
        className,
      )}
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
