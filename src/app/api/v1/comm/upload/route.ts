import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per image
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

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
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Image too large (max 10 MB)' }, { status: 400 });
  }
  if (!ALLOWED_MIMES.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPG, PNG, GIF or WebP images are allowed' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${profile.org_id}/announcements/${Date.now()}-${safeName}`;

  const { error: storageError } = await admin.storage
    .from('training-content')
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (storageError) {
    return NextResponse.json({ error: `Storage error: ${storageError.message}` }, { status: 500 });
  }

  const { data: publicUrlData } = admin.storage
    .from('training-content')
    .getPublicUrl(storagePath);

  return NextResponse.json({ success: true, url: publicUrlData.publicUrl, path: storagePath });
}
