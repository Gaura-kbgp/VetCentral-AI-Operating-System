# API Architecture
# Vet AI Operating System
**Version:** 1.0.0

---

## 1. API Design Principles

- **Server Actions** preferred for mutations (CSRF-protected, co-located with forms)
- **API Routes** (`/api/v1/`) for operations requiring raw HTTP (webhooks, AI streaming, cron)
- **Supabase SDK** for direct DB operations within server components and actions
- All responses return consistent JSON envelope
- All errors include machine-readable `code` and human-readable `message`
- All endpoints (except webhooks) require authenticated Supabase session

---

## 2. Response Envelope

```typescript
// Success
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 145
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "You do not have access to this resource",
    "details": { ... }
  }
}
```

---

## 3. Middleware (Edge)

```typescript
// middleware.ts — runs on every request
export async function middleware(request: NextRequest) {
  // 1. Validate Supabase session
  const { data: { session } } = await supabase.auth.getSession();
  if (!session && isProtectedRoute(request.pathname)) {
    return NextResponse.redirect('/login');
  }

  // 2. Inject hospital context headers
  const hospitalContext = await resolveHospitalContext(session);
  const response = NextResponse.next();
  response.headers.set('x-org-id', hospitalContext.org_id);
  response.headers.set('x-hospital-id', hospitalContext.active_hospital_id);

  // 3. RBAC check for admin routes
  if (isAdminRoute(request.pathname)) {
    const hasAccess = await checkAdminPermission(session, hospitalContext);
    if (!hasAccess) return NextResponse.redirect('/403');
  }

  return response;
}
```

---

## 4. API Routes

### Authentication
```
POST   /api/v1/auth/invite          → Send invite email to new user
POST   /api/v1/auth/accept-invite   → Accept invite, set password
POST   /api/v1/auth/mfa/setup       → Initialize TOTP setup
POST   /api/v1/auth/mfa/verify      → Verify TOTP code
DELETE /api/v1/auth/sessions/{id}   → Revoke specific session
GET    /api/v1/auth/me              → Get current user profile + roles
```

### Organizations & Hospitals
```
GET    /api/v1/org                           → Get organization details
PATCH  /api/v1/org                           → Update org settings
GET    /api/v1/org/hospitals                 → List all hospitals
POST   /api/v1/org/hospitals                 → Create hospital
GET    /api/v1/org/hospitals/{id}            → Get hospital details
PATCH  /api/v1/org/hospitals/{id}            → Update hospital
GET    /api/v1/org/users                     → List all org users
POST   /api/v1/org/users/{id}/roles          → Assign role to user
DELETE /api/v1/org/users/{id}/roles/{role}   → Remove role from user
```

### Knowledge Base
```
GET    /api/v1/kb/articles                   → List articles (paginated, filtered)
POST   /api/v1/kb/articles                   → Create article
GET    /api/v1/kb/articles/{id}              → Get article with content
PATCH  /api/v1/kb/articles/{id}             → Update article
DELETE /api/v1/kb/articles/{id}             → Archive article
POST   /api/v1/kb/articles/{id}/publish     → Submit for review / publish
GET    /api/v1/kb/articles/{id}/versions    → Get version history
POST   /api/v1/kb/articles/{id}/feedback   → Submit helpful/not helpful
GET    /api/v1/kb/search?q={query}          → Full-text + semantic search
GET    /api/v1/kb/categories                 → Get category tree
POST   /api/v1/kb/categories                 → Create category
```

### AI Assistant
```
POST   /api/v1/ai/chat                       → Send message (streaming SSE response)
GET    /api/v1/ai/conversations              → List user's conversations
GET    /api/v1/ai/conversations/{id}         → Get conversation with messages
DELETE /api/v1/ai/conversations/{id}         → Delete conversation
POST   /api/v1/ai/messages/{id}/feedback    → Rate a message (thumbs up/down)
POST   /api/v1/ai/index-document            → Trigger document indexing (internal)
POST   /api/v1/ai/search?q={query}          → Semantic search only (no generation)
```

**AI Chat Endpoint Detail:**
```typescript
// POST /api/v1/ai/chat
// Body: { conversation_id?: string, message: string, hospital_id: string }
// Response: Server-Sent Events stream

export async function POST(req: Request) {
  const { message, conversation_id, hospital_id } = await req.json();
  const session = await getServerSession();

  // 1. Embed the user query
  const queryEmbedding = await embedText(message);

  // 2. Vector search for relevant chunks (scoped to hospital)
  const relevantChunks = await searchChunks(queryEmbedding, hospital_id, 5);

  // 3. Build context
  const context = buildRAGContext(relevantChunks);

  // 4. Call Claude API with streaming
  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      ...conversationHistory,
      { role: 'user', content: `Context:\n${context}\n\nQuestion: ${message}` }
    ]
  });

  // 5. Stream response + save to DB
  return new Response(stream.toReadableStream(), {
    headers: { 'Content-Type': 'text/event-stream' }
  });
}
```

### Calendar
```
GET    /api/v1/calendar/events               → List events (with filters: hospital, type, date range)
POST   /api/v1/calendar/events               → Create event
GET    /api/v1/calendar/events/{id}          → Get event details + attendees
PATCH  /api/v1/calendar/events/{id}          → Update event
DELETE /api/v1/calendar/events/{id}          → Cancel event
POST   /api/v1/calendar/events/{id}/rsvp    → RSVP to event
GET    /api/v1/calendar/conflicts            → Get unresolved conflicts
PATCH  /api/v1/calendar/conflicts/{id}       → Resolve conflict

# Outlook Sync
POST   /api/v1/calendar/outlook/connect      → Start OAuth flow for Outlook
GET    /api/v1/calendar/outlook/callback     → OAuth callback
DELETE /api/v1/calendar/outlook/disconnect   → Disconnect Outlook
POST   /api/v1/calendar/outlook/sync         → Manual sync trigger
GET    /api/v1/calendar/outlook/status       → Sync status + last synced timestamp
```

### Communication
```
GET    /api/v1/channels                      → List accessible channels
POST   /api/v1/channels                      → Create channel
GET    /api/v1/channels/{id}                 → Get channel details + members
PATCH  /api/v1/channels/{id}                 → Update channel
DELETE /api/v1/channels/{id}                 → Archive channel
POST   /api/v1/channels/{id}/members        → Add member
DELETE /api/v1/channels/{id}/members/{uid}  → Remove member

GET    /api/v1/channels/{id}/messages        → List messages (cursor-paginated)
POST   /api/v1/channels/{id}/messages        → Send message
PATCH  /api/v1/channels/{id}/messages/{mid} → Edit message
DELETE /api/v1/channels/{id}/messages/{mid} → Delete message
POST   /api/v1/channels/{id}/messages/{mid}/reactions → Add reaction

# Direct Messages
POST   /api/v1/dm                            → Open DM with user (create channel)
GET    /api/v1/dm                            → List DM conversations

# Notifications
GET    /api/v1/notifications                 → List notifications (unread first)
PATCH  /api/v1/notifications/{id}/read      → Mark as read
POST   /api/v1/notifications/read-all       → Mark all as read
```

### Documents
```
GET    /api/v1/documents                     → List documents (filtered)
POST   /api/v1/documents/upload              → Get signed upload URL
POST   /api/v1/documents                     → Create document record after upload
GET    /api/v1/documents/{id}               → Get document metadata
DELETE /api/v1/documents/{id}               → Delete document
POST   /api/v1/documents/{id}/download      → Get signed download URL
POST   /api/v1/documents/{id}/share         → Create share link

GET    /api/v1/documents/folders             → List folder tree
POST   /api/v1/documents/folders             → Create folder
PATCH  /api/v1/documents/folders/{id}        → Rename/move folder
DELETE /api/v1/documents/folders/{id}        → Delete folder

GET    /api/v1/documents/search?q={query}    → Search documents
```

**Secure File Upload Pattern:**
```typescript
// Step 1: Client requests signed URL
POST /api/v1/documents/upload
Body: { filename, content_type, folder_id, hospital_id }
Response: { upload_url, storage_path, expires_in }

// Step 2: Client uploads directly to Supabase Storage using signed URL
PUT upload_url ← binary file

// Step 3: Client confirms upload and creates DB record
POST /api/v1/documents
Body: { storage_path, name, folder_id, file_size, file_type }
Response: { document }

// Step 4: Server triggers background indexing
// POST /api/v1/ai/index-document { document_id }
```

### Projects & Tasks
```
GET    /api/v1/projects                      → List projects
POST   /api/v1/projects                      → Create project
GET    /api/v1/projects/{id}                 → Get project details
PATCH  /api/v1/projects/{id}                 → Update project
DELETE /api/v1/projects/{id}                 → Delete project
GET    /api/v1/projects/{id}/members        → List members
POST   /api/v1/projects/{id}/members        → Add member

GET    /api/v1/projects/{id}/tasks          → List tasks (board/list/gantt)
POST   /api/v1/projects/{id}/tasks          → Create task
GET    /api/v1/tasks/{id}                   → Get task details
PATCH  /api/v1/tasks/{id}                   → Update task (status, assignee, etc.)
DELETE /api/v1/tasks/{id}                   → Delete task
POST   /api/v1/tasks/{id}/comments         → Add comment
GET    /api/v1/tasks/assigned-to-me        → My tasks across all projects
```

### Workflows
```
GET    /api/v1/workflow-forms                → List available request forms
GET    /api/v1/workflow-forms/{id}           → Get form schema
POST   /api/v1/workflow-forms                → Create form (admin)
PATCH  /api/v1/workflow-forms/{id}           → Update form (admin)

POST   /api/v1/workflow-requests             → Submit a request
GET    /api/v1/workflow-requests             → List requests (mine or queue)
GET    /api/v1/workflow-requests/{id}        → Get request status + history
PATCH  /api/v1/workflow-requests/{id}        → Update request (admin only)
POST   /api/v1/workflow-requests/{id}/approve → Approve request
POST   /api/v1/workflow-requests/{id}/reject  → Reject request
```

### Training (LMS)
```
GET    /api/v1/courses                       → List courses (assigned to me)
GET    /api/v1/courses/{id}                 → Get course structure
GET    /api/v1/courses/{id}/progress        → My progress in course
POST   /api/v1/courses/{id}/enroll         → Enroll in course
POST   /api/v1/lessons/{id}/complete       → Mark lesson complete
POST   /api/v1/lessons/{id}/quiz-submit    → Submit quiz answers
GET    /api/v1/courses/{id}/certificate   → Get certificate

# Admin
POST   /api/v1/courses                       → Create course
PATCH  /api/v1/courses/{id}                 → Update course
POST   /api/v1/courses/{id}/publish        → Publish course
POST   /api/v1/courses/{id}/assign         → Assign to users/roles
GET    /api/v1/courses/{id}/completion-report → Completion stats
```

### KPI & Analytics
```
GET    /api/v1/kpi/overview                  → Org-level KPI summary
GET    /api/v1/kpi/hospital/{id}            → Hospital-level KPIs
GET    /api/v1/kpi/training                  → Training completion metrics
GET    /api/v1/kpi/workflows                 → Request volume + SLA metrics
GET    /api/v1/kpi/calendar                  → Meeting and scheduling metrics
GET    /api/v1/kpi/communication             → Channel activity metrics
GET    /api/v1/kpi/export?format=csv         → Export KPI data
```

### Administration
```
GET    /api/v1/admin/users                   → Paginated user list
POST   /api/v1/admin/users/invite            → Invite new user
PATCH  /api/v1/admin/users/{id}             → Update user profile
DELETE /api/v1/admin/users/{id}             → Deactivate user
POST   /api/v1/admin/users/{id}/reset-password → Send password reset
GET    /api/v1/admin/audit-logs              → Paginated audit log
GET    /api/v1/admin/system-health           → System status metrics
```

### Webhooks (no auth, signature verification only)
```
POST   /api/v1/webhooks/outlook              → MS Graph calendar notifications
POST   /api/v1/webhooks/outlook/validation  → Graph webhook validation handshake
```

### Cron Jobs (CRON_SECRET header required)
```
GET    /api/v1/cron/outlook-sync             → Poll Outlook delta changes
GET    /api/v1/cron/renew-subscriptions      → Renew expiring Graph webhook subscriptions
GET    /api/v1/cron/kpi-snapshot             → Take daily KPI snapshot
GET    /api/v1/cron/cleanup-expired-tokens   → Remove expired share links/tokens
```

---

## 5. Server Actions

Mutations that are form-driven use Server Actions instead of API routes:

```typescript
// actions/knowledge-base.ts
'use server';

export async function createArticle(data: ArticleFormData) {
  const session = await requireAuth();
  const { org_id, hospital_id } = await getHospitalContext();
  
  // Validate with Zod
  const validated = ArticleSchema.parse(data);
  
  const { data: article, error } = await supabaseAdmin
    .from('kb_articles')
    .insert({ ...validated, org_id, author_id: session.user.id })
    .select()
    .single();

  if (error) throw new Error(error.message);
  
  // Trigger indexing
  await triggerDocumentIndexing('kb_article', article.id);
  
  revalidatePath('/knowledge-base');
  return { success: true, data: article };
}
```

---

## 6. Error Codes

| Code | HTTP Status | Description |
|---|---|---|
| `UNAUTHORIZED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Session valid but insufficient permission |
| `NOT_FOUND` | 404 | Resource does not exist or not accessible |
| `VALIDATION_ERROR` | 422 | Request body failed Zod schema validation |
| `CONFLICT` | 409 | Calendar conflict detected or duplicate resource |
| `RATE_LIMITED` | 429 | Too many requests |
| `AI_ERROR` | 503 | Upstream AI API error |
| `SYNC_ERROR` | 503 | Outlook sync failure |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## 7. Rate Limiting

| Endpoint Group | Limit |
|---|---|
| AI chat | 30 requests/min per user |
| Document upload | 10 uploads/min per user |
| AI indexing | 5 concurrent jobs per org |
| Notifications | 100 reads/min per user |
| Calendar sync trigger | 1 manual sync/5min per user |
| All other endpoints | 120 requests/min per user |

Implemented via Upstash Redis (KV) or Vercel's built-in rate limiting on Vercel Pro.
