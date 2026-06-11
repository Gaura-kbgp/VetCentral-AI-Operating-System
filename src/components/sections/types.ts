import type { AppRole } from '@/types/database';

export interface SectionProps {
  userId: string;
  orgId: string;
  role: AppRole | null;
  firstName: string;
  hospitalId: string | null;
  subId?: string;
}
