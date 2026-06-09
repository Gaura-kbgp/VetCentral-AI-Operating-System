# System Architecture
# Vet AI Operating System
**Version:** 1.0.0

---

## 1. Architecture Overview

VetOS follows a **multi-tenant SaaS architecture** using a monorepo Next.js application deployed on Vercel, backed by Supabase as the unified backend (PostgreSQL, Auth, Storage, Realtime, Vector).

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VERCEL EDGE NETWORK                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                   Next.js 15 Application                     │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐ │   │
│  │  │   App Router │  │ Server Acts │  │   API Route Handlers │ │   │
│  │  │  (RSC+Client)│  │  (Mutations)│  │  /api/v1/**          │ │   │
│  │  └─────────────┘  └─────────────┘  └──────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐
│  Supabase Auth  │  │  Supabase DB │  │ Supabase Storage │
│  (JWT + OAuth2) │  │  PostgreSQL  │  │  Files + Assets  │
│  MFA / Sessions │  │  + pgvector  │  │  CDN Delivery    │
└─────────────────┘  └──────────────┘  └──────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐
│Supabase Realtime│  │  AI Layer    │  │  MS Graph API    │
│  Channels/      │  │  Anthropic   │  │  Outlook/365     │
│  Broadcasts     │  │  Claude API  │  │  Calendar Sync   │
└─────────────────┘  └──────────────┘  └──────────────────┘
```

---

## 2. Layered Architecture

### Layer 1: Presentation (Next.js App Router)
- **React Server Components (RSC)** for data-heavy read pages (dashboards, knowledge base, documents)
- **Client Components** for interactive features (chat, calendar, rich editors)
- **Server Actions** for secure mutations (form submissions, data updates)
- **Next.js Middleware** for auth guard, RBAC enforcement, hospital context injection

### Layer 2: API Layer
- **Internal API Routes** (`/api/v1/`) for operations requiring server-side secrets
- **Server Actions** for form mutations with CSRF protection
- **Supabase Client (Server-side)** using service role only in secure server contexts
- **Supabase Client (Browser)** using anon key + JWT for RLS-enforced queries

### Layer 3: Data Layer
- **PostgreSQL** (Supabase): Primary relational store
- **pgvector**: Vector embeddings for AI semantic search
- **Supabase Storage**: Binary files, documents, videos, images
- **Supabase Realtime**: WebSocket-based live subscriptions

### Layer 4: Integration Layer
- **Microsoft Graph API**: Outlook calendar sync
- **Anthropic Claude API**: AI assistant and document analysis
- **OpenAI Embeddings API** (or Supabase AI): Vector embedding generation

---

## 3. Multi-Tenancy Design

### Organization Hierarchy
```
Organization (1)
    └── Hospital (1..N)
            └── Department (1..N)
                    └── User (1..N)
```

### Tenancy Isolation Strategy
- **Organization ID** and **Hospital ID** present on every major table
- **Row-Level Security (RLS)** policies enforce data isolation
- **JWT custom claims** carry `org_id`, `hospital_ids[]`, and `roles[]`
- No cross-organization data leakage possible at DB layer

### Hospital Context
```typescript
// Injected into every request via middleware
interface HospitalContext {
  org_id: string;
  user_id: string;
  active_hospital_id: string;
  accessible_hospital_ids: string[];
  roles: Record<string, RoleType>; // hospital_id -> role
  permissions: Permission[];
}
```

---

## 4. Module Architecture Map

```
VetOS Modules
├── /app/(auth)/           → Login, MFA, invite acceptance
├── /app/(dashboard)/      → Main authenticated shell
│   ├── dashboard/         → Home dashboard with widgets
│   ├── ai-assistant/      → AI chat interface
│   ├── calendar/          → Master calendar hub
│   ├── knowledge-base/    → AI knowledge base & search
│   ├── training/          → LMS module
│   ├── communication/     → Channels + DMs
│   ├── documents/         → Document management
│   ├── projects/          → Project management workspace
│   ├── workflows/         → Request & workflow portal
│   ├── kpi/               → KPI & analytics dashboards
│   ├── onboarding/        → Employee onboarding automation
│   ├── assets/            → Brand & asset library
│   └── admin/             → Administration panel
└── /api/v1/               → Server-side API handlers
    ├── auth/
    ├── ai/
    ├── calendar/
    ├── webhooks/
    └── integrations/
```

---

## 5. Authentication Flow

```
User visits app
     │
     ▼
Next.js Middleware (edge)
     │ checks Supabase session cookie
     │
     ├── No session → redirect /login
     │
     └── Has session → validate JWT
              │
              ▼
         Decode claims: org_id, hospital_ids, roles
              │
              ▼
         Inject HospitalContext into request
              │
              ▼
         Page renders with correct data scope
```

### Microsoft 365 SSO Flow
```
User clicks "Sign in with Microsoft"
     │
     ▼
Supabase Auth → Azure AD OAuth2
     │
     ▼
Azure AD issues token → Supabase validates
     │
     ▼
User matched by email to existing account
     │ (or new account created + pending role assignment)
     ▼
Session cookie set → redirect dashboard
```

---

## 6. Microsoft Outlook Calendar Sync Architecture

```
Microsoft Graph API (Webhook Subscription)
     │
     │ Event created/updated/deleted in Outlook
     ▼
/api/v1/webhooks/outlook  (Next.js API Route)
     │
     │ Validates Graph notification signature
     ▼
Calendar Sync Service
     │
     ├── Parse event data (title, time, location, attendees)
     ├── Map to VetOS event schema
     ├── Check for conflicts (DB query)
     │    ├── Conflict found → create conflict_alert record
     │    └── No conflict → upsert calendar_event record
     └── Broadcast via Supabase Realtime → calendar_updates channel
     
Poll Fallback (every 15 min via Vercel Cron)
     │
     ▼
/api/v1/cron/outlook-sync
     │ Fetches delta events from Graph API
     └── Same sync pipeline
```

### Conflict Detection Algorithm
```sql
-- Detect overlapping events for same person
SELECT e2.id
FROM calendar_events e1
JOIN calendar_event_attendees a1 ON a1.event_id = e1.id
JOIN calendar_event_attendees a2 ON a2.user_id = a1.user_id
JOIN calendar_events e2 ON e2.id = a2.event_id
WHERE e1.id != e2.id
  AND e1.hospital_id = $hospital_id
  AND (e1.start_time, e1.end_time) OVERLAPS (e2.start_time, e2.end_time);
```

---

## 7. AI System Architecture

### RAG (Retrieval-Augmented Generation) Pipeline

```
User Query
     │
     ▼
Query Embedding (text-embedding-3-small or Supabase AI)
     │
     ▼
pgvector similarity search (cosine distance)
     │ top-k = 5 most relevant chunks
     ▼
Context Assembly
     │ [System Prompt] + [Retrieved Chunks] + [User Query]
     ▼
Claude API (claude-sonnet-4-6)
     │
     ▼
Response with source citations
     │
     ▼
Streamed to user via Server-Sent Events
```

### Document Indexing Pipeline
```
File uploaded to Supabase Storage
     │
     ▼
/api/v1/ai/index-document (background job)
     │
     ├── Extract text (PDF: pdf-parse, DOCX: mammoth)
     ├── Chunk text (512 tokens, 50 token overlap)
     ├── Generate embeddings per chunk
     └── Insert into document_chunks table (with vector)
```

---

## 8. Realtime Architecture

### Supabase Realtime Channels

| Channel | Purpose | Subscribers |
|---|---|---|
| `org:{org_id}:announcements` | Org-wide broadcast | All users |
| `hospital:{hospital_id}:channel:{channel_id}` | Team chat | Channel members |
| `hospital:{hospital_id}:notifications` | In-app notifications | All hospital users |
| `hospital:{hospital_id}:calendar` | Calendar updates | Calendar viewers |
| `user:{user_id}:dm` | Direct messages | Specific user |
| `hospital:{hospital_id}:workflows` | Request status updates | Requesters + approvers |
| `hospital:{hospital_id}:tasks` | Task updates | Project members |

### Realtime Message Flow (Chat)
```
User types message → Client Component
     │
     ▼
Supabase Realtime Broadcast (optimistic)
     │
     ▼
Server Action (INSERT into messages table)
     │ triggers Postgres CDC
     ▼
Supabase Realtime → all channel subscribers receive message
```

---

## 9. State Management Strategy

| Concern | Solution |
|---|---|
| Server data (lists, records) | RSC + Server Actions (no client state) |
| UI state (modals, tabs, dropdowns) | Zustand (lightweight) |
| Real-time subscriptions | Supabase Realtime hooks (custom) |
| Forms | React Hook Form + Zod validation |
| Optimistic updates | useOptimistic (React 19) |
| Global user context | React Context (auth session, hospital context) |

---

## 10. Caching Strategy

| Data | Cache Strategy |
|---|---|
| User session / JWT | Supabase cookie-based session, 1hr TTL |
| Knowledge base articles | Next.js `unstable_cache`, revalidated on edit |
| KPI metrics | `revalidate: 300` (5 min) |
| Static assets | Vercel CDN, immutable |
| Document listings | `revalidate: 60` |
| Real-time data (chat, notifications) | No cache — Realtime subscriptions |
| AI embeddings | Stored in DB, never re-generated unless content changes |

---

## 11. Technology Decisions

| Concern | Choice | Rationale |
|---|---|---|
| AI Model | Claude claude-sonnet-4-6 | Best balance of quality and cost for internal assistant |
| Embedding Model | text-embedding-3-small (OpenAI) | Cost-effective, high quality |
| Vector Store | pgvector (Supabase) | No additional infrastructure; co-located with data |
| File Storage | Supabase Storage | Integrated auth + RLS on buckets |
| Calendar Sync | Microsoft Graph API | Organization uses Microsoft 365 |
| Real-time | Supabase Realtime | Already in stack, no extra service |
| Email | Resend | Simple transactional emails from API routes |
| PDF Preview | react-pdf | Client-side PDF rendering |
| Rich Text | Tiptap | Extensible, headless, works with Shadcn |
| Charts | Recharts | Lightweight, composable, React-native |

---

## 12. Deployment Architecture

```
┌─────────────────────────────────┐
│         Vercel                  │
│  ┌──────────────────────────┐   │
│  │  Next.js App             │   │
│  │  ├── Edge Middleware     │   │
│  │  ├── RSC (Node runtime)  │   │
│  │  ├── API Routes          │   │
│  │  └── Cron Jobs           │   │
│  └──────────────────────────┘   │
│  Vercel Analytics + Speed Insights│
└─────────────────────────────────┘
         │                │
         ▼                ▼
┌─────────────┐  ┌────────────────┐
│  Supabase   │  │  External APIs │
│  Project    │  │  ├── Anthropic │
│  ├── Auth   │  │  ├── MS Graph  │
│  ├── DB     │  │  ├── OpenAI    │
│  ├── Storage│  │  └── Resend    │
│  └── Realtime│ └────────────────┘
└─────────────┘

Environment: Production
  - Vercel: Production deployment (main branch)
  - Vercel: Preview deployments (feature branches)
  - Supabase: Production project
  - Supabase: Staging project (separate)
```

---

## 13. Environment Configuration

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# Microsoft 365
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=

# App
NEXT_PUBLIC_APP_URL=
NEXTAUTH_SECRET=

# Email
RESEND_API_KEY=

# Cron Security
CRON_SECRET=
```

All environment variables set in Vercel project settings (never committed to git).
