// TEMPORARY placeholder — replace with auto-generated types after connecting Supabase:
// npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/types/database.ts

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;

export type AppRole =
  | 'super_admin' | 'org_admin' | 'hospital_admin' | 'practice_manager'
  | 'doctor' | 'csr' | 'va' | 'marketing' | 'hr' | 'it_admin' | 'viewer';

export type ChannelType = 'public' | 'private' | 'announcement' | 'direct';
export type EventType = 'meeting' | 'training' | 'pto' | 'hospital_event' | 'onboarding' | 'doctor_meeting' | 'maintenance' | 'other';
export type NotificationType = 'message_mention' | 'channel_message' | 'task_assigned' | 'task_due' | 'workflow_update' | 'calendar_reminder' | 'training_assigned' | 'document_shared' | 'system_announcement';
export type MessageRole = 'user' | 'assistant' | 'system';
export type ArticleStatus = 'draft' | 'review' | 'published' | 'archived';
