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

// ── Departments + hospitals for channel creation UI ───────
export async function getCommunicationSetupData(): Promise<ActionResult<{
  departments: Array<{ id: string; name: string }>;
  hospitals: Array<{ id: string; name: string }>;
}>> {
  const { user, orgId } = await getUserContext();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();

  const [deptRes, hospRes] = await Promise.all([
    admin
      .from('departments')
      .select('id,name')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('name'),
    admin
      .from('hospitals')
      .select('id,name')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('name'),
  ]);

  return {
    success: true,
    data: {
      departments: (deptRes.data ?? []) as Array<{ id: string; name: string }>,
      hospitals:   (hospRes.data ?? []) as Array<{ id: string; name: string }>,
    },
  };
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

// ── Delete channels by name (removes all with matching name) ─
export async function deleteChannelsByName(name: string): Promise<ActionResult<{ deleted: number }>> {
  const { user, orgId } = await getUserContext();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();

  const { data: channels } = await admin
    .from('channels')
    .select('id')
    .eq('org_id', orgId)
    .eq('name', name);

  if (!channels || channels.length === 0) return { success: true, data: { deleted: 0 } };

  const ids = channels.map(c => c.id);

  await admin.from('messages').delete().in('channel_id', ids);
  await admin.from('channel_members').delete().in('channel_id', ids);

  const { error } = await admin.from('channels').delete().in('id', ids);
  if (error) return { success: false, error: error.message };

  return { success: true, data: { deleted: ids.length } };
}

// ── One-time channel housekeeping ─────────────────────────
// Keeps only all-hospital + private channels, ensures doctors-discussion exists.
export async function housekeepChannels(): Promise<ActionResult<Channel[]>> {
  const { user, orgId } = await getUserContext();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();

  // 1. Find public channels that are NOT all-hospital
  const { data: publicChannels } = await admin
    .from('channels')
    .select('id, name')
    .eq('org_id', orgId)
    .eq('channel_type', 'public')
    .neq('name', 'all-hospital');

  if (publicChannels && publicChannels.length > 0) {
    const ids = publicChannels.map(c => c.id);
    await admin.from('messages').delete().in('channel_id', ids);
    await admin.from('channel_members').delete().in('channel_id', ids);
    await admin.from('channels').delete().in('id', ids);
  }

  // 2. Also clean up announcement duplicates (keep only one)
  const { data: announcements } = await admin
    .from('channels')
    .select('id')
    .eq('org_id', orgId)
    .eq('channel_type', 'announcement')
    .order('created_at', { ascending: true });

  if (announcements && announcements.length > 1) {
    const dupeIds = announcements.slice(1).map(c => c.id);
    await admin.from('messages').delete().in('channel_id', dupeIds);
    await admin.from('channel_members').delete().in('channel_id', dupeIds);
    await admin.from('channels').delete().in('id', dupeIds);
  }

  // 3. Ensure doctors-discussion private channel exists
  const { data: existing } = await admin
    .from('channels')
    .select('id')
    .eq('org_id', orgId)
    .eq('name', 'doctors-discussion')
    .maybeSingle();

  if (!existing) {
    const { data: newCh } = await admin
      .from('channels')
      .insert({
        org_id: orgId,
        name: 'doctors-discussion',
        description: 'Private discussions for doctors and clinical leads',
        channel_type: 'private',
        created_by: user.id,
      })
      .select('id')
      .single();

    if (newCh) {
      await admin.from('channel_members').insert({ channel_id: newCh.id, user_id: user.id, is_admin: true });
    }
  }

  return getChannels();
}

// ── Org members (for group creation / add member) ─────────
export interface OrgMember {
  id: string;
  name: string;
  job_title: string | null;
  avatar_url: string | null;
}

export async function getOrgMembers(): Promise<ActionResult<OrgMember[]>> {
  const { user, orgId } = await getUserContext();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('id, first_name, last_name, job_title, avatar_url')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('first_name');

  if (error) return { success: false, error: error.message };

  // dedupe by id (defensive) and build display names
  const seen = new Set<string>();
  const members: OrgMember[] = [];
  for (const p of data ?? []) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    members.push({
      id: p.id,
      name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
      job_title: p.job_title,
      avatar_url: p.avatar_url,
    });
  }
  return { success: true, data: members };
}

// ── Channel members ───────────────────────────────────────
export async function getChannelMembers(channelId: string): Promise<ActionResult<OrgMember[]>> {
  const { user } = await getUserContext();
  if (!user) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('channel_members')
    .select('user_id, member:profiles!user_id(id, first_name, last_name, job_title, avatar_url)')
    .eq('channel_id', channelId);

  if (error) return { success: false, error: error.message };

  const seen = new Set<string>();
  const members: OrgMember[] = [];
  for (const row of data ?? []) {
    const p: any = Array.isArray(row.member) ? row.member[0] : row.member;
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    members.push({
      id: p.id,
      name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
      job_title: p.job_title,
      avatar_url: p.avatar_url,
    });
  }
  return { success: true, data: members };
}

// ── Create group chat (private channel + members) ─────────
export async function createGroupChat(
  name: string,
  memberIds: string[],
): Promise<ActionResult<Channel>> {
  const { user, orgId } = await getUserContext();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) return { success: false, error: 'Enter a group name' };

  const { data: existing } = await admin
    .from('channels')
    .select('id')
    .eq('org_id', orgId)
    .eq('name', slug)
    .maybeSingle();
  if (existing) return { success: false, error: `A group named "${slug}" already exists` };

  const { data, error } = await admin
    .from('channels')
    .insert({ org_id: orgId, name: slug, description: null, channel_type: 'private', created_by: user.id })
    .select('id, org_id, hospital_id, name, description, channel_type, created_by, is_archived, created_at')
    .single();
  if (error) return { success: false, error: error.message };

  // creator (admin) + selected members, deduped
  const ids = Array.from(new Set([user.id, ...memberIds]));
  await admin.from('channel_members').upsert(
    ids.map(id => ({ channel_id: data.id, user_id: id, is_admin: id === user.id })),
    { onConflict: 'channel_id,user_id' },
  );

  return { success: true, data: data as Channel };
}

// ── Add members to a channel (deduped) ────────────────────
export async function addChannelMembers(
  channelId: string,
  memberIds: string[],
): Promise<ActionResult<{ added: number }>> {
  const { user } = await getUserContext();
  if (!user) return { success: false, error: 'Unauthorized' };
  if (!memberIds.length) return { success: true, data: { added: 0 } };

  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from('channel_members')
    .select('user_id')
    .eq('channel_id', channelId);
  const already = new Set((existing ?? []).map(r => r.user_id));
  const toAdd = Array.from(new Set(memberIds)).filter(id => !already.has(id));
  if (!toAdd.length) return { success: true, data: { added: 0 } };

  const { error } = await admin
    .from('channel_members')
    .upsert(
      toAdd.map(id => ({ channel_id: channelId, user_id: id })),
      { onConflict: 'channel_id,user_id' },
    );
  if (error) return { success: false, error: error.message };
  return { success: true, data: { added: toAdd.length } };
}

// ── Start (or reuse) a 1:1 direct chat ────────────────────
export async function startDirectChat(otherUserId: string): Promise<ActionResult<Channel>> {
  const { user, orgId } = await getUserContext();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };
  if (otherUserId === user.id) return { success: false, error: 'Cannot chat with yourself' };

  const admin = createSupabaseAdminClient();

  // deterministic name from sorted user ids → same pair always maps to one channel
  const [a, b] = [user.id, otherUserId].sort();
  const dmName = `dm-${a.slice(0, 8)}-${b.slice(0, 8)}`;

  const { data: existing } = await admin
    .from('channels')
    .select('id, org_id, hospital_id, name, description, channel_type, created_by, is_archived, created_at')
    .eq('org_id', orgId)
    .eq('name', dmName)
    .maybeSingle();

  if (existing) {
    // make sure both are members (self-heal)
    await admin.from('channel_members').upsert(
      [user.id, otherUserId].map(id => ({ channel_id: existing.id, user_id: id })),
      { onConflict: 'channel_id,user_id' },
    );
    return { success: true, data: existing as Channel };
  }

  const { data, error } = await admin
    .from('channels')
    .insert({ org_id: orgId, name: dmName, description: null, channel_type: 'direct', created_by: user.id })
    .select('id, org_id, hospital_id, name, description, channel_type, created_by, is_archived, created_at')
    .single();
  if (error) return { success: false, error: error.message };

  await admin.from('channel_members').upsert(
    [user.id, otherUserId].map(id => ({ channel_id: data.id, user_id: id })),
    { onConflict: 'channel_id,user_id' },
  );

  return { success: true, data: data as Channel };
}

// ── Total unread messages (for sidebar badge) ─────────────
export async function getUnreadMessageCount(): Promise<ActionResult<{ count: number }>> {
  const { user } = await getUserContext();
  if (!user) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();

  const { data: memberships } = await admin
    .from('channel_members')
    .select('channel_id, last_read_at')
    .eq('user_id', user.id);
  if (!memberships?.length) return { success: true, data: { count: 0 } };

  // exclude announcement channels — they have their own section
  const { data: chTypes } = await admin
    .from('channels')
    .select('id, channel_type')
    .in('id', memberships.map(m => m.channel_id));
  const chatChannelIds = new Set(
    (chTypes ?? []).filter(c => c.channel_type !== 'announcement').map(c => c.id),
  );

  const lastRead: Record<string, string | null> = {};
  for (const m of memberships) lastRead[m.channel_id] = m.last_read_at;

  const countableIds = memberships.map(m => m.channel_id).filter(id => chatChannelIds.has(id));
  if (!countableIds.length) return { success: true, data: { count: 0 } };

  // recent messages across my chat channels — counted client-side against last_read_at
  const { data: msgs } = await admin
    .from('messages')
    .select('channel_id, user_id, created_at')
    .in('channel_id', countableIds)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(300);

  let count = 0;
  for (const m of msgs ?? []) {
    if (m.user_id === user.id) continue;
    const read = lastRead[m.channel_id];
    if (!read || m.created_at > read) count++;
  }

  return { success: true, data: { count } };
}

// ── Chat list: my channels with last message preview ──────
export interface ChatListItem extends Channel {
  last_message: string | null;
  last_message_at: string | null;
  last_sender: string | null;
  member_count: number;
  is_dm: boolean;
  display_name: string;
  dm_other: OrgMember | null;
  unread_count: number;
}

export async function getChatList(): Promise<ActionResult<ChatListItem[]>> {
  const { user, orgId } = await getUserContext();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();

  // channels: all public/announcement + private ones I belong to
  const [chRes, myRes] = await Promise.all([
    admin
      .from('channels')
      .select('id, org_id, hospital_id, name, description, channel_type, created_by, is_archived, created_at')
      .eq('org_id', orgId)
      .eq('is_archived', false),
    admin
      .from('channel_members')
      .select('channel_id, last_read_at')
      .eq('user_id', user.id),
  ]);

  if (chRes.error) return { success: false, error: chRes.error.message };
  const myChannelIds = new Set((myRes.data ?? []).map(r => r.channel_id));
  const myLastRead: Record<string, string | null> = {};
  for (const r of myRes.data ?? []) myLastRead[r.channel_id] = r.last_read_at;

  // announcements live in their own section — keep chat list to public/private/direct
  const visible = (chRes.data ?? []).filter(
    c => c.channel_type !== 'announcement' && (c.channel_type === 'public' || myChannelIds.has(c.id)),
  );
  if (!visible.length) return { success: true, data: [] };

  const ids = visible.map(c => c.id);
  const [msgRes, memRes] = await Promise.all([
    admin
      .from('messages')
      .select('channel_id, user_id, content, created_at, author:profiles!user_id(first_name)')
      .in('channel_id', ids)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(300),
    admin
      .from('channel_members')
      .select('channel_id, user_id, member:profiles!user_id(id, first_name, last_name, job_title, avatar_url)')
      .in('channel_id', ids),
  ]);

  // first message per channel = latest (sorted desc); also count unread per channel
  const lastByChannel: Record<string, { content: string; at: string; sender: string | null }> = {};
  const unreadByChannel: Record<string, number> = {};
  for (const m of (msgRes.data ?? []) as any[]) {
    if (!lastByChannel[m.channel_id]) {
      const author = Array.isArray(m.author) ? m.author[0] : m.author;
      lastByChannel[m.channel_id] = { content: m.content, at: m.created_at, sender: author?.first_name ?? null };
    }
    if (m.user_id !== user.id && myChannelIds.has(m.channel_id)) {
      const read = myLastRead[m.channel_id];
      if (!read || m.created_at > read) {
        unreadByChannel[m.channel_id] = (unreadByChannel[m.channel_id] ?? 0) + 1;
      }
    }
  }
  const memberCount: Record<string, number> = {};
  const dmOther: Record<string, OrgMember | null> = {};
  for (const r of (memRes.data ?? []) as any[]) {
    memberCount[r.channel_id] = (memberCount[r.channel_id] ?? 0) + 1;
    // for direct chats, remember the member that isn't me
    if (r.user_id !== user.id) {
      const p = Array.isArray(r.member) ? r.member[0] : r.member;
      if (p && !dmOther[r.channel_id]) {
        dmOther[r.channel_id] = {
          id: p.id,
          name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
          job_title: p.job_title,
          avatar_url: p.avatar_url,
        };
      }
    }
  }

  const items: ChatListItem[] = visible.map(c => {
    const isDm = c.channel_type === 'direct';
    const other = isDm ? (dmOther[c.id] ?? null) : null;
    return {
      ...(c as Channel),
      last_message: lastByChannel[c.id]?.content ?? null,
      last_message_at: lastByChannel[c.id]?.at ?? null,
      last_sender: lastByChannel[c.id]?.sender ?? null,
      member_count: memberCount[c.id] ?? 0,
      is_dm: isDm,
      display_name: isDm ? (other?.name ?? 'Direct chat') : c.name,
      dm_other: other,
      unread_count: unreadByChannel[c.id] ?? 0,
    };
  });

  // most recent activity first, then alphabetical
  items.sort((a, b) => {
    if (a.last_message_at && b.last_message_at) return b.last_message_at.localeCompare(a.last_message_at);
    if (a.last_message_at) return -1;
    if (b.last_message_at) return 1;
    return a.display_name.localeCompare(b.display_name);
  });

  return { success: true, data: items };
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
  parentId?: string | null,
): Promise<ActionResult<Message>> {
  const { user } = await getUserContext();
  if (!user) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();

  // Ensure member before posting
  await ensureMember(channelId, user.id);

  // Insert the message
  const { data: inserted, error: insertError } = await admin
    .from('messages')
    .insert({ channel_id: channelId, user_id: user.id, content: content.trim(), parent_id: parentId ?? null })
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

// ── Post announcement (text + optional photos) ────────────
// stored as JSON in content with content_type 'announcement'
export async function postAnnouncement(
  channelId: string,
  text: string,
  images: string[],
  priority: 'normal' | 'urgent' | 'emergency' = 'normal',
): Promise<ActionResult<Message>> {
  const { user } = await getUserContext();
  if (!user) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();
  await ensureMember(channelId, user.id);

  const needsJson = images.length > 0 || priority !== 'normal';
  const content = needsJson
    ? JSON.stringify({ text: text.trim(), images, priority })
    : text.trim();

  const { data: inserted, error: insertError } = await admin
    .from('messages')
    .insert({
      channel_id: channelId,
      user_id: user.id,
      content,
      content_type: needsJson ? 'announcement' : 'text',
    })
    .select('id, channel_id, user_id, content, content_type, parent_id, is_edited, is_deleted, created_at, updated_at')
    .single();

  if (insertError) return { success: false, error: insertError.message };

  const { data: profile } = await admin
    .from('profiles')
    .select('id, first_name, last_name, avatar_url, job_title')
    .eq('id', user.id)
    .single();

  return {
    success: true,
    data: {
      ...inserted,
      content_type: inserted.content_type ?? 'text',
      parent_id: inserted.parent_id ?? null,
      is_edited: inserted.is_edited ?? false,
      is_deleted: inserted.is_deleted ?? false,
      author: profile ? (profile as MessageAuthor) : null,
    },
  };
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

// ── Edit message (own only) ───────────────────────────────
export async function editMessage(
  messageId: string,
  content: string,
): Promise<ActionResult<Message>> {
  const { user } = await getUserContext();
  if (!user) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();
  const { data: msg } = await admin
    .from('messages')
    .select('user_id')
    .eq('id', messageId)
    .single();

  if (!msg) return { success: false, error: 'Message not found' };
  if (msg.user_id !== user.id) return { success: false, error: 'Cannot edit another user\'s message' };

  const { data, error } = await admin
    .from('messages')
    .update({ content: content.trim(), is_edited: true, updated_at: new Date().toISOString() })
    .eq('id', messageId)
    .select(MSG_SELECT)
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: normaliseAuthor(data as Parameters<typeof normaliseAuthor>[0]) as Message };
}

// ── Get top-level messages (parent_id IS NULL) ────────────
export async function getTopLevelMessages(
  channelId: string,
  limit = 60,
): Promise<ActionResult<Message[]>> {
  const { user } = await getUserContext();
  if (!user) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();
  await ensureMember(channelId, user.id);

  const { data, error } = await admin
    .from('messages')
    .select(MSG_SELECT)
    .eq('channel_id', channelId)
    .is('parent_id', null)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) return { success: false, error: error.message };

  const messages = (data ?? []).map(normaliseAuthor) as Message[];

  admin
    .from('channel_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('channel_id', channelId)
    .eq('user_id', user.id)
    .then(() => {});

  return { success: true, data: messages };
}

// ── Get thread replies for a parent message ────────────────
export async function getThreadReplies(
  channelId: string,
  parentId: string,
): Promise<ActionResult<Message[]>> {
  const { user } = await getUserContext();
  if (!user) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from('messages')
    .select(MSG_SELECT)
    .eq('channel_id', channelId)
    .eq('parent_id', parentId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []).map(normaliseAuthor) as Message[] };
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
