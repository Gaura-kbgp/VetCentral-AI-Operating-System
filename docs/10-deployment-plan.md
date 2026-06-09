# Deployment Plan & Cost Estimation
# Vet AI Operating System
**Version:** 1.0.0

---

## 1. Deployment Architecture

### Infrastructure Stack

```
┌─────────────────────────────────────────────────────────┐
│                   PRODUCTION STACK                      │
├──────────────────┬──────────────────┬───────────────────┤
│  VERCEL PRO      │  SUPABASE PRO    │  EXTERNAL APIS    │
│                  │                  │                   │
│  - Next.js app   │  - PostgreSQL    │  - Anthropic API  │
│  - Edge runtime  │  - Auth          │  - OpenAI API     │
│  - CDN (global)  │  - Storage       │  - MS Graph API   │
│  - Cron jobs     │  - Realtime      │  - Resend Email   │
│  - Preview envs  │  - Edge Functions│                   │
│  - Analytics     │  - Backups (daily)│                  │
└──────────────────┴──────────────────┴───────────────────┘
```

---

## 2. Environment Strategy

| Environment | Purpose | Branch | URL |
|---|---|---|---|
| Production | Live system for all hospitals | `main` | `app.vetaisystem.com` |
| Staging | Pre-release testing | `staging` | `staging.vetaisystem.com` |
| Preview | Per-PR preview (Vercel auto) | `feature/*` | `*.vercel.app` |
| Local | Development | `feature/*` | `localhost:3000` |

### Supabase Projects
- **Production project**: Live data, point-in-time recovery enabled
- **Staging project**: Clone of production schema, synthetic data only

---

## 3. Deployment Pipeline (CI/CD)

```
Developer pushes to feature branch
          │
          ▼
GitHub Actions CI:
  ├── npm ci
  ├── tsc --noEmit (TypeScript check)
  ├── eslint
  └── vitest (unit tests)
          │
          ▼ (on PR open)
Vercel Preview Deployment
  └── Preview URL auto-posted to PR
          │
          ▼ (on PR merge to staging)
Vercel Staging Deployment
  ├── Run Supabase migrations on staging DB
  └── E2E tests (Playwright) against staging
          │
          ▼ (on staging approval → merge to main)
Vercel Production Deployment
  ├── Run Supabase migrations on production DB
  └── Vercel zero-downtime deployment
```

### GitHub Actions Workflow
```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx eslint .
      - run: npx vitest run

  migrate-staging:
    if: github.ref == 'refs/heads/staging'
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx supabase db push --db-url ${{ secrets.STAGING_DB_URL }}
```

---

## 4. Supabase Configuration

### Database Migrations via Supabase CLI
```bash
# Local development
supabase start                         # start local Supabase
supabase migration new create_kb_tables  # create new migration
supabase db push                       # push to remote

# Production migrations
supabase db push --db-url $PROD_DB_URL
```

### Supabase Edge Functions Deployment
```bash
supabase functions deploy custom-access-token
supabase functions deploy on-user-created
```

### Type Generation
```bash
supabase gen types typescript --project-id $PROJECT_ID > src/types/database.ts
```

---

## 5. Vercel Configuration

### vercel.json
```json
{
  "crons": [
    {
      "path": "/api/v1/cron/outlook-sync",
      "schedule": "*/15 * * * *"
    },
    {
      "path": "/api/v1/cron/kpi-snapshot",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/v1/cron/renew-subscriptions",
      "schedule": "0 6 * * *"
    },
    {
      "path": "/api/v1/cron/cleanup-expired-tokens",
      "schedule": "0 3 * * 0"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" }
      ]
    }
  ]
}
```

### Custom Domain
```
app.vetaisystem.com → Vercel production deployment
*.vetaisystem.com   → Subdomain wildcard (optional)
```

---

## 6. Microsoft 365 Setup (One-time)

1. Register an Azure AD App in Microsoft Entra Admin Center
2. Set permissions: `Calendars.ReadWrite`, `User.Read`, `offline_access`
3. Add redirect URI: `https://app.vetaisystem.com/api/v1/calendar/outlook/callback`
4. Copy Client ID, Client Secret, Tenant ID → Vercel env vars
5. Create Graph webhook subscription via API on first user connection

---

## 7. Launch Checklist

### Pre-Launch (1 week before)
- [ ] All migrations run on production Supabase
- [ ] RLS policies tested with all 5+ role types
- [ ] Environment variables verified in Vercel production
- [ ] Custom domain configured with SSL (Vercel auto-provisions Let's Encrypt)
- [ ] Microsoft Azure AD app registered with production redirect URI
- [ ] Resend domain verified for transactional emails
- [ ] Test invite flow end-to-end (invite → accept → login → role-based access)
- [ ] Outlook sync tested with at least one calendar connected
- [ ] AI assistant tested with sample knowledge base content
- [ ] Mobile responsive tested on iPhone and Android
- [ ] Performance: Lighthouse score > 90 on all main pages
- [ ] Error logging configured (Vercel built-in)

### Launch Day
- [ ] Create organization record in production DB
- [ ] Create 3 hospital records (Town & Country, Columbia Pike, Clifton)
- [ ] Invite first admin users (Haley, Brian, IT Admin)
- [ ] Admins complete their own onboarding and configure departments
- [ ] Seed initial knowledge base content (SOPs, handbooks)
- [ ] Connect Outlook calendars for key users
- [ ] Send all-staff announcement via email about VetOS launch

### Post-Launch (Week 1)
- [ ] Monitor error rates in Vercel Analytics
- [ ] Monitor Supabase DB performance (query times, connection count)
- [ ] Collect feedback from Dr. Hall, Haley, and CSR team
- [ ] Address critical bugs (< 48hr SLA for severity 1)
- [ ] Weekly KPI review with stakeholders

---

## 8. Cost Estimation

### Monthly Infrastructure Costs (Production)

#### Vercel
| Plan | Features Needed | Cost |
|---|---|---|
| Vercel Pro | Cron jobs, 10 team members, analytics, no function limit | **$20/month** |

#### Supabase
| Plan | Threshold | Cost |
|---|---|---|
| Supabase Pro | 8GB DB, 100GB storage, 250GB bandwidth, daily backups | **$25/month** |
| Additional Storage | ~50GB additional (documents) | **$0.021/GB** → ~$1/month |

#### AI APIs (variable — estimate for 50-200 users)

| API | Usage Estimate | Cost |
|---|---|---|
| Anthropic (Claude Sonnet) | ~500 AI queries/day × $3/1M input tokens | ~**$45/month** |
| OpenAI Embeddings | ~50K chunks indexed + 10K queries/day | ~**$5/month** |

#### Microsoft Graph API
- Free for Microsoft 365 subscribers (organization already has M365)

#### Resend (Email)
| Plan | Emails/month | Cost |
|---|---|---|
| Free | 3,000 | **$0** |
| Pro (if needed) | 50,000 | $20/month |

#### Total Monthly Cost Estimate

| Service | MVP (50 users) | Growth (200 users) | Scale (500+ users) |
|---|---|---|---|
| Vercel Pro | $20 | $20 | $20–$150 |
| Supabase Pro | $25 | $25–$50 | $50–$200 |
| Anthropic API | $15 | $45 | $150 |
| OpenAI Embeddings | $2 | $5 | $15 |
| Resend | $0 | $0–$20 | $20 |
| **TOTAL** | **~$62/month** | **~$115/month** | **~$435/month** |

This is dramatically cheaper than any enterprise SaaS alternative (Slack + SharePoint + Trainual + ClickUp + Guru alone would cost $1,000–$5,000/month for 200 users).

---

## 9. Backup & Disaster Recovery

| Data | Backup | Recovery |
|---|---|---|
| PostgreSQL DB | Supabase Pro: daily backups, 7-day retention | Restore via Supabase dashboard |
| Files (Storage) | Supabase replication | Re-upload if catastrophic |
| Application code | Git (GitHub) — source of truth | Redeploy from git |
| Env variables | Vercel dashboard (encrypted) | Re-configure if needed |

**RTO (Recovery Time Objective):** < 4 hours for full restoration
**RPO (Recovery Point Objective):** < 24 hours (last daily backup)

For critical production incidents:
- Supabase Pro supports point-in-time recovery (PITR) for < 5 min data loss
- PITR available as Supabase add-on (~$100/month)

---

## 10. Scalability Plan

### Current Architecture (3 hospitals, ~200 users)
- Single Supabase project, single Vercel app
- pgvector with IVFFlat (100 lists, suitable to ~500K chunks)
- Supabase Pro plan

### Scale to 20 hospitals, ~2,000 users
- Supabase: upgrade to Team plan ($599/month) for SOC2, more connections
- Vercel: upgrade to Enterprise for more concurrent functions
- Add Upstash Redis for rate limiting and caching
- Add background job queue (Trigger.dev or Inngest) for document indexing
- pgvector: increase IVFFlat lists to 500

### Scale to 100+ hospitals, 10,000+ users
- Consider Supabase Enterprise (dedicated infrastructure)
- Add read replicas for high-volume analytics queries
- Split document indexing to dedicated background service
- Consider dedicated vector DB (Pinecone or Weaviate) if pgvector becomes bottleneck
- Implement connection pooling (PgBouncer via Supabase)
- Add Cloudflare CDN for file delivery

---

## 11. Monitoring & Observability

| Tool | Purpose | Cost |
|---|---|---|
| Vercel Analytics | Page views, core web vitals, function usage | Included in Pro |
| Vercel Speed Insights | Real user performance monitoring | Included in Pro |
| Supabase Dashboard | DB query performance, connection counts | Included |
| Custom error logging | Server-side errors → email alert | Via Resend (free) |

### Key Metrics to Monitor
- P95 page load time (target: < 2 seconds)
- AI response time (target: < 5 seconds)
- Supabase connection count (stay under 60 on Pro)
- Outlook sync success rate (target: > 99%)
- DB query execution time (flag queries > 100ms)
- Storage usage growth rate
