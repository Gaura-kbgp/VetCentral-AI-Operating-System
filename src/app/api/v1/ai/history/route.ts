import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();

  const { data: conversations, error: convError } = await admin
    .from('ai_conversations')
    .select('id, title, created_at, updated_at, hospital_id')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (convError) return NextResponse.json({ error: convError.message }, { status: 500 });

  return NextResponse.json({ conversations: conversations ?? [] });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();

  if (id) {
    await admin.from('ai_conversations').delete().eq('id', id).eq('user_id', user.id);
  } else {
    await admin.from('ai_conversations').delete().eq('user_id', user.id);
  }

  return NextResponse.json({ success: true });
}
