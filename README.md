# VetCentral AI Operating System

An enterprise-grade internal operations platform for multi-hospital veterinary organizations. Centralizes HR, onboarding, scheduling, document management, task workflows, approvals, and AI-assisted operations across multiple hospital locations from a single platform.

---

## Features

- **AI Assistant** — Conversational AI (Llama 3 via Replicate) with document upload, chat history, and knowledge base search
- **Multi-Hospital Management** — Single instance, multi-tenant architecture supporting multiple hospitals under one organization
- **Employee Onboarding** — Self-service onboarding flows, task checklists, and progress tracking
- **Document Management** — Upload, parse, and search SOPs, policies, and training materials (PDF + Word)
- **Approval Center** — Multi-step approval workflows for requests, expenses, and scheduling
- **Calendar & Scheduling** — Shift scheduling with optional Microsoft Outlook/365 sync via Graph API
- **HR Module** — Employee records, departments, roles, and permission matrix
- **Training Tracker** — Assign and track training completion across staff
- **Knowledge Base** — Searchable internal wiki with AI-powered retrieval
- **KPI & Analytics** — Dashboards and charts for operational metrics
- **Notifications** — In-app and email notifications via Resend
- **Role-Based Access Control** — Granular permissions per role and hospital

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth + Row Level Security |
| AI / LLM | Replicate — Meta Llama 3 70B |
| Email | Resend |
| Calendar Sync | Microsoft Graph API (Outlook 365) |
| Rich Text | Tiptap |
| Document Parsing | pdf-parse, Mammoth (Word) |
| File Uploads | react-dropzone |
| Charts | Recharts |
| Forms | react-hook-form + Zod |
| State | Zustand |
| Deployment | Render (primary) / Vercel (optional) |
| Node | >= 20.0.0 |

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login pages
│   ├── (dashboard)/     # All authenticated feature routes
│   │   ├── admin/       # User, role, hospital, department management
│   │   ├── ai-assistant/
│   │   ├── analytics/
│   │   ├── approvals/
│   │   ├── calendar/
│   │   ├── documents/
│   │   ├── hr/
│   │   ├── knowledge-base/
│   │   ├── onboarding/
│   │   ├── tasks/
│   │   ├── training/
│   │   └── ...
│   └── api/v1/          # REST API routes
├── components/          # Feature + UI components
├── lib/
│   ├── supabase/        # Supabase clients (server, client, admin)
│   ├── ai/              # AI integration logic
│   ├── microsoft/       # Graph API / Outlook sync
│   ├── email/           # Resend email templates
│   └── actions/         # Next.js server actions
├── hooks/               # Custom React hooks
└── types/               # TypeScript definitions
supabase/
└── migrations/          # SQL migration files
```

---

## Local Development

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- A [Supabase](https://supabase.com) project
- A [Replicate](https://replicate.com) account for AI features
- A [Resend](https://resend.com) account for email

### 1. Clone & install

```bash
git clone https://github.com/Gaura-kbgp/VetCentral-AI-Operating-System.git
cd VetCentral-AI-Operating-System
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in the required values:

```env
# Supabase — from supabase.com → Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres:PASSWORD@db.your-project-ref.supabase.co:5432/postgres

# AI — from replicate.com/account/api-tokens
REPLICATE_API_TOKEN=r8_...
AI_ASSISTANT_PROVIDER=replicate
AI_ASSISTANT_MODEL=meta/meta-llama-3-70b-instruct

# Email — from resend.com/api-keys
RESEND_API_KEY=re_...

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Security keys — generate with: openssl rand -hex 32
TOKEN_ENCRYPTION_KEY=your-64-char-hex-string-here
CRON_SECRET=your-cron-secret-here
```

> Microsoft 365 calendar sync keys (`MICROSOFT_*`) are optional. Leave them blank to skip Outlook integration.

### 3. Run database migrations

```bash
npx supabase db push
```

Or apply the SQL files in `supabase/migrations/` manually via the Supabase SQL editor.

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment

### Option A — Render (Recommended)

A `render.yaml` is included in the repo for one-click deploy.

1. Push your repo to GitHub.
2. Go to [render.com](https://render.com) → **New → Blueprint**.
3. Connect your GitHub repo — Render will detect `render.yaml` automatically.
4. In **Environment Variables**, add all keys from `.env.example`.
5. Deploy. Render will run `npm run build && npm run start`.

**Cron jobs** (Outlook webhook renewal) are configured in `render.yaml` and will be created automatically. Set `CRON_SECRET` to the same value in both your app env and the cron service env.

### Option B — Vercel

A `vercel.json` is included.

1. Install the [Vercel CLI](https://vercel.com/docs/cli): `npm i -g vercel`
2. Run `vercel` in the project root and follow the prompts.
3. Add all environment variables in the Vercel dashboard (Project → Settings → Environment Variables).
4. Set `NEXT_PUBLIC_APP_URL` to your Vercel deployment URL.

> Note: Vercel's default serverless function timeout (10s on Hobby) may be limiting for AI responses. Use the Pro plan or set `maxDuration` in `vercel.json`.

### Environment Variables Checklist

| Variable | Required | Source |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project settings |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase project settings |
| `DATABASE_URL` | Yes | Supabase → Database → Connection string |
| `REPLICATE_API_TOKEN` | Yes | replicate.com/account/api-tokens |
| `AI_ASSISTANT_MODEL` | Yes | Any Replicate model ID |
| `RESEND_API_KEY` | Yes | resend.com/api-keys |
| `NEXT_PUBLIC_APP_URL` | Yes | Your deployed URL |
| `TOKEN_ENCRYPTION_KEY` | Yes | `openssl rand -hex 32` |
| `CRON_SECRET` | Yes | `openssl rand -base64 32` |
| `MICROSOFT_CLIENT_ID` | Optional | Azure portal — app registration |
| `MICROSOFT_CLIENT_SECRET` | Optional | Azure portal |
| `MICROSOFT_TENANT_ID` | Optional | Azure portal |
| `MICROSOFT_REDIRECT_URI` | Optional | Your app URL + `/api/v1/calendar/outlook/callback` |
| `OUTLOOK_WEBHOOK_SECRET` | Optional | Any random string |

---

## Microsoft 365 / Outlook Calendar Sync (Optional)

1. Go to [portal.azure.com](https://portal.azure.com) → Azure Active Directory → App registrations → New registration.
2. Set redirect URI to `https://your-app-url/api/v1/calendar/outlook/callback`.
3. Add API permissions: `Calendars.ReadWrite`, `offline_access`.
4. Copy Client ID, Client Secret, and Tenant ID into `.env.local`.
5. In the app, go to **Settings → Integrations** to connect an Outlook account.

---

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full multi-tenant database schema, RLS policies, role/permission matrix, and scaling strategy.

---

## License

Private — All rights reserved. This codebase is proprietary to VetCentral.
