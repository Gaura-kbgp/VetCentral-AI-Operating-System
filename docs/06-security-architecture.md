# Security Architecture
# Vet AI Operating System
**Version:** 1.0.0

---

## 1. Security Principles

1. **Zero Trust**: Every request is authenticated and authorized, even internal ones
2. **Least Privilege**: Users receive minimum permissions necessary for their role
3. **Defense in Depth**: Security at every layer (edge, API, database, storage)
4. **Audit Everything**: All write operations logged with actor and context
5. **No Secrets in Code**: All credentials via environment variables only
6. **Data Minimization**: Store only what's needed; never store patient data in VetOS

---

## 2. Authentication Architecture

### Session Management
```
Supabase Auth Issues JWT (signed RS256)
       │
       ▼
JWT Stored in HttpOnly Cookie (SameSite=Lax, Secure=true)
       │
       ▼
Next.js Middleware validates cookie on every request (edge)
       │
       ├── Valid → extract claims, inject context headers
       └── Invalid/Expired → redirect /login
```

### JWT Custom Claims (set via Supabase Auth Hook)
```json
{
  "sub": "user-uuid",
  "email": "dr.hall@townandcountryvet.com",
  "role": "authenticated",
  "app_metadata": {
    "org_id": "org-uuid",
    "hospital_ids": ["hospital-1-uuid", "hospital-2-uuid"],
    "roles": {
      "hospital-1-uuid": "doctor",
      "hospital-2-uuid": "viewer"
    },
    "is_super_admin": false
  },
  "exp": 1234567890,
  "iat": 1234567890
}
```

### Auth Hook (Supabase Edge Function)
```typescript
// supabase/functions/custom-access-token/index.ts
// Fires on every token generation/refresh

Deno.serve(async (req) => {
  const { user } = await req.json();

  // Fetch user's hospital roles from DB
  const roles = await fetchUserRoles(user.id);
  
  return new Response(JSON.stringify({
    user_metadata: user.user_metadata,
    app_metadata: {
      org_id: roles.org_id,
      hospital_ids: roles.hospital_ids,
      roles: roles.roleMap,
    }
  }));
});
```

### MFA (TOTP)
- Enforced for: `super_admin`, `org_admin`, `hospital_admin`, `practice_manager`
- Optional for: All other roles
- Implementation: Supabase Auth TOTP built-in
- Recovery: 8 single-use backup codes generated at setup

### Password Policy
```
Minimum length: 12 characters
Require: uppercase, lowercase, number, special character
Bcrypt hashing: handled by Supabase Auth
Password reset: via email link (15 min expiry)
Session invalidation: all sessions revoked on password change
```

---

## 3. Role-Based Access Control (RBAC)

### Permission Hierarchy

```
super_admin
    │ (all permissions, all orgs)
    ▼
org_admin
    │ (all permissions within org)
    ▼
hospital_admin
    │ (all permissions within hospital)
    ▼
practice_manager
    │ (operational permissions within hospital)
    ▼
doctor / hr / marketing / it_admin
    │ (role-specific permissions)
    ▼
csr / va
    │ (limited read + request permissions)
    ▼
viewer
    (read-only access)
```

### Permission Matrix

| Permission | super_admin | org_admin | hospital_admin | practice_manager | doctor | csr | va | viewer |
|---|---|---|---|---|---|---|---|---|
| Manage organizations | ✓ | | | | | | | |
| Manage hospitals | ✓ | ✓ | | | | | | |
| Manage users | ✓ | ✓ | ✓ | | | | | |
| Manage roles | ✓ | ✓ | ✓ | | | | | |
| View audit logs | ✓ | ✓ | ✓ | | | | | |
| Publish KB articles | ✓ | ✓ | ✓ | ✓ | | | | |
| Create KB articles | ✓ | ✓ | ✓ | ✓ | ✓ | | | |
| View KB articles | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Manage documents | ✓ | ✓ | ✓ | ✓ | | | | |
| Upload documents | ✓ | ✓ | ✓ | ✓ | ✓ | | | |
| View documents | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create events | ✓ | ✓ | ✓ | ✓ | | | | |
| View calendar | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create channels | ✓ | ✓ | ✓ | ✓ | | | | |
| Send messages | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| Create projects | ✓ | ✓ | ✓ | ✓ | ✓ | | | |
| View KPI dashboard | ✓ | ✓ | ✓ | ✓ | | | | |
| Manage workflows | ✓ | ✓ | ✓ | ✓ | | | | |
| Submit requests | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| Create courses | ✓ | ✓ | ✓ | ✓ | | | | |
| Take training | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| Use AI Assistant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### RBAC Enforcement Layers

**Layer 1: Next.js Middleware** (Edge)
```typescript
const ROLE_REQUIRED_ROUTES: Record<string, app_role[]> = {
  '/admin': ['super_admin', 'org_admin', 'hospital_admin'],
  '/kpi': ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager'],
  '/admin/audit-logs': ['super_admin', 'org_admin', 'hospital_admin'],
};

export async function middleware(req: NextRequest) {
  const roles = getClaimsFromCookie(req);
  const requiredRoles = ROLE_REQUIRED_ROUTES[req.pathname];
  if (requiredRoles && !hasAnyRole(roles, requiredRoles)) {
    return NextResponse.redirect('/403');
  }
}
```

**Layer 2: Server Actions / API Handlers**
```typescript
export async function publishArticle(articleId: string) {
  const { role } = await requireHospitalRole(['super_admin', 'org_admin', 'hospital_admin', 'practice_manager']);
  // ... proceed
}
```

**Layer 3: Database RLS Policies**
All queries enforced by PostgreSQL RLS — even if Layer 1 and 2 are bypassed, the DB will reject unauthorized reads/writes.

---

## 4. Row-Level Security Design

### Key Patterns

**Pattern 1: Org Isolation**
```sql
-- User can only see data from their org
CREATE POLICY "org_isolation" ON kb_articles
  FOR SELECT USING (org_id = auth.org_id());
```

**Pattern 2: Hospital Scoping**
```sql
-- User can see hospital-level data if they have access to that hospital
CREATE POLICY "hospital_scope" ON calendar_events
  FOR SELECT USING (
    hospital_id = ANY(auth.accessible_hospital_ids())
    OR hospital_id IS NULL
  );
```

**Pattern 3: Own-Data Only**
```sql
-- Users can only see their own conversations
CREATE POLICY "own_conversations" ON ai_conversations
  FOR ALL USING (user_id = auth.uid());
```

**Pattern 4: Role-Gated Write**
```sql
-- Only managers+ can create events
CREATE POLICY "create_events" ON calendar_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_hospital_roles
      WHERE user_id = auth.uid()
        AND hospital_id = NEW.hospital_id
        AND role IN ('super_admin', 'org_admin', 'hospital_admin', 'practice_manager')
    )
  );
```

---

## 5. Storage Security

### Supabase Storage Bucket Design

```
buckets/
├── documents/          (private — RLS via signed URLs)
│   └── {org_id}/{hospital_id}/{folder_path}/{filename}
├── avatars/            (public — user profile images)
│   └── {user_id}/{filename}
├── course-assets/      (private — signed URLs for enrolled users)
│   └── {org_id}/{course_id}/{filename}
├── brand-assets/       (org-private — all authenticated org members)
│   └── {org_id}/{filename}
└── certificates/       (private — user's own certs only)
    └── {org_id}/{user_id}/{cert_id}.pdf
```

### Signed URL Policy
```typescript
// Generate time-limited signed URL for document download
const { data: signedUrl } = await supabaseAdmin.storage
  .from('documents')
  .createSignedUrl(storagePath, 3600); // 1 hour expiry

// Log download for audit trail
await createAuditLog('VIEW', 'document', document.id);
```

### Storage RLS Policies
```sql
-- Documents bucket: user must have permission record
CREATE POLICY "documents_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] = auth.org_id()::text AND
    EXISTS (
      SELECT 1 FROM document_permissions dp
      JOIN documents d ON d.id = dp.document_id
      WHERE d.storage_path = name
        AND (dp.user_id = auth.uid() OR dp.role = ANY(
          SELECT role FROM user_hospital_roles WHERE user_id = auth.uid()
        ))
    )
  );
```

---

## 6. API Security

### Webhook Signature Verification (Outlook)
```typescript
export async function POST(req: Request) {
  // Microsoft Graph sends a validation token on subscription creation
  const validationToken = req.nextUrl.searchParams.get('validationToken');
  if (validationToken) {
    return new Response(validationToken, { 
      headers: { 'Content-Type': 'text/plain' } 
    });
  }

  // Verify webhook signature
  const clientState = req.headers.get('clientstate');
  if (clientState !== process.env.OUTLOOK_WEBHOOK_SECRET) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Process notification...
}
```

### Cron Job Security
```typescript
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Run cron logic...
}
```

### Input Validation (Zod)
```typescript
const CreateEventSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  event_type: z.enum(['meeting', 'training', 'pto', 'hospital_event', 'onboarding', 'other']),
  hospital_id: z.string().uuid(),
  meeting_link: z.string().url().optional(),
});

// All Server Actions and API routes validate with Zod before touching DB
```

### SQL Injection Prevention
- All queries use Supabase SDK (parameterized queries by default)
- No raw SQL interpolation with user input anywhere
- `rpc()` calls use typed parameters, not string concatenation

### XSS Prevention
- Rich text content stored as JSON (Tiptap format), rendered via Tiptap viewer
- DOMPurify on all HTML rendering
- CSP headers via Next.js config
- No `dangerouslySetInnerHTML` without sanitization

---

## 7. Content Security Policy

```typescript
// next.config.ts
const cspHeader = `
  default-src 'self';
  script-src 'self' 'nonce-{nonce}';
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https://*.supabase.co;
  font-src 'self';
  connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com;
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
`;
```

---

## 8. Encryption Strategy

| Data Type | Encryption |
|---|---|
| Passwords | bcrypt (Supabase Auth managed) |
| JWT secrets | RS256 asymmetric (Supabase managed) |
| Data at rest | AES-256 (Supabase managed) |
| Data in transit | TLS 1.3 (Vercel + Supabase managed) |
| Outlook refresh tokens | AES-256-GCM before storing in `outlook_sync_tokens` |
| API keys | Vercel environment variables (encrypted at rest) |
| File storage | AES-256 (Supabase Storage managed) |

### Sensitive Token Encryption
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_KEY = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY!, 'hex'); // 32 bytes

export function encryptToken(token: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map(b => b.toString('hex')).join(':');
}

export function decryptToken(encrypted: string): string {
  const [ivHex, authTagHex, encryptedHex] = encrypted.split(':');
  const decipher = createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return decipher.update(Buffer.from(encryptedHex, 'hex')) + decipher.final('utf8');
}
```

---

## 9. Audit Logging

Every write operation captures:

```typescript
interface AuditLog {
  org_id: string;
  hospital_id?: string;
  user_id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW' | 'DOWNLOAD' | 'LOGIN' | 'LOGOUT';
  resource_type: string;
  resource_id?: string;
  old_data?: object;
  new_data?: object;
  ip_address: string;
  user_agent: string;
  created_at: string;
}
```

Audit log is:
- **Immutable**: No UPDATE or DELETE RLS policy on `audit_logs`
- **Append-only**: Trigger-based via database functions
- **Retained**: 2 years minimum
- **Searchable**: Indexed by org, user, action, date

---

## 10. Session Security

```typescript
// Supabase Auth configuration
{
  session: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,  // prevent token in URL
  },
  cookieOptions: {
    name: 'vetos-session',
    lifetime: 3600 * 8,        // 8 hours
    domain: process.env.COOKIE_DOMAIN,
    path: '/',
    sameSite: 'lax',
    secure: true,              // HTTPS only
    httpOnly: true,            // no JS access
  }
}
```

### Automatic Session Revocation
- Password change → revoke all sessions
- Role change → trigger token refresh
- User deactivated → immediate session invalidation via Supabase Admin API

---

## 11. Security Monitoring

| Event | Alert |
|---|---|
| 5+ failed login attempts | Account temporarily locked; admin notified |
| Login from new IP | Email notification to user |
| Admin role assigned | Email to org admin |
| Mass document download | Anomaly alert to admin |
| Audit log query (large range) | Log and rate-limit |

Monitoring implemented via:
- Supabase audit log webhooks → Vercel API Route → email via Resend
- Vercel Analytics for traffic anomalies
