-- ============================================================
-- Migration 031: Seed demo projects (ongoing + completed)
-- ============================================================

DO $$
DECLARE
  v_org_id   UUID;
  v_admin_id UUID;
  v_user1_id UUID;
  v_user2_id UUID;
  v_hosp1    UUID;
  v_hosp2    UUID;
  v_p1 UUID; v_p2 UUID; v_p3 UUID; v_p4 UUID; v_p5 UUID; v_p6 UUID; v_p7 UUID;
BEGIN
  -- Resolve org, admin, and first two members
  SELECT id INTO v_org_id FROM organizations LIMIT 1;
  IF v_org_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_admin_id FROM profiles WHERE org_id = v_org_id ORDER BY created_at LIMIT 1;
  SELECT id INTO v_user1_id FROM profiles WHERE org_id = v_org_id ORDER BY created_at LIMIT 1 OFFSET 1;
  SELECT id INTO v_user2_id FROM profiles WHERE org_id = v_org_id ORDER BY created_at LIMIT 1 OFFSET 2;

  IF v_user1_id IS NULL THEN v_user1_id := v_admin_id; END IF;
  IF v_user2_id IS NULL THEN v_user2_id := v_admin_id; END IF;

  SELECT id INTO v_hosp1 FROM hospitals WHERE org_id = v_org_id ORDER BY name LIMIT 1 OFFSET 0;
  SELECT id INTO v_hosp2 FROM hospitals WHERE org_id = v_org_id ORDER BY name LIMIT 1 OFFSET 1;
  IF v_hosp2 IS NULL THEN v_hosp2 := v_hosp1; END IF;

  -- Skip if projects already seeded
  IF EXISTS (SELECT 1 FROM projects WHERE org_id = v_org_id LIMIT 1) THEN
    RETURN;
  END IF;

  -- ── Project 1: ACTIVE — EMR System Upgrade ────────────────
  INSERT INTO projects (id, org_id, hospital_id, name, description, status, priority, owner_id, created_by,
    start_date, due_date, progress_pct, color, tags, checklist)
  VALUES (
    uuid_generate_v4(), v_org_id, v_hosp1,
    'EMR System Upgrade',
    'Migrate all three hospitals from legacy EMR to VetEMR Cloud. Includes data migration, staff training, and go-live support.',
    'active', 'urgent', v_admin_id, v_admin_id,
    (CURRENT_DATE - INTERVAL '30 days')::DATE,
    (CURRENT_DATE + INTERVAL '45 days')::DATE,
    62, '#3b82f6',
    ARRAY['emr','migration','infrastructure'],
    '[
      {"id":"c1","text":"Audit current EMR records","completed":true},
      {"id":"c2","text":"Map data schema to VetEMR Cloud","completed":true},
      {"id":"c3","text":"Run test migration on staging","completed":true},
      {"id":"c4","text":"Train admin staff — Columbia Pike","completed":false},
      {"id":"c5","text":"Train clinical staff — all hospitals","completed":false},
      {"id":"c6","text":"Go-live: Hospital 1","completed":false},
      {"id":"c7","text":"Go-live: Hospitals 2 & 3","completed":false},
      {"id":"c8","text":"Post-migration audit & sign-off","completed":false}
    ]'::jsonb
  ) RETURNING id INTO v_p1;

  INSERT INTO project_members (project_id, org_id, user_id, role) VALUES
    (v_p1, v_org_id, v_admin_id, 'owner'),
    (v_p1, v_org_id, v_user1_id, 'member'),
    (v_p1, v_org_id, v_user2_id, 'member');

  INSERT INTO project_tasks (project_id, org_id, title, status, priority, assigned_to, due_date, section, position, created_by) VALUES
    (v_p1, v_org_id, 'Negotiate VetEMR Cloud licensing terms',       'done',        'high',   v_admin_id, (CURRENT_DATE - INTERVAL '20 days')::DATE, 'Planning',     1, v_admin_id),
    (v_p1, v_org_id, 'Export legacy patient records to CSV',         'done',        'high',   v_user1_id, (CURRENT_DATE - INTERVAL '10 days')::DATE, 'Migration',    2, v_admin_id),
    (v_p1, v_org_id, 'Validate migrated records for accuracy',       'in_progress', 'urgent', v_user1_id, (CURRENT_DATE + INTERVAL '5 days')::DATE,  'Migration',    3, v_admin_id),
    (v_p1, v_org_id, 'Configure role permissions in new system',     'in_progress', 'medium', v_admin_id, (CURRENT_DATE + INTERVAL '7 days')::DATE,  'Configuration',4, v_admin_id),
    (v_p1, v_org_id, 'Schedule staff training sessions',             'todo',        'medium', v_user2_id, (CURRENT_DATE + INTERVAL '14 days')::DATE, 'Training',     5, v_admin_id),
    (v_p1, v_org_id, 'Conduct go-live dry run',                      'todo',        'high',   v_admin_id, (CURRENT_DATE + INTERVAL '30 days')::DATE, 'Go-Live',      6, v_admin_id);

  -- ── Project 2: ACTIVE — New Clinic Wing Construction ──────
  INSERT INTO projects (id, org_id, hospital_id, name, description, status, priority, owner_id, created_by,
    start_date, due_date, progress_pct, color, tags, checklist)
  VALUES (
    uuid_generate_v4(), v_org_id, v_hosp2,
    'New Surgical Wing — Animal Clinic of Clifton',
    'Construction and fit-out of a 4-room surgical suite wing, including specialized surgical equipment, monitoring systems, and sterile prep areas.',
    'active', 'high', v_user1_id, v_admin_id,
    (CURRENT_DATE - INTERVAL '60 days')::DATE,
    (CURRENT_DATE + INTERVAL '90 days')::DATE,
    38, '#8b5cf6',
    ARRAY['construction','facilities','surgery'],
    '[
      {"id":"c1","text":"Submit building permit application","completed":true},
      {"id":"c2","text":"Receive permit approval","completed":true},
      {"id":"c3","text":"Demolition & framing","completed":false},
      {"id":"c4","text":"Electrical & HVAC rough-in","completed":false},
      {"id":"c5","text":"Surgical equipment procurement","completed":false},
      {"id":"c6","text":"Install monitoring systems","completed":false},
      {"id":"c7","text":"OSHA compliance inspection","completed":false},
      {"id":"c8","text":"Soft opening & staff orientation","completed":false}
    ]'::jsonb
  ) RETURNING id INTO v_p2;

  INSERT INTO project_members (project_id, org_id, user_id, role) VALUES
    (v_p2, v_org_id, v_user1_id, 'owner'),
    (v_p2, v_org_id, v_admin_id, 'member'),
    (v_p2, v_org_id, v_user2_id, 'viewer');

  INSERT INTO project_tasks (project_id, org_id, title, status, priority, assigned_to, due_date, section, position, created_by) VALUES
    (v_p2, v_org_id, 'Finalize architectural drawings',              'done',        'high',   v_user1_id, (CURRENT_DATE - INTERVAL '40 days')::DATE, 'Planning',   1, v_admin_id),
    (v_p2, v_org_id, 'Select general contractor',                    'done',        'high',   v_admin_id, (CURRENT_DATE - INTERVAL '25 days')::DATE, 'Planning',   2, v_admin_id),
    (v_p2, v_org_id, 'Order surgical tables & lighting',             'in_progress', 'urgent', v_user1_id, (CURRENT_DATE + INTERVAL '10 days')::DATE, 'Procurement',3, v_admin_id),
    (v_p2, v_org_id, 'Install ventilation & gas lines',              'todo',        'high',   v_user2_id, (CURRENT_DATE + INTERVAL '35 days')::DATE, 'Construction',4, v_admin_id),
    (v_p2, v_org_id, 'Sterile supply storage room fit-out',          'todo',        'medium', v_user2_id, (CURRENT_DATE + INTERVAL '55 days')::DATE, 'Construction',5, v_admin_id),
    (v_p2, v_org_id, 'Final inspection & sign-off',                  'todo',        'urgent', v_admin_id, (CURRENT_DATE + INTERVAL '85 days')::DATE, 'Inspection', 6, v_admin_id);

  -- ── Project 3: ACTIVE — Staff Wellness Program Q3 ─────────
  INSERT INTO projects (id, org_id, name, description, status, priority, owner_id, created_by,
    start_date, due_date, progress_pct, color, is_cross_hospital, tags, checklist)
  VALUES (
    uuid_generate_v4(), v_org_id,
    'Staff Wellness Program — Q3 2026',
    'Cross-hospital initiative to improve staff retention and mental health. Includes quarterly workshops, peer support groups, and an anonymous feedback system.',
    'active', 'medium', v_user2_id, v_admin_id,
    (CURRENT_DATE - INTERVAL '14 days')::DATE,
    (CURRENT_DATE + INTERVAL '60 days')::DATE,
    25, '#f59e0b',
    TRUE,
    ARRAY['hr','wellness','staff'],
    '[
      {"id":"c1","text":"Survey all staff on wellness priorities","completed":true},
      {"id":"c2","text":"Analyse survey results","completed":false},
      {"id":"c3","text":"Partner with wellness vendor","completed":false},
      {"id":"c4","text":"Launch peer support Slack channel","completed":false},
      {"id":"c5","text":"Host Q3 wellness kickoff workshop","completed":false},
      {"id":"c6","text":"Deploy anonymous feedback form","completed":false}
    ]'::jsonb
  ) RETURNING id INTO v_p3;

  INSERT INTO project_members (project_id, org_id, user_id, role) VALUES
    (v_p3, v_org_id, v_user2_id, 'owner'),
    (v_p3, v_org_id, v_admin_id, 'member'),
    (v_p3, v_org_id, v_user1_id, 'member');

  -- ── Project 4: ACTIVE — Vaccine Protocol Update ────────────
  INSERT INTO projects (id, org_id, hospital_id, name, description, status, priority, owner_id, created_by,
    start_date, due_date, progress_pct, color, tags, checklist)
  VALUES (
    uuid_generate_v4(), v_org_id, v_hosp1,
    'Vaccine Protocol Standardization 2026',
    'Align vaccination schedules and documentation across all three hospitals to meet new state veterinary board requirements effective August 2026.',
    'active', 'high', v_user1_id, v_user1_id,
    (CURRENT_DATE - INTERVAL '7 days')::DATE,
    (CURRENT_DATE + INTERVAL '30 days')::DATE,
    15, '#10b981',
    ARRAY['clinical','compliance','vaccines'],
    '[
      {"id":"c1","text":"Review current protocol documents","completed":true},
      {"id":"c2","text":"Consult state vet board guidelines","completed":false},
      {"id":"c3","text":"Draft updated protocol","completed":false},
      {"id":"c4","text":"Medical director sign-off","completed":false},
      {"id":"c5","text":"Distribute to all clinicians","completed":false}
    ]'::jsonb
  ) RETURNING id INTO v_p4;

  INSERT INTO project_members (project_id, org_id, user_id, role) VALUES
    (v_p4, v_org_id, v_user1_id, 'owner'),
    (v_p4, v_org_id, v_admin_id, 'member');

  -- ── Project 5: COMPLETED — Website Redesign ────────────────
  INSERT INTO projects (id, org_id, name, description, status, priority, owner_id, created_by,
    start_date, due_date, completed_at, progress_pct, color, is_cross_hospital, tags, checklist)
  VALUES (
    uuid_generate_v4(), v_org_id,
    'Public Website Redesign',
    'Full redesign of the VetCentral public website with new branding, online appointment booking, and mobile-first responsive design.',
    'completed', 'medium', v_admin_id, v_admin_id,
    (CURRENT_DATE - INTERVAL '90 days')::DATE,
    (CURRENT_DATE - INTERVAL '10 days')::DATE,
    NOW() - INTERVAL '12 days',
    100, '#06b6d4',
    TRUE,
    ARRAY['marketing','website','design'],
    '[
      {"id":"c1","text":"Wireframe new site architecture","completed":true},
      {"id":"c2","text":"Design system & brand refresh","completed":true},
      {"id":"c3","text":"Build homepage & service pages","completed":true},
      {"id":"c4","text":"Integrate online booking widget","completed":true},
      {"id":"c5","text":"SEO optimization","completed":true},
      {"id":"c6","text":"QA testing across devices","completed":true},
      {"id":"c7","text":"Launch & DNS cutover","completed":true}
    ]'::jsonb
  ) RETURNING id INTO v_p5;

  INSERT INTO project_members (project_id, org_id, user_id, role) VALUES
    (v_p5, v_org_id, v_admin_id, 'owner'),
    (v_p5, v_org_id, v_user1_id, 'member'),
    (v_p5, v_org_id, v_user2_id, 'member');

  -- ── Project 6: COMPLETED — OSHA Safety Audit ──────────────
  INSERT INTO projects (id, org_id, hospital_id, name, description, status, priority, owner_id, created_by,
    start_date, due_date, completed_at, progress_pct, color, tags, checklist)
  VALUES (
    uuid_generate_v4(), v_org_id, v_hosp1,
    'Annual OSHA Safety Audit 2025',
    'Comprehensive annual safety audit covering chemical storage, fire safety, emergency protocols, and PPE compliance across all departments.',
    'completed', 'urgent', v_admin_id, v_admin_id,
    (CURRENT_DATE - INTERVAL '120 days')::DATE,
    (CURRENT_DATE - INTERVAL '30 days')::DATE,
    NOW() - INTERVAL '32 days',
    100, '#ef4444',
    ARRAY['compliance','osha','safety'],
    '[
      {"id":"c1","text":"Schedule OSHA inspector visit","completed":true},
      {"id":"c2","text":"Prepare chemical inventory","completed":true},
      {"id":"c3","text":"Review fire safety equipment","completed":true},
      {"id":"c4","text":"Conduct staff safety drill","completed":true},
      {"id":"c5","text":"Remediate inspector findings","completed":true},
      {"id":"c6","text":"Receive compliance certificate","completed":true}
    ]'::jsonb
  ) RETURNING id INTO v_p6;

  INSERT INTO project_members (project_id, org_id, user_id, role) VALUES
    (v_p6, v_org_id, v_admin_id, 'owner'),
    (v_p6, v_org_id, v_user2_id, 'member');

  -- ── Project 7: ON HOLD — Inventory Management System ─────
  INSERT INTO projects (id, org_id, name, description, status, priority, owner_id, created_by,
    start_date, due_date, progress_pct, color, is_cross_hospital, tags, checklist)
  VALUES (
    uuid_generate_v4(), v_org_id,
    'Inventory Management System Integration',
    'Integrate third-party veterinary inventory system with VetOS for automated reorder alerts, expiry tracking, and cross-hospital stock visibility. On hold pending budget approval.',
    'on_hold', 'medium', v_user2_id, v_admin_id,
    (CURRENT_DATE - INTERVAL '45 days')::DATE,
    (CURRENT_DATE + INTERVAL '120 days')::DATE,
    20, '#64748b',
    TRUE,
    ARRAY['inventory','integration','procurement'],
    '[
      {"id":"c1","text":"Evaluate vendor options (3 shortlisted)","completed":true},
      {"id":"c2","text":"Present ROI analysis to leadership","completed":true},
      {"id":"c3","text":"Await Q3 budget approval","completed":false},
      {"id":"c4","text":"Contract negotiation","completed":false},
      {"id":"c5","text":"API integration development","completed":false},
      {"id":"c6","text":"Staff training & rollout","completed":false}
    ]'::jsonb
  ) RETURNING id INTO v_p7;

  INSERT INTO project_members (project_id, org_id, user_id, role) VALUES
    (v_p7, v_org_id, v_user2_id, 'owner'),
    (v_p7, v_org_id, v_admin_id, 'member'),
    (v_p7, v_org_id, v_user1_id, 'viewer');

END $$;
