'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ActionResult, SupportTicket, TicketComment, CreateTicketInput } from '@/types/app';

const createTicketSchema = z.object({
  title:       z.string().min(5, 'Title must be at least 5 characters').max(300),
  description: z.string().min(20, 'Please provide more detail (min 20 characters)').max(5000),
  category:    z.enum(['technical', 'access', 'training', 'billing', 'bug', 'feature_request', 'other']),
  priority:    z.enum(['low', 'medium', 'high', 'critical']),
});

export async function createSupportTicket(input: CreateTicketInput): Promise<ActionResult<SupportTicket>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const parsed = createTicketSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid data' };

  const { data: profile } = await supabase
    .from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile) return { success: false, error: 'Profile not found' };

  const { data, error } = await supabase
    .from('support_tickets')
    .insert({ ...parsed.data, org_id: profile.org_id, user_id: user.id })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath('/help');
  return { success: true, data: data as SupportTicket };
}

export async function getMyTickets(): Promise<SupportTicket[]> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return (data as SupportTicket[]) ?? [];
}

export async function addTicketComment(ticketId: string, content: string): Promise<ActionResult<TicketComment>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  if (!content.trim()) return { success: false, error: 'Comment cannot be empty' };

  const { data, error } = await supabase
    .from('support_ticket_comments')
    .insert({ ticket_id: ticketId, user_id: user.id, content: content.trim() })
    .select(`*, author:user_id(id,first_name,last_name,avatar_url)`)
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath('/help');
  return { success: true, data: data as TicketComment };
}
