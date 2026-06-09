# VetOS — Enterprise SaaS Architecture
## Single Instance · Multi-Tenant · Production-Grade

> **Version:** 2.0 · **Date:** June 2026  
> **Stack:** Next.js 16 · Supabase PostgreSQL · TypeScript · Tailwind CSS v4

---

## TABLE OF CONTENTS

1. [Multi-Tenant Architecture Overview](#1-multi-tenant-architecture-overview)
2. [Complete Database Schema](#2-complete-database-schema)
3. [Entity Relationship Diagram](#3-entity-relationship-diagram)
4. [Tenant Strategy](#4-tenant-strategy)
5. [Row Level Security Policies](#5-row-level-security-policies)
6. [Role & Permission Matrix](#6-role--permission-matrix)
7. [API Architecture](#7-api-architecture)
8. [Storage Structure](#8-storage-structure)
9. [Security Architecture](#9-security-architecture)
10. [Folder Structure](#10-folder-structure)
11. [AI Permission Model](#11-ai-permission-model)
12. [Scaling Strategy](#12-scaling-strategy)
13. [Production Deployment Plan](#13-production-deployment-plan)
14. [Future Expansion Plan](#14-future-expansion-plan)

---

## 1. MULTI-TENANT ARCHITECTURE OVERVIEW

### 1.1 Architecture Pattern: Single Instance Multi-Tenant

```
┌──────────────────────────────────────────────────────────────────┐
│                    ONE APPLICATION                               │
│                    ONE BACKEND                                   │
│                    ONE DATABASE                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   TENANT A (VetCentral Corp)                                     │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Hospital 1          Hospital 2          Hospital 3     │   │
│   │  Town & Country      Columbia Pike       Clifton        │   │
│   │  [isolated data]     [isolated data]     [isolated data]│   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   TENANT B (Future: Another Vet Group)                           │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Hospital 4          Hospital 5                         │   │
│   │  [isolated data]     [isolated data]                    │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   SHARED LAYER (Global Content)                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  SOP Templates  Training Templates  Global KB  Policies │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 Three-Level Data Hierarchy

```
Level 0: GLOBAL (system-level, Supabase admin only)
         └── SOP templates, training templates, platform settings

Level 1: ORGANIZATION / TENANT  (org_id scoping)
         └── Knowledge base, brand assets, org-wide announcements,
             shared training content, organization reports

Level 2: HOSPITAL  (hospital_id scoping)
         └── Calendar events, tasks, projects, staff, PTO,
             departments, workflows, local communications

Level 3: DEPARTMENT  (department_id scoping)
         └── Department calendar, department tasks, department reports

Level 4: PERSONAL  (user_id scoping)
         └── Own tasks, own calendar, AI conversations, preferences
```

### 1.3 Tenant Identification Strategy

Every database row uses a **dual-key isolation model**:

| Column        | Scope        | Used For                                    |
|---------------|--------------|---------------------------------------------|
| `org_id`      | Tenant gate  | Primary isolation — blocks cross-tenant     |
| `hospital_id` | Sub-tenant   | Hospital isolation within one org           |
| `department_id`| Sub-sub-tenant| Dept isolation within one hospital         |

**Rule:** RLS always checks `org_id` first. `hospital_id` is the secondary filter.  
**Rule:** A `NULL` hospital_id = org-wide (visible to all hospitals in the org).  
**Rule:** A `NULL` org_id = global system record (templates, defaults).

---

## 2. COMPLETE DATABASE SCHEMA

### 2.1 Foundation Tables

```sql
-- ─────────────────────────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────────────────────────

CREATE TYPE app_role AS ENUM (
  'super_admin',        -- full platform access (Supabase admin level)
  'org_admin',          -- full org access, all hospitals
  'hospital_admin',     -- full single-hospital access
  'practice_manager',   -- operational management, single hospital
  'executive',          -- cross-hospital read, reporting only (NEW)
  'department_manager', -- department-level management (NEW)
  'doctor',             -- clinical staff
  'hr',                 -- HR module + employee access
  'operations',         -- operational data access (NEW)
  'csr',                -- front desk / client services
  'va',                 -- virtual assistant / intern
  'marketing',          -- marketing content
  'it_admin',           -- IT + integrations
  'viewer'              -- read-only
);

CREATE TYPE data_scope AS ENUM (
  'global',       -- platform templates, no tenant
  'org',          -- entire organization
  'hospital',     -- single hospital
  'department',   -- single department
  'personal'      -- single user
);

-- ─────────────────────────────────────────────────────────────────
-- ORGANIZATIONS (tenants)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  domain          TEXT UNIQUE,                    -- e.g. vetcentral.com (SSO)
  logo_url        TEXT,
  primary_color   TEXT DEFAULT '#1e3a5f',
  plan            TEXT NOT NULL DEFAULT 'standard'
                  CHECK (plan IN ('trial','standard','professional','enterprise')),
  max_hospitals   INT NOT NULL DEFAULT 10,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  settings        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────
-- HOSPITALS (sub-tenants)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE hospitals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  code            TEXT,                           -- short code: TC, CP, CL
  address         TEXT,
  city            TEXT,
  state           TEXT,
  zip             TEXT,
  phone           TEXT,
  timezone        TEXT NOT NULL DEFAULT 'America/New_York',
  color           TEXT DEFAULT '#3B82F6',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  settings        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, slug),
  UNIQUE(org_id, code)
);

-- ─────────────────────────────────────────────────────────────────
-- DEPARTMENTS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE departments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hospital_id     UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  code            TEXT,                           -- e.g. SURG, RECEP, HR
  description     TEXT,
  color           TEXT,
  manager_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(hospital_id, code)
);

-- ─────────────────────────────────────────────────────────────────
-- PROFILES (users)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE profiles (
  id                      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id             TEXT,
  first_name              TEXT NOT NULL,
  last_name               TEXT NOT NULL,
  display_name            TEXT,
  email                   TEXT NOT NULL,
  avatar_url              TEXT,
  job_title               TEXT,
  department              TEXT,                   -- free-text fallback
  phone                   TEXT,
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,
  microsoft_id            TEXT UNIQUE,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at            TIMESTAMPTZ,
  settings                JSONB NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, employee_id),
  UNIQUE(org_id, email)
);

-- ─────────────────────────────────────────────────────────────────
-- USER ↔ HOSPITAL ROLES  (RBAC junction)
-- ─────────────────────────────────────────────────────────────────
-- One user can have DIFFERENT roles at DIFFERENT hospitals.
-- Same user: Doctor at Town & Country, Manager at Columbia Pike.
-- hospital_id = NULL means org-wide role (org_admin, executive, hr).
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE user_hospital_roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hospital_id     UUID REFERENCES hospitals(id) ON DELETE CASCADE,  -- NULL = org-wide
  role            app_role NOT NULL,
  assigned_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ,                    -- optional role expiry
  notes           TEXT,
  UNIQUE(user_id, hospital_id, role)              -- one role per hospital per type
);

-- ─────────────────────────────────────────────────────────────────
-- USER ↔ DEPARTMENTS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE user_departments (
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  department_id   UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, department_id)
);

-- ─────────────────────────────────────────────────────────────────
-- EXECUTIVE ACCESS GRANTS  (cross-hospital visibility)
-- ─────────────────────────────────────────────────────────────────
-- Allows executives to see specific hospitals, or ALL (hospital_id = NULL).
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE executive_hospital_access (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hospital_id     UUID REFERENCES hospitals(id) ON DELETE CASCADE,  -- NULL = all hospitals
  access_level    TEXT NOT NULL DEFAULT 'read'
                  CHECK (access_level IN ('read', 'report', 'full')),
  granted_by      UUID REFERENCES profiles(id),
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, hospital_id)
);
```

### 2.2 Calendar & Scheduling

```sql
-- ─────────────────────────────────────────────────────────────────
-- CALENDAR EVENTS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE calendar_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hospital_id         UUID REFERENCES hospitals(id) ON DELETE SET NULL,
  department_id       UUID REFERENCES departments(id) ON DELETE SET NULL,
  scope               data_scope NOT NULL DEFAULT 'hospital',
  title               TEXT NOT NULL,
  description         TEXT,
  location            TEXT,
  meeting_link        TEXT,
  event_type          event_type NOT NULL DEFAULT 'meeting',
  priority            TEXT NOT NULL DEFAULT 'medium'
                      CHECK (priority IN ('low','medium','high','urgent')),
  start_time          TIMESTAMPTZ NOT NULL,
  end_time            TIMESTAMPTZ NOT NULL,
  is_all_day          BOOLEAN NOT NULL DEFAULT FALSE,
  is_recurring        BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_rule     TEXT,
  color               TEXT,
  tags                TEXT[] DEFAULT '{}',
  created_by          UUID NOT NULL REFERENCES profiles(id),
  is_cancelled        BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_reason       TEXT,
  outlook_event_id    TEXT UNIQUE,
  outlook_calendar_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Multi-hospital event bridge (org-wide events appear in multiple hospitals)
CREATE TABLE event_hospitals (
  event_id        UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  hospital_id     UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, hospital_id)
);

-- ─────────────────────────────────────────────────────────────────
-- SCHEDULE REQUESTS (non-admin approval workflow)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE schedule_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hospital_id       UUID REFERENCES hospitals(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  event_type        TEXT NOT NULL DEFAULT 'meeting',
  start_time        TIMESTAMPTZ NOT NULL,
  end_time          TIMESTAMPTZ NOT NULL,
  is_all_day        BOOLEAN NOT NULL DEFAULT FALSE,
  location          TEXT,
  meeting_link      TEXT,
  priority          TEXT NOT NULL DEFAULT 'medium',
  description       TEXT,
  attendee_emails   TEXT[] DEFAULT '{}',
  requested_by      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  admin_notes       TEXT,
  approved_by       UUID REFERENCES profiles(id),
  approved_at       TIMESTAMPTZ,
  rejected_at       TIMESTAMPTZ,
  calendar_event_id UUID REFERENCES calendar_events(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.3 Tasks & Projects

```sql
-- ─────────────────────────────────────────────────────────────────
-- TASKS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hospital_id     UUID REFERENCES hospitals(id) ON DELETE SET NULL,
  department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  status          task_status NOT NULL DEFAULT 'todo',
  priority        task_priority NOT NULL DEFAULT 'medium',
  due_date        TIMESTAMPTZ,
  assigned_to     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by      UUID NOT NULL REFERENCES profiles(id),
  completed_at    TIMESTAMPTZ,
  tags            TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────
-- PROJECTS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hospital_id     UUID REFERENCES hospitals(id) ON DELETE SET NULL,
  department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('planning','active','on_hold','completed','cancelled')),
  priority        TEXT NOT NULL DEFAULT 'medium',
  start_date      DATE,
  due_date        DATE,
  owner_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by      UUID NOT NULL REFERENCES profiles(id),
  tags            TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.4 Communications

```sql
-- ─────────────────────────────────────────────────────────────────
-- CHANNELS
-- scope = 'org'        → visible to entire org (announcements)
-- scope = 'hospital'   → hospital-specific
-- scope = 'department' → department-specific
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE channels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hospital_id     UUID REFERENCES hospitals(id) ON DELETE CASCADE,
  department_id   UUID REFERENCES departments(id) ON DELETE CASCADE,
  scope           data_scope NOT NULL DEFAULT 'hospital',
  name            TEXT NOT NULL,
  description     TEXT,
  channel_type    channel_type NOT NULL DEFAULT 'public',
  created_by      UUID NOT NULL REFERENCES profiles(id),
  is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.5 Knowledge Base & Documents

```sql
-- ─────────────────────────────────────────────────────────────────
-- KB ARTICLES
-- hospital_id = NULL   → org-wide (shared)
-- hospital_id = <uuid> → hospital-specific
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE kb_articles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hospital_id     UUID REFERENCES hospitals(id) ON DELETE CASCADE,   -- NULL = shared
  department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
  scope           data_scope NOT NULL DEFAULT 'org',
  category_id     UUID REFERENCES kb_categories(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  slug            TEXT NOT NULL,
  content         TEXT,
  content_text    TEXT,
  status          article_status NOT NULL DEFAULT 'draft',
  author_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  published_at    TIMESTAMPTZ,
  version         INT NOT NULL DEFAULT 1,
  tags            TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, slug)
);

-- ─────────────────────────────────────────────────────────────────
-- DOCUMENTS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hospital_id     UUID REFERENCES hospitals(id) ON DELETE CASCADE,
  department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
  scope           data_scope NOT NULL DEFAULT 'hospital',
  title           TEXT NOT NULL,
  description     TEXT,
  file_url        TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  file_type       TEXT,
  file_size_bytes BIGINT,
  category        TEXT,                           -- SOP, Policy, Form, etc.
  version         TEXT DEFAULT '1.0',
  is_current      BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  tags            TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.6 Notifications & Audit

```sql
-- ─────────────────────────────────────────────────────────────────
-- NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hospital_id     UUID REFERENCES hospitals(id) ON DELETE CASCADE,
  scope           data_scope NOT NULL DEFAULT 'personal',
  type            notification_type NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  action_url      TEXT,
  source_type     TEXT,                           -- 'task', 'calendar', 'schedule_request', etc.
  source_id       UUID,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────
-- AUDIT LOGS
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID REFERENCES organizations(id) ON DELETE SET NULL,
  hospital_id     UUID REFERENCES hospitals(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,                  -- 'create', 'update', 'delete', 'login', etc.
  resource_type   TEXT NOT NULL,                  -- 'calendar_event', 'profile', etc.
  resource_id     UUID,
  old_data        JSONB,
  new_data        JSONB,
  ip_address      INET,
  user_agent      TEXT,
  session_id      TEXT,
  severity        TEXT NOT NULL DEFAULT 'info'
                  CHECK (severity IN ('info','warning','critical')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Audit logs are append-only — no UPDATE or DELETE RLS policies.
```

### 2.7 Required Indexes

```sql
-- Organizations & hospitals
CREATE INDEX idx_hospitals_org        ON hospitals(org_id);
CREATE INDEX idx_hospitals_slug       ON hospitals(org_id, slug);

-- Profiles
CREATE INDEX idx_profiles_org         ON profiles(org_id);
CREATE INDEX idx_profiles_email       ON profiles(org_id, email);
CREATE INDEX idx_profiles_active      ON profiles(org_id, is_active);

-- Roles
CREATE INDEX idx_roles_user           ON user_hospital_roles(user_id);
CREATE INDEX idx_roles_hospital       ON user_hospital_roles(hospital_id);
CREATE INDEX idx_roles_org            ON user_hospital_roles(org_id);
CREATE INDEX idx_roles_role           ON user_hospital_roles(role);

-- Calendar events
CREATE INDEX idx_events_org           ON calendar_events(org_id);
CREATE INDEX idx_events_hospital      ON calendar_events(hospital_id);
CREATE INDEX idx_events_time          ON calendar_events(start_time, end_time);
CREATE INDEX idx_events_type          ON calendar_events(event_type);
CREATE INDEX idx_events_created_by    ON calendar_events(created_by);

-- Tasks
CREATE INDEX idx_tasks_org            ON tasks(org_id);
CREATE INDEX idx_tasks_hospital       ON tasks(hospital_id);
CREATE INDEX idx_tasks_assigned       ON tasks(assigned_to);
CREATE INDEX idx_tasks_due            ON tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_tasks_status         ON tasks(status);

-- Notifications
CREATE INDEX idx_notif_user_unread    ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notif_org            ON notifications(org_id);

-- Audit logs
CREATE INDEX idx_audit_org            ON audit_logs(org_id, created_at DESC);
CREATE INDEX idx_audit_user           ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_resource       ON audit_logs(resource_type, resource_id);

-- Vector search (AI)
CREATE INDEX idx_chunks_embedding     ON document_chunks
  USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);
```

---

## 3. ENTITY RELATIONSHIP DIAGRAM

```
┌─────────────────┐         ┌──────────────────┐
│  organizations  │────┐    │    hospitals      │
│─────────────────│    │    │──────────────────│
│ id (PK)         │    └───>│ id (PK)          │
│ name            │    ┌───>│ org_id (FK)      │
│ slug (UNIQUE)   │    │    │ name             │
│ domain          │    │    │ slug             │
│ plan            │    │    │ timezone         │
│ is_active       │    │    │ color            │
└─────────────────┘    │    └──────────────────┘
         │              │             │
         │              │             │
         ▼              │             ▼
┌─────────────────┐    │    ┌──────────────────┐
│    profiles     │    │    │   departments     │
│─────────────────│    │    │──────────────────│
│ id (PK)         │    │    │ id (PK)          │
│ org_id (FK)────────────┘   │ org_id (FK)      │
│ employee_id     │         │ hospital_id (FK) │
│ first_name      │         │ name             │
│ last_name       │         │ manager_id (FK)──┼──┐
│ email           │         └──────────────────┘  │
│ job_title       │◄───────────────────────────────┘
│ is_active       │
└────────┬────────┘
         │
         │ 1:many
         ▼
┌─────────────────────────────┐
│    user_hospital_roles      │
│─────────────────────────────│
│ user_id (FK) ───────────────┤──► profiles
│ org_id  (FK) ───────────────┤──► organizations
│ hospital_id (FK, nullable)──┤──► hospitals (NULL = org-wide)
│ role (app_role ENUM)        │
│ assigned_by (FK) ───────────┤──► profiles
│ expires_at (nullable)       │
└─────────────────────────────┘

┌─────────────────────────────┐
│   executive_hospital_access │
│─────────────────────────────│
│ user_id (FK) ───────────────┤──► profiles
│ org_id  (FK) ───────────────┤──► organizations
│ hospital_id (FK, nullable)──┤──► hospitals (NULL = all)
│ access_level                │
└─────────────────────────────┘

┌─────────────────────────────┐
│      calendar_events        │
│─────────────────────────────│
│ id (PK)                     │
│ org_id (FK) ────────────────┤──► organizations
│ hospital_id (FK, nullable)──┤──► hospitals
│ department_id (FK, nullable)┤──► departments
│ scope (data_scope ENUM)     │
│ title, event_type, priority │
│ start_time, end_time        │
│ created_by (FK) ────────────┤──► profiles
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  calendar_event_attendees   │
│─────────────────────────────│
│ event_id (FK) ──────────────┤──► calendar_events
│ user_id  (FK) ──────────────┤──► profiles
│ email                       │
│ status, is_organizer        │
└─────────────────────────────┘

┌─────────────────────────────┐
│           tasks             │
│─────────────────────────────│
│ org_id (FK)                 │──► organizations
│ hospital_id (FK, nullable)  │──► hospitals
│ department_id (FK, nullable)│──► departments
│ project_id (FK, nullable)   │──► projects
│ assigned_to (FK)            │──► profiles
│ created_by (FK)             │──► profiles
└─────────────────────────────┘

┌─────────────────────────────┐
│          channels           │  scope: org/hospital/department
│─────────────────────────────│
│ org_id (FK)                 │──► organizations
│ hospital_id (FK, nullable)  │──► hospitals
│ department_id (FK, nullable)│──► departments
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│          messages           │
│─────────────────────────────│
│ channel_id (FK)             │──► channels
│ user_id (FK)                │──► profiles
│ parent_id (FK, nullable)    │──► messages (threading)
└─────────────────────────────┘

┌─────────────────────────────┐
│         kb_articles         │  hospital_id=NULL → org-wide shared
│─────────────────────────────│
│ org_id (FK)                 │──► organizations
│ hospital_id (FK, nullable)  │──► hospitals
│ author_id (FK)              │──► profiles
└─────────────────────────────┘

┌─────────────────────────────┐
│       document_chunks       │  AI retrieval layer
│─────────────────────────────│
│ org_id (FK)                 │──► organizations
│ hospital_id (FK, nullable)  │──► hospitals
│ embedding (vector 1536)     │
│ source_type, source_id      │
└─────────────────────────────┘

┌─────────────────────────────┐
│        audit_logs           │  append-only, no RLS write
│─────────────────────────────│
│ org_id (FK)                 │
│ hospital_id (FK, nullable)  │
│ user_id (FK)                │
│ action, resource_type       │
│ old_data, new_data (JSONB)  │
└─────────────────────────────┘
```

---

## 4. TENANT STRATEGY

### 4.1 Where to Use Each ID

| ID              | Use When                                              | Example                                    |
|-----------------|-------------------------------------------------------|--------------------------------------------|
| `org_id`        | **Always** — every user-created row                  | Tasks, events, docs, messages              |
| `hospital_id`   | Data belongs to ONE hospital                          | Staff schedule, local announcements, PTO   |
| `hospital_id = NULL` | Data visible to ALL hospitals in the org         | Org-wide training, shared KB, brand assets |
| `department_id` | Data belongs to ONE department within a hospital      | Dept calendar, dept tasks                  |

### 4.2 Data Classification Matrix

```
MODULE              SCOPE         org_id  hospital_id  department_id
──────────────────────────────────────────────────────────────────────
Master Calendar     hospital      ✓       ✓            optional
Tasks               hospital      ✓       ✓            optional
Projects            hospital      ✓       ✓            optional
PTO / Leave         hospital      ✓       ✓            —
Staff / Profiles    org           ✓       —            —
Departments         hospital      ✓       ✓            —
Schedule Requests   hospital      ✓       ✓            —
Workflows           hospital      ✓       ✓            optional
Hospital Reports    hospital      ✓       ✓            —

Knowledge Base      org (shared)  ✓       NULL         optional
Training Content    org (shared)  ✓       NULL         —
SOP Library         org (shared)  ✓       NULL         —
Brand Assets        org (shared)  ✓       NULL         —
Policies            org (shared)  ✓       NULL         —
Org Announcements   org (shared)  ✓       NULL         —
AI Memory           org (shared)  ✓       NULL         —

Dept Communication  department    ✓       ✓            ✓
Dept Calendar       department    ✓       ✓            ✓

Personal Tasks      personal      ✓       optional     —
AI Conversations    personal      ✓       optional     —
User Preferences    personal      ✓       —            —
```

### 4.3 Current Hospitals (Seed Data)

```sql
-- Organization
INSERT INTO organizations (name, slug, primary_color) VALUES
  ('VetCentral', 'vetcentral', '#1e3a5f');

-- Hospitals
INSERT INTO hospitals (org_id, name, slug, code, color) VALUES
  (<org_id>, 'Town & Country',  'town-country',  'TC', '#3B82F6'),
  (<org_id>, 'Columbia Pike',   'columbia-pike',  'CP', '#10B981'),
  (<org_id>, 'Clifton',         'clifton',        'CL', '#F59E0B');
```

---

## 5. ROW LEVEL SECURITY POLICIES

### 5.1 Core Helper Functions

```sql
-- Extract current user's org_id from JWT claims
CREATE OR REPLACE FUNCTION auth.user_org_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT (auth.jwt() ->> 'org_id')::uuid;
$$;

-- Get array of hospital IDs the current user can access
CREATE OR REPLACE FUNCTION auth.user_hospital_ids()
RETURNS UUID[] LANGUAGE sql STABLE AS $$
  SELECT ARRAY(
    SELECT hospital_id FROM user_hospital_roles
    WHERE user_id = auth.uid()
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

-- Check if current user has a specific role at a hospital
CREATE OR REPLACE FUNCTION auth.has_role_at(
  p_hospital_id UUID,
  p_roles       app_role[]
) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_hospital_roles
    WHERE user_id    = auth.uid()
      AND (hospital_id = p_hospital_id OR hospital_id IS NULL)
      AND role        = ANY(p_roles)
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

-- Check if current user is org-level admin
CREATE OR REPLACE FUNCTION auth.is_org_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_hospital_roles
    WHERE user_id    = auth.uid()
      AND org_id     = auth.user_org_id()
      AND role       IN ('super_admin','org_admin')
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

-- Check if current user is executive with access to a hospital
CREATE OR REPLACE FUNCTION auth.executive_can_see(p_hospital_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM executive_hospital_access
    WHERE user_id    = auth.uid()
      AND org_id     = auth.user_org_id()
      AND (hospital_id = p_hospital_id OR hospital_id IS NULL)
  );
$$;
```

### 5.2 Calendar Events RLS

```sql
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- SELECT: own hospital staff, org admins, executives
CREATE POLICY "events_select" ON calendar_events FOR SELECT
  USING (
    org_id = auth.user_org_id()
    AND (
      -- Org-wide event (no hospital)
      hospital_id IS NULL
      -- User has role at this hospital
      OR hospital_id = ANY(auth.user_hospital_ids())
      -- Executive granted access
      OR auth.executive_can_see(hospital_id)
      -- Org admin sees everything
      OR auth.is_org_admin()
    )
  );

-- INSERT: any user with a role at the target hospital
CREATE POLICY "events_insert" ON calendar_events FOR INSERT
  WITH CHECK (
    org_id = auth.user_org_id()
    AND (
      hospital_id IS NULL
      OR hospital_id = ANY(auth.user_hospital_ids())
    )
  );

-- UPDATE: creator or admin/manager at that hospital
CREATE POLICY "events_update" ON calendar_events FOR UPDATE
  USING (
    org_id = auth.user_org_id()
    AND (
      created_by = auth.uid()
      OR auth.has_role_at(hospital_id,
           ARRAY['super_admin','org_admin','hospital_admin','practice_manager']::app_role[])
    )
  );

-- DELETE: creator or admin only
CREATE POLICY "events_delete" ON calendar_events FOR DELETE
  USING (
    org_id = auth.user_org_id()
    AND (
      created_by = auth.uid()
      OR auth.is_org_admin()
    )
  );
```

### 5.3 Tasks RLS

```sql
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- SELECT: own org + own hospital
CREATE POLICY "tasks_select" ON tasks FOR SELECT
  USING (
    org_id = auth.user_org_id()
    AND (
      hospital_id IS NULL                                   -- org-wide task
      OR hospital_id = ANY(auth.user_hospital_ids())        -- user is at this hospital
      OR assigned_to = auth.uid()                           -- personally assigned
      OR created_by  = auth.uid()                           -- created by me
      OR auth.is_org_admin()
    )
  );

-- INSERT: own hospital
CREATE POLICY "tasks_insert" ON tasks FOR INSERT
  WITH CHECK (
    org_id = auth.user_org_id()
    AND (hospital_id IS NULL OR hospital_id = ANY(auth.user_hospital_ids()))
  );
```

### 5.4 Profiles RLS

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: see all colleagues in same org (needed for attendee lookups)
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (org_id = auth.user_org_id());

-- UPDATE: own profile only
CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  USING (id = auth.uid());

-- INSERT: service role only (via createEmployee action)
-- No INSERT policy = only service role can insert
```

### 5.5 Channels RLS

```sql
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channels_select" ON channels FOR SELECT
  USING (
    org_id = auth.user_org_id()
    AND (
      -- Org-wide public announcements
      (hospital_id IS NULL AND channel_type = 'announcement')
      -- Hospital channel: user is at this hospital
      OR hospital_id = ANY(auth.user_hospital_ids())
      -- Executive access
      OR auth.executive_can_see(hospital_id)
      -- Org admin
      OR auth.is_org_admin()
    )
  );
```

### 5.6 Knowledge Base RLS

```sql
ALTER TABLE kb_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_select" ON kb_articles FOR SELECT
  USING (
    org_id = auth.user_org_id()
    AND status = 'published'
    AND (
      hospital_id IS NULL                               -- org-wide shared
      OR hospital_id = ANY(auth.user_hospital_ids())    -- hospital-specific
    )
  );

-- Admins and HR can also see drafts for their hospital
CREATE POLICY "kb_select_own_drafts" ON kb_articles FOR SELECT
  USING (
    org_id = auth.user_org_id()
    AND (
      author_id = auth.uid()
      OR auth.is_org_admin()
    )
  );
```

### 5.7 Document Chunks (AI) RLS

```sql
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- SELECT: org-scoped + hospital filter (AI must respect tenant boundary)
CREATE POLICY "chunks_select" ON document_chunks FOR SELECT
  USING (
    org_id = auth.user_org_id()
    AND (
      hospital_id IS NULL
      OR hospital_id = ANY(auth.user_hospital_ids())
      OR auth.executive_can_see(hospital_id)
      OR auth.is_org_admin()
    )
  );
```

### 5.8 Audit Logs RLS

```sql
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only org admins and super admins can READ audit logs
CREATE POLICY "audit_select" ON audit_logs FOR SELECT
  USING (
    org_id = auth.user_org_id()
    AND auth.is_org_admin()
  );

-- NO INSERT policy — only service role (admin client) can insert
-- NO UPDATE or DELETE policy ever — audit logs are immutable
```

---

## 6. ROLE & PERMISSION MATRIX

### 6.1 Role Hierarchy (High to Low)

```
LEVEL 1  super_admin        Platform god — all tenants, all data
LEVEL 2  org_admin          Full org — all hospitals, all modules
LEVEL 3  hospital_admin     Full single hospital
LEVEL 4  practice_manager   Operational management, single hospital
LEVEL 5  executive          Cross-hospital READ + reports
LEVEL 5  department_manager Dept-level management
LEVEL 6  doctor             Clinical + own calendar
LEVEL 6  hr                 HR module + employee data
LEVEL 6  operations         Operational workflows
LEVEL 7  csr                Front desk, reception tasks
LEVEL 7  marketing          Marketing content, assets
LEVEL 7  va                 View + limited task
LEVEL 7  it_admin           Tech settings, integrations
LEVEL 8  viewer             Read-only, no writes
```

### 6.2 Module Permission Matrix

```
MODULE                  super  org    hosp   mgr    exec   dept_mgr  doctor  hr     ops    csr    va
────────────────────────────────────────────────────────────────────────────────────────────────────
Master Calendar
  View own hospital      ✓      ✓      ✓      ✓      R      ✓         ✓       ✓      ✓      ✓      R
  View all hospitals     ✓      ✓      —      —      R      —         —       —      —      —      —
  Create events          ✓      ✓      ✓      ✓      —      ✓         ✓       ✓      ✓      —      —
  Create (needs approval)—      —      —      —      —      —         —       —      —      ✓      ✓
  Approve requests       ✓      ✓      ✓      ✓      —      ✓         —       —      —      —      —
  Cancel any event       ✓      ✓      ✓      ✓      —      ✓         —       —      —      —      —

Tasks
  View own tasks         ✓      ✓      ✓      ✓      R      ✓         ✓       ✓      ✓      ✓      ✓
  View all hosp tasks    ✓      ✓      ✓      ✓      R      ✓(dept)   —       ✓      ✓      —      —
  Create/assign          ✓      ✓      ✓      ✓      —      ✓         ✓       ✓      ✓      ✓      —
  Delete any task        ✓      ✓      ✓      ✓      —      —         —       —      —      —      —

HR Module
  View all employees     ✓      ✓      ✓      ✓      R      —         —       ✓      —      —      —
  Create employee acct   ✓      ✓      ✓      ✓      —      —         —       ✓      —      —      —
  View credentials       ✓      ✓      ✓      —      —      —         —       ✓      —      —      —
  Assign roles           ✓      ✓      ✓      ✓      —      —         —       ✓      —      —      —
  View leave requests    ✓      ✓      ✓      ✓      R      ✓(dept)   —       ✓      —      —      —
  Approve leave          ✓      ✓      ✓      ✓      —      ✓         —       ✓      —      —      —

Knowledge Base
  View org-wide KB       ✓      ✓      ✓      ✓      ✓      ✓         ✓       ✓      ✓      ✓      ✓
  View hospital KB       ✓      ✓      ✓      ✓      ✓(all) ✓         ✓       ✓      ✓      ✓      ✓
  Write/publish          ✓      ✓      ✓      ✓      —      ✓         —       ✓      ✓      —      —

Training
  View/take courses      ✓      ✓      ✓      ✓      ✓      ✓         ✓       ✓      ✓      ✓      ✓
  Create courses         ✓      ✓      ✓      ✓      —      —         —       ✓      —      —      —
  View progress all      ✓      ✓      ✓      ✓      R      ✓(dept)   —       ✓      —      —      —

Admin Panel
  User management        ✓      ✓      ✓      —      —      —         —       ✓(HR)  —      —      —
  Hospital settings      ✓      ✓      ✓      —      —      —         —       —      —      —      —
  Roles & permissions    ✓      ✓      ✓      —      —      —         —       —      —      —      —
  Audit logs             ✓      ✓      ✓      —      —      —         —       —      —      —      —
  System settings        ✓      ✓      —      —      —      —         —       —      —      —      —

Reports & Analytics
  Own hospital report    ✓      ✓      ✓      ✓      ✓      ✓(dept)   —       ✓      ✓      —      —
  Cross-hospital report  ✓      ✓      —      —      ✓      —         —       —      —      —      —
  Org-wide report        ✓      ✓      —      —      ✓(all) —         —       —      —      —      —

R = Read only
```

### 6.3 Executive Access Levels

```
Executive Type              hospital_id setting    Can See
───────────────────────────────────────────────────────────────
Regional Executive          NULL                   All hospitals in org
Single-Hospital Executive   <specific UUID>        Only that hospital
Multi-Hospital Executive    Multiple rows           Specified hospitals only
```

---

## 7. API ARCHITECTURE

### 7.1 Tenant-Aware Request Pipeline

```
Client Request
      │
      ▼
┌─────────────────┐
│  Next.js        │  1. Parse JWT → get user.id
│  Middleware      │  2. Look up org_id from JWT claims
│  (middleware.ts)│  3. Attach to request context
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Server Action  │  4. createSupabaseServerClient()
│  or             │  5. RLS auto-applies based on auth.uid()
│  Route Handler  │  6. org_id & hospital_id filters enforced
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Supabase       │  7. RLS policies run at DB level
│  PostgreSQL     │  8. auth.user_org_id() filters rows
│  (with RLS)     │  9. Data returned only for allowed scope
└─────────────────┘
```

### 7.2 Middleware (middleware.ts — to be created)

```typescript
// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => request.cookies.get(name)?.value,
                 set: (name, value, options) => response.cookies.set(name, value, options),
                 remove: (name, options) => response.cookies.set(name, '', options) } }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Unauthenticated → redirect to login
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Set org_id in request headers for server components
  if (user) {
    const { data: profile } = await supabase
      .from('profiles').select('org_id').eq('id', user.id).single();
    if (profile) {
      response.headers.set('x-org-id', profile.org_id);
    }
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
};
```

### 7.3 Standard Server Action Pattern

```typescript
// Every server action follows this pattern:
export async function createTask(input: CreateTaskInput) {
  const supabase = await createSupabaseServerClient();

  // 1. Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  // 2. Hospital access check
  const { data: roles } = await supabase
    .from('user_hospital_roles')
    .select('hospital_id')
    .eq('user_id', user.id)
    .eq('hospital_id', input.hospital_id);

  if (!roles?.length) return { success: false, error: 'Access denied' };

  // 3. Insert — RLS enforces org_id at DB level
  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...input, created_by: user.id })  // org_id from RLS
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  // 4. Audit log
  await writeAuditLog({ action: 'create', resource_type: 'task',
                        resource_id: data.id, new_data: data });

  revalidatePath('/tasks');
  return { success: true, data };
}
```

### 7.4 API Tenant Detection Summary

| Source           | How Detected                               |
|------------------|--------------------------------------------|
| `org_id`         | `auth.user_org_id()` — from JWT claims     |
| `hospital_id`    | From `user_hospital_roles` table           |
| Role             | From `user_hospital_roles.role`            |
| Exec access      | From `executive_hospital_access` table     |
| Cross-tenant     | BLOCKED by `org_id` RLS on every table     |

---

## 8. STORAGE STRUCTURE

### 8.1 Supabase Storage Bucket Layout

```
supabase-storage/
├── global/                     # Platform-level templates (service role only)
│   ├── templates/
│   └── system-assets/
│
├── org-{org_id}/               # Org-wide assets
│   ├── brand/
│   │   ├── logo.png
│   │   └── favicon.ico
│   ├── documents/              # Shared SOPs, policies
│   │   ├── sop/
│   │   ├── policies/
│   │   └── forms/
│   ├── training/               # Shared training materials
│   │   └── courses/
│   └── knowledge-base/         # Org-wide KB attachments
│
├── hospital-{hospital_id}/     # Per-hospital assets
│   ├── documents/
│   ├── staff-photos/
│   ├── reports/
│   └── communications/
│
└── user-{user_id}/             # Per-user assets
    ├── avatar.jpg
    └── uploads/
```

### 8.2 Storage RLS Policies

```sql
-- Org-level bucket: members of the org only
CREATE POLICY "org_storage_access"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'org-documents'
  AND (storage.foldername(name))[1] = auth.user_org_id()::text
);

-- Hospital bucket: only users assigned to that hospital
CREATE POLICY "hospital_storage_access"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'hospital-assets'
  AND (storage.foldername(name))[1] = ANY(
    SELECT hospital_id::text FROM user_hospital_roles
    WHERE user_id = auth.uid()
  )
);

-- User bucket: own files only
CREATE POLICY "user_storage_access"
ON storage.objects FOR ALL
USING (
  bucket_id = 'user-uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

---

## 9. SECURITY ARCHITECTURE

### 9.1 Defense in Depth Model

```
Layer 1: NETWORK
  ├── HTTPS everywhere (Vercel auto-SSL)
  ├── HSTS headers
  └── Rate limiting on auth endpoints

Layer 2: AUTHENTICATION
  ├── Supabase Auth (JWT, session management)
  ├── JWT contains org_id (set via auth.users metadata)
  ├── Session auto-refresh
  └── Email verification required

Layer 3: AUTHORIZATION (RBAC)
  ├── Role stored in user_hospital_roles
  ├── Every server action checks role before DB access
  ├── Executive access via dedicated table
  └── Admin operations require explicit ADMIN_ROLES check

Layer 4: DATA ISOLATION (RLS)
  ├── Row Level Security on every table
  ├── auth.user_org_id() ensures cross-tenant blocking
  ├── auth.user_hospital_ids() enforces hospital scope
  └── Audit logs are append-only (no RLS write policy)

Layer 5: APPLICATION
  ├── Server Actions only (no direct DB from client)
  ├── Zod schema validation on all inputs
  ├── Parameterized queries via Supabase client
  └── No secrets in client-side code

Layer 6: AUDIT
  ├── All CRUD operations logged
  ├── Login/logout events logged
  ├── Permission changes logged with old/new data
  └── IP address and user agent captured
```

### 9.2 JWT Claim Setup

```sql
-- Set org_id in JWT when user logs in
-- This runs via Supabase Auth Hook (Database Webhook on auth.users)
CREATE OR REPLACE FUNCTION public.set_claim_org_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Find user's org_id and set as JWT claim
  UPDATE auth.users
  SET raw_app_meta_data =
    raw_app_meta_data || jsonb_build_object(
      'org_id', (SELECT org_id FROM profiles WHERE id = NEW.id)
    )
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;
```

### 9.3 Sensitive Data Handling

| Data Type         | Storage                    | Access Control                     |
|-------------------|----------------------------|------------------------------------|
| Auth tokens       | Supabase Auth (encrypted)  | User only, auto-refresh            |
| Passwords         | bcrypt (Supabase managed)  | Never stored in profiles           |
| Temp credentials  | Returned once, never stored| Admin/HR at creation time only     |
| Outlook tokens    | `outlook_sync_tokens` (AES)| User + service role only           |
| AI API keys       | `.env` server-side only    | Never in client bundle             |
| Session data      | `user_sessions` table      | User + org admin                   |

---

## 10. FOLDER STRUCTURE

```
src/
├── app/
│   ├── (auth)/                    # Public auth pages (no sidebar)
│   │   ├── login/
│   │   ├── signup/
│   │   └── reset-password/
│   │
│   └── (dashboard)/               # Protected app (requires auth)
│       ├── layout.tsx             # Auth + data loading shell
│       ├── dashboard/             # Home dashboard
│       ├── ai-assistant/          # AI chat interface
│       ├── calendar/              # Master Calendar
│       ├── communication/         # Channels + messaging
│       ├── documents/             # Document library
│       ├── hr/                    # HR Management
│       │   ├── page.tsx
│       │   ├── server-data.tsx
│       │   └── client.tsx
│       ├── knowledge-base/        # KB articles
│       ├── notifications/         # Notification center
│       ├── onboarding/            # Employee onboarding
│       ├── profile/               # User profile
│       ├── projects/              # Project management
│       ├── schedule-requests/     # Admin approval queue
│       ├── settings/              # User settings
│       │   ├── ai/
│       │   ├── preferences/
│       │   └── security/
│       ├── tasks/                 # Task management
│       ├── training/              # Training academy
│       └── admin/                 # Admin panel (admin roles only)
│           ├── audit-logs/
│           ├── departments/
│           ├── hospitals/
│           ├── integrations/
│           ├── roles/
│           ├── settings/
│           └── users/
│
├── components/
│   ├── calendar/                  # Calendar components
│   │   ├── calendar-client.tsx    # Big Calendar wrapper
│   │   ├── event-form.tsx         # Event creation form
│   │   └── availability-grid.tsx  # Scheduling assistant
│   ├── hr/                        # HR components
│   │   ├── new-employee-form.tsx
│   │   └── employee-list.tsx
│   ├── layout/                    # App shell
│   │   ├── AppSidebar.tsx
│   │   ├── TopNav.tsx
│   │   ├── AccountMenu.tsx
│   │   └── NotificationBell.tsx
│   ├── schedule-requests/
│   ├── ui/                        # Base UI primitives (shadcn)
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── select.tsx
│   │   ├── date-time-picker.tsx
│   │   └── page-header.tsx
│   └── [feature]/                 # Feature-specific components
│
├── lib/
│   ├── actions/                   # Server Actions (all DB writes)
│   │   ├── calendar.ts
│   │   ├── hr.ts
│   │   ├── notifications.ts
│   │   ├── schedule-requests.ts
│   │   ├── scheduling.ts          # Conflict detection
│   │   ├── tasks.ts
│   │   └── [feature].ts
│   ├── scheduling/
│   │   └── conflict-engine.ts     # Pure conflict detection logic
│   ├── supabase/
│   │   ├── server.ts              # SSR + admin clients
│   │   └── client.ts              # Browser client
│   └── utils.ts                   # cn(), formatters
│
├── types/
│   ├── app.ts                     # All app interfaces
│   └── database.ts                # AppRole, DB types
│
└── middleware.ts                  # Auth + tenant detection
```

---

## 11. AI PERMISSION MODEL

### 11.1 AI Retrieval Architecture

```
User asks AI question
         │
         ▼
┌─────────────────────────────────────────────┐
│           AI Context Builder                │
│                                             │
│  1. Get user.id + org_id + hospital_ids     │
│  2. Determine role level                    │
│  3. Build permission context for retrieval  │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│        Secure Vector Search                 │
│                                             │
│  SELECT * FROM match_documents(             │
│    query_embedding,                         │
│    org_id      := auth.user_org_id(),       │
│    hospital_ids := auth.user_hospital_ids() │
│  )                                          │
│                                             │
│  RLS auto-filters to allowed chunks only    │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│           Response Generation               │
│                                             │
│  Source: only docs from allowed hospitals   │
│  Context: injected permission scope         │
│  Output: scoped to user's hospitals         │
└─────────────────────────────────────────────┘
```

### 11.2 AI Permission by Role

```
Role             Can Query                            Examples
─────────────────────────────────────────────────────────────────────────
staff/doctor     Own hospital only                    "Next meeting?" →
                                                      Clifton events only

hr               Own hospital + HR data               "Who is on leave?" →
                                                      Hospital staff list

practice_manager Own hospital + dept data             "All tasks this week?" →
                                                      All hospital tasks

executive        All granted hospitals                 "Show all meetings" →
                                                      All 3 hospitals

org_admin        Entire organization                  "Org training status?" →
                                                      All hospitals + shared

super_admin      Everything (system-level)            "Platform health?" →
                                                      All orgs
```

### 11.3 Secure Vector Search Function

```sql
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding   vector(1536),
  match_threshold   float DEFAULT 0.78,
  match_count       int   DEFAULT 5,
  p_org_id          uuid  DEFAULT auth.user_org_id(),
  p_hospital_ids    uuid[] DEFAULT auth.user_hospital_ids()
)
RETURNS TABLE (
  id          uuid,
  content     text,
  metadata    jsonb,
  similarity  float
)
LANGUAGE sql STABLE AS $$
  SELECT
    dc.id,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  WHERE
    dc.org_id = p_org_id
    AND (
      dc.hospital_id IS NULL              -- shared org content
      OR dc.hospital_id = ANY(p_hospital_ids) -- hospital-specific
    )
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

### 11.4 AI System Prompt Injection

```typescript
// In AI server action — inject user context into system prompt
function buildSystemPrompt(user: UserContext): string {
  const hospitalNames = user.hospitals.map(h => h.name).join(', ');
  const scopeNote = user.isExec
    ? `You have access to ALL hospitals: ${hospitalNames}.`
    : `You only have access to: ${hospitalNames}. Never mention or reveal data from other hospitals.`;

  return `You are VetCentral AI, an assistant for a veterinary hospital management platform.
${scopeNote}
Current user: ${user.name} | Role: ${user.role} | Organization: ${user.orgName}
Today: ${new Date().toLocaleDateString()}

SECURITY RULES:
- Never reveal data from hospitals the user cannot access
- If asked about other hospitals, say "I don't have access to that hospital's data"
- Always scope your answers to the user's accessible hospitals
- For calendar queries, only return events from ${hospitalNames}`;
}
```

---

## 12. SCALING STRATEGY

### 12.1 Growth Phases

```
PHASE 1: 3 Hospitals (Current)
  ─────────────────────────────
  Database:   Supabase Free → Pro ($25/mo)
  Compute:    Vercel Hobby → Vercel Pro
  Vector:     pgvector (lists=100)
  Realtime:   Supabase Realtime (default)
  Storage:    Supabase Storage (100GB)
  Est. rows:  <1M per table
  Action:     No schema changes needed

PHASE 2: 10 Hospitals
  ─────────────────────
  Database:   Supabase Pro ($25/mo) — same schema
  Compute:    Vercel Pro + ISR caching
  Vector:     pgvector (lists=200, higher recall)
  Realtime:   Selective subscriptions per hospital
  Add:        Redis (Upstash) for rate limiting
  Action:     Add org_id indexes if missing, vacuum analyze

PHASE 3: 100+ Hospitals
  ──────────────────────
  Database:   Supabase Enterprise or self-hosted PG16
  Compute:    Multiple Vercel regions
  Vector:     Dedicated pgvector replica
  Realtime:   Filter by hospital_id on WS subscription
  Add:        Read replicas for reporting queries
  Add:        Table partitioning on audit_logs (by month)
  Add:        Horizontal sharding on document_chunks
  Action:     Partition audit_logs by created_at
```

### 12.2 Table Partitioning (Phase 3)

```sql
-- Partition audit_logs by month for 100+ hospitals
CREATE TABLE audit_logs (
  id          UUID NOT NULL DEFAULT gen_random_uuid(),
  org_id      UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ...
) PARTITION BY RANGE (created_at);

CREATE TABLE audit_logs_2026_06
  PARTITION OF audit_logs
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
```

### 12.3 Database Sizing Estimates

```
3 hospitals    →   ~500K rows/table    →   Supabase Pro handles
10 hospitals   →   ~2M rows/table     →   Add indexes, no changes
50 hospitals   →   ~10M rows/table    →   Read replicas for reports
100 hospitals  →   ~20M rows/table    →   Partitioning + sharding
```

---

## 13. PRODUCTION DEPLOYMENT PLAN

### 13.1 Environment Setup

```bash
# .env.local (NEVER commit to git)

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://[project-ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Database (for postgres.js direct connection)
DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres

# AI
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Microsoft 365 / Outlook
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_TENANT_ID=...
MICROSOFT_REDIRECT_URI=https://app.vetcentral.com/api/auth/outlook/callback

# App
NEXT_PUBLIC_APP_URL=https://app.vetcentral.com

# Email
RESEND_API_KEY=re_...

# Security
TOKEN_ENCRYPTION_KEY=64-char-hex-key
CRON_SECRET=your-cron-secret

# Webhooks
OUTLOOK_WEBHOOK_SECRET=...
```

### 13.2 Deployment Checklist

```
PRE-DEPLOYMENT
  ☐ Run all migrations in Supabase SQL Editor
  ☐ Enable RLS on all tables
  ☐ Set JWT claim hook for org_id
  ☐ Create storage buckets with RLS
  ☐ Seed organizations + hospitals + super_admin user
  ☐ Test cross-tenant isolation (log in as two different orgs)
  ☐ TypeScript build passes (npx tsc --noEmit)
  ☐ Environment variables set in Vercel

DEPLOYMENT
  ☐ Push to main → Vercel auto-deploys
  ☐ Verify HTTPS + HSTS headers
  ☐ Test login flow for all 3 hospital users
  ☐ Test role-based page access (non-admin → /dashboard redirect)
  ☐ Test RLS (hospital A user cannot see hospital B events)
  ☐ Test AI scoping (Clifton doctor gets Clifton events only)
  ☐ Test executive cross-hospital view

POST-DEPLOYMENT
  ☐ Set up monitoring (Vercel Analytics)
  ☐ Enable Supabase Logs
  ☐ Schedule weekly database vacuum analyze
  ☐ Enable Supabase PITR (Point-in-Time Recovery)
  ☐ Test backup restore procedure
```

### 13.3 Supabase Migration Order

```
Run in Supabase SQL Editor in this order:
  001_create_core_tables.sql
  002_create_communication_tables.sql
  003_create_calendar_tables.sql
  004_create_ai_vector_tables.sql
  005_enable_rls_policies.sql
  006_create_feature_tables.sql
  006b_master_operational_calendar.sql
  007_schedule_requests.sql
  008_executive_access.sql          ← NEW (add this migration)
  009_department_scoping.sql        ← NEW (add this migration)
  seed_hospitals.sql                ← Seed 3 hospitals
```

---

## 14. FUTURE EXPANSION PLAN

### 14.1 Adding New Hospitals (Zero Code Changes)

```sql
-- Adding Hospital 4 requires ONLY this SQL:
INSERT INTO hospitals (org_id, name, slug, code, color, timezone)
VALUES (
  '00000000-0000-0000-0000-000000000001',  -- VetCentral org_id
  'Springfield', 'springfield', 'SF', '#EC4899', 'America/Chicago'
);

-- Then assign an admin user:
INSERT INTO user_hospital_roles (user_id, org_id, hospital_id, role)
VALUES (<admin_user_id>, <org_id>, <new_hospital_id>, 'hospital_admin');

-- Done. No code changes. RLS auto-scopes the new hospital.
```

### 14.2 Adding New Tenants (New Organizations)

```sql
-- Adding a second veterinary group:
INSERT INTO organizations (name, slug, domain, primary_color)
VALUES ('PetHealth Group', 'pethealth', 'pethealth.com', '#10B981');

-- Each org is completely isolated. Their users cannot see VetCentral data.
```

### 14.3 Roadmap Modules

```
PHASE 1 (Current — 3 hospitals)
  ✓ Master Calendar + Conflict Detection
  ✓ Tasks + Projects
  ✓ HR Management + Credentials
  ✓ Knowledge Base + AI
  ✓ Communications
  ✓ Schedule Requests + Approval
  ✓ Training Academy
  ✓ Notifications

PHASE 2 (10 hospitals)
  ☐ Financial reporting per hospital
  ☐ Payroll integration (Gusto/ADP)
  ☐ Client portal (pet owner facing)
  ☐ Cross-hospital staff scheduling
  ☐ Advanced AI analytics ("Compare training completion rates")
  ☐ Mobile app (React Native)

PHASE 3 (100+ hospitals)
  ☐ White-label support (custom domain per org)
  ☐ Public API for third-party integrations
  ☐ AI-powered demand forecasting
  ☐ Multi-language support (i18n)
  ☐ Advanced compliance reporting (OSHA, HIPAA-adjacent)
  ☐ Marketplace for training content
```

### 14.4 Module Extensibility Pattern

Every future module should follow this template:

```sql
-- New module table template
CREATE TABLE [module_name] (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,  -- ALWAYS
  hospital_id     UUID REFERENCES hospitals(id) ON DELETE CASCADE,               -- if hospital-scoped
  department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,            -- if dept-scoped
  scope           data_scope NOT NULL DEFAULT 'hospital',                        -- classify data level
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  -- ... module-specific columns
);

-- RLS template
ALTER TABLE [module_name] ENABLE ROW LEVEL SECURITY;

CREATE POLICY "[module]_select" ON [module_name] FOR SELECT
  USING (
    org_id = auth.user_org_id()
    AND (
      hospital_id IS NULL
      OR hospital_id = ANY(auth.user_hospital_ids())
      OR auth.executive_can_see(hospital_id)
      OR auth.is_org_admin()
    )
  );
```

---

## ARCHITECTURE SUMMARY

```
┌──────────────────────────────────────────────────────────────────┐
│                    VETOS SAAS PLATFORM                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  FRONTEND          Next.js 16 App Router + TypeScript            │
│                    Tailwind CSS v4 + Base UI + shadcn            │
│                                                                  │
│  AUTH              Supabase Auth (JWT + org_id claim)            │
│                    Role stored in user_hospital_roles            │
│                                                                  │
│  API LAYER         Next.js Server Actions (all DB writes)        │
│                    Middleware for tenant detection               │
│                                                                  │
│  DATABASE          Supabase PostgreSQL                           │
│                    RLS on every table (org_id + hospital_id)     │
│                    pgvector for AI embeddings                    │
│                                                                  │
│  REALTIME          Supabase Realtime (tasks, notifications)      │
│                                                                  │
│  STORAGE           Supabase Storage                              │
│                    /org-{id} / /hospital-{id} / /user-{id}       │
│                                                                  │
│  AI                Anthropic Claude (primary)                    │
│                    OpenAI (fallback)                             │
│                    RAG via pgvector, scoped to user's hospitals  │
│                                                                  │
│  ISOLATION         org_id = tenant gate (never crosses)          │
│                    hospital_id = sub-tenant filter               │
│                    RLS = enforced at DB row level                │
│                    RBAC = enforced at application level          │
│                                                                  │
│  SCALE             3 hospitals today → 100+ without changes      │
│                    New hospital = INSERT INTO hospitals           │
│                    New tenant   = INSERT INTO organizations       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

> **Key Principle:** Security is enforced at TWO independent layers:  
> 1. **Application layer** — Server Actions check roles before querying  
> 2. **Database layer** — RLS runs `auth.user_org_id()` on every single row  
>
> Even if application code has a bug, the database WILL NOT return data
> from another tenant. This is the multi-tenant guarantee.
