import { createSupabaseAdminClient } from '@/lib/supabase/server';

interface AuditLogParams {
  org_id: string;
  hospital_id?: string | null;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
}

export async function writeAuditLog(params: AuditLogParams): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    await admin.from('audit_logs').insert({
      org_id: params.org_id,
      hospital_id: params.hospital_id ?? null,
      user_id: params.user_id,
      action: params.action,
      resource_type: params.resource_type,
      resource_id: params.resource_id ?? null,
      old_data: params.old_data ?? null,
      new_data: params.new_data ?? null,
    });
  } catch {
    // Audit log failure should never break the main operation
  }
}
