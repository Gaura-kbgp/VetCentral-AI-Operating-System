'use client';

import { useSPANavigation } from '@/contexts/spa-navigation';
import { cn } from '@/lib/utils';
import type { SectionKey } from '@/types/sections';

interface SPALinkProps {
  section: SectionKey;
  subId?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export function SPALink({ section, subId, className, style, children }: SPALinkProps) {
  const { navigate } = useSPANavigation();
  return (
    <button
      type="button"
      onClick={() => navigate(section, subId)}
      className={cn('cursor-pointer', className)}
      style={style}
    >
      {children}
    </button>
  );
}
