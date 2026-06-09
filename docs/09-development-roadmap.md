# Development Roadmap & Sprint Planning
# Vet AI Operating System
**Version:** 1.0.0  
**Sprint Duration:** 2 weeks  
**Team Size (estimated):** 2-3 developers + 1 designer

---

## Phase Overview

| Phase | Name | Duration | Outcome |
|---|---|---|---|
| Phase 1 | Foundation & MVP | Sprints 1–6 (12 weeks) | Core system live for all 3 hospitals |
| Phase 2 | Full Feature Buildout | Sprints 7–12 (12 weeks) | All modules complete + Outlook sync |
| Phase 3 | AI & Analytics Depth | Sprints 13–16 (8 weeks) | Advanced AI, deep KPIs, voice |
| Phase 4 | Customer-Facing & Integrations | Sprints 17–20 (8 weeks) | Customer AI, Cornerstone layer |

---

## MVP Scope (Phase 1 — 12 Weeks)

MVP is a fully usable system that solves the most critical pain points:
1. Centralized calendar with Outlook sync
2. Internal communication (channels + DMs)
3. Document management
4. Knowledge base with AI search
5. Basic user management with RBAC

Everything needed for staff to stop relying on scattered emails and Outlook alone.

---

## Sprint 1 (Weeks 1–2): Foundation

**Goal:** Project setup, auth, multi-hospital scaffolding

### Tasks
- [ ] Initialize Next.js 15 project with TypeScript, Tailwind, Shadcn
- [ ] Configure Supabase project (DB, Auth, Storage)
- [ ] Run migrations 001–003 (core tables: orgs, hospitals, profiles, roles)
- [ ] Implement Supabase Auth (email/password)
- [ ] Build custom JWT claims hook (inject org_id, hospital_ids, roles)
- [ ] Build Next.js middleware (session validation + hospital context injection)
- [ ] Build app shell: sidebar, top nav, hospital switcher
- [ ] Deploy to Vercel (preview + production environments)
- [ ] Configure environment variables in Vercel

**Definition of Done:**
- User can log in and see the sidebar
- Hospital switcher shows their assigned hospitals
- Session is validated on every route

---

## Sprint 2 (Weeks 3–4): Communication

**Goal:** Real-time team communication (channels + DMs)

### Tasks
- [ ] Run migration 004 (channels, messages, notifications)
- [ ] Enable RLS for communication tables
- [ ] Build channel list sidebar component
- [ ] Build message list with infinite scroll (cursor pagination)
- [ ] Build real-time message delivery via Supabase Realtime
- [ ] Build message input with file attachment support
- [ ] Build DM (direct message) channel creation
- [ ] Build @mention detection and notification creation
- [ ] Build notification bell + notification dropdown
- [ ] Build in-app notification real-time subscription
- [ ] Build emoji reactions
- [ ] Build thread replies (parent_id)

**Definition of Done:**
- Staff can send/receive real-time messages in channels
- Notifications appear without page refresh

---

## Sprint 3 (Weeks 5–6): Calendar + Outlook Sync

**Goal:** Unified calendar with Microsoft Outlook integration

### Tasks
- [ ] Run migration 003 (calendar events, attendees, conflicts, outlook tokens)
- [ ] Build calendar UI (month view, week view, agenda view)
- [ ] Build event creation modal with attendee selector
- [ ] Build calendar filter (by hospital, type, department)
- [ ] Implement Microsoft Graph API OAuth2 flow (connect Outlook)
- [ ] Build delta sync service (poll Outlook calendar changes)
- [ ] Build Graph webhook subscription (real-time Outlook notifications)
- [ ] Build webhook handler at /api/v1/webhooks/outlook
- [ ] Implement conflict detection (DB trigger + UI alert)
- [ ] Build calendar real-time update channel
- [ ] Build Vercel cron for periodic sync fallback
- [ ] Build "Sync Outlook" button + sync status indicator

**Definition of Done:**
- Calendar shows events from VetOS + Outlook
- Creating an event in Outlook appears in VetOS within 60 seconds
- Conflicts are detected and surfaced with an alert

---

## Sprint 4 (Weeks 7–8): Knowledge Base + Document Management

**Goal:** Centralized docs and searchable knowledge base

### Tasks
- [ ] Run migrations 002, 005 (KB articles, documents, folders)
- [ ] Enable RLS for KB and document tables
- [ ] Build KB article list with category filter
- [ ] Build Tiptap rich text editor for article creation/editing
- [ ] Build article viewer (read-only rendering)
- [ ] Build article version history UI
- [ ] Build KB full-text search (Postgres FTS)
- [ ] Build document folder tree navigation
- [ ] Build file upload dropzone (to Supabase Storage via signed URLs)
- [ ] Build document listing (grid + list views)
- [ ] Build in-browser PDF preview
- [ ] Build document permissions UI (share with user/role)
- [ ] Build secure download (signed URL generation)
- [ ] Build document search

**Definition of Done:**
- Staff can browse, upload, and download documents
- Admins can publish KB articles
- Full-text search returns relevant results

---

## Sprint 5 (Weeks 9–10): AI Assistant + Vector Search

**Goal:** AI-powered knowledge retrieval and chat assistant

### Tasks
- [ ] Enable pgvector extension in Supabase
- [ ] Run migration 009 (document_chunks, ai_conversations, ai_messages)
- [ ] Build document text extraction pipeline (PDF + DOCX)
- [ ] Build chunking and embedding pipeline (OpenAI text-embedding-3-small)
- [ ] Build vector search SQL function (search_document_chunks)
- [ ] Build RAG pipeline (embed → search → assemble context → Claude)
- [ ] Build streaming SSE endpoint at /api/v1/ai/chat
- [ ] Build AI Assistant sidebar component
- [ ] Build conversation list (per-user history)
- [ ] Build voice input (browser Speech API)
- [ ] Build source citation display
- [ ] Build thumbs up/down feedback
- [ ] Auto-index KB articles on publish
- [ ] Auto-index documents on upload

**Definition of Done:**
- User can ask "What is our after-hours protocol?" and get an accurate answer with citations
- AI indexes newly uploaded documents automatically

---

## Sprint 6 (Weeks 11–12): Dashboard + Admin Panel + MVP Polish

**Goal:** Home dashboard, user management, and MVP-ready polish

### Tasks
- [ ] Build home dashboard with all widgets (today's schedule, tasks, announcements, training progress)
- [ ] Build admin user management (invite, list, edit, deactivate)
- [ ] Build role assignment UI per hospital
- [ ] Build audit log viewer
- [ ] Build notification preferences
- [ ] Mobile responsive pass (sidebar → bottom nav, responsive layouts)
- [ ] Error handling throughout (toasts, error boundaries)
- [ ] Loading states and skeletons everywhere
- [ ] Accessibility audit (keyboard navigation, ARIA labels)
- [ ] Performance audit (Lighthouse > 90)
- [ ] Security review (RBAC, RLS policy testing)
- [ ] UAT with hospital staff (Dr. Hall, Haley, Brian)

**Definition of Done:**
- System is usable by all 3 hospitals
- All role-based access controls work correctly
- No critical bugs in core flows

---

## Phase 2 Sprints (Weeks 13–24)

### Sprint 7–8: Training / LMS
- Course builder (module + lesson + quiz creation)
- Course enrollment (manual + auto-assign by role)
- Lesson player (video, text, file types)
- Quiz engine with scoring
- Completion tracking + certificates
- Manager progress dashboard

### Sprint 9–10: Project Management
- Project creation with board/list/timeline views
- Kanban board with drag-and-drop (dnd-kit)
- Task CRUD (title, assignee, due date, priority, status)
- Sub-tasks
- Task comments with @mentions
- Project activity log
- My tasks view (cross-project)

### Sprint 11: Workflow & Request Portal
- Request form builder (admin drag-and-drop)
- Dynamic form renderer
- Submission + approval routing
- Status tracking UI
- Email notifications on status change

### Sprint 12: Employee Onboarding Automation
- Onboarding template builder
- Auto-trigger on new user creation
- Onboarding checklist UI for employee
- Progress tracker for HR/manager
- Auto-assign training courses
- Auto-create onboarding calendar events

---

## Phase 3 Sprints (Weeks 25–32)

### Sprint 13–14: KPI & Analytics
- Org-wide KPI dashboard
- Hospital-level dashboards
- Training completion metrics
- Request volume charts
- Calendar activity metrics
- Daily KPI snapshot cron
- CSV export

### Sprint 15: Asset Library & Brand Center
- File type organization (logos, templates, videos)
- Brand guidelines page
- Tag-based browsing
- Asset sharing links

### Sprint 16: Advanced AI Features
- AI calendar queries ("Who is off next week?")
- AI-generated article summaries
- Proactive content suggestions on page load
- Improved prompt engineering from feedback data

---

## Phase 4 Sprints (Weeks 33–40)

### Sprint 17–18: Microsoft 365 Deeper Integration
- SSO via Microsoft Azure AD
- Teams notification bridge
- Outlook email notifications from VetOS

### Sprint 19–20: Cornerstone Integration Layer (Read-Only)
- API connection to Cornerstone
- Appointment count surfacing in KPI dashboard
- Doctor schedule import from Cornerstone

---

## Testing Strategy

| Type | Tool | When |
|---|---|---|
| Unit Tests | Vitest | Every module |
| Integration Tests | Playwright | API routes, auth flows |
| E2E Tests | Playwright | Critical user journeys |
| RLS Tests | pgTAP | Every new policy |
| Performance | Lighthouse CI | Before each release |
| Security | Manual RBAC audit | End of each phase |

---

## Definition of Done (per sprint)

- [ ] All acceptance criteria met
- [ ] RLS policies tested for all user roles
- [ ] No TypeScript errors (`tsc --noEmit` passes)
- [ ] ESLint passes
- [ ] Mobile responsive (tested on 375px and 768px)
- [ ] Deployed to preview environment
- [ ] Demo walkthrough with stakeholder (Haley / Dr. Hall)
