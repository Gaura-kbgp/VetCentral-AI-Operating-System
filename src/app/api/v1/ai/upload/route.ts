import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { indexTextContent } from '@/lib/ai/rag';
import {
  extractText,
  getFileTypeFromName,
  MAX_FILE_SIZE,
} from '@/lib/ai/text-extractor';

// Mode 2: upload → extract → chunk → embed → store in pgvector KB
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const hospitalId = (formData.get('hospital_id') as string | null) || null;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 15 MB)' }, { status: 400 });
  }

  const fileType = getFileTypeFromName(file.name);
  if (!fileType) {
    return NextResponse.json({
      error: 'Unsupported file type. Supported: PDF, DOCX, TXT, CSV, XLSX, PNG, JPG, WEBP, GIF',
    }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `ai-uploads/${profile.org_id}/${user.id}/${Date.now()}-${safeName}`;

  // Upload raw file to storage
  const { error: storageError } = await admin.storage
    .from('knowledge-base')
    .upload(storagePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

  if (storageError) {
    return NextResponse.json({ error: `Storage error: ${storageError.message}` }, { status: 500 });
  }

  // Create upload record
  const { data: uploadRecord, error: dbError } = await admin
    .from('ai_uploads')
    .insert({
      org_id: profile.org_id,
      hospital_id: hospitalId,
      uploaded_by: user.id,
      file_name: file.name,
      file_type: fileType,
      file_size: file.size,
      storage_path: storagePath,
      status: 'processing',
    })
    .select()
    .single();

  if (dbError || !uploadRecord) {
    return NextResponse.json({ error: 'Failed to save upload record' }, { status: 500 });
  }

  // Extract text
  let textContent = '';
  try {
    textContent = await extractText(buffer, fileType, file.name, file.type || '');
  } catch (extractErr) {
    const msg = extractErr instanceof Error ? extractErr.message : String(extractErr);
    await admin.from('ai_uploads')
      .update({ status: 'failed', error_text: msg })
      .eq('id', uploadRecord.id);
    return NextResponse.json({ error: `Text extraction failed: ${msg}` }, { status: 422 });
  }

  if (!textContent.trim()) {
    await admin.from('ai_uploads')
      .update({ status: 'failed', error_text: 'No text content found in file' })
      .eq('id', uploadRecord.id);
    return NextResponse.json({ error: 'No readable text found in file' }, { status: 422 });
  }

  // Chunk → embed → store in pgvector
  try {
    await indexTextContent(
      textContent,
      'ai_upload',
      uploadRecord.id,
      profile.org_id,
      hospitalId,
      { source_title: file.name, file_type: fileType, upload_id: uploadRecord.id },
    );

    const { count } = await admin
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', uploadRecord.id);

    const processedAt = new Date().toISOString();
    await admin.from('ai_uploads')
      .update({ status: 'indexed', chunk_count: count ?? 0, processed_at: processedAt })
      .eq('id', uploadRecord.id);

    return NextResponse.json({
      success: true,
      upload: { ...uploadRecord, status: 'indexed', chunk_count: count ?? 0, processed_at: processedAt },
    });
  } catch (indexErr) {
    const msg = indexErr instanceof Error ? indexErr.message : String(indexErr);
    await admin.from('ai_uploads')
      .update({ status: 'failed', error_text: msg })
      .eq('id', uploadRecord.id);
    return NextResponse.json({ error: `Indexing failed: ${msg}` }, { status: 500 });
  }
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ uploads: [] });

  const { data } = await admin
    .from('ai_uploads')
    .select('id, file_name, file_type, file_size, status, chunk_count, created_at, processed_at')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json({ uploads: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: upload } = await admin
    .from('ai_uploads')
    .select('uploaded_by, storage_path')
    .eq('id', id)
    .single();

  if (!upload || upload.uploaded_by !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await admin.storage.from('knowledge-base').remove([upload.storage_path]);
  await admin.from('ai_uploads').delete().eq('id', id);

  return NextResponse.json({ success: true });
}
