import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';

const MAX_FILE_SIZE = 209715200; // 200 MB

const ALLOWED_TYPES: Record<string, string[]> = {
  pdf:   ['application/pdf'],
  docx:  ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo'],
  photo: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
};

function detectContentType(mimeType: string): string | null {
  for (const [ct, mimes] of Object.entries(ALLOWED_TYPES)) {
    if (mimes.includes(mimeType)) return ct;
  }
  return null;
}

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
  const courseId = formData.get('courseId') as string | null;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!courseId) return NextResponse.json({ error: 'courseId required' }, { status: 400 });

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 200 MB)' }, { status: 400 });
  }

  const detectedContentType = detectContentType(file.type);
  if (!detectedContentType) {
    return NextResponse.json({
      error: 'Unsupported file type. Supported: PDF, DOCX, MP4, WebM, MOV, AVI, JPG, PNG, GIF, WebP',
    }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${profile.org_id}/${courseId}/${Date.now()}-${safeName}`;

  const { error: storageError } = await admin.storage
    .from('training-content')
    .upload(storagePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

  if (storageError) {
    return NextResponse.json({ error: `Storage error: ${storageError.message}` }, { status: 500 });
  }

  const { data: publicUrlData } = admin.storage
    .from('training-content')
    .getPublicUrl(storagePath);

  return NextResponse.json({
    success: true,
    url: publicUrlData.publicUrl,
    path: storagePath,
    fileName: file.name,
    fileSize: file.size,
    contentType: detectedContentType,
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
  const { error: removeError } = await admin.storage
    .from('training-content')
    .remove([storagePath]);

  if (removeError) {
    return NextResponse.json({ error: removeError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
