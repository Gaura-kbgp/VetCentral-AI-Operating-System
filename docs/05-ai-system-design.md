# AI System Design
# Vet AI Operating System
**Version:** 1.0.0

---

## 1. AI System Overview

The AI layer provides three capabilities:
1. **Semantic Search** — find relevant documents, articles, and content using meaning, not just keywords
2. **RAG Chat Assistant** — answer staff questions using internal knowledge as context
3. **Document Intelligence** — auto-extract and index content from uploaded files

All AI functionality is scoped to the user's accessible hospitals — no cross-organization data leakage.

---

## 2. Model Selection

| Task | Model | Rationale |
|---|---|---|
| Chat / Q&A | `claude-sonnet-4-6` | Best reasoning quality for internal assistant; cost-effective at scale |
| Document summarization | `claude-haiku-4-5-20251001` | Fast and cheap for background processing |
| Text embeddings | `text-embedding-3-small` (OpenAI) | 1536 dimensions; cost-effective at $0.02/1M tokens |
| PDF text extraction | `pdf-parse` (Node.js library) | Free, runs server-side |
| DOCX extraction | `mammoth` (Node.js library) | Free, accurate |

---

## 3. Embedding Architecture

### Embedding Dimensions
- Model: `text-embedding-3-small`
- Dimensions: 1536
- Storage: `pgvector` column type `vector(1536)`
- Similarity: Cosine distance (`<=>` operator)
- Index: IVFFlat with 100 lists (suitable for up to ~500K vectors)

### Chunking Strategy
```typescript
interface ChunkConfig {
  maxTokens: 512;       // max tokens per chunk
  overlapTokens: 50;    // overlap between consecutive chunks
  minChunkLength: 100;  // discard very small chunks
}

function chunkText(text: string): string[] {
  // 1. Split on paragraph boundaries first
  // 2. If paragraph > maxTokens, split on sentences
  // 3. Apply sliding window overlap
  // 4. Filter chunks < minChunkLength
}
```

### Metadata per Chunk
```typescript
interface ChunkMetadata {
  source_type: 'document' | 'kb_article' | 'training_content';
  source_id: string;
  source_title: string;
  source_url: string;      // deep link back to source
  hospital_id: string | null;
  org_id: string;
  chunk_index: number;
  total_chunks: number;
  file_type?: string;
  last_updated: string;
}
```

---

## 4. Document Indexing Pipeline

```
File Upload Complete
       │
       ▼
Queue: index-document job
  { document_id, source_type, org_id, hospital_id }
       │
       ▼
Text Extraction
  ├── PDF  → pdf-parse → plain text
  ├── DOCX → mammoth  → plain text
  ├── TXT  → direct read
  ├── MD   → direct read
  └── (other types skipped / flagged)
       │
       ▼
Text Cleaning
  ├── Remove excessive whitespace
  ├── Remove headers/footers (heuristic)
  └── Normalize unicode
       │
       ▼
Chunking (512 tokens, 50 overlap)
       │
       ├── [Chunk 1] [Chunk 2] [Chunk 3] ... [Chunk N]
       │
       ▼
Batch Embedding (OpenAI API, batch size 100)
  → vector[1536] per chunk
       │
       ▼
Upsert into document_chunks
  (delete old chunks for this source first)
       │
       ▼
Update documents.is_indexed = TRUE
Update documents.indexed_at = NOW()
```

### Background Processing Implementation
```typescript
// /api/v1/ai/index-document (POST)
// Called server-side after upload confirmation
// Uses Vercel's waitUntil for background execution

export async function POST(req: Request) {
  const { document_id, source_type } = await req.json();
  const ctx = (req as any).waitUntil;  // Vercel edge context

  ctx(async () => {
    await indexDocument(document_id, source_type);
  });

  return Response.json({ success: true, message: 'Indexing started' });
}
```

---

## 5. RAG Query Pipeline

```
User sends message: "What is our policy on after-hours emergency calls?"
       │
       ▼
1. EMBED USER QUERY
   queryVector = await embed("What is our policy on after-hours emergency calls?")
       │
       ▼
2. VECTOR SEARCH (pgvector)
   SELECT content, metadata, source_title, source_url,
          1 - (embedding <=> queryVector) AS similarity
   FROM document_chunks
   WHERE org_id = $org_id
     AND (hospital_id = $hospital_id OR hospital_id IS NULL)
     AND 1 - (embedding <=> queryVector) > 0.75  -- similarity threshold
   ORDER BY embedding <=> queryVector
   LIMIT 5;
       │
       ▼
3. CONTEXT ASSEMBLY
   [Source 1: Emergency Protocol SOP — chunk excerpt]
   [Source 2: Staff Handbook — Chapter 4 excerpt]
   [Source 3: Manager Training — Module 2 excerpt]
       │
       ▼
4. CLAUDE API CALL (streaming)
   System: You are the VetOS internal AI assistant for [Hospital Name].
           Answer questions using only the provided context.
           If the answer is not in the context, say so clearly.
           Always cite your sources.
   
   Context: [assembled chunks]
   
   User: What is our policy on after-hours emergency calls?
       │
       ▼
5. STREAMING RESPONSE
   "Based on our Emergency Protocol SOP (last updated March 2026),
    after-hours emergency calls should be..."
   
   Sources: [Emergency Protocol SOP] [Staff Handbook Ch. 4]
       │
       ▼
6. SAVE TO DB
   INSERT ai_messages (conversation_id, role='assistant', content, source_chunks)
```

### pgvector Similarity Search Function
```sql
CREATE OR REPLACE FUNCTION search_document_chunks(
  query_embedding  vector(1536),
  org_id_param     UUID,
  hospital_id_param UUID,
  match_threshold  FLOAT DEFAULT 0.75,
  match_count      INT DEFAULT 5
)
RETURNS TABLE (
  id            UUID,
  content       TEXT,
  source_type   TEXT,
  source_id     UUID,
  metadata      JSONB,
  similarity    FLOAT
) AS $$
  SELECT 
    id,
    content,
    source_type,
    source_id,
    metadata,
    1 - (embedding <=> query_embedding) AS similarity
  FROM document_chunks
  WHERE 
    org_id = org_id_param
    AND (hospital_id = hospital_id_param OR hospital_id IS NULL)
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE SQL STABLE;
```

---

## 6. System Prompt Design

```typescript
const SYSTEM_PROMPT = `
You are the VetOS AI Assistant — an internal knowledge assistant for veterinary hospital staff.

ROLE:
- Help staff find information from internal documents, SOPs, policies, and training materials
- Answer questions about hospital operations, schedules, and procedures
- Always be accurate, concise, and professional

RULES:
1. Only answer using the provided context. Do NOT invent information.
2. If the answer is not in the context, say: "I don't have that information in our knowledge base. Please check with your manager or [relevant department]."
3. Always cite your sources by naming the document/article you found the answer in.
4. Do not share information outside the user's hospital scope.
5. Do not discuss patient records or clinical decisions.
6. Keep answers concise — bullet points when listing steps or items.

HOSPITAL CONTEXT:
Hospital: {{hospital_name}}
User Role: {{user_role}}
Date: {{current_date}}
`;
```

---

## 7. AI Calendar Queries

For calendar-specific questions, augment RAG with structured calendar data:

```typescript
// Detect if query is calendar-related
function isCalendarQuery(message: string): boolean {
  const calendarKeywords = ['when', 'meeting', 'schedule', 'training', 'off', 'pto', 'event', 'today', 'tomorrow', 'week'];
  return calendarKeywords.some(kw => message.toLowerCase().includes(kw));
}

// If calendar query: fetch relevant events + pass as structured context
async function getCalendarContext(hospital_id: string, message: string) {
  const events = await supabase
    .from('calendar_events')
    .select('title, start_time, end_time, location, event_type')
    .eq('hospital_id', hospital_id)
    .gte('start_time', startOfToday())
    .lte('start_time', addDays(new Date(), 30))
    .order('start_time');
  
  return formatEventsForContext(events.data);
}
```

---

## 8. Voice Input

```typescript
// Client-side browser Speech API
// components/ai/VoiceInput.tsx

'use client';

export function VoiceInput({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [isRecording, setIsRecording] = useState(false);
  
  const startRecording = () => {
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      onTranscript(transcript);
    };
    
    recognition.start();
    setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
  };

  return (
    <button onClick={startRecording} aria-label="Voice input">
      {isRecording ? <MicOff /> : <Mic />}
    </button>
  );
}
```

---

## 9. Semantic Search (non-chat)

Used in Knowledge Base and Document search UI — returns ranked results without generation:

```typescript
// /api/v1/kb/search?q=OSHA+training

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');
  const hospital_id = searchParams.get('hospital_id');

  // 1. Full-text search (fast, keyword-based)
  const ftsResults = await supabase.rpc('search_kb_fts', { query, hospital_id });

  // 2. Semantic search (slower, meaning-based)
  const embedding = await embedText(query);
  const semanticResults = await supabase.rpc('search_document_chunks', {
    query_embedding: embedding,
    hospital_id_param: hospital_id,
    match_count: 10
  });

  // 3. Merge and deduplicate (RRF — Reciprocal Rank Fusion)
  const merged = reciprocalRankFusion(ftsResults, semanticResults);

  return Response.json({ success: true, data: merged });
}
```

---

## 10. Re-indexing Strategy

| Trigger | Action |
|---|---|
| Document uploaded | Index new document |
| Document updated (new version) | Delete old chunks, index new content |
| KB article published | Index article content |
| KB article updated | Delete old chunks, index updated content |
| Document deleted | Delete all associated chunks |
| Manual re-index (admin) | Full re-index of all org content |

### Deletion on Source Delete
```sql
-- Trigger to clean up chunks when source is deleted
CREATE OR REPLACE FUNCTION delete_document_chunks()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM document_chunks
  WHERE source_type = TG_TABLE_NAME AND source_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER kb_articles_delete_chunks
  AFTER DELETE ON kb_articles
  FOR EACH ROW EXECUTE FUNCTION delete_document_chunks();
```

---

## 11. AI Cost Controls

| Control | Implementation |
|---|---|
| Rate limiting | 30 AI requests/min per user |
| Max tokens per response | 1024 tokens |
| Max context chunks | 5 chunks per query |
| Skip re-embedding unchanged content | Hash content before re-indexing |
| Haiku for bulk/background tasks | Use cheaper model for indexing summaries |
| Conversation truncation | Keep only last 10 messages in history |
| Feedback loop | Log thumbs-down to improve prompts over time |

---

## 12. Future AI Enhancements (Phase 3+)

- **Fine-tuning**: Train on hospital-specific terminology and SOPs
- **Multimodal**: Analyze images (X-rays, procedure photos) — Claude's vision capability
- **Proactive AI**: Surface relevant articles when user opens related page
- **AI-generated summaries**: Auto-summarize long documents on upload
- **Customer-facing bot**: Separate AI instance with limited public knowledge base
- **Anomaly detection**: Flag unusual workflow patterns or scheduling overloads
