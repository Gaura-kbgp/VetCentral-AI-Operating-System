'use server';

import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types/app';

// ── Types ─────────────────────────────────────────────────
export interface Channel {
  id: string;
  org_id: string;
  hospital_id: string | null;
  name: string;
  description: string | null;
  channel_type: 'public' | 'private' | 'announcement' | 'direct';
  created_by: string | null;
  is_archived: boolean;
  created_at: string;
}

export interface MessageAuthor {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
}

export interface Message {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  content_type: string;
  parent_id: string | null;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  author: MessageAuthor | null;
}

export interface Reaction {
  message_id: string;
  user_id: string;
  emoji: string;
}

// ── Default channels ──────────────────────────────────────
const DEFAULT_CHANNELS: Array<{
  name: string; description: string; channel_type: Channel['channel_type'];
}> = [
  { name: 'announcements', description: 'Hospital-wide announcements from leadership', channel_type: 'announcement' },
  { name: 'general',       description: 'General conversation for all staff',          channel_type: 'public'       },
  { name: 'team-updates',  description: 'Quick updates, reminders, and team news',     channel_type: 'public'       },
];

// ── Auth helper — server client for auth ONLY ─────────────
async function getAuthUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ── Get user + orgId using admin client ───────────────────
async function getUserContext() {
  const user = await getAuthUser();
  if (!user) return { user: null, orgId: null };

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();

  return { user, orgId: profile?.org_id ?? null };
}

// ── Ensure channel member (admin client) ──────────────────
async function ensureMember(channelId: string, userId: string) {
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from('channel_members')
    .select('user_id')
    .eq('channel_id', channelId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) {
    const { data: ch } = await admin
      .from('channels')
      .select('channel_type')
      .eq('id', channelId)
      .single();

    if (ch && (ch.channel_type === 'public' || ch.channel_type === 'announcement')) {
      await admin
        .from('channel_members')
        .insert({ channel_id: channelId, user_id: userId });
    }
  }
}

// ── Message select string ─────────────────────────────────
const MSG_SELECT = `
  id, channel_id, user_id, content, content_type, parent_id,
  is_edited, is_deleted, created_at, updated_at,
  author:profiles!user_id(id, first_name, last_name, avatar_url, job_title)
`;

function normaliseAuthor<T extends { author: unknown }>(row: T): Omit<T, 'author'> & { author: MessageAuthor | null } {
  return {
    ...row,
    author: Array.isArray(row.author)
      ? ((row.author[0] as MessageAuthor) ?? null)
      : (row.author as MessageAuthor | null),
  };
}

// ── Seed default channels ─────────────────────────────────
export async function seedDefaultChannels(): Promise<ActionResult<Channel[]>> {
  const { user, orgId } = await getUserContext();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();

  for (const ch of DEFAULT_CHANNELS) {
    const { data: existing } = await admin
      .from('channels')
      .select('id')
      .eq('org_id', orgId)
      .eq('name', ch.name)
      .maybeSingle();

    if (!existing) {
      const { data: newCh } = await admin
        .from('channels')
        .insert({ ...ch, org_id: orgId, created_by: user.id })
        .select('id')
        .single();

      if (newCh) {
        await admin
          .from('channel_members')
          .insert({ channel_id: newCh.id, user_id: user.id, is_admin: true });
      }
    }
  }

  return getChannels();
}

// ── Get channels ──────────────────────────────────────────
export async function getChannels(): Promise<ActionResult<Channel[]>> {
  const { user, orgId } = await getUserContext();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('channels')
    .select('id, org_id, hospital_id, name, description, channel_type, created_by, is_archived, created_at')
    .eq('org_id', orgId)
    .eq('is_archived', false)
    .order('name');

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as Channel[] };
}

// ── Create channel ────────────────────────────────────────
export async function createChannel(
  name: string,
  description: string | null,
  channelType: 'public' | 'private' | 'announcement',
): Promise<ActionResult<Channel>> {
  const { user, orgId } = await getUserContext();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();
  const slug  = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const { data: existing } = await admin
    .from('channels')
    .select('id')
    .eq('org_id', orgId)
    .eq('name', slug)
    .maybeSingle();

  if (existing) return { success: false, error: `A channel named "${slug}" already exists` };

  const { data, error } = await admin
    .from('channels')
    .insert({ org_id: orgId, name: slug, description, channel_type: channelType, created_by: user.id })
    .select('id, org_id, hospital_id, name, description, channel_type, created_by, is_archived, created_at')
    .single();

  if (error) return { success: false, error: error.message };

  await admin
    .from('channel_members')
    .insert({ channel_id: data.id, user_id: user.id, is_admin: true });

  return { success: true, data: data as Channel };
}

// ── Get messages ──────────────────────────────────────────
export async function getMessages(
  channelId: string,
  limit = 60,
): Promise<ActionResult<Message[]>> {
  const { user } = await getUserContext();
  if (!user) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();

  // Auto-join public/announcement channels
  await ensureMember(channelId, user.id);

  const { data, error } = await admin
    .from('messages')
    .select(MSG_SELECT)
    .eq('channel_id', channelId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) return { success: false, error: error.message };

  const messages = (data ?? []).map(normaliseAuthor) as Message[];

  // Mark as read (non-blocking)
  admin
    .from('channel_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('channel_id', channelId)
    .eq('user_id', user.id)
    .then(() => {});

  return { success: true, data: messages };
}

// ── Send message ──────────────────────────────────────────
export async function sendMessage(
  channelId: string,
  content: string,
): Promise<ActionResult<Message>> {
  const { user } = await getUserContext();
  if (!user) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();

  // Ensure member before posting
  await ensureMember(channelId, user.id);

  // Insert the message
  const { data: inserted, error: insertError } = await admin
    .from('messages')
    .insert({ channel_id: channelId, user_id: user.id, content: content.trim() })
    .select('id, channel_id, user_id, content, content_type, parent_id, is_edited, is_deleted, created_at, updated_at')
    .single();

  if (insertError) return { success: false, error: insertError.message };

  // Fetch author profile separately (avoids FK join issues)
  const { data: profile } = await admin
    .from('profiles')
    .select('id, first_name, last_name, avatar_url, job_title')
    .eq('id', user.id)
    .single();

  const message: Message = {
    ...inserted,
    content_type:  inserted.content_type  ?? 'text',
    parent_id:     inserted.parent_id     ?? null,
    is_edited:     inserted.is_edited     ?? false,
    is_deleted:    inserted.is_deleted    ?? false,
    author: profile ? (profile as MessageAuthor) : null,
  };

  return { success: true, data: message };
}

// ── Delete message ────────────────────────────────────────
export async function deleteMessage(messageId: string): Promise<ActionResult> {
  const { user } = await getUserContext();
  if (!user) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();

  // Only allow deleting own messages
  const { data: msg } = await admin
    .from('messages')
    .select('user_id')
    .eq('id', messageId)
    .single();

  if (!msg) return { success: false, error: 'Message not found' };
  if (msg.user_id !== user.id) return { success: false, error: 'Cannot delete another user\'s message' };

  const { error } = await admin
    .from('messages')
    .update({ is_deleted: true })
    .eq('id', messageId);

  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

// ── Get reactions ─────────────────────────────────────────
export async function getReactions(messageIds: string[]): Promise<ActionResult<Reaction[]>> {
  if (messageIds.length === 0) return { success: true, data: [] };

  const user = await getAuthUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('message_reactions')
    .select('message_id, user_id, emoji')
    .in('message_id', messageIds);

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as Reaction[] };
}

// ── Toggle reaction ───────────────────────────────────────
export async function toggleReaction(
  messageId: string,
  emoji: string,
): Promise<ActionResult<{ added: boolean }>> {
  const user = await getAuthUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from('message_reactions')
    .select('message_id')
    .eq('message_id', messageId)
    .eq('user_id', user.id)
    .eq('emoji', emoji)
    .maybeSingle();

  if (existing) {
    await admin
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .eq('emoji', emoji);
    return { success: true, data: { added: false } };
  }

  await admin
    .from('message_reactions')
    .insert({ message_id: messageId, user_id: user.id, emoji });
  return { success: true, data: { added: true } };
}
