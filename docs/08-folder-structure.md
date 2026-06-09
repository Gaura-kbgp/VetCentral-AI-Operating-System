# Next.js Project Folder Structure
# Vet AI Operating System
**Version:** 1.0.0

---

## Complete Folder Structure

```
vet-ai-system/
├── .env.local                          # Local secrets (never commit)
├── .env.example                        # Template (safe to commit)
├── .gitignore
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── middleware.ts                        # Edge auth + RBAC + hospital context
│
├── public/
│   ├── favicon.ico
│   ├── logo.svg
│   └── og-image.png
│
├── src/
│   ├── app/                             # Next.js App Router
│   │   │
│   │   ├── (auth)/                      # Public auth routes (no sidebar)
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   ├── forgot-password/
│   │   │   │   └── page.tsx
│   │   │   ├── reset-password/
│   │   │   │   └── page.tsx
│   │   │   ├── accept-invite/
│   │   │   │   └── page.tsx             # Invitation acceptance flow
│   │   │   └── layout.tsx               # Centered auth layout
│   │   │
│   │   ├── (dashboard)/                 # Protected dashboard routes
│   │   │   ├── layout.tsx               # Sidebar + topnav shell
│   │   │   │
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx             # Home dashboard
│   │   │   │
│   │   │   ├── ai-assistant/
│   │   │   │   └── page.tsx             # Full-screen AI chat (mobile)
│   │   │   │
│   │   │   ├── calendar/
│   │   │   │   ├── page.tsx             # Month/week/day view
│   │   │   │   ├── [eventId]/
│   │   │   │   │   └── page.tsx         # Event detail
│   │   │   │   └── new/
│   │   │   │       └── page.tsx         # Create event form
│   │   │   │
│   │   │   ├── knowledge-base/
│   │   │   │   ├── page.tsx             # KB home + search
│   │   │   │   ├── [articleId]/
│   │   │   │   │   ├── page.tsx         # Article view
│   │   │   │   │   └── edit/
│   │   │   │   │       └── page.tsx     # Article editor
│   │   │   │   └── new/
│   │   │   │       └── page.tsx         # New article editor
│   │   │   │
│   │   │   ├── training/
│   │   │   │   ├── page.tsx             # My courses list
│   │   │   │   ├── [courseId]/
│   │   │   │   │   ├── page.tsx         # Course overview
│   │   │   │   │   └── [lessonId]/
│   │   │   │   │       └── page.tsx     # Lesson player
│   │   │   │   └── admin/               # (admin/manager only)
│   │   │   │       ├── page.tsx         # Course management
│   │   │   │       ├── new/
│   │   │   │       │   └── page.tsx     # Course builder
│   │   │   │       └── [courseId]/
│   │   │   │           └── edit/
│   │   │   │               └── page.tsx
│   │   │   │
│   │   │   ├── communication/
│   │   │   │   ├── page.tsx             # Default redirect to first channel
│   │   │   │   └── [channelId]/
│   │   │   │       └── page.tsx         # Channel chat view
│   │   │   │
│   │   │   ├── documents/
│   │   │   │   ├── page.tsx             # Folder browser
│   │   │   │   └── [folderId]/
│   │   │   │       └── page.tsx         # Folder contents
│   │   │   │
│   │   │   ├── projects/
│   │   │   │   ├── page.tsx             # Projects list
│   │   │   │   ├── [projectId]/
│   │   │   │   │   ├── page.tsx         # Board view
│   │   │   │   │   ├── list/
│   │   │   │   │   │   └── page.tsx     # List view
│   │   │   │   │   └── timeline/
│   │   │   │   │       └── page.tsx     # Timeline/Gantt view
│   │   │   │   └── new/
│   │   │   │       └── page.tsx
│   │   │   │
│   │   │   ├── workflows/
│   │   │   │   ├── page.tsx             # Request portal
│   │   │   │   ├── submit/[formId]/
│   │   │   │   │   └── page.tsx         # Submit a request
│   │   │   │   ├── [requestId]/
│   │   │   │   │   └── page.tsx         # Request status
│   │   │   │   └── admin/
│   │   │   │       └── page.tsx         # Approval queue
│   │   │   │
│   │   │   ├── kpi/
│   │   │   │   └── page.tsx             # KPI dashboard
│   │   │   │
│   │   │   ├── assets/
│   │   │   │   └── page.tsx             # Brand & asset library
│   │   │   │
│   │   │   ├── onboarding/
│   │   │   │   ├── page.tsx             # My onboarding (new employee view)
│   │   │   │   └── admin/
│   │   │   │       ├── page.tsx         # Onboarding management
│   │   │   │       └── [userId]/
│   │   │   │           └── page.tsx     # Individual onboarding tracker
│   │   │   │
│   │   │   └── admin/                   # Admin-only section
│   │   │       ├── page.tsx             # Admin home
│   │   │       ├── users/
│   │   │       │   ├── page.tsx         # User management
│   │   │       │   ├── invite/
│   │   │       │   │   └── page.tsx
│   │   │       │   └── [userId]/
│   │   │       │       └── page.tsx     # User detail + role management
│   │   │       ├── hospitals/
│   │   │       │   ├── page.tsx
│   │   │       │   └── [hospitalId]/
│   │   │       │       └── page.tsx
│   │   │       ├── audit-logs/
│   │   │       │   └── page.tsx
│   │   │       └── settings/
│   │   │           └── page.tsx
│   │   │
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── auth/
│   │   │       │   ├── invite/route.ts
│   │   │       │   ├── accept-invite/route.ts
│   │   │       │   └── me/route.ts
│   │   │       ├── ai/
│   │   │       │   ├── chat/route.ts        # Streaming SSE endpoint
│   │   │       │   ├── search/route.ts
│   │   │       │   └── index-document/route.ts
│   │   │       ├── calendar/
│   │   │       │   ├── events/route.ts
│   │   │       │   ├── events/[id]/route.ts
│   │   │       │   ├── conflicts/route.ts
│   │   │       │   └── outlook/
│   │   │       │       ├── connect/route.ts
│   │   │       │       ├── callback/route.ts
│   │   │       │       └── sync/route.ts
│   │   │       ├── kb/
│   │   │       │   ├── articles/route.ts
│   │   │       │   ├── articles/[id]/route.ts
│   │   │       │   └── search/route.ts
│   │   │       ├── channels/
│   │   │       │   ├── route.ts
│   │   │       │   └── [id]/
│   │   │       │       ├── route.ts
│   │   │       │       └── messages/route.ts
│   │   │       ├── documents/
│   │   │       │   ├── route.ts
│   │   │       │   ├── upload/route.ts
│   │   │       │   └── [id]/route.ts
│   │   │       ├── notifications/route.ts
│   │   │       ├── webhooks/
│   │   │       │   └── outlook/route.ts
│   │   │       └── cron/
│   │   │           ├── outlook-sync/route.ts
│   │   │           ├── kpi-snapshot/route.ts
│   │   │           └── renew-subscriptions/route.ts
│   │   │
│   │   ├── error.tsx                    # Global error boundary
│   │   ├── not-found.tsx
│   │   └── layout.tsx                   # Root layout (fonts, providers)
│   │
│   ├── components/
│   │   ├── ui/                          # Shadcn UI primitives (auto-generated)
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── input.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── avatar.tsx
│   │   │   ├── calendar.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── sheet.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── toast.tsx
│   │   │   └── ... (all shadcn components)
│   │   │
│   │   ├── layout/                      # App shell components
│   │   │   ├── Sidebar.tsx
│   │   │   ├── TopNav.tsx
│   │   │   ├── HospitalSwitcher.tsx
│   │   │   ├── NotificationBell.tsx
│   │   │   ├── UserMenu.tsx
│   │   │   └── MobileBottomNav.tsx
│   │   │
│   │   ├── dashboard/
│   │   │   ├── WelcomeWidget.tsx
│   │   │   ├── TodayScheduleWidget.tsx
│   │   │   ├── MyTasksWidget.tsx
│   │   │   ├── AnnouncementsWidget.tsx
│   │   │   ├── TrainingProgressWidget.tsx
│   │   │   └── QuickActionsWidget.tsx
│   │   │
│   │   ├── ai/
│   │   │   ├── AIAssistantSidebar.tsx
│   │   │   ├── ChatMessage.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── VoiceInput.tsx
│   │   │   ├── SourceCitations.tsx
│   │   │   └── ConversationList.tsx
│   │   │
│   │   ├── calendar/
│   │   │   ├── CalendarView.tsx         # Main calendar (month/week/day)
│   │   │   ├── EventCard.tsx
│   │   │   ├── EventModal.tsx
│   │   │   ├── ConflictAlert.tsx
│   │   │   ├── CalendarFilters.tsx
│   │   │   └── OutlookSyncStatus.tsx
│   │   │
│   │   ├── communication/
│   │   │   ├── ChannelList.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageItem.tsx
│   │   │   ├── MessageInput.tsx
│   │   │   ├── ThreadPanel.tsx
│   │   │   └── EmojiPicker.tsx
│   │   │
│   │   ├── knowledge-base/
│   │   │   ├── ArticleList.tsx
│   │   │   ├── ArticleCard.tsx
│   │   │   ├── ArticleEditor.tsx        # Tiptap rich text editor
│   │   │   ├── ArticleViewer.tsx
│   │   │   ├── CategoryTree.tsx
│   │   │   └── SearchResults.tsx
│   │   │
│   │   ├── documents/
│   │   │   ├── FolderTree.tsx
│   │   │   ├── DocumentGrid.tsx
│   │   │   ├── DocumentCard.tsx
│   │   │   ├── FileUploadZone.tsx
│   │   │   └── DocumentPreview.tsx
│   │   │
│   │   ├── training/
│   │   │   ├── CourseCard.tsx
│   │   │   ├── CourseProgress.tsx
│   │   │   ├── LessonPlayer.tsx
│   │   │   ├── QuizEngine.tsx
│   │   │   └── CertificateView.tsx
│   │   │
│   │   ├── projects/
│   │   │   ├── KanbanBoard.tsx
│   │   │   ├── TaskCard.tsx
│   │   │   ├── TaskModal.tsx
│   │   │   ├── ProjectList.tsx
│   │   │   └── GanttChart.tsx
│   │   │
│   │   ├── workflows/
│   │   │   ├── RequestForm.tsx          # Dynamic form renderer
│   │   │   ├── RequestCard.tsx
│   │   │   ├── ApprovalQueue.tsx
│   │   │   └── WorkflowStatus.tsx
│   │   │
│   │   ├── kpi/
│   │   │   ├── MetricCard.tsx
│   │   │   ├── TrainingCompletionChart.tsx
│   │   │   ├── RequestVolumeChart.tsx
│   │   │   ├── ActivityChart.tsx
│   │   │   └── HospitalComparisonChart.tsx
│   │   │
│   │   └── shared/
│   │       ├── LoadingSpinner.tsx
│   │       ├── EmptyState.tsx
│   │       ├── ErrorBoundary.tsx
│   │       ├── ConfirmDialog.tsx
│   │       ├── PageHeader.tsx
│   │       ├── SearchInput.tsx
│   │       ├── UserAvatar.tsx
│   │       ├── RoleBadge.tsx
│   │       └── HospitalBadge.tsx
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── server.ts                # Server-side Supabase client
│   │   │   ├── client.ts                # Browser-side Supabase client
│   │   │   ├── middleware.ts            # Auth middleware helpers
│   │   │   └── types.ts                 # Generated DB types
│   │   │
│   │   ├── ai/
│   │   │   ├── anthropic.ts             # Anthropic client + chat function
│   │   │   ├── embeddings.ts            # OpenAI embedding calls
│   │   │   ├── rag.ts                   # RAG pipeline (search + generate)
│   │   │   ├── indexer.ts               # Document indexing pipeline
│   │   │   └── prompts.ts               # System prompts
│   │   │
│   │   ├── microsoft/
│   │   │   ├── graph.ts                 # MS Graph API client
│   │   │   ├── calendar-sync.ts         # Outlook sync logic
│   │   │   ├── conflict-detection.ts    # Overlap detection
│   │   │   └── token-manager.ts         # OAuth token refresh
│   │   │
│   │   ├── email/
│   │   │   ├── resend.ts                # Resend client
│   │   │   └── templates/
│   │   │       ├── invite.tsx           # React Email template
│   │   │       ├── notification.tsx
│   │   │       └── password-reset.tsx
│   │   │
│   │   ├── auth/
│   │   │   ├── session.ts               # Session helpers
│   │   │   ├── permissions.ts           # RBAC helpers
│   │   │   └── context.ts               # Hospital context resolver
│   │   │
│   │   ├── realtime/
│   │   │   ├── channels.ts              # Realtime channel names
│   │   │   └── hooks.ts                 # useRealtimeSubscription hook
│   │   │
│   │   └── utils/
│   │       ├── cn.ts                    # Tailwind class merger
│   │       ├── date.ts                  # Date formatting helpers
│   │       ├── crypto.ts                # Token encryption/decryption
│   │       └── format.ts                # Number/text formatting
│   │
│   ├── actions/                         # Server Actions
│   │   ├── auth.ts
│   │   ├── calendar.ts
│   │   ├── knowledge-base.ts
│   │   ├── documents.ts
│   │   ├── communication.ts
│   │   ├── training.ts
│   │   ├── projects.ts
│   │   ├── workflows.ts
│   │   ├── notifications.ts
│   │   └── admin.ts
│   │
│   ├── hooks/                           # Custom React hooks
│   │   ├── use-hospital-context.ts
│   │   ├── use-realtime-messages.ts
│   │   ├── use-realtime-notifications.ts
│   │   ├── use-calendar-events.ts
│   │   ├── use-ai-chat.ts
│   │   └── use-file-upload.ts
│   │
│   ├── stores/                          # Zustand stores
│   │   ├── ui-store.ts                  # Sidebar open/close, AI panel state
│   │   ├── hospital-store.ts            # Active hospital, hospital switcher
│   │   └── notification-store.ts        # Unread count, notifications list
│   │
│   ├── types/
│   │   ├── database.ts                  # Generated from Supabase (supabase gen types)
│   │   ├── api.ts                       # API request/response types
│   │   ├── permissions.ts               # RBAC types
│   │   └── calendar.ts                  # Calendar-specific types
│   │
│   └── config/
│       ├── nav.ts                       # Sidebar navigation config (role-filtered)
│       ├── permissions.ts               # Permission matrix constants
│       └── constants.ts                 # App-wide constants
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_create_core_tables.sql
│   │   ├── 002_create_kb_tables.sql
│   │   ├── 003_create_calendar_tables.sql
│   │   ├── 004_create_communication_tables.sql
│   │   ├── 005_create_documents_tables.sql
│   │   ├── 006_create_training_tables.sql
│   │   ├── 007_create_project_tables.sql
│   │   ├── 008_create_workflow_tables.sql
│   │   ├── 009_create_ai_tables.sql
│   │   ├── 010_create_kpi_tables.sql
│   │   ├── 011_create_audit_tables.sql
│   │   ├── 012_enable_rls.sql
│   │   ├── 013_rls_policies.sql
│   │   ├── 014_functions_triggers.sql
│   │   └── 015_seed_data.sql
│   │
│   ├── functions/
│   │   ├── custom-access-token/         # JWT claims hook
│   │   │   └── index.ts
│   │   └── on-user-created/             # Auto-create profile + onboarding
│   │       └── index.ts
│   │
│   └── config.toml
│
└── docs/
    ├── 01-SRS.md
    ├── 02-system-architecture.md
    ├── 03-database-schema.md
    ├── 04-api-architecture.md
    ├── 05-ai-system-design.md
    ├── 06-security-architecture.md
    ├── 07-ui-wireframes.md
    ├── 08-folder-structure.md
    ├── 09-development-roadmap.md
    ├── 10-deployment-plan.md
    └── 11-cost-estimation.md
```

---

## Key Configuration Files

### next.config.ts
```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  experimental: {
    serverActions: { allowedOrigins: [process.env.NEXT_PUBLIC_APP_URL!] },
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    },
  ],
};

export default nextConfig;
```

### package.json (key dependencies)
```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "typescript": "^5.0.0",
    "@supabase/supabase-js": "^2.0.0",
    "@supabase/ssr": "^0.5.0",
    "@anthropic-ai/sdk": "^0.34.0",
    "openai": "^4.0.0",
    "@microsoft/microsoft-graph-client": "^3.0.0",
    "tailwindcss": "^3.4.0",
    "@radix-ui/react-*": "latest",
    "zustand": "^5.0.0",
    "react-hook-form": "^7.0.0",
    "zod": "^3.0.0",
    "@tiptap/react": "^2.0.0",
    "@tiptap/starter-kit": "^2.0.0",
    "recharts": "^2.0.0",
    "react-pdf": "^9.0.0",
    "pdf-parse": "^1.0.0",
    "mammoth": "^1.0.0",
    "resend": "^4.0.0",
    "date-fns": "^4.0.0",
    "react-dropzone": "^14.0.0",
    "lucide-react": "^0.460.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0",
    "supabase": "^2.0.0"
  }
}
```

### .env.example
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AI
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Microsoft 365
MICROSOFT_CLIENT_ID=your-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret
MICROSOFT_TENANT_ID=your-tenant-id
MICROSOFT_REDIRECT_URI=https://your-app.vercel.app/api/v1/calendar/outlook/callback
OUTLOOK_WEBHOOK_SECRET=your-random-webhook-secret

# App
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
NEXTAUTH_SECRET=your-nextauth-secret

# Email
RESEND_API_KEY=re_...

# Security
TOKEN_ENCRYPTION_KEY=your-32-byte-hex-key
CRON_SECRET=your-cron-secret
```
