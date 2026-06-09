# Software Requirements Specification (SRS)
# Vet AI Operating System — Internal Hospital Platform
**Version:** 1.0.0  
**Date:** 2026-06-05  
**Classification:** Internal / Confidential  
**Author:** Architecture Team

---

## 1. Executive Summary

The Vet AI Operating System (VetOS) is a unified internal operating platform designed for multi-hospital veterinary organizations. It centralizes communication, operations, training, scheduling, knowledge management, workflows, and AI-powered assistance under a single authenticated interface. The platform is staff-facing only — no patient or client-facing surface exists in Phase 1.

The system serves three hospitals (Town & Country, Columbia Pike, Clifton) under one organizational umbrella, with shared resources and hospital-specific isolation where required.

---

## 2. Problem Statement

| Current Pain Point | Impact |
|---|---|
| Scheduling information scattered across Outlook, emails, and verbal communication | Staff miss events; scheduling conflicts occur |
| SOPs and handbooks stored in email chains and physical binders | Knowledge loss; onboarding takes weeks |
| No centralized training system | Inconsistent onboarding across hospitals |
| Communication fragmented across Teams, email, and text | Information silos; slow response |
| No single source of truth for operational data | Managers lack visibility |
| Manual onboarding workflows | New hires experience delays getting access and resources |

---

## 3. Stakeholders

| Role | Description | System Access Level |
|---|---|---|
| Super Admin | Organization-wide administrator | Full system access |
| Hospital Admin | Per-hospital administrator | Hospital-scoped full access |
| Executive / Owner | Strategic oversight | Read-only KPI dashboards, all hospitals |
| Practice Manager | Day-to-day operations management | Operational modules, own hospital |
| Veterinarian (Doctor) | Clinical staff | Clinical content, own hospital calendar |
| CSR (Client Services Rep) | Front desk staff | Communication, calendar, requests |
| VA (Veterinary Assistant) | Clinical support | Training, calendar, requests |
| Marketing Manager | Content and brand | Asset library, announcements |
| HR / Operations | People operations | Onboarding, training, personnel |
| IT Admin | System configuration | User management, integrations |

---

## 4. Functional Requirements

### 4.1 Authentication & Identity
- FR-AUTH-01: Single sign-on via email/password with Supabase Auth
- FR-AUTH-02: Microsoft 365 OAuth2 SSO support
- FR-AUTH-03: Multi-factor authentication (TOTP)
- FR-AUTH-04: Session timeout configurable per organization
- FR-AUTH-05: Role assignment per user, per hospital
- FR-AUTH-06: Invitation-based user onboarding

### 4.2 Multi-Hospital Management
- FR-ORG-01: Organization → Hospital hierarchy
- FR-ORG-02: Users can be assigned to one or multiple hospitals
- FR-ORG-03: Data isolation per hospital with shared organization resources
- FR-ORG-04: Hospital-level settings, branding, and configuration
- FR-ORG-05: Cross-hospital admin views for executives and super admins

### 4.3 AI Knowledge Base
- FR-KB-01: Full-text and semantic search across all content
- FR-KB-02: Content types: Articles, SOPs, Procedures, FAQs, Policies
- FR-KB-03: Versioning with edit history
- FR-KB-04: Rich text editor with image and file embeds
- FR-KB-05: Tag and category taxonomy
- FR-KB-06: AI-powered answer generation from knowledge base content
- FR-KB-07: Suggested content based on user role and recent queries
- FR-KB-08: Content approval workflow for published SOPs

### 4.4 Training & Onboarding (LMS)
- FR-LMS-01: Course creation with modules, lessons, quizzes
- FR-LMS-02: Role-based course assignment
- FR-LMS-03: Completion tracking and progress reporting
- FR-LMS-04: Certificate generation on completion
- FR-LMS-05: Automated assignment on hire (linked to onboarding)
- FR-LMS-06: Video content support via Supabase Storage
- FR-LMS-07: Quiz engine with pass/fail grading
- FR-LMS-08: Manager progress visibility for their direct reports

### 4.5 Master Calendar
- FR-CAL-01: Unified calendar across all hospitals
- FR-CAL-02: Filter by hospital, department, doctor, event type
- FR-CAL-03: Event types: Meetings, Trainings, PTO, Onboarding, Hospital Events
- FR-CAL-04: Microsoft Outlook / 365 calendar sync (read + write)
- FR-CAL-05: Conflict detection across staff calendars
- FR-CAL-06: Role-based calendar visibility
- FR-CAL-07: Event RSVP and attendance tracking
- FR-CAL-08: AI query: "When is the next doctor meeting?"
- FR-CAL-09: Recurring event support
- FR-CAL-10: iCal export

### 4.6 Team Communication
- FR-COMM-01: Channels organized by hospital, department, and topic
- FR-COMM-02: Direct messaging between users
- FR-COMM-03: Thread-based replies
- FR-COMM-04: File sharing in channels
- FR-COMM-05: @mentions with notifications
- FR-COMM-06: Announcement channels (broadcast, read-only for staff)
- FR-COMM-07: Pinned messages
- FR-COMM-08: Message search
- FR-COMM-09: Emoji reactions
- FR-COMM-10: Real-time delivery via Supabase Realtime

### 4.7 Document Management
- FR-DOC-01: File upload with type restrictions (PDF, DOCX, XLSX, MP4, PNG, etc.)
- FR-DOC-02: Folder hierarchy with permissions
- FR-DOC-03: File versioning
- FR-DOC-04: Search by filename and content (AI-indexed)
- FR-DOC-05: Access control per file and folder
- FR-DOC-06: Preview in-browser (PDF, images)
- FR-DOC-07: Download tracking and audit log
- FR-DOC-08: Link sharing with expiration

### 4.8 Project Management
- FR-PROJ-01: Projects with boards, lists, and timeline views
- FR-PROJ-02: Tasks with assignees, due dates, priority, status
- FR-PROJ-03: Sub-tasks and dependencies
- FR-PROJ-04: Project templates
- FR-PROJ-05: Activity log per project
- FR-PROJ-06: @mentions in task comments
- FR-PROJ-07: File attachments on tasks
- FR-PROJ-08: Project-level reporting and completion metrics

### 4.9 Workflow & Request Portal
- FR-WF-01: Request form builder (drag-and-drop fields)
- FR-WF-02: Request types: Business Cards, Uniforms, Maintenance, IT, Onboarding, Other
- FR-WF-03: Approval routing with configurable approvers
- FR-WF-04: Status tracking: Submitted → In Review → Approved → Complete
- FR-WF-05: Email and in-app notifications on status change
- FR-WF-06: Request history per user
- FR-WF-07: Admin queue view for processing requests

### 4.10 AI Assistant
- FR-AI-01: Natural language chat interface embedded in sidebar
- FR-AI-02: Answers drawn from internal knowledge base (RAG)
- FR-AI-03: Calendar queries ("What's on the schedule this week?")
- FR-AI-04: Document retrieval ("Find the OSHA training document")
- FR-AI-05: Conversation history per user
- FR-AI-06: Source citations in responses
- FR-AI-07: Voice input (browser speech API)
- FR-AI-08: Feedback mechanism (thumbs up/down per response)

### 4.11 KPI & Analytics
- FR-KPI-01: Organization-wide dashboard for executives
- FR-KPI-02: Hospital-level dashboard for managers
- FR-KPI-03: Metrics: Training completion, request volumes, calendar adherence
- FR-KPI-04: Custom date range filters
- FR-KPI-05: Export to CSV/PDF
- FR-KPI-06: Trend charts and comparison across hospitals

### 4.12 Employee Onboarding Automation
- FR-ONBOARD-01: New employee trigger creates onboarding checklist
- FR-ONBOARD-02: Automated task assignment: badges, uniforms, accounts, training
- FR-ONBOARD-03: Progress tracking visible to HR and manager
- FR-ONBOARD-04: Onboarding calendar events auto-populated
- FR-ONBOARD-05: Role-specific training auto-assigned

### 4.13 Role-Based Administration
- FR-ADMIN-01: User management (invite, edit, deactivate)
- FR-ADMIN-02: Role assignment per hospital
- FR-ADMIN-03: Permission matrix configuration
- FR-ADMIN-04: Audit log viewer
- FR-ADMIN-05: System health and usage metrics

---

## 5. Non-Functional Requirements

### 5.1 Performance
- NFR-PERF-01: Page load < 2 seconds (P95) on 10Mbps connection
- NFR-PERF-02: AI response < 5 seconds for knowledge base queries
- NFR-PERF-03: Real-time message delivery < 200ms latency
- NFR-PERF-04: Calendar sync < 30 seconds from Outlook event creation

### 5.2 Scalability
- NFR-SCALE-01: Architecture supports 100+ hospitals, 10,000+ users
- NFR-SCALE-02: Database designed with multi-tenancy from day one
- NFR-SCALE-03: Storage scalable to 10TB+ via Supabase Storage / S3

### 5.3 Security
- NFR-SEC-01: All data encrypted at rest (AES-256) and in transit (TLS 1.3)
- NFR-SEC-02: Row-Level Security on all database tables
- NFR-SEC-03: No secrets in frontend code or git repository
- NFR-SEC-04: Audit log for all write operations
- NFR-SEC-05: HIPAA-adjacent design principles (data minimization, access control)
- NFR-SEC-06: Session revocation capability

### 5.4 Availability
- NFR-AVAIL-01: 99.9% uptime SLA target
- NFR-AVAIL-02: Zero-downtime deployments via Vercel

### 5.5 Usability
- NFR-UX-01: Mobile-responsive design
- NFR-UX-02: Accessible (WCAG 2.1 AA)
- NFR-UX-03: Role-based onboarding guidance for first login

---

## 6. Constraints

- Tech stack is fixed: Next.js, TypeScript, Tailwind CSS, Shadcn UI, Supabase, Vercel
- Microsoft Outlook integration is required from MVP
- No patient/client data stored in this system (Cornerstone integration is read-only summary in future phase)
- All secrets stored in `.env` files — never hardcoded

---

## 7. Assumptions

- Organization already has Microsoft 365 tenant
- User identities managed in this system (no existing LDAP/AD sync required for MVP)
- Hospitals are geographically distributed but operationally unified
- Initial user count: ~50–200 staff across 3 hospitals

---

## 8. Out of Scope (Phase 1)

- Patient record management
- Client-facing portal
- Billing or invoicing
- Payroll integration
- Cornerstone live data sync
- Mobile native application

---

## 9. Acceptance Criteria Summary

| Module | Minimum Acceptance Criteria |
|---|---|
| Auth | Login, MFA, role assignment, invite flow working |
| Calendar | Events visible, Outlook sync operational, conflict detection alerts |
| Knowledge Base | Search returns relevant results; AI can answer from docs |
| Training | Courses creatable; completion tracked; certs generated |
| Communication | Real-time messages in channels; DMs; file sharing |
| Documents | Upload, folder organization, permissions, preview |
| Projects | Tasks creatable, assignable, trackable |
| Workflows | Requests submittable, routable, status trackable |
| AI Assistant | Answers questions from internal knowledge with citations |
| KPI Dashboard | At least 5 metrics displayed with chart visualization |
| Admin Panel | User management, role assignment, audit log accessible |
