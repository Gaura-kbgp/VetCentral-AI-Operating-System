-- ============================================================
-- Migration 035: Seed real onboarding data
-- Populates documents, training tasks, meetings, equipment
-- for all active/on_hold onboarding records
-- ============================================================

DO $$
DECLARE
  v_org_id   UUID;
  v_admin_id UUID;
  v_rec      RECORD;
  v_role     TEXT;
  v_is_vet   BOOLEAN;
BEGIN
  SELECT id INTO v_org_id FROM organizations LIMIT 1;
  IF v_org_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_admin_id FROM profiles WHERE org_id = v_org_id ORDER BY created_at LIMIT 1;

  -- ── Loop over every active / on_hold onboarding record ───────
  FOR v_rec IN
    SELECT r.id AS record_id, r.employee_id, r.org_id, r.stage, p.job_title
    FROM onboarding_records r
    JOIN profiles p ON p.id = r.employee_id
    WHERE r.org_id = v_org_id AND r.status IN ('active','on_hold')
  LOOP

    SELECT coalesce(uhr.role::TEXT, '') INTO v_role
    FROM user_hospital_roles uhr WHERE uhr.user_id = v_rec.employee_id LIMIT 1;
    v_role := lower(coalesce(v_rec.job_title, v_role, ''));
    v_is_vet := (v_role LIKE '%vet%' OR v_role LIKE '%doctor%' OR v_role LIKE '%surgeon%' OR v_role LIKE '%technician%');

    -- ────────────────────────────────────────────────────────────
    -- DOCUMENTS
    -- ────────────────────────────────────────────────────────────
    INSERT INTO onboarding_documents
      (org_id, record_id, employee_id, doc_type, name, status, notes)
    VALUES
      (v_rec.org_id, v_rec.record_id, v_rec.employee_id, 'contract',          'Employment Contract',             'pending', 'Standard full-time employment agreement'),
      (v_rec.org_id, v_rec.record_id, v_rec.employee_id, 'id',                'Government-Issued Photo ID',      'pending', 'Passport or driver''s license required'),
      (v_rec.org_id, v_rec.record_id, v_rec.employee_id, 'tax_form',          'Tax Withholding Form (W-4)',       'pending', 'Federal tax withholding declaration'),
      (v_rec.org_id, v_rec.record_id, v_rec.employee_id, 'tax_form',          'State Tax Form',                  'pending', 'State income tax withholding'),
      (v_rec.org_id, v_rec.record_id, v_rec.employee_id, 'emergency_contact', 'Emergency Contact Form',          'pending', 'Next-of-kin contact details'),
      (v_rec.org_id, v_rec.record_id, v_rec.employee_id, 'other',             'Direct Deposit Authorization',    'pending', 'Bank account details for payroll'),
      (v_rec.org_id, v_rec.record_id, v_rec.employee_id, 'other',             'Benefits Enrollment Form',        'pending', 'Health, dental & vision election')
    ON CONFLICT DO NOTHING;

    -- Vet-specific credential documents
    IF v_is_vet THEN
      INSERT INTO onboarding_documents
        (org_id, record_id, employee_id, doc_type, name, status, notes)
      VALUES
        (v_rec.org_id, v_rec.record_id, v_rec.employee_id, 'certification', 'Veterinary License Certificate',   'pending', 'State-issued license — must be current'),
        (v_rec.org_id, v_rec.record_id, v_rec.employee_id, 'certification', 'DEA Registration Certificate',     'pending', 'Required for controlled substance handling'),
        (v_rec.org_id, v_rec.record_id, v_rec.employee_id, 'certification', 'AVMA Membership / Board Cert.',    'pending', 'If applicable — board specialty certificate')
      ON CONFLICT DO NOTHING;
    END IF;

    -- ────────────────────────────────────────────────────────────
    -- TRAINING TASKS (task_type = 'training')
    -- ────────────────────────────────────────────────────────────
    INSERT INTO onboarding_tasks
      (org_id, record_id, title, description, category, task_type, stage, status, due_date, sort_order)
    VALUES
      (v_rec.org_id, v_rec.record_id,
        'Complete Safety & Compliance E-Learning Module',
        'Online training covering OSHA, workplace safety, PPE usage, and emergency procedures. Duration approx. 45 minutes.',
        'required', 'training', 'training', 'pending',
        (CURRENT_DATE + 7)::DATE, 1),
      (v_rec.org_id, v_rec.record_id,
        'HIPAA & Patient Privacy Training',
        'Mandatory HIPAA training covering patient data protection, PHI handling, breach reporting, and penalties. Duration approx. 30 minutes.',
        'required', 'training', 'training', 'pending',
        (CURRENT_DATE + 7)::DATE, 2),
      (v_rec.org_id, v_rec.record_id,
        'VetOS Platform Orientation Training',
        'Interactive walkthrough of the VetOS operating system — calendar, tasks, knowledge base, communication, and patient modules.',
        'required', 'training', 'orientation', 'pending',
        (CURRENT_DATE + 3)::DATE, 3),
      (v_rec.org_id, v_rec.record_id,
        'EMR / Patient Records System Training',
        'Hands-on training with the electronic medical records system. Covers patient intake, record creation, treatment logging, and billing codes.',
        'required', 'training', 'training', 'pending',
        (CURRENT_DATE + 10)::DATE, 4),
      (v_rec.org_id, v_rec.record_id,
        'Infection Control & Biosafety Procedures',
        'Covers standard infection control protocols, PPE requirements, disinfection procedures, and handling of biohazardous materials.',
        'required', 'training', 'training', 'pending',
        (CURRENT_DATE + 14)::DATE, 5),
      (v_rec.org_id, v_rec.record_id,
        'Emergency & Code Response Procedures',
        'Review of emergency codes, fire evacuation procedures, patient emergency response, and critical incident reporting.',
        'required', 'training', 'training', 'pending',
        (CURRENT_DATE + 14)::DATE, 6)
    ON CONFLICT DO NOTHING;

    -- Vet-specific training
    IF v_is_vet THEN
      INSERT INTO onboarding_tasks
        (org_id, record_id, title, description, category, task_type, stage, status, due_date, sort_order)
      VALUES
        (v_rec.org_id, v_rec.record_id,
          'Controlled Substance Handling & DEA Compliance',
          'Mandatory training for all staff handling controlled substances. Covers DEA regulations, log requirements, disposal, and auditing.',
          'required', 'training', 'training', 'pending',
          (CURRENT_DATE + 10)::DATE, 7),
        (v_rec.org_id, v_rec.record_id,
          'Surgical Suite Protocols & Sterile Technique',
          'Training on surgical preparation, sterile field maintenance, instrument handling, and post-op procedures in our surgical suites.',
          'required', 'training', 'training', 'pending',
          (CURRENT_DATE + 21)::DATE, 8)
      ON CONFLICT DO NOTHING;
    END IF;

    -- HR / compliance tasks
    INSERT INTO onboarding_tasks
      (org_id, record_id, title, description, category, task_type, stage, status, due_date, sort_order)
    VALUES
      (v_rec.org_id, v_rec.record_id,
        'Submit All Required Onboarding Documents',
        'Upload all required documents including employment contract, government ID, tax forms, and any professional certifications.',
        'required', 'hr', 'documents', 'pending',
        (CURRENT_DATE + 3)::DATE, 10),
      (v_rec.org_id, v_rec.record_id,
        'Acknowledge All Workplace Policies',
        'Review and electronically sign all 6 company policies in the Compliance section of your onboarding wizard.',
        'required', 'compliance', 'documents', 'pending',
        (CURRENT_DATE + 5)::DATE, 11),
      (v_rec.org_id, v_rec.record_id,
        'Complete IT Setup & System Access Request',
        'Coordinate with IT to set up your workstation, email account, VetOS credentials, EMR access, and any specialty software needed for your role.',
        'required', 'it', 'orientation', 'pending',
        (CURRENT_DATE + 2)::DATE, 12)
    ON CONFLICT DO NOTHING;

    -- ────────────────────────────────────────────────────────────
    -- MEETINGS
    -- ────────────────────────────────────────────────────────────
    INSERT INTO onboarding_meetings
      (org_id, record_id, title, meeting_type, scheduled_at, duration_mins, location, status, notes, created_by)
    VALUES
      (v_rec.org_id, v_rec.record_id,
        'HR Welcome & Orientation Meeting',
        'orientation',
        (NOW() + INTERVAL '1 day')::TIMESTAMPTZ,
        90,
        'HR Office — Main Building, Room 101',
        'scheduled',
        'Welcome meeting with HR. Covers benefits overview, org structure, policies, and facility tour.',
        v_admin_id),
      (v_rec.org_id, v_rec.record_id,
        'IT Setup & System Access Session',
        'it_setup',
        (NOW() + INTERVAL '2 days')::TIMESTAMPTZ,
        60,
        'IT Department — Building B, Room 205',
        'scheduled',
        'IT technician will configure workstation, set up credentials, and provide access to all required systems.',
        v_admin_id),
      (v_rec.org_id, v_rec.record_id,
        'Manager One-on-One Introduction',
        'one_on_one',
        (NOW() + INTERVAL '3 days')::TIMESTAMPTZ,
        45,
        'Manager''s Office or Video Call',
        'scheduled',
        'Introduction meeting with direct manager to discuss role expectations, team dynamics, and first 30-day goals.',
        v_admin_id),
      (v_rec.org_id, v_rec.record_id,
        'Team Introduction & Office Tour',
        'team_intro',
        (NOW() + INTERVAL '4 days')::TIMESTAMPTZ,
        60,
        'Main Hospital — Conference Room A',
        'scheduled',
        'Meet your immediate team members, tour hospital facilities, and learn about departmental workflows.',
        v_admin_id),
      (v_rec.org_id, v_rec.record_id,
        '30-Day Manager Check-in',
        'manager_review',
        (NOW() + INTERVAL '30 days')::TIMESTAMPTZ,
        60,
        'Manager''s Office or Video Call',
        'scheduled',
        'Formal 30-day progress review. Discussion of performance, questions, feedback, and goals for the next 60 days.',
        v_admin_id)
    ON CONFLICT DO NOTHING;

    -- ────────────────────────────────────────────────────────────
    -- EQUIPMENT
    -- ────────────────────────────────────────────────────────────
    INSERT INTO equipment_assignments
      (org_id, record_id, employee_id, equipment_name, equipment_type, serial_number, status, assigned_by, assigned_date, notes)
    VALUES
      (v_rec.org_id, v_rec.record_id, v_rec.employee_id,
        'MacBook Pro 14"', 'laptop', 'SN-LP-' || substr(v_rec.record_id::TEXT, 1, 6),
        'pending', v_admin_id, CURRENT_DATE, 'Standard issue laptop — IT will configure before first day'),
      (v_rec.org_id, v_rec.record_id, v_rec.employee_id,
        'Employee ID Badge & Access Card', 'badge', 'BADGE-' || substr(v_rec.record_id::TEXT, 1, 6),
        'pending', v_admin_id, CURRENT_DATE, 'Photo ID and door access card — pick up from reception'),
      (v_rec.org_id, v_rec.record_id, v_rec.employee_id,
        'Staff Locker & Key', 'locker', 'LOCK-' || substr(v_rec.record_id::TEXT, 1, 6),
        'pending', v_admin_id, CURRENT_DATE, 'Personal locker in staff room — key issued by facilities'),
      (v_rec.org_id, v_rec.record_id, v_rec.employee_id,
        'VetCentral Uniform Set (×3)', 'uniform', NULL,
        'pending', v_admin_id, CURRENT_DATE, 'Scrubs in hospital colours — size confirmed during HR meeting')
    ON CONFLICT DO NOTHING;

    -- Vet-specific equipment
    IF v_is_vet THEN
      INSERT INTO equipment_assignments
        (org_id, record_id, employee_id, equipment_name, equipment_type, serial_number, status, assigned_by, assigned_date, notes)
      VALUES
        (v_rec.org_id, v_rec.record_id, v_rec.employee_id,
          'Clinical Mobile Device (iPad)', 'mobile', 'MOB-' || substr(v_rec.record_id::TEXT, 1, 6),
          'pending', v_admin_id, CURRENT_DATE, 'For use at patient bedside — pre-loaded with EMR app'),
        (v_rec.org_id, v_rec.record_id, v_rec.employee_id,
          'Department Access Keys', 'keys', 'KEY-' || substr(v_rec.record_id::TEXT, 1, 6),
          'pending', v_admin_id, CURRENT_DATE, 'Access to surgical suite, pharmacy & lab — issued by dept head')
      ON CONFLICT DO NOTHING;
    END IF;

  END LOOP;
END $$;
