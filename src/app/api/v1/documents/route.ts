import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';

const MAX_FILE_SIZE = 524288000; // 500 MB

const ALLOWED_TYPES: Record<string, boolean> = {
  'application/pdf': true,
  'application/msword': true,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
  'application/vnd.ms-excel': true,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true,
  'application/vnd.ms-powerpoint': true,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': true,
  'text/plain': true,
  'text/csv': true,
  'image/jpeg': true,
  'image/png': true,
  'image/gif': true,
  'image/webp': true,
  'image/svg+xml': true,
  'video/mp4': true,
  'video/webm': true,
  'application/zip': true,
  'application/x-zip-compressed': true,
};

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'Profile not found' }, { status: 401 });

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }); }

  const file       = formData.get('file') as File | null;
  const documentId = formData.get('documentId') as string | null;

  if (!file)       return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'File too large (max 500 MB)' }, { status: 400 });
  if (!ALLOWED_TYPES[file.type]) return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 });

  const safeName    = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${profile.org_id}/${documentId}/${Date.now()}-${safeName}`;
  const buffer      = Buffer.from(await file.arrayBuffer());

  const { error: storageError } = await admin.storage
    .from('documents')
    .upload(storagePath, buffer, { contentType: file.type || 'application/octet-stream', upsert: false });

  if (storageError) return NextResponse.json({ error: `Storage: ${storageError.message}` }, { status: 500 });

  const { data: attData, error: attError } = await admin.from('knowledge_attachments').insert({
    document_id:  documentId,
    org_id:       profile.org_id,
    file_name:    file.name,
    file_type:    file.type,
    file_size:    file.size,
    storage_path: storagePath,
    uploaded_by:  user.id,
  }).select('id').single();

  if (attError) {
    await admin.storage.from('documents').remove([storagePath]);
    return NextResponse.json({ error: attError.message }, { status: 500 });
  }

  const { data: urlData } = admin.storage.from('documents').getPublicUrl(storagePath);

  return NextResponse.json({
    success: true,
    attachmentId: attData.id,
    storagePath,
    publicUrl: urlData.publicUrl,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
  });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const storagePath = searchParams.get('path');
  if (!storagePath) return NextResponse.json({ error: 'path required' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { error: removeError } = await admin.storage.from('documents').remove([storagePath]);
  if (removeError) return NextResponse.json({ error: removeError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
