'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';
import { indexTextContent } from '@/lib/ai/rag';
import type {
  ActionResult,
  KBDocument,
  KBCategory,
  KBTag,
  KBVersion,
  KBAttachment,
  CreateKBDocumentInput,
  UpdateKBDocumentInput,
} from '@/types/app';

// ── Helpers ───────────────────────────────────────────────────
function flattenTags(rawTags: unknown[]): KBTag[] {
  return rawTags
    .map((t) => (t as { tag: KBTag }).tag)
    .filter(Boolean) as KBTag[];
}

// ── Get Documents ─────────────────────────────────────────────
export interface KBDocFilters {
  category_id?: string | null;
  hospital_id?: string | null;
  status?: 'draft' | 'published' | 'archived' | 'all' | null;
  search?: string | null;
  archived?: boolean;
}

export async function getKBDocuments(
  filters: KBDocFilters = {}
): Promise<ActionResult<KBDocument[]>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  let query = supabase
    .from('knowledge_documents')
    .select(
      `id, org_id, hospital_id, category_id, title, slug, description, status,
       visibility, created_by, updated_by, published_at, archived_at, view_count,
       version, created_at, updated_at,
       category:knowledge_categories(id,name,slug,color,icon),
       tags:knowledge_document_tags(tag:knowledge_tags(id,name,slug,color))`
    )
    .order('updated_at', { ascending: false });

  if (filters.archived) {
    query = query.eq('status', 'archived');
  } else if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  } else if (!filters.archived) {
    query = query.neq('status', 'archived');
  }

  if (filters.category_id) query = query.eq('category_id', filters.category_id);
  if (filters.hospital_id) query = query.eq('hospital_id', filters.hospital_id);
  if (filters.search) {
    const s = filters.search.trim();
    query = query.or(`title.ilike.%${s}%,description.ilike.%${s}%`);
  }

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };

  const docs = (data ?? []).map((d) => ({
    ...d,
    tags: flattenTags((d.tags ?? []) as unknown[]),
    category: Array.isArray(d.category) ? (d.category[0] ?? null) : d.category,
  })) as KBDocument[];

  return { success: true, data: docs };
}

// ── Get Single Document ───────────────────────────────────────
export async function getKBDocument(id: string): Promise<ActionResult<KBDocument>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('knowledge_documents')
    .select(
      `*, category:knowledge_categories(id,name,slug,color,icon),
       hospital:hospital_id(id,name,color),
       author:created_by(id,first_name,last_name,avatar_url,job_title,department),
       updater:updated_by(id,first_name,last_name,avatar_url,job_title,department),
       tags:knowledge_document_tags(tag:knowledge_tags(id,name,slug,color)),
       attachments:knowledge_attachments(*)`
    )
    .eq('id', id)
    .single();

  if (error) return { success: false, error: error.message };

  // Increment view count (fire-and-forget)
  supabase
    .from('knowledge_documents')
    .update({ view_count: (data.view_count ?? 0) + 1 })
    .eq('id', id)
    .then(() => {});

  const doc = {
    ...data,
    tags: flattenTags((data.tags ?? []) as unknown[]),
    hospital: Array.isArray(data.hospital) ? (data.hospital[0] ?? null) : data.hospital,
    author: Array.isArray(data.author) ? (data.author[0] ?? null) : data.author,
    updater: Array.isArray(data.updater) ? (data.updater[0] ?? null) : data.updater,
    category: Array.isArray(data.category) ? (data.category[0] ?? null) : data.category,
  } as KBDocument;

  return { success: true, data: doc };
}

// ── Create Document ───────────────────────────────────────────
const docSchema = z.object({
  title: z.string().min(1, 'Title required').max(500),
  description: z.string().max(2000).nullable().optional(),
  content: z.string().max(200000).optional(),
  category_id: z.string().uuid().nullable().optional(),
  hospital_id: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  visibility: z.enum(['org', 'hospital', 'restricted']).default('org'),
});

export async function createKBDocument(
  input: CreateKBDocumentInput
): Promise<ActionResult<KBDocument>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const parsed = docSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();
  if (!profile) return { success: false, error: 'Profile not found' };

  const now = new Date().toISOString();
  const isPublished = parsed.data.status === 'published';

  const { data, error } = await supabase
    .from('knowledge_documents')
    .insert({
      ...parsed.data,
      org_id: profile.org_id,
      created_by: user.id,
      updated_by: user.id,
      ...(isPublished ? { published_at: now, published_by: user.id } : {}),
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  // Initial version snapshot
  await supabase.from('knowledge_versions').insert({
    document_id: data.id,
    version: 1,
    title: data.title,
    content: data.content,
    description: data.description,
    change_summary: 'Initial version',
    created_by: user.id,
  });

  // Attach tags
  if (input.tag_ids && input.tag_ids.length > 0) {
    await supabase
      .from('knowledge_document_tags')
      .insert(input.tag_ids.map((tag_id) => ({ document_id: data.id, tag_id })));
  }

  await writeAuditLog({
    org_id: profile.org_id,
    user_id: user.id,
    action: 'knowledge.document.create',
    resource_type: 'knowledge_document',
    resource_id: data.id,
    new_data: { title: data.title, status: data.status },
  });

  // Auto-index published documents for RAG (fire-and-forget)
  if (data.status === 'published' && data.content) {
    indexTextContent(
      data.content,
      'knowledge_document',
      data.id,
      profile.org_id,
      data.hospital_id ?? null,
      { source_title: data.title, source_url: `/knowledge-base/${data.id}` }
    ).catch(() => {});
  }

  revalidatePath('/knowledge-base');
  return { success: true, data: data as KBDocument };
}

// ── Update Document ───────────────────────────────────────────
export async function updateKBDocument(
  id: string,
  input: UpdateKBDocumentInput
): Promise<ActionResult<KBDocument>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: existing } = await supabase
    .from('knowledge_documents')
    .select('org_id, version, title, content, description, status')
    .eq('id', id)
    .single();
  if (!existing) return { success: false, error: 'Document not found' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();
  if (!profile || profile.org_id !== existing.org_id)
    return { success: false, error: 'Unauthorized' };

  const now = new Date().toISOString();
  const newVersion = existing.version + 1;
  const wasJustPublished = existing.status !== 'published' && input.status === 'published';

  // Omit tag_ids from DB payload
  const { tag_ids, change_summary, ...docFields } = input;

  const { data, error } = await supabase
    .from('knowledge_documents')
    .update({
      ...docFields,
      updated_by: user.id,
      updated_at: now,
      version: newVersion,
      ...(wasJustPublished ? { published_at: now, published_by: user.id } : {}),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  // Save version snapshot
  await supabase.from('knowledge_versions').insert({
    document_id: id,
    version: newVersion,
    title: input.title ?? existing.title,
    content: input.content ?? existing.content,
    description: input.description ?? existing.description,
    change_summary: change_summary ?? 'Updated',
    created_by: user.id,
  });

  // Replace tags if provided
  if (tag_ids !== undefined) {
    await supabase.from('knowledge_document_tags').delete().eq('document_id', id);
    if (tag_ids.length > 0) {
      await supabase
        .from('knowledge_document_tags')
        .insert(tag_ids.map((tag_id) => ({ document_id: id, tag_id })));
    }
  }

  await writeAuditLog({
    org_id: profile.org_id,
    user_id: user.id,
    action: 'knowledge.document.update',
    resource_type: 'knowledge_document',
    resource_id: id,
    new_data: { title: data.title, status: data.status, version: newVersion },
  });

  // Re-index if published (fire-and-forget)
  if (data.status === 'published' && data.content) {
    indexTextContent(
      data.content,
      'knowledge_document',
      data.id,
      profile.org_id,
      data.hospital_id ?? null,
      { source_title: data.title, source_url: `/knowledge-base/${data.id}` }
    ).catch(() => {});
  }

  revalidatePath('/knowledge-base');
  revalidatePath(`/knowledge-base/${id}`);
  return { success: true, data: data as KBDocument };
}

// ── Archive (soft delete) ─────────────────────────────────────
export async function archiveKBDocument(id: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: existing } = await supabase
    .from('knowledge_documents')
    .select('org_id, title')
    .eq('id', id)
    .single();
  if (!existing) return { success: false, error: 'Document not found' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();
  if (!profile || profile.org_id !== existing.org_id)
    return { success: false, error: 'Unauthorized' };

  const { error } = await supabase
    .from('knowledge_documents')
    .update({ status: 'archived', archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    org_id: profile.org_id,
    user_id: user.id,
    action: 'knowledge.document.archive',
    resource_type: 'knowledge_document',
    resource_id: id,
    old_data: { title: existing.title },
  });

  revalidatePath('/knowledge-base');
  return { success: true, data: undefined };
}

// ── Restore from Archive ──────────────────────────────────────
export async function restoreKBDocument(id: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: existing } = await supabase
    .from('knowledge_documents')
    .select('org_id, title')
    .eq('id', id)
    .single();
  if (!existing) return { success: false, error: 'Document not found' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();
  if (!profile || profile.org_id !== existing.org_id)
    return { success: false, error: 'Unauthorized' };

  const { error } = await supabase
    .from('knowledge_documents')
    .update({ status: 'draft', archived_at: null, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    org_id: profile.org_id,
    user_id: user.id,
    action: 'knowledge.document.restore',
    resource_type: 'knowledge_document',
    resource_id: id,
    new_data: { title: existing.title },
  });

  revalidatePath('/knowledge-base');
  return { success: true, data: undefined };
}

// ── Publish Document ──────────────────────────────────────────
export async function publishKBDocument(id: string): Promise<ActionResult<KBDocument>> {
  return updateKBDocument(id, { status: 'published', change_summary: 'Published' });
}

// ── Get Categories ────────────────────────────────────────────
export async function getKBCategories(): Promise<ActionResult<KBCategory[]>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('knowledge_categories')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as KBCategory[] };
}

// ── Seed default categories for org ──────────────────────────
const DEFAULT_CATEGORIES = [
  { name: 'SOP Library',          slug: 'sop-library',          icon: 'clipboard-list', color: '#3B82F6', sort_order: 1 },
  { name: 'HR Policies',          slug: 'hr-policies',          icon: 'users',          color: '#10B981', sort_order: 2 },
  { name: 'Training Materials',   slug: 'training-materials',   icon: 'graduation-cap', color: '#8B5CF6', sort_order: 3 },
  { name: 'Compliance',           slug: 'compliance',           icon: 'shield-check',   color: '#F59E0B', sort_order: 4 },
  { name: 'Operations',           slug: 'operations',           icon: 'settings',       color: '#6366F1', sort_order: 5 },
  { name: 'Hospital Procedures',  slug: 'hospital-procedures',  icon: 'building-2',     color: '#EC4899', sort_order: 6 },
  { name: 'Employee Handbook',    slug: 'employee-handbook',    icon: 'book-open',      color: '#14B8A6', sort_order: 7 },
  { name: 'Forms & Templates',    slug: 'forms-templates',      icon: 'file-text',      color: '#F97316', sort_order: 8 },
] as const;

export async function seedKBCategories(): Promise<ActionResult<KBCategory[]>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();
  if (!profile) return { success: false, error: 'Profile not found' };

  const { error } = await supabase.from('knowledge_categories').upsert(
    DEFAULT_CATEGORIES.map((c) => ({ ...c, org_id: profile.org_id, is_system: true })),
    { onConflict: 'org_id,slug', ignoreDuplicates: true }
  );

  if (error) return { success: false, error: error.message };

  const { data } = await supabase
    .from('knowledge_categories')
    .select('*')
    .eq('org_id', profile.org_id)
    .order('sort_order');

  return { success: true, data: (data ?? []) as KBCategory[] };
}

// ── Tags ──────────────────────────────────────────────────────
export async function getKBTags(): Promise<ActionResult<KBTag[]>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('knowledge_tags')
    .select('*')
    .order('name');

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as KBTag[] };
}

export async function getOrCreateKBTag(name: string): Promise<ActionResult<KBTag>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();
  if (!profile) return { success: false, error: 'Profile not found' };

  const slug = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  const { data: existing } = await supabase
    .from('knowledge_tags')
    .select('*')
    .eq('org_id', profile.org_id)
    .eq('slug', slug)
    .single();

  if (existing) return { success: true, data: existing as KBTag };

  const { data, error } = await supabase
    .from('knowledge_tags')
    .insert({ org_id: profile.org_id, name: name.trim(), slug })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as KBTag };
}

// ── Version History ───────────────────────────────────────────
export async function getKBVersions(
  documentId: string
): Promise<ActionResult<KBVersion[]>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('knowledge_versions')
    .select(
      `*, author:created_by(id,first_name,last_name,avatar_url,job_title,department)`
    )
    .eq('document_id', documentId)
    .order('version', { ascending: false });

  if (error) return { success: false, error: error.message };

  const versions = (data ?? []).map((v) => ({
    ...v,
    author: Array.isArray(v.author) ? (v.author[0] ?? null) : v.author,
  })) as KBVersion[];

  return { success: true, data: versions };
}

export async function rollbackKBVersion(
  documentId: string,
  versionId: string
): Promise<ActionResult<KBDocument>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const [{ data: ver }, { data: doc }] = await Promise.all([
    supabase.from('knowledge_versions').select('*').eq('id', versionId).single(),
    supabase.from('knowledge_documents').select('org_id, version').eq('id', documentId).single(),
  ]);

  if (!ver || !doc) return { success: false, error: 'Not found' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();
  if (!profile || profile.org_id !== doc.org_id)
    return { success: false, error: 'Unauthorized' };

  const newVer = doc.version + 1;

  const { data, error } = await supabase
    .from('knowledge_documents')
    .update({
      title: ver.title,
      content: ver.content,
      description: ver.description,
      version: newVer,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  await supabase.from('knowledge_versions').insert({
    document_id: documentId,
    version: newVer,
    title: ver.title,
    content: ver.content,
    description: ver.description,
    change_summary: `Rolled back to version ${ver.version}`,
    created_by: user.id,
  });

  await writeAuditLog({
    org_id: profile.org_id,
    user_id: user.id,
    action: 'knowledge.document.rollback',
    resource_type: 'knowledge_document',
    resource_id: documentId,
    new_data: { version: newVer, rolled_back_to: ver.version },
  });

  revalidatePath('/knowledge-base');
  revalidatePath(`/knowledge-base/${documentId}`);
  return { success: true, data: data as KBDocument };
}

// ── Attachments ───────────────────────────────────────────────
export async function saveKBAttachment(
  documentId: string,
  meta: { file_name: string; file_type: string; file_size: number; storage_path: string }
): Promise<ActionResult<KBAttachment>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();
  if (!profile) return { success: false, error: 'Profile not found' };

  const { data, error } = await supabase
    .from('knowledge_attachments')
    .insert({ document_id: documentId, org_id: profile.org_id, ...meta, uploaded_by: user.id })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath(`/knowledge-base/${documentId}`);
  return { success: true, data: data as KBAttachment };
}

export async function deleteKBAttachment(id: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: att } = await supabase
    .from('knowledge_attachments')
    .select('storage_path, org_id, document_id')
    .eq('id', id)
    .single();
  if (!att) return { success: false, error: 'Attachment not found' };

  await supabase.storage.from('knowledge-base').remove([att.storage_path]);

  const { error } = await supabase.from('knowledge_attachments').delete().eq('id', id);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/knowledge-base/${att.document_id}`);
  return { success: true, data: undefined };
}

// ── Get attachment public URL ─────────────────────────────────
export async function getKBAttachmentUrl(storagePath: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.storage
    .from('knowledge-base')
    .createSignedUrl(storagePath, 3600);
  return data?.signedUrl ?? null;
}

// ── Full-text search ──────────────────────────────────────────
export async function searchKBDocuments(
  query: string
): Promise<ActionResult<KBDocument[]>> {
  if (!query.trim()) return { success: true, data: [] };
  return getKBDocuments({ search: query });
}
