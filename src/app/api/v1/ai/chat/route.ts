import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { streamRAGResponse } from '@/lib/ai/rag';
import { z } from 'zod';

const FileContextSchema = z.object({
  text: z.string().max(100_000),
  file_name: z.string().max(500),
  file_type: z.string().max(20),
  file_size: z.number().optional(),
});

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(5000),
  conversation_id: z.string().uuid().optional().nullable(),
  hospital_id: z.string().uuid().optional().nullable(),
  file_context: FileContextSchema.optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
    }

    const body = await req.json();
    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', details: parsed.error.flatten() } },
        { status: 422 },
      );
    }

    const { message, conversation_id, hospital_id, file_context } = parsed.data;

    const admin = createSupabaseAdminClient();

    const { data: profile } = await admin
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    const orgId = profile?.org_id;
    if (!orgId) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
    }

    // Get or create conversation
    let conversationId = conversation_id;
    if (!conversationId) {
      const { data: conv } = await admin
        .from('ai_conversations')
        .insert({
          user_id: user.id,
          hospital_id: hospital_id ?? null,
          title: message.slice(0, 80),
        })
        .select('id')
        .single();
      conversationId = conv?.id;
    }

    if (!conversationId) {
      return NextResponse.json({ error: { code: 'INTERNAL_ERROR' } }, { status: 500 });
    }

    // Conversation history
    const { data: history } = await admin
      .from('ai_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(20);

    // Hospital name
    let hospitalName = 'VetCentral';
    if (hospital_id) {
      const { data: hospital } = await admin
        .from('hospitals')
        .select('name')
        .eq('id', hospital_id)
        .single();
      hospitalName = hospital?.name ?? hospitalName;
    }

    const appMetadata = user.app_metadata as { roles?: Record<string, string> };
    const userRole = hospital_id ? (appMetadata?.roles?.[hospital_id] ?? 'staff') : 'staff';

    // Save user message (original, without file text)
    await admin.from('ai_messages').insert({
      conversation_id: conversationId,
      role: 'user' as const,
      content: file_context
        ? `[Attached: ${file_context.file_name}]\n\n${message}`
        : message,
    });

    const safeHistory = (history ?? []).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const { stream, sourceChunks } = await streamRAGResponse(
      message,
      safeHistory,
      {
        userId: user.id,
        orgId,
        hospitalId: hospital_id ?? null,
        hospitalName,
        userRole,
      },
      file_context ?? null,
    );

    const encoder = new TextEncoder();
    let fullContent = '';
    const convId = conversationId;

    const readable = new ReadableStream({
      async start(controller) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'conversation_id', value: convId })}\n\n`),
        );

        for await (const text of stream) {
          if (text) {
            fullContent += text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'text', value: text })}\n\n`),
            );
          }
        }

        if (sourceChunks.length > 0) {
          const sources = sourceChunks.map(c => ({
            title: (c.metadata as Record<string, string>)?.source_title ?? 'Internal Document',
            similarity: c.similarity,
            source_type: c.source_type,
          }));
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'sources', value: sources })}\n\n`),
          );
        }

        // Emit the attached file as a synthetic source if in file_context mode
        if (file_context && sourceChunks.length === 0) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'sources',
                value: [{ title: file_context.file_name, similarity: 1, source_type: 'attachment' }],
              })}\n\n`,
            ),
          );
        }

        await admin.from('ai_messages').insert({
          conversation_id: convId,
          role: 'assistant' as const,
          content: fullContent,
          source_chunks: sourceChunks.map(c => ({
            id: c.id,
            source_type: c.source_type,
            source_id: c.source_id,
            similarity: c.similarity,
            title: (c.metadata as Record<string, string>)?.source_title,
          })),
        });

        await admin
          .from('ai_conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', convId);

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('AI chat error:', error);
    return NextResponse.json(
      { error: { code: 'AI_ERROR', message: 'AI service unavailable' } },
      { status: 503 },
    );
  }
}
