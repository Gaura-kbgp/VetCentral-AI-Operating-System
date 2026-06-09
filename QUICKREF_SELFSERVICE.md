# Self-Service Onboarding — Quick Reference

## 🎯 Core URLs

| Path | Role | Purpose |
|------|------|---------|
| `/onboarding` | HR | Dashboard: Pipeline, List, Templates |
| `/onboarding/{employeeId}` | Employee | Self-service portal |
| `/onboarding/{employeeId}` | HR | Review & approve documents |

---

## 👥 Role Detection

**Same URL, different views:**

```tsx
// In page.tsx
const isOwnRecord = user.id === recordRes.data.employee_id;

// In component
<EmployeeOnboarding
  isOwnRecord={isOwnRecord}  // true = employee view
  isAdmin={isAdmin}           // true = HR view
/>
```

---

## 📋 Tabs Available

| Tab | Employee | HR | Purpose |
|-----|----------|----|----|
| Overview | ✅ | ✅ | Progress, dates, people |
| Checklist | ✅ | ✅ | Action items, tasks |
| Documents | ✅ | ✅ | Upload & review docs |
| Training | ✅ | ✅ | Course enrollments |
| Meetings | ✅ | ✅ | Scheduled meetings |
| Compliance | ✅ | ✅ | Score 0-100% |
| Activity | ✅ | ✅ | Audit log |

---

## 📤 Document Upload Flow

```
Employee clicks upload zone
    ↓
Selects file (PDF/JPG/PNG/DOC/DOCX, max 15MB)
    ↓
POST /api/v1/onboarding/documents
    ├─ Validate user is employee
    ├─ Upload to onboarding-docs bucket
    ├─ Extract OCR text
    ├─ Create signed 1-hour URL
    ├─ Update doc status: "uploaded"
    ├─ Send notification to HR
    └─ Log activity
    ↓
HR receives notification
    ↓
HR clicks "Download" → signed URL
HR clicks "View Text" → OCR preview
    ↓
HR clicks "Approve" or "Reject"
    ├─ POST /api/v1/onboarding/documents/approve
    ├─ or POST /api/v1/onboarding/documents/reject
    ├─ Send notification to employee
    └─ Log activity
    ↓
Employee notified
```

---

## 🔄 Key Server Actions

### Approval Workflow
```typescript
// HR approves a document
approveDocument(docId: string)
  → status: "verified"
  → verified_by, verified_at set
  → notification sent to employee

// HR rejects a document  
rejectDocument(docId: string, reason: string)
  → status: "rejected"
  → rejection_reason stored
  → notification sent with reason
```

### Invitations
```typescript
// Auto-called when creating onboarding record
sendOnboardingInvitation(recordId: string)
  → in-app notification inserted
  → email sent via Resend (if key configured)
  → invitation_sent_at timestamp set
```

### Compliance
```typescript
// Get real-time compliance status
getComplianceStatus(recordId: string)
  → returns: {
      totalDocs, verifiedDocs, requiredDocs, requiredVerified,
      totalTasks, completedTasks, requiredTasks, requiredCompleted,
      overallScore (0-100), status ("complete"/"in_progress"/"at_risk")
    }
```

---

## 💾 Database Tables

### onboarding_documents
```sql
status: 'pending' | 'uploaded' | 'verified' | 'rejected'

NEW columns:
- ocr_text: TEXT          -- Extracted text from file
- rejection_reason: TEXT  -- HR's rejection message
- public_url: TEXT        -- Signed download URL
```

### onboarding_meetings
```sql
NEW column:
- calendar_event_id: UUID -- Link to calendar_events row
```

### onboarding_records
```sql
NEW column:
- invitation_sent_at: TIMESTAMPTZ -- When invitation was sent
```

---

## 🔔 Notification Types

| Event | Recipient | Type | Body Includes |
|-------|-----------|------|---------------|
| Invite sent | Employee | system_announcement | Portal link |
| Doc uploaded | HR | document_shared | Doc name |
| Doc approved | Employee | document_shared | Doc name |
| Doc rejected | Employee | system_announcement | Reason text |
| Meeting scheduled | Employee | calendar_reminder | Meeting details |

---

## 🎨 Component Props

### EmployeeOnboarding
```typescript
interface EmployeeOnboardingProps {
  record: OnboardingRecord;
  profiles: Array<{ id: string; name: string }>;
  userId: string;
  isAdmin: boolean;
  initialTab: DetailTab;
  isOwnRecord?: boolean;  // true = employee view
}
```

### DocumentUploadZone
```typescript
interface DocumentUploadZoneProps {
  docId: string;
  docName: string;
  docType: string;
  status: 'pending' | 'uploaded' | 'verified' | 'rejected';
  currentUrl?: string | null;
  ocrText?: string | null;
  rejectionReason?: string | null;
  isEmployee: boolean;
  recordId: string;
  onUploadSuccess?: () => void;
  onDeleteSuccess?: () => void;
}
```

### ComplianceTab
```typescript
interface ComplianceTabProps {
  recordId: string;
}

// Returns: ComplianceStatus
interface ComplianceStatus {
  totalDocs: number;
  verifiedDocs: number;
  totalTasks: number;
  completedTasks: number;
  overallScore: number;      // 0-100
  status: 'complete' | 'in_progress' | 'at_risk';
}
```

---

## 🗃️ Storage Bucket

**Name:** `onboarding-docs`  
**Path pattern:** `{org_id}/{employee_id}/{docId}-{filename}`

**Example:**
```
onboarding-docs/
├── 123abc-org/
│   ├── emp-001/
│   │   ├── doc-id-contract.pdf
│   │   ├── doc-id-license.jpg
│   │   └── doc-id-tax-form.pdf
│   └── emp-002/
│       └── doc-id-contract.pdf
```

---

## 🌍 Environment Variables

```bash
# Required (already set)
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Optional (new)
RESEND_API_KEY=re_...              # Email service
FROM_EMAIL=noreply@vetOS.local     # Email sender
NEXT_PUBLIC_BASE_URL=http://localhost:3000  # Invitation links
```

---

## 🧪 Quick Test Checklist

- [ ] Create onboarding as HR
- [ ] Employee receives notification
- [ ] Employee uploads document
- [ ] HR approves document
- [ ] Compliance score updates
- [ ] Employee re-uploads after rejection
- [ ] Meeting scheduled and synced to calendar
- [ ] Task marked complete updates progress
- [ ] ComplianceTab shows 100% when done

---

## 🐛 Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| File upload fails | Check: file type, file size < 15MB |
| No OCR text | OCR is optional; file still uploads |
| Email not sent | Check RESEND_API_KEY env var |
| Compliance score wrong | Refresh page; verify doc status is "verified" |
| Buttons not showing | Check isAdmin/isOwnRecord flags |

---

## 📊 Status Badges

**Document Status:**
- 🟦 Pending — No file yet
- 🟧 Uploaded — Waiting for HR review
- 🟩 Verified — Approved by HR
- 🟥 Rejected — Failed review, re-upload needed

**Overall Compliance:**
- 🟥 0-50% → At Risk
- 🟧 51-99% → In Progress
- 🟩 100% → Complete ✓

---

## 🔐 Access Control Matrix

| Action | Employee | HR/Admin |
|--------|----------|----------|
| Upload own doc | ✅ | ✅ |
| Upload others' doc | ❌ | ✅ |
| Approve doc | ❌ | ✅ |
| Reject doc | ❌ | ✅ |
| View own onboarding | ✅ | ✅ |
| View others' onboarding | ❌ | ✅ |
| Create template | ❌ | ✅ |
| Advance stage | ❌ | ✅ |

---

## 📞 API Reference Cheat Sheet

### Upload Document
```bash
POST /api/v1/onboarding/documents
Content-Type: multipart/form-data

file: {File}
docId: {UUID}
recordId: {UUID}
```

### Approve Document
```bash
POST /api/v1/onboarding/documents/approve
Content-Type: application/json

{ "docId": "{UUID}" }
```

### Reject Document
```bash
POST /api/v1/onboarding/documents/reject
Content-Type: application/json

{ "docId": "{UUID}", "reason": "..." }
```

### Delete Document
```bash
DELETE /api/v1/onboarding/documents?docId={UUID}&recordId={UUID}
```

---

## 🎯 File Types Supported

✅ **Allowed:**
- PDF (.pdf)
- JPEG (.jpg, .jpeg)
- PNG (.png)
- Word (.doc, .docx)

❌ **Not allowed:**
- ZIP, RAR, 7Z (archives)
- EXE, BAT, COM (executables)
- XLS, XLSX (spreadsheets)
- Videos, audio files

**Max size:** 15 MB per file

---

## 🚀 Deployment Steps

1. Run migration: `supabase db push`
2. Create bucket: `onboarding-docs` in Supabase console
3. Set env vars: `RESEND_API_KEY`, `FROM_EMAIL`
4. Test workflow (see testing guide)
5. Train HR and employees
6. Monitor first week

---

## 📚 Full Docs

- **Architecture:** `ONBOARDING_SELFSERVICE.md`
- **Testing:** `TESTING_SELFSERVICE_ONBOARDING.md`
- **Summary:** `IMPLEMENTATION_SUMMARY.md`
- **README:** `README_SELFSERVICE_ONBOARDING.md`

---

**Last Updated:** June 7, 2026  
**Status:** ✅ Production Ready
