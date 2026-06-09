'use server';

import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types/app';
import { revalidatePath } from 'next/cache';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface DocCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  icon: string;
  sort_order: number;
  docCount?: number;
}

export interface DocTag {
  id: string;
  name: string;
  slug: string;
  color: string;
}

export interface DocVersion {
  id: string;
  version: number;
  title: string;
  change_summary: string | null;
  created_at: string;
  createdBy: string | null;
}

export interface DocAttachment {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  public_url: string;
  created_at: string;
  uploadedBy: string | null;
}

export interface Document {
  id: string;
  org_id: string;
  hospital_id: string | null;
  category_id: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  title: string;
  slug: string | null;
  description: string | null;
  content: string;
  status: 'draft' | 'published' | 'archived';
  visibility: 'org' | 'hospital' | 'restricted';
  view_count: number;
  version: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  tags: DocTag[];
  attachments?: DocAttachment[];
  versions?: DocVersion[];
  hospitalName?: string | null;
}

export interface DocumentFilters {
  search?: string;
  categoryId?: string;
  status?: string;
  hospitalId?: string;
  tagId?: string;
  visibility?: string;
  sortBy?: 'updated_at' | 'created_at' | 'title' | 'view_count';
  sortDir?: 'asc' | 'desc';
}

export interface CreateDocumentInput {
  title: string;
  description?: string;
  content?: string;
  category_id?: string;
  hospital_id?: string;
  status?: 'draft' | 'published' | 'archived';
  visibility?: 'org' | 'hospital' | 'restricted';
  tag_ids?: string[];
}

// ─────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────

async function getUserAndOrg() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, orgId: null, admin: createSupabaseAdminClient() };
  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
  return { user, orgId: profile?.org_id ?? null, admin };
}

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ─────────────────────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────────────────────

export async function getDocCategories(): Promise<ActionResult<DocCategory[]>> {
  const { user, orgId, admin } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const [catRes, countRes] = await Promise.all([
    admin.from('knowledge_categories').select('id,name,slug,description,color,icon,sort_order').eq('org_id', orgId).order('sort_order'),
    admin.from('knowledge_documents').select('category_id').eq('org_id', orgId).eq('status', 'published'),
  ]);

  const counts: Record<string, number> = {};
  for (const d of countRes.data ?? []) {
    if (d.category_id) counts[d.category_id] = (counts[d.category_id] ?? 0) + 1;
  }

  const cats: DocCategory[] = (catRes.data ?? []).map(c => ({
    id: c.id, name: c.name, slug: c.slug,
    description: c.description ?? null,
    color: c.color, icon: c.icon, sort_order: c.sort_order,
    docCount: counts[c.id] ?? 0,
  }));

  return { success: true, data: cats };
}

export async function getDocTags(): Promise<ActionResult<DocTag[]>> {
  const { user, orgId, admin } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('knowledge_tags')
    .select('id,name,slug,color')
    .eq('org_id', orgId)
    .order('name');

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as DocTag[] };
}

// ─────────────────────────────────────────────────────────────
// Documents List
// ─────────────────────────────────────────────────────────────

export async function getDocuments(filters: DocumentFilters = {}): Promise<ActionResult<Document[]>> {
  const { user, orgId, admin } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  let q = admin
    .from('knowledge_documents')
    .select(`
      id, org_id, hospital_id, category_id, title, slug, description,
      content, status, visibility, view_count, version,
      created_at, updated_at, published_at,
      category:category_id(name, color),
      creator:created_by(first_name, last_name),
      updater:updated_by(first_name, last_name),
      hospital:hospital_id(name),
      tags:knowledge_document_tags(tag:tag_id(id, name, slug, color))
    `)
    .eq('org_id', orgId);

  if (filters.status) q = q.eq('status', filters.status);
  else q = q.neq('status', 'archived');

  if (filters.categoryId) q = q.eq('category_id', filters.categoryId);
  if (filters.hospitalId) q = q.eq('hospital_id', filters.hospitalId);
  if (filters.visibility) q = q.eq('visibility', filters.visibility);

  const sortCol = filters.sortBy ?? 'updated_at';
  const sortAsc = filters.sortDir === 'asc';
  q = q.order(sortCol, { ascending: sortAsc, nullsFirst: false });
  q = q.limit(200);

  const { data, error } = await q;
  if (error) return { success: false, error: error.message };

  let docs: Document[] = (data ?? []).map((d: any) => {
    const cat   = Array.isArray(d.category) ? d.category[0] : d.category;
    const cr    = Array.isArray(d.creator)  ? d.creator[0]  : d.creator;
    const up    = Array.isArray(d.updater)  ? d.updater[0]  : d.updater;
    const hosp  = Array.isArray(d.hospital) ? d.hospital[0] : d.hospital;
    const tags  = (d.tags ?? []).map((t: any) => {
      const tg = Array.isArray(t.tag) ? t.tag[0] : t.tag;
      return tg ? { id: tg.id, name: tg.name, slug: tg.slug, color: tg.color } : null;
    }).filter(Boolean) as DocTag[];
    return {
      id: d.id, org_id: d.org_id, hospital_id: d.hospital_id,
      category_id: d.category_id,
      categoryName:  cat?.name  ?? null,
      categoryColor: cat?.color ?? null,
      title: d.title, slug: d.slug ?? null,
      description: d.description ?? null,
      content: d.content ?? '',
      status: d.status, visibility: d.visibility,
      view_count: d.view_count ?? 0, version: d.version ?? 1,
      created_at: d.created_at, updated_at: d.updated_at,
      published_at: d.published_at ?? null,
      createdBy: cr ? `${cr.first_name} ${cr.last_name}` : null,
      updatedBy:  up ? `${up.first_name} ${up.last_name}` : null,
      hospitalName: hosp?.name ?? null,
      tags,
    };
  });

  if (filters.search) {
    const s = filters.search.toLowerCase();
    docs = docs.filter(d =>
      d.title.toLowerCase().includes(s) ||
      (d.description ?? '').toLowerCase().includes(s) ||
      (d.content ?? '').toLowerCase().includes(s)
    );
  }

  if (filters.tagId) {
    docs = docs.filter(d => d.tags.some(t => t.id === filters.tagId));
  }

  return { success: true, data: docs };
}

// ─────────────────────────────────────────────────────────────
// Single Document
// ─────────────────────────────────────────────────────────────

export async function getDocument(id: string): Promise<ActionResult<Document & { attachments: DocAttachment[]; versions: DocVersion[] }>> {
  const { user, orgId, admin } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const [docRes, attRes, verRes] = await Promise.all([
    admin.from('knowledge_documents').select(`
      id, org_id, hospital_id, category_id, title, slug, description,
      content, status, visibility, view_count, version,
      created_at, updated_at, published_at,
      category:category_id(name, color),
      creator:created_by(first_name, last_name),
      updater:updated_by(first_name, last_name),
      hospital:hospital_id(name),
      tags:knowledge_document_tags(tag:tag_id(id, name, slug, color))
    `).eq('id', id).single(),
    admin.from('knowledge_attachments').select('id,file_name,file_type,file_size,storage_path,created_at,uploader:uploaded_by(first_name,last_name)').eq('document_id', id).order('created_at'),
    admin.from('knowledge_versions').select('id,version,title,change_summary,created_at,creator:created_by(first_name,last_name)').eq('document_id', id).order('version', { ascending: false }),
  ]);

  if (docRes.error) return { success: false, error: docRes.error.message };

  // Increment view count
  await admin.from('knowledge_documents').update({ view_count: (docRes.data.view_count ?? 0) + 1 }).eq('id', id);

  const d = docRes.data as any;
  const cat  = Array.isArray(d.category) ? d.category[0] : d.category;
  const cr   = Array.isArray(d.creator)  ? d.creator[0]  : d.creator;
  const up   = Array.isArray(d.updater)  ? d.updater[0]  : d.updater;
  const hosp = Array.isArray(d.hospital) ? d.hospital[0] : d.hospital;
  const tags = (d.tags ?? []).map((t: any) => {
    const tg = Array.isArray(t.tag) ? t.tag[0] : t.tag;
    return tg ? { id: tg.id, name: tg.name, slug: tg.slug, color: tg.color } : null;
  }).filter(Boolean) as DocTag[];

  const attachments: DocAttachment[] = (attRes.data ?? []).map((a: any) => {
    const up2 = Array.isArray(a.uploader) ? a.uploader[0] : a.uploader;
    const { data: urlData } = admin.storage.from('documents').getPublicUrl(a.storage_path);
    return {
      id: a.id, file_name: a.file_name, file_type: a.file_type,
      file_size: a.file_size, storage_path: a.storage_path,
      public_url: urlData?.publicUrl ?? '',
      created_at: a.created_at,
      uploadedBy: up2 ? `${up2.first_name} ${up2.last_name}` : null,
    };
  });

  const versions: DocVersion[] = (verRes.data ?? []).map((v: any) => {
    const vc = Array.isArray(v.creator) ? v.creator[0] : v.creator;
    return {
      id: v.id, version: v.version, title: v.title,
      change_summary: v.change_summary ?? null,
      created_at: v.created_at,
      createdBy: vc ? `${vc.first_name} ${vc.last_name}` : null,
    };
  });

  return {
    success: true,
    data: {
      id: d.id, org_id: d.org_id, hospital_id: d.hospital_id,
      category_id: d.category_id,
      categoryName:  cat?.name  ?? null,
      categoryColor: cat?.color ?? null,
      title: d.title, slug: d.slug ?? null,
      description: d.description ?? null,
      content: d.content ?? '',
      status: d.status, visibility: d.visibility,
      view_count: d.view_count ?? 0, version: d.version ?? 1,
      created_at: d.created_at, updated_at: d.updated_at,
      published_at: d.published_at ?? null,
      createdBy: cr ? `${cr.first_name} ${cr.last_name}` : null,
      updatedBy:  up ? `${up.first_name} ${up.last_name}` : null,
      hospitalName: hosp?.name ?? null,
      tags, attachments, versions,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Create / Update / Delete
// ─────────────────────────────────────────────────────────────

export async function createDocument(input: CreateDocumentInput): Promise<ActionResult<{ id: string }>> {
  const { user, orgId, admin } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const slug = slugify(input.title);
  const now = new Date().toISOString();

  const { data, error } = await admin.from('knowledge_documents').insert({
    org_id: orgId,
    hospital_id: input.hospital_id ?? null,
    category_id: input.category_id ?? null,
    title: input.title,
    slug,
    description: input.description ?? null,
    content: input.content ?? '',
    status: input.status ?? 'draft',
    visibility: input.visibility ?? 'org',
    created_by: user.id,
    updated_by: user.id,
    published_at: input.status === 'published' ? now : null,
    published_by: input.status === 'published' ? user.id : null,
  }).select('id').single();

  if (error) return { success: false, error: error.message };

  if (input.tag_ids?.length) {
    await admin.from('knowledge_document_tags').insert(
      input.tag_ids.map(tag_id => ({ document_id: data.id, tag_id }))
    );
  }

  revalidatePath('/documents');
  return { success: true, data: { id: data.id } };
}

export async function updateDocument(
  id: string,
  input: Partial<CreateDocumentInput> & { change_summary?: string }
): Promise<ActionResult<void>> {
  const { user, orgId, admin } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data: existing } = await admin.from('knowledge_documents').select('version, title, content, status').eq('id', id).single();
  if (!existing) return { success: false, error: 'Document not found' };

  const newVersion = (existing.version ?? 1) + 1;
  const now = new Date().toISOString();

  await admin.from('knowledge_versions').insert({
    document_id: id,
    version: existing.version ?? 1,
    title: existing.title,
    content: existing.content,
    change_summary: input.change_summary ?? 'Updated',
    created_by: user.id,
  });

  const updates: Record<string, unknown> = {
    updated_by: user.id,
    updated_at: now,
    version: newVersion,
  };
  if (input.title       !== undefined) updates.title       = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.content     !== undefined) updates.content     = input.content;
  if (input.category_id !== undefined) updates.category_id = input.category_id;
  if (input.hospital_id !== undefined) updates.hospital_id = input.hospital_id;
  if (input.visibility  !== undefined) updates.visibility  = input.visibility;
  if (input.status !== undefined) {
    updates.status = input.status;
    if (input.status === 'published' && existing.status !== 'published') {
      updates.published_at = now;
      updates.published_by = user.id;
    }
  }

  const { error } = await admin.from('knowledge_documents').update(updates).eq('id', id);
  if (error) return { success: false, error: error.message };

  if (input.tag_ids !== undefined) {
    await admin.from('knowledge_document_tags').delete().eq('document_id', id);
    if (input.tag_ids.length > 0) {
      await admin.from('knowledge_document_tags').insert(
        input.tag_ids.map(tag_id => ({ document_id: id, tag_id }))
      );
    }
  }

  revalidatePath('/documents');
  return { success: true, data: undefined };
}

export async function deleteDocument(id: string): Promise<ActionResult<void>> {
  const { user, orgId, admin } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data: atts } = await admin.from('knowledge_attachments').select('storage_path').eq('document_id', id);
  if (atts?.length) {
    await admin.storage.from('documents').remove(atts.map(a => a.storage_path));
  }

  const { error } = await admin.from('knowledge_documents').delete().eq('id', id);
  if (error) return { success: false, error: error.message };

  revalidatePath('/documents');
  return { success: true, data: undefined };
}

export async function publishDocument(id: string): Promise<ActionResult<void>> {
  return updateDocument(id, { status: 'published', change_summary: 'Published' });
}

export async function archiveDocument(id: string): Promise<ActionResult<void>> {
  return updateDocument(id, { status: 'archived', change_summary: 'Archived' });
}

// ─────────────────────────────────────────────────────────────
// Tags CRUD
// ─────────────────────────────────────────────────────────────

export async function createTag(name: string, color = '#6366F1'): Promise<ActionResult<DocTag>> {
  const { user, orgId, admin } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const slug = slugify(name);
  const { data, error } = await admin.from('knowledge_tags').insert({ org_id: orgId, name, slug, color }).select('id,name,slug,color').single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as DocTag };
}

// ─────────────────────────────────────────────────────────────
// File Upload / Delete
// ─────────────────────────────────────────────────────────────

export async function deleteDocumentAttachment(attachmentId: string): Promise<ActionResult<void>> {
  const { user, orgId, admin } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data: att } = await admin.from('knowledge_attachments').select('storage_path').eq('id', attachmentId).single();
  if (!att) return { success: false, error: 'Attachment not found' };

  await admin.storage.from('documents').remove([att.storage_path]);
  await admin.from('knowledge_attachments').delete().eq('id', attachmentId);

  revalidatePath('/documents');
  return { success: true, data: undefined };
}
