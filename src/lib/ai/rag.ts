import Replicate from 'replicate';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! });

const EMBED_MODEL = 'nateraw/jina-embeddings-v2-base-en';
const CHAT_MODEL  = (process.env.AI_ASSISTANT_MODEL ?? 'meta/meta-llama-3-70b-instruct') as `${string}/${string}`;

interface RAGContext {
  userId: string;
  orgId: string;
  hospitalId: string | null;
  hospitalName: string;
  userRole: string;
}

interface ChunkResult {
  id: string;
  content: string;
  source_type: string;
  source_id: string;
  metadata: {
    source_title?: string;
    source_url?: string;
    [key: string]: unknown;
  };
  similarity: number;
}

export async function embedText(text: string): Promise<number[]> {
  const output = await replicate.run(EMBED_MODEL, { input: { text } });
  return output as number[];
}

export async function searchChunks(
  queryEmbedding: number[],
  orgId: string,
  hospitalId: string | null,
  matchCount = 5
): Promise<ChunkResult[]> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase.rpc('search_document_chunks', {
    query_embedding: queryEmbedding,
    org_id_param: orgId,
    hospital_id_param: hospitalId,
    match_threshold: 0.72,
    match_count: matchCount,
  });

  if (error) throw new Error(`Vector search failed: ${error.message}`);
  return data || [];
}

export function buildSystemPrompt(ctx: RAGContext, hasFileContext = false): string {
  const fileNote = hasFileContext
    ? '\n\nADDITIONAL INSTRUCTIONS: The user has attached a file. Analyze and answer questions about its content. Reference the ATTACHED FILE section above. You may also cross-reference knowledge base documents when relevant.'
    : '';

  return `You are the VetOS AI Assistant — an internal knowledge assistant for veterinary hospital staff at ${ctx.hospitalName}.

ROLE:
- Help staff find information from internal documents, SOPs, policies, handbooks, and training materials
- Answer questions about hospital operations, schedules, and procedures
- When a file is attached, analyze its content and answer questions about it
- Always be accurate, concise, and professional

RULES:
1. Answer using the provided context. Do NOT invent or fabricate information.
2. If the answer is not clearly in the context, say: "I don't have that specific information in our knowledge base. Please check with your manager or the relevant department."
3. Always cite your sources by naming the document or article you found the answer in.
4. Keep answers focused and concise. Use bullet points when listing steps or items.
5. Do not discuss patient records, clinical diagnoses, or medical decisions.
6. Today's date is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

HOSPITAL: ${ctx.hospitalName}
USER ROLE: ${ctx.userRole}${fileNote}`;
}

export function buildRAGContext(chunks: ChunkResult[]): string {
  if (chunks.length === 0) return '';

  return chunks
    .map((chunk, i) => {
      const title = chunk.metadata?.source_title || `Document ${i + 1}`;
      return `--- Source: ${title} (similarity: ${(chunk.similarity * 100).toFixed(0)}%) ---\n${chunk.content}`;
    })
    .join('\n\n');
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface FileContext {
  text: string;
  file_name: string;
  file_type: string;
  file_size?: number;
}

function buildPrompt(
  history: ConversationMessage[],
  currentMessage: string,
): string {
  const lines: string[] = [];
  for (const m of history) {
    lines.push(`${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`);
  }
  lines.push(`User: ${currentMessage}`);
  lines.push('Assistant:');
  return lines.join('\n\n');
}

export async function streamRAGResponse(
  userMessage: string,
  conversationHistory: ConversationMessage[],
  ctx: RAGContext,
  fileContext?: FileContext | null,
): Promise<{
  stream: AsyncIterable<string>;
  sourceChunks: ChunkResult[];
}> {
  // 1. Try to embed + search — fail gracefully so chat always works
  let chunks: ChunkResult[] = [];
  try {
    const queryEmbedding = await embedText(userMessage);
    chunks = await searchChunks(queryEmbedding, ctx.orgId, ctx.hospitalId);
  } catch (err) {
    console.error('[RAG] Embedding/search failed, proceeding without KB context:', err);
  }

  // 2. Build context string
  const ragContext = buildRAGContext(chunks);

  // 3. Build message history (last 10 turns)
  const recentHistory = conversationHistory.slice(-10);

  // 4. Construct user message with any file attachment + KB context
  let userMessageWithContext: string;

  if (fileContext) {
    const fileSection = `ATTACHED FILE: "${fileContext.file_name}" (${fileContext.file_type.toUpperCase()})\n\n${fileContext.text.slice(0, 80_000)}`;
    userMessageWithContext = ragContext
      ? `${fileSection}\n\n---\n\nINTERNAL KNOWLEDGE BASE CONTEXT:\n${ragContext}\n\n---\n\nQUESTION: ${userMessage}`
      : `${fileSection}\n\n---\n\nQUESTION: ${userMessage}`;
  } else {
    userMessageWithContext = ragContext
      ? `INTERNAL KNOWLEDGE BASE CONTEXT:\n${ragContext}\n\n---\n\nQUESTION: ${userMessage}`
      : userMessage;
  }

  const prompt = buildPrompt(recentHistory, userMessageWithContext);
  const systemPrompt = buildSystemPrompt(ctx, !!fileContext);

  // 5. Return an async generator that streams from Replicate
  //    Using the correct pattern: destructure { event, data } per the SDK docs
  const model = CHAT_MODEL;
  const input = {
    prompt,
    system_prompt: systemPrompt,
    max_new_tokens: 2048,
    temperature: 0.7,
  };

  async function* textStream(): AsyncIterable<string> {
    for await (const { event, data } of replicate.stream(model, { input })) {
      if (event === 'output' && data) {
        yield data as string;
      }
    }
  }

  return { stream: textStream(), sourceChunks: chunks };
}

export async function indexTextContent(
  content: string,
  sourceType: string,
  sourceId: string,
  orgId: string,
  hospitalId: string | null,
  metadata: Record<string, unknown>
): Promise<void> {
  const supabase = createSupabaseAdminClient();

  await supabase
    .from('document_chunks')
    .delete()
    .eq('source_type', sourceType)
    .eq('source_id', sourceId);

  const chunks = chunkText(content);
  if (chunks.length === 0) return;

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await embedText(chunks[i]);

    await supabase.from('document_chunks').insert({
      org_id: orgId,
      hospital_id: hospitalId,
      source_type: sourceType,
      source_id: sourceId,
      chunk_index: i,
      content: chunks[i],
      token_count: Math.ceil(chunks[i].length / 4),
      embedding,
      metadata: { ...metadata, chunk_index: i, total_chunks: chunks.length },
    });
  }
}

function chunkText(text: string, maxChunkLength = 2000, overlapLength = 200): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChunkLength) return [cleaned];

  const chunks: string[] = [];
  let start = 0;

  while (start < cleaned.length) {
    let end = start + maxChunkLength;

    if (end < cleaned.length) {
      const paragraphBreak = cleaned.lastIndexOf('\n\n', end);
      const sentenceBreak = cleaned.lastIndexOf('. ', end);

      if (paragraphBreak > start + maxChunkLength / 2) {
        end = paragraphBreak;
      } else if (sentenceBreak > start + maxChunkLength / 2) {
        end = sentenceBreak + 1;
      }
    }

    const chunk = cleaned.slice(start, end).trim();
    if (chunk.length >= 100) {
      chunks.push(chunk);
    }

    start = end - overlapLength;
    if (start >= cleaned.length) break;
  }

  return chunks;
}
