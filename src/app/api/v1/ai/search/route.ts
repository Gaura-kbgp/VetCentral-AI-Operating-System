import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { embedText, searchChunks } from '@/lib/ai/rag';
import { z } from 'zod';

const SearchSchema = z.object({
  query: z.string().min(1).max(500),
  hospital_id: z.string().uuid().optional().nullable(),
  limit: z.number().int().min(1).max(20).default(8),
});

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = SearchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 422 });
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const embedding = await embedText(parsed.data.query);
    const chunks = await searchChunks(
      embedding,
      profile.org_id,
      parsed.data.hospital_id ?? null,
      parsed.data.limit
    );

    return NextResponse.json({ results: chunks });
  } catch (err) {
    console.error('Search error:', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
