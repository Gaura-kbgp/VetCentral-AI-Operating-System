# Testing Self-Service Employee Onboarding

This guide walks through testing the complete self-service onboarding workflow.

## Prerequisites

1. **Development Server Running:**
   ```bash
   npm run dev
   # Runs on http://localhost:3000
   ```

2. **Database Migrations Applied:**
   ```bash
   # Apply migration 016_onboarding_selfservice.sql
   supabase db push
   ```

3. **Environment Variables:**
   - `.env.local` configured with Supabase keys
   - Optional: `RESEND_API_KEY` for email testing (gracefully degrades if missing)
   - Optional: `FROM_EMAIL` for sender address (defaults to `noreply@vetOS.local`)

4. **Test Users:**
   - HR Manager user (role: `hr` or `practice_manager`)
   - Employee user (no admin role)
   - Both should be in the same organization

---

## Test Scenario: Complete Onboarding Workflow

### Step 1: HR Creates Onboarding Record

**As HR Manager:**

1. Navigate to `/onboarding`
2. Click **"Start Onboarding"** button (top right, or Pipeline view)
3. **Step 1 - Select Employee:**
   - Search and select an employee without an onboarding record
   - Click **"Continue"**
4. **Step 2 - Choose Template:**
   - Select **"Doctor (DVM) Onboarding"** (or any system template)
   - Click **"Continue"**
5. **Step 3 - Configure Details:**
   - **Manager:** Select a manager
   - **HR Manager:** Select yourself or another HR person
   - **Start Date:** Today's date
   - **Target Completion:** 30 days from today
   - Click **"Start Onboarding"**

**Expected Outcome:**
- ✅ Onboarding record created
- ✅ Tasks and document requirements from template auto-populated
- ✅ Employee receives in-app notification: "Your Onboarding Has Started"
- ✅ Employee receives email (if RESEND_API_KEY configured)
- ✅ Record appears in Pipeline view in "Pre-Hire" column
- ✅ HR dashboard shows new onboarding in stats

**Verify in Database:**
```sql
SELECT id, employee_id, stage, status, invitation_sent_at 
FROM onboarding_records 
WHERE employee_id = '{employee_id}' 
LIMIT 1;
```

---

### Step 2: Employee Receives Invitation

**As Employee:**

1. Check notifications (bell icon in top nav)
2. See notification: **"Your Onboarding Has Started"**
3. Optionally, check email (if Resend configured)
4. Click notification or navigate to `/onboarding/{their_id}`

**Expected Outcome:**
- ✅ Portal loads with employee view (not HR view)
- ✅ Cannot see "Add Document" or "Templates" buttons
- ✅ Overview tab shows: progress, start date, target completion date, manager name
- ✅ Compliance tab shows 0% complete
- ✅ Documents tab shows upload zones for each required doc
- ✅ Checklist tab shows tasks organized by stage

---

### Step 3: Employee Uploads Documents

**As Employee:**

1. Go to **Documents** tab
2. See cards for:
   - Government-issued photo ID
   - State Veterinary License
   - DEA Certificate
   - Employment Agreement
   - W-4 / I-9
3. For **"Government-issued photo ID":**
   - Drag a PDF or JPG file into the upload zone
   - Or click to browse and select file
4. **Upload Progress:**
   - File uploads (progress indicator shown)
   - OCR text extracted automatically
   - File size shown (e.g., "Resume.pdf (245 KB)")
   - Status badge changes to "Waiting for Review"

**Expected Outcome:**
- ✅ File uploaded to `onboarding-docs/{org_id}/{employee_id}/{docId}-{filename}`
- ✅ Status badge: "Waiting for Review"
- ✅ HR Manager receives notification: "Document Uploaded"
- ✅ Activity log entry created: "uploaded document: Government-issued photo ID"
- ✅ Compliance score updated (if all docs uploaded: shows X% uploaded)

**Test File Rejection:**
1. Try uploading a `.txt` or `.exe` file
2. Should see error: "Unsupported file type"
3. Try uploading a file > 15 MB
4. Should see error: "File too large (max 15 MB)"

---

### Step 4: HR Reviews and Approves Documents

**As HR Manager:**

1. Receive notification: **"Document Uploaded"** (click to navigate)
2. Or navigate to `/onboarding/{employee_id}?tab=documents`
3. See employee portal with HR view (has Approve/Reject buttons)
4. For **"Government-issued photo ID":**
   - Click **"Download File"** to verify the document
   - Click **"View Extracted Text"** (collapsible) to see OCR content
   - Review OCR text and file
5. Click **"Approve"** button

**Expected Outcome:**
- ✅ Document status changes to "Approved"
- ✅ Employee receives notification: **"Document Approved"**
- ✅ Activity log: "approved document: Government-issued photo ID"
- ✅ Compliance score updates (1/5 docs verified)
- ✅ Document shows green checkmark badge

**Test Document Rejection:**
1. For another document, click **"Reject"** button
2. Enter rejection reason: `"ID is expired, must be current within 6 months"`
3. Click **"Send"**

**Expected Outcome:**
- ✅ Document status: "Needs Revision"
- ✅ Employee receives notification: **"Document Needs Revision"**
   - Body includes: "ID is expired, must be current within 6 months"
- ✅ When employee views Documents tab, rejection reason shown below status
- ✅ Upload zone reappears for re-upload
- ✅ Compliance score reflects 1 verified, 1 rejected

**Employee Re-uploads After Rejection:**
1. As Employee, see rejected document with reason displayed
2. Upload a new file to the same document
3. File uploads, status back to "Waiting for Review"
4. HR approves again

---

### Step 5: Employee Completes Training

**As Employee:**

1. Go to **Training** tab
2. See message: **"Training courses assigned during onboarding are tracked in the Training Academy"**
3. See button: **"Open Training Academy"**
4. For each training task in the onboarding checklist:
   - See status: "Not Started" / "In Progress" / "Completed"
   - Click **"Go to Course"** → navigates to `/training?course={courseId}`
   - Complete the course (or enroll if not yet enrolled)

**Expected Outcome:**
- ✅ Training enrollment tracked in `user_course_enrollments`
- ✅ Progress visible in Training tab
- ✅ Checklist task with `task_type: 'training'` updates as courses complete
- ✅ Compliance score updates

---

### Step 6: Employee Completes Checklist Items

**As Employee:**

1. Go to **Checklist** tab
2. See tasks organized by stage (Pre-Hire, Documents, Orientation, etc.)
3. For action items (e.g., "Complete new hire paperwork"):
   - Click checkbox to mark **"Complete"**
   - Checkbox fills with green checkmark
   - Task status: "Complete"
   - HR notified: "`{Name}` completed task: Complete new hire paperwork"
4. See progress bar update (e.g., "5/8 tasks completed")

**Expected Outcome:**
- ✅ Task status updates to "completed"
- ✅ Activity log: "completed task: ..."
- ✅ Progress % updates
- ✅ Compliance score reflects new completion rate

---

### Step 7: HR Schedules Meeting

**As HR Manager:**

1. Go to **Meetings** tab
2. Click **"Schedule Meeting"** button
3. Fill form:
   - **Title:** "Welcome & Orientation"
   - **Type:** "Orientation"
   - **Duration:** 90 minutes
   - **Date & Time:** Tomorrow at 10:00 AM
   - **Location:** "Conference Room A"
   - **Add to Master Calendar:** ✓ (checked)
4. Click **"Schedule"**

**Expected Outcome:**
- ✅ Meeting record created in `onboarding_meetings`
- ✅ Calendar event created in `calendar_events` (if "Add to Master Calendar" checked)
- ✅ `calendar_event_id` linked in meeting record
- ✅ Employee receives notification: **"Meeting Scheduled"**
   - Body: "Welcome & Orientation scheduled for [date/time]"
- ✅ Meeting appears in employee's Calendar tab
- ✅ Meeting appears in Master Calendar (`/calendar`)

**Employee View:**
1. As Employee, go to **Meetings** tab
2. See scheduled meeting with:
   - Title, type, date/time, location/link
   - "Scheduled" status badge

---

### Step 8: Monitor Compliance Progress

**As Either Role:**

1. Go to **Compliance** tab
2. See:
   - **Overall Score Card** (large number, color-coded)
   - **Documents Progress:** X/Y required documents verified
   - **Tasks Progress:** X/Y required tasks completed
   - **Breakdown:** Detailed stats
3. As more items complete, score increases
4. When 100% complete:
   - Score: **"100%"** in green
   - Banner: **"All Clear!"**
   - Subtitle: "All onboarding requirements have been completed"

**Expected Outcome:**
- ✅ Score updates in real-time as documents are verified/tasks completed
- ✅ Green progress bars when above 70%
- ✅ Amber/red when below 70%
- ✅ "What's Next" section shows remaining items

---

### Step 9: Complete Onboarding

**As HR Manager:**

1. Verify all requirements met (Compliance tab shows 100%)
2. In **Overview** tab, click **"Advance to Manager Review"** (or next stage button)
3. Stage changes to next phase (continues through: Pre-Hire → Documents → Orientation → Training → Manager Review → Completed)
4. Continue advancing until **"Completed"** stage

**Expected Outcome:**
- ✅ Record status: `stage = 'completed'`
- ✅ `completed_at` timestamp set
- ✅ Employee receives notification: **"Onboarding Completed"** (optional, depends on auto-completion)
- ✅ Pipeline card moves to "Completed" column (gray/green)
- ✅ Activity log: "advanced to completed"

---

## Test Matrix

### Document Upload
| Scenario | Input | Expected |
|----------|-------|----------|
| Valid PDF upload | Resume.pdf (5 MB) | ✅ Uploads, OCR extracted, status "Waiting for Review" |
| Valid JPG upload | ID.jpg (3 MB) | ✅ Uploads, OCR extracted |
| Valid PNG upload | Photo.png (2 MB) | ✅ Uploads, OCR extracted |
| Valid DOCX upload | Contract.docx (1 MB) | ✅ Uploads, OCR extracted |
| Unsupported file | Report.exe | ❌ Error: "Unsupported file type" |
| File too large | LargeVideo.mp4 (20 MB) | ❌ Error: "File too large" |
| Multiple uploads | 2 files to same document | ✅ Second upload replaces first |
| Delete before approval | Upload then delete | ✅ File removed, status "Pending" |

### Document Approval Workflow
| Scenario | Action | Expected |
|----------|--------|----------|
| HR approves | Click Approve | ✅ Status "Approved", employee notified |
| HR rejects | Click Reject + reason | ✅ Status "Rejected", reason shown to employee |
| Employee re-uploads after reject | Upload new file | ✅ Status "Waiting for Review", can be approved again |
| HR can download | Click Download | ✅ File downloaded via signed URL |
| OCR text visible | Click "View Text" | ✅ Extracted text shown (collapsible) |

### Compliance Scoring
| Scenario | Progress | Score |
|----------|----------|-------|
| No docs/tasks | 0 docs, 0 tasks | 0% / At Risk |
| Half done | 2/4 docs, 3/8 tasks | ~31% / At Risk |
| Mostly done | 4/4 docs, 7/8 tasks | ~94% / In Progress |
| All done | 4/4 docs, 8/8 tasks | 100% / All Clear |

### Notifications
| Event | Recipient | Notification Sent |
|-------|-----------|-------------------|
| Onboarding created | Employee | ✅ In-app + Email |
| Document uploaded | HR Manager | ✅ In-app |
| Document approved | Employee | ✅ In-app |
| Document rejected | Employee | ✅ In-app + Reason |
| Meeting scheduled | Employee | ✅ In-app |
| Task completed | HR Manager | ✅ In-app (optional) |
| Onboarding completed | HR Manager | ✅ In-app (optional) |

---

## Database Verification Queries

### Check onboarding record
```sql
SELECT 
  r.id, r.employee_id, r.stage, r.status, r.progress_pct,
  r.start_date, r.target_completion_date, r.invitation_sent_at,
  r.created_at
FROM onboarding_records r
WHERE r.employee_id = '{employee_id}'
LIMIT 1;
```

### Check documents
```sql
SELECT 
  id, name, doc_type, status, 
  file_size, storage_path, ocr_text IS NOT NULL as has_ocr,
  rejection_reason, verified_at
FROM onboarding_documents
WHERE record_id = '{record_id}'
ORDER BY created_at;
```

### Check tasks
```sql
SELECT 
  id, title, task_type, stage, status, 
  due_date, completed_at, sort_order
FROM onboarding_tasks
WHERE record_id = '{record_id}'
ORDER BY sort_order;
```

### Check meetings
```sql
SELECT 
  id, title, meeting_type, status, 
  scheduled_at, duration_mins, location, calendar_event_id
FROM onboarding_meetings
WHERE record_id = '{record_id}'
ORDER BY scheduled_at;
```

### Check notifications
```sql
SELECT 
  id, user_id, type, title, body, 
  action_url, is_read, created_at
FROM notifications
WHERE user_id IN ({employee_id}, {hr_manager_id})
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

### Check activity log
```sql
SELECT 
  id, user_id, action, details, created_at
FROM onboarding_activity
WHERE record_id = '{record_id}'
ORDER BY created_at DESC;
```

---

## Troubleshooting

### "File not uploaded" despite success message
- Check storage bucket `onboarding-docs` permissions
- Verify signed URL created (should be non-null)
- Check Supabase storage RLS policies

### "OCR text not extracted"
- Check `@/lib/ai/text-extractor` is working
- Verify file format is supported (PDF, JPG, PNG, DOC, DOCX)
- OCR failures are non-blocking (file still uploads)

### "Email not sent"
- Check `RESEND_API_KEY` env var is set
- Check `FROM_EMAIL` env var is set
- Email failures are non-blocking (in-app notification still sent)
- Check Resend dashboard for failures/bounces

### "Compliance score not updating"
- Force page refresh (Ctrl+R)
- Check that document status is actually "verified" (not "uploaded")
- Check that tasks are marked "completed" (not "in_progress")
- Verify `getComplianceStatus` calculation in actions

### "Can't see Documents tab upload zones"
- Check `isOwnRecord` flag is set correctly (user_id === record.employee_id)
- Verify page received `isOwnRecord={true}` prop
- Check browser console for errors

### "HR can't see Approve/Reject buttons"
- Verify user has HR role (check `user_hospital_roles`)
- Check `isAdmin` flag is true
- Page must load with `isAdmin={true}`

---

## Performance Testing

### Document Upload Performance
- **File size:** 15 MB PDF
- **Expected time:** < 10 seconds (including OCR)
- **Expected result:** File stored, OCR extracted, notification sent

### Compliance Score Calculation
- **Record with:** 10 docs, 50 tasks
- **Expected time:** < 1 second
- **Expected result:** Score calculated, page updates

### Real-time Updates
- **Supabase subscriptions:** Active on `onboarding_records`, `onboarding_tasks`
- **Expected:** Changes visible within 1-2 seconds on both roles' pages

---

## Accessibility Testing

- [ ] Keyboard navigation (Tab through form fields)
- [ ] Screen reader: Form labels properly associated
- [ ] Color contrast: Compliance badges readable
- [ ] Upload zones: Focus visible
- [ ] Error messages: Clear and descriptive

---

## Security Testing

- [ ] Employee cannot upload to another employee's documents
- [ ] Employee cannot approve/reject their own documents
- [ ] HR cannot see employees from other organizations
- [ ] Storage files require signed URL (time-limited access)
- [ ] RLS policies prevent unauthorized access

---

## Next Steps After Testing

1. **Train HR team** on creating onboarding records
2. **Train employees** on portal access and document upload
3. **Monitor first batch** of onboardings for issues
4. **Collect feedback** on UX/workflow
5. **Plan enhancements** (bulk upload, auto-approval, etc.)
