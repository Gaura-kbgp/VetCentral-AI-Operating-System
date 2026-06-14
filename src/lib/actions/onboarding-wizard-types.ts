// Shared constants and types for the onboarding wizard.
// NOT a 'use server' file — safe to import from both server and client.

// ── 8-step wizard ──────────────────────────────────────────────────────────

export type WizardStepKey =
  | 'personal_info'
  | 'documents'
  | 'emergency_contacts'
  | 'compliance'
  | 'training'
  | 'orientation'
  | 'manager_review'
  | 'complete';

export const WIZARD_STEP_ORDER: WizardStepKey[] = [
  'personal_info',
  'documents',
  'emergency_contacts',
  'compliance',
  'training',
  'orientation',
  'manager_review',
  'complete',
];

export const TOTAL_STEPS = WIZARD_STEP_ORDER.length;

export interface WizardStepMeta {
  key: WizardStepKey;
  index: number;
  label: string;
  shortLabel: string;
  description: string;
  estimatedMinutes: number;
}

export const WIZARD_STEPS: WizardStepMeta[] = [
  { key: 'personal_info',      index: 0, label: 'Personal Information', shortLabel: 'Personal',    description: 'Your contact details and basic info',        estimatedMinutes: 5  },
  { key: 'documents',          index: 1, label: 'Documents',             shortLabel: 'Documents',   description: 'Upload your required documents',             estimatedMinutes: 10 },
  { key: 'emergency_contacts', index: 2, label: 'Emergency Contacts',    shortLabel: 'Emergency',   description: 'Who to contact in an emergency',             estimatedMinutes: 3  },
  { key: 'compliance',         index: 3, label: 'Compliance Forms',      shortLabel: 'Compliance',  description: 'Review and sign required policies',           estimatedMinutes: 10 },
  { key: 'training',           index: 4, label: 'Training',              shortLabel: 'Training',    description: 'Complete your assigned training courses',     estimatedMinutes: 20 },
  { key: 'orientation',        index: 5, label: 'Orientation',           shortLabel: 'Orientation', description: 'Your orientation meeting details',           estimatedMinutes: 2  },
  { key: 'manager_review',     index: 6, label: 'Manager Review',        shortLabel: 'Review',      description: 'Awaiting manager approval',                  estimatedMinutes: 1  },
  { key: 'complete',           index: 7, label: 'Complete',              shortLabel: 'Done',        description: 'Welcome to the team!',                      estimatedMinutes: 0  },
];

export const VET_ROLES = [
  'doctor', 'vet_technician', 'veterinarian',
  'vet_tech', 'vet_assistant', 'veterinary_technician',
];

// ── Form data types ────────────────────────────────────────────────────────

export interface PersonalInfo {
  phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip: string;
  dob: string;
  preferred_name: string;
  gender: string;
  vet_license?: string;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  email: string;
}

export interface FirstWeekItem {
  id: string;
  title: string;
  completed: boolean;
  completed_at: string | null;
}

// ── WizardData — full record returned by getWizardData() ──────────────────

export interface WizardData {
  record: {
    id: string;
    org_id: string;
    employee_id: string;
    stage: string;
    status: string;
    progress_pct: number;
    wizard_step: number;
    completed_steps: string[];
    wizard_data: {
      personal_info?: PersonalInfo;
      emergency_contact?: EmergencyContact;
      emergency_contacts?: EmergencyContact[];
      first_week_checklist?: FirstWeekItem[];
    };
    employment_type: string | null;
    start_date: string | null;
    completed_at: string | null;
    notes: string | null;
    hospital_id: string | null;
    manager_id: string | null;
  };
  employee: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    job_title: string | null;
    department: string | null;
    avatar_url: string | null;
    role: string | null;
  };
  hospital: {
    id: string;
    name: string;
    color: string | null;
    address: string | null;
    phone: string | null;
  } | null;
  manager: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    job_title: string | null;
    avatar_url: string | null;
  } | null;
  documents: Array<{
    id: string;
    doc_type: string;
    name: string;
    status: string;
    storage_path: string | null;
    notes: string | null;
  }>;
  vetCredentials: {
    license_number: string | null;
    license_state: string | null;
    license_expiry: string | null;
    dea_number: string | null;
    dea_expiry: string | null;
    specializations: string[];
    skill_matrix: Record<string, boolean>;
    verification_status: string;
  } | null;
  trainingTasks: Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    due_date: string | null;
  }>;
  policies: Array<{
    id: string;
    policy_key: string;
    policy_name: string;
    policy_content: string | null;
    acknowledged: boolean;
    acknowledged_at: string | null;
    signature_text: string | null;
  }>;
  equipment: Array<{
    id: string;
    equipment_name: string;
    equipment_type: string | null;
    serial_number: string | null;
    status: string;
    assigned_date: string | null;
  }>;
  requiresVetCredentials: boolean;
}

// ── HR Dashboard type ──────────────────────────────────────────────────────

export interface PipelineEmployee {
  record_id: string;
  employee_id: string;
  employee_name: string;
  employee_email: string | null;
  employee_avatar: string | null;
  job_title: string | null;
  department: string | null;
  hospital_name: string | null;
  hospital_color: string | null;
  status: string;
  stage: string;
  progress_pct: number;
  wizard_step: number;
  completed_steps: string[];
  employment_type: string | null;
  start_date: string | null;
  created_at: string;
  docs_uploaded: number;
  docs_total: number;
  policies_acked: number;
  policies_total: number;
}
