import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import Replicate from 'replicate';
import { z } from 'zod';

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! });

const QuerySchema = z.object({
  query:    z.string().min(1).max(1000),
  events:   z.array(z.object({
    id:         z.string(),
    title:      z.string(),
    event_type: z.string(),
    start_time: z.string(),
    end_time:   z.string(),
    location:   z.string().nullable().optional(),
    hospital:   z.string().nullable().optional(),
    is_all_day: z.boolean().optional(),
  })).max(500),
  today: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parsed = QuerySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 422 });
    }

    const { query, events, today } = parsed.data;

    const eventsContext = events
      .map(e => {
        const start = new Date(e.start_time);
        const end   = new Date(e.end_time);
        const dateStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const timeStr = e.is_all_day
          ? 'All day'
          : `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
        const loc = e.location ? ` @ ${e.location}` : '';
        const hosp = e.hospital ? ` [${e.hospital}]` : '';
        return `• ${e.title} | ${e.event_type.replace(/_/g,' ')} | ${dateStr} ${timeStr}${loc}${hosp}`;
      })
      .join('\n');

    const systemPrompt = `You are the Master Calendar Assistant for a veterinary hospital group (Town & Country, Columbia Pike, Clifton).
Today is ${today}.

Your job is to answer questions about scheduled events concisely and helpfully.
Format responses clearly — when listing events, use short bullet points.
If no events match, say so briefly and suggest checking the calendar directly.
Never fabricate events not in the provided data.
Keep answers under 200 words unless a list requires more.`;

    const prompt = `Calendar data (next 90 days):\n${eventsContext || 'No events found.'}\n\nQuestion: ${query}\n\nAnswer:`;

    const output = await replicate.run(
      process.env.AI_ASSISTANT_MODEL ?? 'meta/meta-llama-3-70b-instruct',
      {
        input: {
          prompt,
          system_prompt: systemPrompt,
          max_new_tokens: 512,
          temperature: 0.3,
        },
      },
    );

    const answer = Array.isArray(output)
      ? (output as string[]).join('')
      : String(output ?? 'Unable to process query.');

    return NextResponse.json({ answer });
  } catch (err) {
    console.error('[ai-query]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
