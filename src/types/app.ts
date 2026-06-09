// ============================================================
// Application TypeScript Types
// ============================================================

import type { AppRole } from './database';
export type { AppRole };

// ── Shared ────────────────────────────────────────────────
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

// ── Profile ───────────────────────────────────────────────
export interface Profile {
  id: string;
  org_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  employee_id: string | null;
  avatar_url: string | null;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  microsoft_id: string | null;
  is_active: boolean;
  last_seen_at: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ProfileSummary = Pick<Profile,
  'id' | 'first_name' | 'last_name' | 'avatar_url' | 'job_title' | 'department'
>;

// ── Hospital ──────────────────────────────────────────────
export interface Hospital {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  timezone: string;
  color: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── Department ────────────────────────────────────────────
export interface Department {
  id: string;
  hospital_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

// ── Tasks ─────────────────────────────────────────────────
export type TaskStatus   = 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task {
  id: string;
  org_id: string;
  hospital_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  assignee?: ProfileSummary | null;
  creator?: ProfileSummary | null;
  comments?: TaskComment[];
  attachments?: TaskAttachment[];
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author?: ProfileSummary | null;
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  user_id: string;
  file_url: string;
  file_name: string;
  file_size: number;
  created_at: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  priority: TaskPriority;
  status?: TaskStatus;
  due_date?: string | null;
  assigned_to?: string | null;
  hospital_id?: string | null;
}

export interface UpdateTaskInput extends Partial<CreateTaskInput> {
  status?: TaskStatus;
}

// ── Training ──────────────────────────────────────────────
export interface TrainingCourse {
  id: string;
  org_id: string;
  hospital_id: string | null;
  title: string;
  description: string | null;
  category: string | null;
  thumbnail_url: string | null;
  is_required: boolean;
  due_days: number | null;
  created_by: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface TrainingModule {
  id: string;
  course_id: string;
  title: string;
  content_type: 'article' | 'video' | 'pdf' | 'quiz';
  content_url: string | null;
  content: string | null;
  duration_mins: number;
  sort_order: number;
  created_at: string;
}

export interface UserCourseEnrollment {
  id: string;
  user_id: string;
  course_id: string;
  enrolled_at: string;
  completed_at: string | null;
  due_date: string | null;
  progress_pct: number;
  course?: TrainingCourse;
  modules_total?: number;
  modules_done?: number;
}

export interface TrainingCertificate {
  id: string;
  user_id: string;
  course_id: string;
  issued_at: string;
  certificate_url: string | null;
  course?: TrainingCourse;
}

// ── Notifications ─────────────────────────────────────────
export type NotificationKind =
  | 'message_mention' | 'channel_message' | 'task_assigned' | 'task_due'
  | 'workflow_update' | 'calendar_reminder' | 'training_assigned'
  | 'document_shared' | 'system_announcement';

export interface Notification {
  id: string;
  user_id: string;
  org_id: string;
  type: NotificationKind;
  title: string;
  body: string | null;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
}

// ── Preferences ───────────────────────────────────────────
export interface NotificationPrefs {
  email: boolean;
  push: boolean;
  tasks: boolean;
  calendar: boolean;
  messages: boolean;
  training: boolean;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  theme: 'light' | 'dark' | 'system';
  language: string;
  timezone: string;
  date_format: string;
  time_format: '12h' | '24h';
  notification_prefs: NotificationPrefs;
  dashboard_layout: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type UpsertPreferencesInput = Partial<Omit<UserPreferences, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;

// ── AI Settings ───────────────────────────────────────────
export interface SavedPrompt {
  id: string;
  name: string;
  content: string;
  created_at: string;
}

export interface AIUserSettings {
  id: string;
  user_id: string;
  preferred_model: string;
  provider: 'anthropic' | 'openai' | 'google';
  voice_enabled: boolean;
  voice_id: string | null;
  saved_prompts: SavedPrompt[];
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AIModel {
  id: string;
  name: string;
  provider: 'anthropic' | 'openai' | 'google';
  description: string;
  context_window: number;
}

// ── Support Tickets ───────────────────────────────────────
export type TicketStatus   = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type TicketCategory =
  | 'technical' | 'access' | 'training' | 'billing'
  | 'bug' | 'feature_request' | 'other';

export interface SupportTicket {
  id: string;
  org_id: string;
  user_id: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  assigned_to: string | null;
  resolved_at: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
  submitter?: ProfileSummary | null;
  assignee?: ProfileSummary | null;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  user_id: string;
  content: string;
  is_internal: boolean;
  created_at: string;
  author?: ProfileSummary | null;
}

export interface CreateTicketInput {
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
}

// ── Security / Sessions ───────────────────────────────────
export interface UserSession {
  id: string;
  user_id: string;
  session_id: string;
  ip_address: string | null;
  user_agent: string | null;
  location: string | null;
  created_at: string;
  last_seen: string;
  revoked_at: string | null;
}

// ── Calendar ──────────────────────────────────────────────
export type EventType =
  // Meetings
  | 'meeting' | 'doctor_meeting' | 'leadership_meeting' | 'manager_meeting' | 'department_meeting'
  // Training
  | 'training' | 'cpr_training' | 'osha_training' | 'compliance_training' | 'lms_session'
  // HR
  | 'onboarding' | 'orientation' | 'performance_review'
  // PTO / Leave
  | 'pto' | 'vacation' | 'sick_leave' | 'personal_leave'
  // Hospital Events
  | 'hospital_event' | 'town_hall' | 'staff_event' | 'announcement'
  // Operational
  | 'audit' | 'inspection' | 'deadline'
  // Projects
  | 'project_milestone' | 'project_review'
  // Other
  | 'maintenance' | 'other';

export type EventCategory = 'meetings' | 'training' | 'hr' | 'pto' | 'hospital' | 'operational' | 'projects' | 'other';

export interface EventMeta {
  label: string;
  color: string;
  lightBg: string;
  textColor: string;
  borderColor: string;
  category: EventCategory;
}

export interface TodayStats {
  meetingsCount: number;
  staffOutCount: number;
  trainingDueCount: number;
  deadlinesCount: number;
  upcomingCount: number;
  onboardingCount: number;
}

export interface LeaveRequest {
  id: string;
  org_id: string;
  user_id: string;
  hospital_id: string | null;
  leave_type: 'vacation' | 'sick_leave' | 'personal_leave' | 'bereavement' | 'unpaid' | 'other';
  start_date: string;
  end_date: string;
  days_requested: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  calendar_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: string;
  org_id: string;
  hospital_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  meeting_link: string | null;
  event_type: EventType;
  start_time: string;
  end_time: string;
  is_all_day: boolean;
  is_recurring: boolean;
  recurrence_rule: string | null;
  outlook_event_id: string | null;
  created_by: string | null;
  is_cancelled: boolean;
  created_at: string;
  updated_at: string;
  attendees?: CalendarEventAttendee[];
}

export interface CalendarEventAttendee {
  id: string;
  event_id: string;
  user_id: string | null;
  email: string | null;
  status: 'invited' | 'accepted' | 'declined' | 'tentative';
  is_organizer: boolean;
}

// ── User Role Assignment ──────────────────────────────────
export interface UserHospitalRole {
  id: string;
  user_id: string;
  hospital_id: string;
  role: AppRole;
  granted_by: string | null;
  granted_at: string;
  user?: ProfileSummary;
  hospital?: Pick<Hospital, 'id' | 'name' | 'color'>;
}

// ── Knowledge Base ────────────────────────────────────────
export type KBDocStatus  = 'draft' | 'published' | 'archived';
export type KBVisibility = 'org' | 'hospital' | 'restricted';

export interface KBCategory {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  color: string;
  sort_order: number;
  is_system: boolean;
  created_at: string;
  document_count?: number;
}

export interface KBTag {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  color: string;
  created_at: string;
}

export interface KBDocument {
  id: string;
  org_id: string;
  hospital_id: string | null;
  category_id: string | null;
  title: string;
  slug: string | null;
  description: string | null;
  content?: string;
  status: KBDocStatus;
  visibility: KBVisibility;
  created_by: string | null;
  updated_by: string | null;
  published_at: string | null;
  published_by: string | null;
  archived_at: string | null;
  view_count: number;
  version: number;
  created_at: string;
  updated_at: string;
  category?: KBCategory | null;
  hospital?: Pick<Hospital, 'id' | 'name' | 'color'> | null;
  author?: ProfileSummary | null;
  updater?: ProfileSummary | null;
  tags?: KBTag[];
  attachments?: KBAttachment[];
}

export interface KBVersion {
  id: string;
  document_id: string;
  version: number;
  title: string;
  content: string | null;
  description: string | null;
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
  author?: ProfileSummary | null;
}

export interface KBAttachment {
  id: string;
  document_id: string;
  org_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
  public_url?: string;
}

export interface CreateKBDocumentInput {
  title: string;
  description?: string | null;
  content?: string;
  category_id?: string | null;
  hospital_id?: string | null;
  status?: KBDocStatus;
  visibility?: KBVisibility;
  tag_ids?: string[];
  change_summary?: string;
}

export interface UpdateKBDocumentInput extends Partial<CreateKBDocumentInput> {
  change_summary?: string;
}

// ── Audit Log ─────────────────────────────────────────────
export interface AuditLog {
  id: string;
  org_id: string;
  hospital_id: string | null;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  actor?: ProfileSummary | null;
}
