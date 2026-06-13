'use server';

import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types/app';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type DirectSubtype = 'general' | 'medical_certificate' | 'work_report';

export interface DirectRequest {
  id: string;
  title: string;
  description: string | null;
  status: string;
  subtype: DirectSubtype;
  read_at: string | null;
  created_at: string;
  requested_by: string;
  assigned_to: string;
  sender: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null; job_title?: string | null } | null;
  recipient: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null; job_title?: string | null } | null;
}

export interface RequestReply {
  id: string;
  request_id: string;
  author_id: string;
  content: string;
  files: ReplyFile[];
  created_at: string;
  author: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null } | null;
}

export interface ReplyFile {
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface OrgMember {
  id: string;
  name: string;
  role: string;
  job_title: string | null;
  avatar_url: string | null;
}

// ─────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────

async function ctx() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin.from('profiles')
    .select('org_id, first_name, last_name').eq('id', user.id).single();
  if (!profile?.org_id) return null;
  return { user, admin, orgId: profile.org_id as string, profile };
}

const PERSON_SEL = 'id,first_name,last_name,avatar_url,job_title';

function parseSubtype(description: string | null): DirectSubtype {
  if (!description) return 'general';
  try {
    const p = JSON.parse(description);
    if (p.__subtype === 'medical_certificate') return 'medical_certificate';
    if (p.__subtype === 'work_report') return 'work_report';
  } catch { /* fall through */ }
  return 'general';
}

function parseMessage(description: string | null): string {
  if (!description) return '';
  try {
    const p = JSON.parse(description);
    return p.message ?? description;
  } catch { return description; }
}

function enrichDirect(raw: Record<string, unknown>): DirectRequest {
  const desc = raw.description as string | null;
  return {
    id: raw.id as string,
    title: raw.title as string,
    description: parseMessage(desc),
    status: raw.status as string,
    subtype: parseSubtype(desc),
    read_at: raw.read_at as string | null,
    created_at: raw.created_at as string,
    requested_by: raw.requested_by as string,
    assigned_to: raw.assigned_to as string,
    sender: (raw.sender ?? null) as DirectRequest['sender'],
    recipient: (raw.recipient ?? null) as DirectRequest['recipient'],
  };
}

const DR_SEL = `
  id, title, description, status, read_at, created_at, requested_by, assigned_to,
  sender:requested_by(${PERSON_SEL}),
  recipient:assigned_to(${PERSON_SEL})
`;

// ─────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────

export async function getDirectInbox(): Promise<ActionResult<DirectRequest[]>> {
  const c = await ctx(); if (!c) return { success: false, error: 'Unauthorized' };
  const { data, error } = await c.admin.from('requests').select(DR_SEL)
    .eq('org_id', c.orgId).eq('request_type', 'direct').eq('assigned_to', c.user.id)
    .order('created_at', { ascending: false });
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []).map(r => enrichDirect(r as Record<string, unknown>)) };
}

export async function getDirectSent(): Promise<ActionResult<DirectRequest[]>> {
  const c = await ctx(); if (!c) return { success: false, error: 'Unauthorized' };
  const { data, error } = await c.admin.from('requests').select(DR_SEL)
    .eq('org_id', c.orgId).eq('request_type', 'direct').eq('requested_by', c.user.id)
    .order('created_at', { ascending: false });
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []).map(r => enrichDirect(r as Record<string, unknown>)) };
}

export async function getDirectInboxUnreadCount(): Promise<ActionResult<number>> {
  const c = await ctx(); if (!c) return { success: false, error: 'Unauthorized' };
  const { count, error } = await c.admin.from('requests')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', c.orgId).eq('request_type', 'direct')
    .eq('assigned_to', c.user.id).is('read_at', null);
  if (error) return { success: false, error: error.message };
  return { success: true, data: count ?? 0 };
}

export async function getRequestReplies(requestId: string): Promise<ActionResult<RequestReply[]>> {
  const c = await ctx(); if (!c) return { success: false, error: 'Unauthorized' };
  const { data, error } = await c.admin.from('request_activity').select(`
    id, request_id, action_by, details, created_at,
    author:action_by(id,first_name,last_name,avatar_url)
  `)
    .eq('request_id', requestId)
    .eq('activity_type', 'reply')
    .order('created_at', { ascending: true });
  if (error) return { success: false, error: error.message };

  const replies: RequestReply[] = (data ?? []).map(r => {
    const d = (r.details ?? {}) as Record<string, unknown>;
    return {
      id: r.id as string,
      request_id: r.request_id as string,
      author_id: r.action_by as string,
      content: (d.content ?? '') as string,
      files: Array.isArray(d.files) ? (d.files as ReplyFile[]) : [],
      created_at: r.created_at as string,
      author: (Array.isArray(r.author) ? (r.author[0] ?? null) : (r.author ?? null)) as RequestReply['author'],
    };
  });
  return { success: true, data: replies };
}

export async function getOrgMembersForDirect(): Promise<ActionResult<OrgMember[]>> {
  const c = await ctx(); if (!c) return { success: false, error: 'Unauthorized' };

  const { data: profiles, error } = await c.admin.from('profiles')
    .select('id,first_name,last_name,avatar_url,job_title')
    .eq('org_id', c.orgId).eq('is_active', true).neq('id', c.user.id);
  if (error) return { success: false, error: error.message };

  const ids = (profiles ?? []).map((p: Record<string, string>) => p.id);
  const { data: roleRows } = await c.admin.from('org_user_roles').select('user_id,role').in('user_id', ids);
  const roleMap: Record<string, string> = {};
  for (const r of (roleRows ?? []) as Array<{ user_id: string; role: string }>) roleMap[r.user_id] = r.role;

  return {
    success: true,
    data: (profiles ?? []).map((p: Record<string, string>) => ({
      id: p.id,
      name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
      role: roleMap[p.id] ?? 'staff',
      job_title: p.job_title ?? null,
      avatar_url: p.avatar_url ?? null,
    })),
  };
}

// ─────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────

export async function createDirectRequest(input: {
  assigned_to: string;
  title: string;
  message: string;
  subtype: DirectSubtype;
}): Promise<ActionResult<DirectRequest>> {
  const c = await ctx(); if (!c) return { success: false, error: 'Unauthorized' };

  const description = input.subtype !== 'general'
    ? JSON.stringify({ __subtype: input.subtype, message: input.message })
    : input.message;

  const { data, error } = await c.admin.from('requests').insert({
    org_id: c.orgId,
    request_type: 'direct',
    requested_by: c.user.id,
    assigned_to: input.assigned_to,
    title: input.title.trim(),
    description,
    status: 'pending',
    priority: 'medium',
  }).select(DR_SEL).single();

  if (error) return { success: false, error: error.message };

  const senderName = [c.profile.first_name, c.profile.last_name].filter(Boolean).join(' ') || 'A colleague';
  try {
    await c.admin.from('notifications').insert({
      user_id: input.assigned_to, org_id: c.orgId,
      type: 'request_received',
      title: 'New Request',
      body: `${senderName} sent you a request: "${input.title}"`,
      link: '/dashboard?section=requests-portal',
      is_read: false,
      metadata: { request_id: data.id },
    });
  } catch { /* non-fatal */ }

  await c.admin.from('request_activity').insert({
    request_id: data.id,
    activity_type: 'created',
    action_by: c.user.id,
    details: { subtype: input.subtype },
  });

  return { success: true, data: enrichDirect(data as Record<string, unknown>) };
}

export async function markDirectRequestRead(requestId: string): Promise<ActionResult<void>> {
  const c = await ctx(); if (!c) return { success: false, error: 'Unauthorized' };
  const { error } = await c.admin.from('requests')
    .update({ read_at: new Date().toISOString() })
    .eq('id', requestId).eq('assigned_to', c.user.id).is('read_at', null);
  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

export async function addReply(requestId: string, content: string, files: ReplyFile[]): Promise<ActionResult<RequestReply>> {
  const c = await ctx(); if (!c) return { success: false, error: 'Unauthorized' };

  const { data: req } = await c.admin.from('requests')
    .select('requested_by,assigned_to,title,status')
    .eq('id', requestId).single();
  if (!req) return { success: false, error: 'Request not found' };

  const isParticipant = req.requested_by === c.user.id || req.assigned_to === c.user.id;
  if (!isParticipant) return { success: false, error: 'Not authorized' };

  const { data, error } = await c.admin.from('request_activity').insert({
    request_id: requestId,
    activity_type: 'reply',
    action_by: c.user.id,
    details: { content: content.trim(), files },
  }).select('id,request_id,action_by,details,created_at,author:action_by(id,first_name,last_name,avatar_url)').single();

  if (error) return { success: false, error: error.message };

  if (req.status === 'pending') {
    await c.admin.from('requests').update({ status: 'completed' }).eq('id', requestId);
  }

  const notifyUserId = req.requested_by === c.user.id ? req.assigned_to : req.requested_by;
  const senderName = [c.profile.first_name, c.profile.last_name].filter(Boolean).join(' ') || 'A colleague';
  try {
    await c.admin.from('notifications').insert({
      user_id: notifyUserId, org_id: c.orgId,
      type: 'request_reply',
      title: 'Request Reply',
      body: `${senderName} replied to "${req.title}"`,
      link: '/dashboard?section=requests-portal',
      is_read: false,
      metadata: { request_id: requestId },
    });
  } catch { /* non-fatal */ }

  const d = (data.details ?? {}) as Record<string, unknown>;
  return {
    success: true,
    data: {
      id: data.id as string,
      request_id: data.request_id as string,
      author_id: data.action_by as string,
      content: (d.content ?? '') as string,
      files: Array.isArray(d.files) ? (d.files as ReplyFile[]) : [],
      created_at: data.created_at as string,
      author: (Array.isArray(data.author) ? (data.author[0] ?? null) : (data.author ?? null)) as RequestReply['author'],
    },
  };
}
