# Self-Service Employee Onboarding System

## Overview
This document describes the production-ready self-service employee onboarding redesign, making the system similar to BambooHR, Rippling, and Trainual.

### Key Principle
**HR creates and assigns → Employee completes → HR approves**

Employees now upload their own documents, complete training, attend meetings, and monitor their progress. HR reviews and approves documents rather than uploading them.

---

## Architecture

### Core Flow

```
1. HR creates onboarding record
   ↓
2. System sends invitation (in-app + email)
   ↓
3. Employee logs in to portal
   ↓
4. Employee uploads documents
   ↓
5. Employee completes training
   ↓
6. Employee attends meetings
   ↓
7. HR reviews and approves documents
   ↓
8. System auto-updates progress
   ↓
9. Onboarding completes when all requirements met
```

### Role-Based Portal Views

Same URL (`/onboarding/{employeeId}`) serves two different interfaces:

**Employee View** (`isOwnRecord = true`):
- Documents Tab: Upload zones, status badges, rejection reasons
- Training Tab: Assigned courses with enrollment status
- Meetings Tab: View scheduled meetings
- Checklist Tab: Track required tasks
- Overview Tab: See progress and due dates

**HR View** (`isAdmin = true`):
- Documents Tab: Download files, view OCR text, Approve/Reject with reasons
- Templates Tab: Create/edit/delete templates
- All tabs: Review and manage employee progress
- Pipeline/List views: Manage multiple onboardings

---

## Database Changes

### Migration: `016_onboarding_selfservice.sql`

**New columns:**

```sql
-- onboarding_documents
ALTER TABLE onboarding_documents
  ADD COLUMN ocr_text TEXT;              -- Extracted text from uploaded file
  ADD COLUMN rejection_reason TEXT;      -- HR's reason for rejecting a doc
  ADD COLUMN public_url TEXT;            -- Signed URL for downloading file

-- onboarding_meetings
ALTER TABLE onboarding_meetings
  ADD COLUMN calendar_event_id UUID;     -- Link to calendar_events for integration

-- onboarding_records
ALTER TABLE onboarding_records
  ADD COLUMN invitation_sent_at TIMESTAMPTZ;  -- Track when invitation was sent
```

### Storage Bucket: `onboarding-docs`

- **Path pattern:** `{org_id}/{employee_id}/{docId}-{filename}`
- **Access:** Employees upload to their own folder; HR/admins can read all
- **Cleanup:** Files deleted when document reset or record deleted

---

## New API Routes

### `POST /api/v1/onboarding/documents`
Employee uploads a document.

**Request:**
```json
{
  "file": File,
  "docId": "uuid",
  "recordId": "uuid"
}
```

**Process:**
1. Verify user is the employee on this document
2. Upload file to `onboarding-docs` bucket
3. Run OCR via `extractText()` to get text content
4. Create signed URL (1 hour expiry)
5. Update document record with upload metadata
6. Send notification to HR manager
7. Log activity

**Response:**
```json
{
  "success": true,
  "data": { OnboardingDocument with ocr_text, public_url, status: "uploaded" }
}
```

### `DELETE /api/v1/onboarding/documents?docId={id}&recordId={id}`
Remove uploaded file (employee before HR review, or HR anytime).

**Process:**
1. Delete from storage
2. Reset document status to "pending"
3. Clear all upload fields

---

### `POST /api/v1/onboarding/documents/approve`
HR approves a document.

**Request:**
```json
{
  "docId": "uuid"
}
```

**Process:**
1. Update status to "verified"
2. Set `verified_by` and `verified_at`
3. Send notification to employee
4. Log activity

---

### `POST /api/v1/onboarding/documents/reject`
HR rejects a document with reason.

**Request:**
```json
{
  "docId": "uuid",
  "reason": "ID is expired, please upload a valid ID"
}
```

**Process:**
1. Update status to "rejected"
2. Store rejection reason
3. Send notification to employee with reason
4. Log activity

---

## New Server Actions (lib/actions/onboarding.ts)

### Document Approval
```typescript
approveDocument(docId: string): Promise<ActionResult<void>>
rejectDocument(docId: string, reason: string): Promise<ActionResult<void>>
```

### Invitations
```typescript
sendOnboardingInvitation(recordId: string): Promise<ActionResult<void>>
```
Sends:
- In-app notification (always)
- Email via Resend (if `RESEND_API_KEY` configured)

### Training Integration
```typescript
getOnboardingTraining(recordId: string): Promise<ActionResult<{
  trainingTasks: OnboardingTask[]
}>>
```
Returns tasks with `task_type === 'training'`.

### Compliance Status
```typescript
getComplianceStatus(recordId: string): Promise<ActionResult<ComplianceStatus>>
```

Returns:
```typescript
interface ComplianceStatus {
  totalDocs: number;
  verifiedDocs: number;
  totalTasks: number;
  completedTasks: number;
  overallScore: number;  // 0-100%
  status: 'complete' | 'in_progress' | 'at_risk';
}
```

### Template CRUD
```typescript
createOnboardingTemplate(input: CreateTemplateInput): Promise<ActionResult<OnboardingTemplate>>
updateOnboardingTemplate(id: string, input: Partial<CreateTemplateInput>): Promise<ActionResult<OnboardingTemplate>>
deleteOnboardingTemplate(id: string): Promise<ActionResult<void>>
```

---

## New Components

### `DocumentUploadZone`
Reusable dropzone component with two modes:

**Employee Mode:**
- Drag-and-drop upload zone
- File type validation (PDF, JPG, PNG, DOC, DOCX)
- Upload progress indicator
- Re-upload on rejection with visual feedback
- Clear rejection reason shown

**HR Mode:**
- Download button
- View extracted OCR text (collapsible)
- Approve button (status → verified)
- Reject button with reason textarea
- Verified badge when complete

**Features:**
- File size validation (max 15 MB)
- OCR text extraction on upload
- Rejection reason storage and display
- Signed URL for secure file access

---

## Notification Events

All notifications inserted into `notifications` table with type, title, body, and action_url.

| Event | Recipient | Type | Title |
|---|---|---|---|
| HR creates record | Employee | system_announcement | "Your Onboarding Has Started" |
| Employee uploads doc | HR Manager | document_shared | "Document Uploaded" |
| HR approves doc | Employee | document_shared | "Document Approved" |
| HR rejects doc | Employee | system_announcement | "Document Needs Revision" |
| HR schedules meeting | Employee | calendar_reminder | "Meeting Scheduled" |
| All requirements met | HR Manager | system_announcement | "{Name}'s Onboarding Complete" |

---

## Environment Variables

Add to `.env.local`:

```bash
# Email (Resend.com)
RESEND_API_KEY=re_...
FROM_EMAIL=noreply@vetOS.local

# Base URL (for invitation links)
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

If `RESEND_API_KEY` is not set, emails gracefully degrade (only in-app notifications sent).

---

## Usage Examples

### For HR: Create Onboarding

1. Go to `/onboarding`
2. Click "Start Onboarding"
3. Select employee
4. Choose template (Doctor, CSR, HR, Manager, VA, or none)
5. Assign manager and HR manager
6. Set start and target completion dates
7. Click "Start Onboarding"
   - Record created with template tasks/docs bootstrapped
   - Invitation notification sent to employee
   - Resend email sent (if configured)

### For Employee: Complete Onboarding

1. Receive notification or email with portal link
2. Go to `/onboarding/{their_id}`
3. **Documents Tab:**
   - See each required document
   - Click to upload file (PDF, JPG, PNG, DOC, DOCX)
   - OCR text automatically extracted
   - HR notified when uploaded
   - Wait for HR approval
   - If rejected, reason shown → re-upload with corrections
4. **Training Tab:**
   - See assigned training courses
   - Click "Go to Course" to complete in Training Academy
   - Progress tracked automatically
5. **Meetings Tab:**
   - See scheduled onboarding meetings
   - Can attend via link or in-person
6. **Checklist Tab:**
   - Check off action items as completed
7. **Compliance Tab:**
   - See overall compliance score
   - "All Clear" badge when 100% complete

### For HR: Review and Approve

1. Go to `/onboarding/{employee_id}`
2. **Documents Tab:**
   - See "Waiting for Review" documents
   - Click "Download File" to review
   - Click "View Extracted Text" to see OCR content
   - Click "Approve" → status changes to "Approved"
   - Or click "Reject" + reason → employee notified
3. **Pipeline/List View:**
   - See onboarding progress across multiple employees
   - Kanban-style columns by stage
   - Lists with compliance scores

---

## Auto-Progress

Progress updates automatically based on:
1. Task completion toggles (checklist)
2. Document verification status
3. Training course completion (via enrollment system)
4. Meeting attendance (via calendar system)

Formula: `(docs_verified + tasks_completed) / (total_docs + total_tasks) * 100`

When 100% + all required docs verified → Stage auto-advances to `completed` (if enabled).

---

## Compliance Tracking

The `getComplianceStatus` action returns:
- Document completion %
- Task completion %
- Overall score (0-100)
- Status badge (at_risk / in_progress / complete)

Used in:
- Compliance Tab: Big compliance score display
- Pipeline cards: Compliance badge
- Overview Tab: Compliance widget

---

## File Structure

### New Files
- `supabase/migrations/016_onboarding_selfservice.sql`
- `src/app/api/v1/onboarding/documents/route.ts` (POST/DELETE)
- `src/app/api/v1/onboarding/documents/approve/route.ts`
- `src/app/api/v1/onboarding/documents/reject/route.ts`
- `src/components/onboarding/document-upload-zone.tsx`

### Modified Files
- `src/lib/actions/onboarding.ts` (new server actions + signature for `createOnboardingRecord`)
- `src/components/onboarding/employee-onboarding.tsx` (DocumentsTab rewritten, isOwnRecord prop added)
- `src/app/(dashboard)/onboarding/[employeeId]/page.tsx` (isOwnRecord detection)
- `.env.example` (RESEND_API_KEY, FROM_EMAIL added)

---

## Testing

### Manual Testing Checklist

1. **Create Onboarding:**
   - [ ] HR creates onboarding record
   - [ ] Invitation notification appears for employee
   - [ ] Resend email sent (check logs if RESEND_API_KEY configured)

2. **Employee Portal:**
   - [ ] Employee sees document upload zones
   - [ ] Employee uploads PDF/JPG/PNG/DOC/DOCX
   - [ ] File size validation works
   - [ ] OCR text extracted and visible to HR
   - [ ] Status badge shows "Waiting for Review"

3. **Document Approval:**
   - [ ] HR sees uploaded document
   - [ ] HR can download file
   - [ ] HR can view OCR text
   - [ ] HR clicks "Approve" → status = "Approved", employee notified
   - [ ] HR clicks "Reject" + reason → employee notified with reason
   - [ ] Employee re-uploads → status resets to "Waiting for Review"

4. **Progress Updates:**
   - [ ] Compliance score updates as docs verified
   - [ ] Checklist completion affects progress %
   - [ ] When 100% complete → "All Clear" banner shows

5. **Training Integration:**
   - [ ] Training Tab shows assigned courses
   - [ ] "Go to Course" link navigates to Training Academy
   - [ ] Course enrollment tracking works

6. **Meetings:**
   - [ ] HR schedules meeting
   - [ ] Employee notified
   - [ ] Meeting shows in employee onboarding

---

## Performance Notes

- Document uploads are streamed to storage (no in-memory buffering beyond 15 MB limit)
- OCR text extraction happens server-side (non-blocking, logged if fails)
- Signed URLs expire after 1 hour (refresh on demand)
- Notifications are fire-and-forget (won't block main flow if insert fails)
- Activity logging is best-effort (won't block main flow)

---

## Security

- Employee can only upload to their own document
- Employee can only see their own onboarding record
- HR/Admins see all documents in org
- Storage bucket RLS enforced app-side (via auth checks in API route)
- Signed URLs provide temporary access (1 hour)
- File type validation server-side (whitelist: PDF, JPG, PNG, DOC, DOCX)
- File size limit: 15 MB

---

## Future Enhancements

- [ ] Background job to auto-verify documents with AI/ML
- [ ] Template versioning and history
- [ ] Bulk onboarding upload (CSV import)
- [ ] Customizable compliance rules per role
- [ ] Export onboarding records to PDF
- [ ] Onboarding task dependencies
- [ ] Automatic task assignment based on triggers
- [ ] Onboarding timeline visualization
- [ ] Integration with payroll systems
