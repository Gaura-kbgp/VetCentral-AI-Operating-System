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

// ── Seed default documents (CBC, Employee Handbook, OSHA) ────
const DEFAULT_DOCUMENTS: Array<{
  title: string;
  description: string;
  content: string;
  categorySlug: string;
}> = [
  {
    title: 'CBC Procedure',
    description: 'Step-by-step guide for performing and interpreting a Complete Blood Count in veterinary practice.',
    categorySlug: 'sop-library',
    content: `# Complete Blood Count (CBC) Procedure

## Overview
A Complete Blood Count (CBC) is one of the most common diagnostic tests in veterinary medicine. It evaluates red blood cells, white blood cells, and platelets to assess a patient's overall health and detect a wide range of conditions.

---

## Equipment Required
- EDTA (purple-top) blood collection tubes
- Appropriate gauge needles (22–25G depending on species)
- Vacutainer or syringe
- Hematology analyzer (e.g., IDEXX ProCyte Dx or Heska HemaTrue)
- Microscope slides and Wright-Giemsa stain
- Personal protective equipment (gloves, lab coat)

---

## Patient Preparation
1. Confirm patient identity and record weight, species, breed, age, and sex.
2. Review medication history — corticosteroids, chemotherapy agents, and antibiotics may affect results.
3. Note any recent stress, excitement, or physical exertion (can cause physiological leukocytosis).
4. Fasting is not required for a CBC but note feeding status.

---

## Blood Collection Protocol

### Dogs and Cats
- **Site:** Jugular, cephalic, or saphenous vein
- **Volume:** Minimum 0.5 mL; ideal 1–2 mL
- **Tube:** EDTA (purple/lavender top)

### Small Animals (rabbits, ferrets)
- **Site:** Lateral saphenous or jugular
- **Volume:** 0.3–0.5 mL
- **Tube:** Microtainer EDTA

**Steps:**
1. Restrain patient appropriately with minimal stress.
2. Clip and disinfect the venipuncture site with 70% isopropyl alcohol.
3. Insert needle bevel-up at a 15–30° angle.
4. Collect required volume and transfer gently to EDTA tube.
5. Immediately invert tube 8–10 times to mix anticoagulant — do not shake.
6. Label tube with patient ID, date, time, and collector initials.

---

## Sample Processing
1. Process sample within 4 hours of collection at room temperature, or within 24 hours if refrigerated at 4°C.
2. Load sample into hematology analyzer per manufacturer protocol.
3. Prepare a blood smear within 30 minutes of collection for morphology review.

### Blood Smear Preparation
1. Place a small drop of blood near one end of a clean slide.
2. Using a second slide at 30–45°, draw back to touch the drop, then push forward in a smooth motion.
3. Allow to air dry completely.
4. Stain with Diff-Quik or Wright-Giemsa (3-step process).
5. Evaluate under 10× and 100× (oil immersion) objectives.

---

## Reference Ranges — Dogs

| Parameter | Unit | Normal Range |
|-----------|------|--------------|
| RBC | ×10⁶/μL | 5.5 – 8.5 |
| Haemoglobin | g/dL | 12 – 18 |
| PCV/Haematocrit | % | 37 – 55 |
| MCV | fL | 60 – 77 |
| WBC | ×10³/μL | 6 – 17 |
| Neutrophils | ×10³/μL | 3 – 11.5 |
| Lymphocytes | ×10³/μL | 1 – 4.8 |
| Platelets | ×10³/μL | 200 – 500 |

## Reference Ranges — Cats

| Parameter | Unit | Normal Range |
|-----------|------|--------------|
| RBC | ×10⁶/μL | 5 – 10 |
| Haemoglobin | g/dL | 8 – 15 |
| PCV/Haematocrit | % | 24 – 45 |
| WBC | ×10³/μL | 5.5 – 19.5 |
| Neutrophils | ×10³/μL | 2.5 – 12.5 |
| Platelets | ×10³/μL | 300 – 700 |

---

## Interpretation Guidelines

### Anaemia (Low RBC / PCV)
- **Regenerative:** Elevated reticulocytes — blood loss or haemolysis
- **Non-regenerative:** Normal reticulocytes — bone marrow disease, chronic disease, or nutritional deficiency

### Leukocytosis (High WBC)
- Neutrophilia + left shift — acute bacterial infection or inflammation
- Lymphocytosis — viral infection, lymphoma, or excitement (cats)
- Eosinophilia — parasitism, hypersensitivity, or eosinophilic disease

### Thrombocytopenia (Low Platelets)
- Consider immune-mediated thrombocytopenia (ITP), tick-borne disease, DIC
- Platelet clumping on smear may cause falsely low automated counts — always verify on smear

---

## Documentation
Record all results in the patient file immediately after processing. Flag critical values (HCT < 15% or > 65%, WBC < 2 or > 30 ×10³/μL, Platelets < 30 ×10³/μL) and notify the attending clinician immediately.

---

## Quality Control
- Run calibration samples at start of each shift.
- Record QC results in the laboratory logbook.
- Do not report patient results if QC is out of range — notify Laboratory Supervisor.

---

*SOP Version 2.1 | Reviewed annually | Next review: December 2026*`,
  },
  {
    title: 'Employee Handbook',
    description: 'Comprehensive guide covering employment policies, conduct standards, benefits, and workplace expectations for all VetCentral staff.',
    categorySlug: 'employee-handbook',
    content: `# VetCentral Employee Handbook

## Welcome
Welcome to VetCentral. This handbook outlines the policies, expectations, and resources that govern your employment. Please read it carefully and retain it for future reference.

---

## 1. Our Mission & Values

**Mission:** To deliver exceptional veterinary care through a culture of excellence, compassion, and continuous learning.

**Core Values:**
- **Compassion** — for patients, clients, and each other
- **Excellence** — in clinical standards and professional conduct
- **Integrity** — transparent, honest communication at all levels
- **Teamwork** — every role matters; we succeed together
- **Growth** — we invest in your development

---

## 2. Employment Policies

### 2.1 Equal Opportunity
VetCentral is an equal opportunity employer. We do not discriminate on the basis of race, colour, religion, sex, national origin, age, disability, or any other characteristic protected by law.

### 2.2 Probationary Period
All new employees serve a **90-day probationary period**. Successful completion results in confirmation of employment.

### 2.3 Employment Classifications
- **Full-Time:** 37.5–40 hours per week
- **Part-Time:** Less than 37.5 hours per week
- **Casual/Relief:** As-needed basis, no guaranteed hours

---

## 3. Working Hours & Attendance

- Arrive at least 5 minutes before your shift starts.
- Notify your supervisor **minimum 2 hours before shift** if unable to attend.
- Rotas are published at least **2 weeks in advance** via the Master Calendar.
- Overtime requires prior written approval from a Hospital Manager.

---

## 4. Leave Entitlements

### 4.1 Annual Leave
- Full-time: **28 days per year** (including public holidays)
- Requests require **at least 4 weeks' notice**

### 4.2 Sick Leave
- Up to **10 days paid** per year
- Medical certificate required for absences exceeding 3 consecutive days

### 4.3 Parental Leave
- Maternity/Adoption: Statutory entitlement plus Company enhancement
- Paternity/Partner: **2 weeks paid** within 8 weeks of birth/placement

### 4.4 Compassionate Leave
Up to **5 days paid** for bereavement of an immediate family member.

---

## 5. Code of Conduct

- Maintain a clean, professional appearance and wear issued uniforms during clinical shifts.
- Communicate respectfully with clients, colleagues, and external parties.
- Maintain client and patient confidentiality at all times.
- Do not share clinical records or images on social media.
- Personal social media use during working hours is not permitted.

---

## 6. Health & Safety

- Complete mandatory Health & Safety induction on first day.
- Report hazards, incidents, and near-misses immediately.
- Use provided PPE at all times in clinical areas.
- Attend annual H&S refresher training.

---

## 7. Performance & Development

- **Performance Reviews:** At 3 months, 12 months, and annually thereafter.
- **CPD:** Annual CPD allowance outlined in your employment contract. Access courses via the Training Academy.
- **Career Development:** Internal vacancies advertised on the HR portal.

---

## 8. Benefits Summary

- Employee Assistance Programme (EAP) — free, confidential counselling
- Staff discount: **20% on veterinary services** for personal pets
- Pension: Employer contributes **5% of qualifying earnings**
- Study support: **50% contribution** toward relevant qualifications (subject to approval)
- Cycle-to-Work scheme
- Refer-a-Friend bonus: **£500** for successful clinical hire referrals

---

## 9. Key Contacts

| Role | Contact |
|------|---------|
| HR Department | hr@vetcentral.com |
| Health & Safety Officer | safety@vetcentral.com |
| Payroll | payroll@vetcentral.com |
| IT Helpdesk | it@vetcentral.com |

---

*Version 3.0 | Effective: January 2026 | Reviewed annually*`,
  },
  {
    title: 'OSHA Requirements',
    description: 'OSHA compliance requirements for veterinary practices including hazard communication, PPE standards, bloodborne pathogens, and emergency protocols.',
    categorySlug: 'compliance',
    content: `# OSHA Compliance Requirements for Veterinary Practices

## Overview
All VetCentral hospitals must maintain full compliance with Occupational Safety and Health Administration (OSHA) standards. Non-compliance can result in fines, citations, mandatory closure, and personal liability.

---

## 1. Hazard Communication (HazCom / GHS)

### Safety Data Sheets (SDS)
- An SDS must be maintained for **every hazardous chemical** in the workplace.
- SDS binders (physical and digital) must be accessible to all staff in each work area.
- Obtain SDS before any new chemical is introduced.
- Review SDS annually and update when formulations change.

### Labels
All secondary containers must be labelled with:
- Product identity
- Hazard pictograms
- Signal word (Danger / Warning)
- Hazard statements
- Name and contact of responsible party

### Training Requirements
HazCom training is required:
- **On hire** (before handling any chemicals)
- **Annually** as refresher
- **When a new hazard is introduced**

---

## 2. Personal Protective Equipment (PPE)

### Required PPE by Task

| Task | Required PPE |
|------|-------------|
| Handling chemotherapy drugs | Double nitrile gloves, impermeable gown, face shield, N95 respirator |
| Radiology / X-ray | Lead apron, thyroid shield, dosimetry badge |
| Surgery / procedures | Sterile gloves, surgical mask, eye protection, scrubs |
| Anaesthetic gases | Ventilation, scavenging system, waste gas monitor |
| Cleaning / disinfection | Chemical-resistant gloves, eye protection, apron |
| Fractious animal handling | Bite-resistant gloves, forearm protection |

- VetCentral provides all required PPE at **no cost** to employees.
- Damaged or expired PPE must be removed from service immediately.
- Work must **not proceed** without appropriate PPE.

---

## 3. Bloodborne Pathogens (BBP)

### Universal Precautions
Treat all animal blood and body fluids as potentially infectious.
- Use gloves for all patient contact involving blood or body fluids.
- Dispose of all sharps immediately in approved **sharps containers**.
- Never recap needles by hand.
- Sharps containers must not exceed ¾ full before disposal.

### Post-Exposure Protocol
If a needlestick or exposure occurs:
1. Wash affected area immediately with soap and water for at least 15 minutes.
2. Report to Hospital Manager and complete an **Incident Report within 1 hour**.
3. Seek medical evaluation from the designated Occupational Health provider.
4. Document in the OSHA 300 log if applicable.

---

## 4. Radiation Safety

All staff working with X-ray equipment must:
- Hold a current IRMER certificate.
- Wear a personal dosimetry badge during all radiation procedures.
- Never hold patients during X-ray exposure.
- Ensure all persons in the room wear lead protective equipment.
- Submit dosimetry badges for monthly processing.

---

## 5. Anaesthetic Gas Safety

- Operate a scavenging system at all times when gas is flowing.
- Test the scavenging system weekly and log results.
- Check hose connections for leaks before each use.
- Maintain ambient gas monitoring — alarm threshold: **>2 ppm isoflurane**.
- Annual WAG monitoring is mandatory; records retained for **30 years**.

---

## 6. Emergency Action Plan

Each hospital maintains a written EAP covering:
- Fire and evacuation procedures
- Chemical spill response
- Medical emergency (human) response
- Animal escape protocol

### Fire Safety
- Fire exit routes must be clearly posted and never obstructed.
- Fire extinguisher: monthly visual inspection + annual professional inspection.
- Fire drill: **minimum once per year**, results documented.

### Spill Response
- Chemical spill kits in all laboratory and pharmacy areas.
- Cytotoxic spills: don full PPE, use cytotoxic spill kit, seal in yellow cytotoxic bag.
- Mercury spills require specialist contractor — do not attempt self-cleanup.

---

## 7. Recordkeeping Requirements

| Record | Retention Period |
|--------|----------------|
| OSHA 300/300A/301 Injury logs | 5 years |
| HazCom training records | Employment + 3 years |
| Radiation dosimetry | 30 years |
| WAG monitoring | 30 years |
| BBP post-exposure medical records | 30 years post-employment |

---

## 8. Annual Compliance Checklist

- HazCom / GHS training completed for all staff
- SDS binders reviewed and updated
- PPE Hazard Assessments reviewed
- Exposure Control Plan updated
- OSHA 300A Summary posted (Feb 1 – Apr 30)
- Radiation dosimetry badges submitted and reviewed
- WAG ambient monitoring conducted
- Fire drill completed and documented
- Staff BBP training refresher completed

---

*Version 1.4 | Last reviewed: March 2026 | Next review: June 2026*
*Compliance Officer: compliance@vetcentral.com*`,
  },
];

export async function seedDefaultDocuments(): Promise<ActionResult<{ seeded: number }>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();
  if (!profile) return { success: false, error: 'Profile not found' };

  const orgId = profile.org_id;
  const now = new Date().toISOString();
  let seeded = 0;

  const { data: cats } = await supabase
    .from('knowledge_categories')
    .select('id, slug')
    .eq('org_id', orgId);

  const catMap = new Map((cats ?? []).map(c => [c.slug, c.id]));

  for (const doc of DEFAULT_DOCUMENTS) {
    const { data: existing } = await supabase
      .from('knowledge_documents')
      .select('id')
      .eq('org_id', orgId)
      .eq('title', doc.title)
      .maybeSingle();

    if (existing) continue;

    const { data: created, error } = await supabase
      .from('knowledge_documents')
      .insert({
        org_id: orgId,
        title: doc.title,
        description: doc.description,
        content: doc.content,
        category_id: catMap.get(doc.categorySlug) ?? null,
        status: 'published',
        visibility: 'org',
        created_by: user.id,
        updated_by: user.id,
        published_at: now,
        published_by: user.id,
        version: 1,
      })
      .select('id')
      .single();

    if (error || !created) continue;

    await supabase.from('knowledge_versions').insert({
      document_id: created.id,
      version: 1,
      title: doc.title,
      content: doc.content,
      description: doc.description,
      change_summary: 'Initial version',
      created_by: user.id,
    });

    seeded++;
  }

  revalidatePath('/knowledge-base');
  return { success: true, data: { seeded } };
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
