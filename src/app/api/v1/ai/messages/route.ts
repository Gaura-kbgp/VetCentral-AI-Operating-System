import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get('conversation_id');

  if (!conversationId) {
    return NextResponse.json({ error: 'conversation_id required' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();

  // Verify conversation belongs to user
  const { data: conv } = await admin
    .from('ai_conversations')
    .select('id, user_id')
    .eq('id', conversationId)
    .single();

  if (!conv || conv.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: messages, error: msgError } = await admin
    .from('ai_messages')
    .select('id, role, content, source_chunks, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 });

  return NextResponse.json({ messages: messages ?? [] });
}
