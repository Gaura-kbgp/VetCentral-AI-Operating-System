-- ============================================================
-- Migration 032: Add demo projects (skips by name if exists)
-- ============================================================

DO $$
DECLARE
  v_org_id   UUID;
  v_admin_id UUID;
  v_user1_id UUID;
  v_user2_id UUID;
  v_hosp1    UUID;
  v_hosp2    UUID;
  v_p UUID;
BEGIN
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

  -- ── Project 1: ACTIVE — EMR System Upgrade ────────────────
  IF NOT EXISTS (SELECT 1 FROM projects WHERE org_id = v_org_id AND name = 'EMR System Upgrade') THEN
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
        {"id":"c1","text":"Audit current EMR records","checked":true,"checked_at":null},
        {"id":"c2","text":"Map data schema to VetEMR Cloud","checked":true,"checked_at":null},
        {"id":"c3","text":"Run test migration on staging","checked":true,"checked_at":null},
        {"id":"c4","text":"Train admin staff","checked":false,"checked_at":null},
        {"id":"c5","text":"Train clinical staff — all hospitals","checked":false,"checked_at":null},
        {"id":"c6","text":"Go-live: Hospital 1","checked":false,"checked_at":null},
        {"id":"c7","text":"Go-live: Hospitals 2 & 3","checked":false,"checked_at":null},
        {"id":"c8","text":"Post-migration audit & sign-off","checked":false,"checked_at":null}
      ]'::jsonb
    ) RETURNING id INTO v_p;

    INSERT INTO project_members (project_id, user_id, role) VALUES
      (v_p, v_admin_id, 'owner'),
      (v_p, v_user1_id, 'member'),
      (v_p, v_user2_id, 'member');

    INSERT INTO project_tasks (project_id, org_id, title, status, priority, assigned_to, due_date, section, position, created_by) VALUES
      (v_p, v_org_id, 'Negotiate VetEMR Cloud licensing terms',    'done',        'high',   v_admin_id, (CURRENT_DATE - INTERVAL '20 days')::DATE, 'Planning',      1, v_admin_id),
      (v_p, v_org_id, 'Export legacy patient records to CSV',      'done',        'high',   v_user1_id, (CURRENT_DATE - INTERVAL '10 days')::DATE, 'Migration',     2, v_admin_id),
      (v_p, v_org_id, 'Validate migrated records for accuracy',    'in_progress', 'urgent', v_user1_id, (CURRENT_DATE + INTERVAL '5 days')::DATE,  'Migration',     3, v_admin_id),
      (v_p, v_org_id, 'Configure role permissions in new system',  'in_progress', 'medium', v_admin_id, (CURRENT_DATE + INTERVAL '7 days')::DATE,  'Configuration', 4, v_admin_id),
      (v_p, v_org_id, 'Schedule staff training sessions',          'todo',        'medium', v_user2_id, (CURRENT_DATE + INTERVAL '14 days')::DATE, 'Training',      5, v_admin_id),
      (v_p, v_org_id, 'Conduct go-live dry run',                   'todo',        'high',   v_admin_id, (CURRENT_DATE + INTERVAL '30 days')::DATE, 'Go-Live',       6, v_admin_id);
  END IF;

  -- ── Project 2: ACTIVE — New Surgical Wing ─────────────────
  IF NOT EXISTS (SELECT 1 FROM projects WHERE org_id = v_org_id AND name LIKE 'New Surgical Wing%') THEN
    INSERT INTO projects (id, org_id, hospital_id, name, description, status, priority, owner_id, created_by,
      start_date, due_date, progress_pct, color, tags, checklist)
    VALUES (
      uuid_generate_v4(), v_org_id, v_hosp2,
      'New Surgical Wing Construction',
      'Construction and fit-out of a 4-room surgical suite wing, including specialized surgical equipment, monitoring systems, and sterile prep areas.',
      'active', 'high', v_user1_id, v_admin_id,
      (CURRENT_DATE - INTERVAL '60 days')::DATE,
      (CURRENT_DATE + INTERVAL '90 days')::DATE,
      38, '#8b5cf6',
      ARRAY['construction','facilities','surgery'],
      '[
        {"id":"c1","text":"Submit building permit application","checked":true,"checked_at":null},
        {"id":"c2","text":"Receive permit approval","checked":true,"checked_at":null},
        {"id":"c3","text":"Demolition & framing","checked":false,"checked_at":null},
        {"id":"c4","text":"Electrical & HVAC rough-in","checked":false,"checked_at":null},
        {"id":"c5","text":"Surgical equipment procurement","checked":false,"checked_at":null},
        {"id":"c6","text":"Install monitoring systems","checked":false,"checked_at":null},
        {"id":"c7","text":"OSHA compliance inspection","checked":false,"checked_at":null},
        {"id":"c8","text":"Soft opening & staff orientation","checked":false,"checked_at":null}
      ]'::jsonb
    ) RETURNING id INTO v_p;

    INSERT INTO project_members (project_id, user_id, role) VALUES
      (v_p, v_user1_id, 'owner'),
      (v_p, v_admin_id, 'member'),
      (v_p, v_user2_id, 'viewer');

    INSERT INTO project_tasks (project_id, org_id, title, status, priority, assigned_to, due_date, section, position, created_by) VALUES
      (v_p, v_org_id, 'Finalize architectural drawings',         'done',        'high',   v_user1_id, (CURRENT_DATE - INTERVAL '40 days')::DATE, 'Planning',    1, v_admin_id),
      (v_p, v_org_id, 'Select general contractor',              'done',        'high',   v_admin_id, (CURRENT_DATE - INTERVAL '25 days')::DATE, 'Planning',    2, v_admin_id),
      (v_p, v_org_id, 'Order surgical tables & lighting',       'in_progress', 'urgent', v_user1_id, (CURRENT_DATE + INTERVAL '10 days')::DATE, 'Procurement', 3, v_admin_id),
      (v_p, v_org_id, 'Install ventilation & gas lines',        'todo',        'high',   v_user2_id, (CURRENT_DATE + INTERVAL '35 days')::DATE, 'Construction',4, v_admin_id),
      (v_p, v_org_id, 'Sterile supply storage room fit-out',    'todo',        'medium', v_user2_id, (CURRENT_DATE + INTERVAL '55 days')::DATE, 'Construction',5, v_admin_id),
      (v_p, v_org_id, 'Final inspection & sign-off',            'todo',        'urgent', v_admin_id, (CURRENT_DATE + INTERVAL '85 days')::DATE, 'Inspection',  6, v_admin_id);
  END IF;

  -- ── Project 3: ACTIVE — Staff Wellness Q3 ─────────────────
  IF NOT EXISTS (SELECT 1 FROM projects WHERE org_id = v_org_id AND name LIKE 'Staff Wellness Program%') THEN
    INSERT INTO projects (id, org_id, name, description, status, priority, owner_id, created_by,
      start_date, due_date, progress_pct, color, is_cross_hospital, tags, checklist)
    VALUES (
      uuid_generate_v4(), v_org_id,
      'Staff Wellness Program — Q3 2026',
      'Cross-hospital initiative to improve staff retention and mental health. Includes quarterly workshops, peer support groups, and an anonymous feedback system.',
      'active', 'medium', v_user2_id, v_admin_id,
      (CURRENT_DATE - INTERVAL '14 days')::DATE,
      (CURRENT_DATE + INTERVAL '60 days')::DATE,
      25, '#f59e0b', TRUE,
      ARRAY['hr','wellness','staff'],
      '[
        {"id":"c1","text":"Survey all staff on wellness priorities","checked":true,"checked_at":null},
        {"id":"c2","text":"Analyse survey results","checked":false,"checked_at":null},
        {"id":"c3","text":"Partner with wellness vendor","checked":false,"checked_at":null},
        {"id":"c4","text":"Launch peer support Slack channel","checked":false,"checked_at":null},
        {"id":"c5","text":"Host Q3 wellness kickoff workshop","checked":false,"checked_at":null},
        {"id":"c6","text":"Deploy anonymous feedback form","checked":false,"checked_at":null}
      ]'::jsonb
    ) RETURNING id INTO v_p;

    INSERT INTO project_members (project_id, user_id, role) VALUES
      (v_p, v_user2_id, 'owner'),
      (v_p, v_admin_id, 'member'),
      (v_p, v_user1_id, 'member');
  END IF;

  -- ── Project 4: ACTIVE — Vaccine Protocol ──────────────────
  IF NOT EXISTS (SELECT 1 FROM projects WHERE org_id = v_org_id AND name LIKE 'Vaccine Protocol%') THEN
    INSERT INTO projects (id, org_id, hospital_id, name, description, status, priority, owner_id, created_by,
      start_date, due_date, progress_pct, color, tags, checklist)
    VALUES (
      uuid_generate_v4(), v_org_id, v_hosp1,
      'Vaccine Protocol Standardization 2026',
      'Align vaccination schedules and documentation across all three hospitals to meet new state veterinary board requirements effective August 2026.',
      'active', 'high', v_user1_id, v_user1_id,
      (CURRENT_DATE - INTERVAL '7 days')::DATE,
      (CURRENT_DATE + INTERVAL '30 days')::DATE,
      20, '#10b981',
      ARRAY['clinical','compliance','vaccines'],
      '[
        {"id":"c1","text":"Review current protocol documents","checked":true,"checked_at":null},
        {"id":"c2","text":"Consult state vet board guidelines","checked":false,"checked_at":null},
        {"id":"c3","text":"Draft updated protocol","checked":false,"checked_at":null},
        {"id":"c4","text":"Medical director sign-off","checked":false,"checked_at":null},
        {"id":"c5","text":"Distribute to all clinicians","checked":false,"checked_at":null}
      ]'::jsonb
    ) RETURNING id INTO v_p;

    INSERT INTO project_members (project_id, user_id, role) VALUES
      (v_p, v_user1_id, 'owner'),
      (v_p, v_admin_id, 'member');
  END IF;

  -- ── Project 5: COMPLETED — Website Redesign ───────────────
  IF NOT EXISTS (SELECT 1 FROM projects WHERE org_id = v_org_id AND name = 'Public Website Redesign') THEN
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
      100, '#06b6d4', TRUE,
      ARRAY['marketing','website','design'],
      '[
        {"id":"c1","text":"Wireframe new site architecture","checked":true,"checked_at":null},
        {"id":"c2","text":"Design system & brand refresh","checked":true,"checked_at":null},
        {"id":"c3","text":"Build homepage & service pages","checked":true,"checked_at":null},
        {"id":"c4","text":"Integrate online booking widget","checked":true,"checked_at":null},
        {"id":"c5","text":"SEO optimization","checked":true,"checked_at":null},
        {"id":"c6","text":"QA testing across devices","checked":true,"checked_at":null},
        {"id":"c7","text":"Launch & DNS cutover","checked":true,"checked_at":null}
      ]'::jsonb
    ) RETURNING id INTO v_p;

    INSERT INTO project_members (project_id, user_id, role) VALUES
      (v_p, v_admin_id, 'owner'),
      (v_p, v_user1_id, 'member'),
      (v_p, v_user2_id, 'member');
  END IF;

  -- ── Project 6: COMPLETED — OSHA Safety Audit ──────────────
  IF NOT EXISTS (SELECT 1 FROM projects WHERE org_id = v_org_id AND name LIKE 'Annual OSHA%') THEN
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
        {"id":"c1","text":"Schedule OSHA inspector visit","checked":true,"checked_at":null},
        {"id":"c2","text":"Prepare chemical inventory","checked":true,"checked_at":null},
        {"id":"c3","text":"Review fire safety equipment","checked":true,"checked_at":null},
        {"id":"c4","text":"Conduct staff safety drill","checked":true,"checked_at":null},
        {"id":"c5","text":"Remediate inspector findings","checked":true,"checked_at":null},
        {"id":"c6","text":"Receive compliance certificate","checked":true,"checked_at":null}
      ]'::jsonb
    ) RETURNING id INTO v_p;

    INSERT INTO project_members (project_id, user_id, role) VALUES
      (v_p, v_admin_id, 'owner'),
      (v_p, v_user2_id, 'member');
  END IF;

  -- ── Project 7: ON HOLD — Inventory Management ─────────────
  IF NOT EXISTS (SELECT 1 FROM projects WHERE org_id = v_org_id AND name LIKE 'Inventory Management%') THEN
    INSERT INTO projects (id, org_id, name, description, status, priority, owner_id, created_by,
      start_date, due_date, progress_pct, color, is_cross_hospital, tags, checklist)
    VALUES (
      uuid_generate_v4(), v_org_id,
      'Inventory Management System Integration',
      'Integrate third-party veterinary inventory system with VetOS for automated reorder alerts, expiry tracking, and cross-hospital stock visibility. On hold pending budget approval.',
      'on_hold', 'medium', v_user2_id, v_admin_id,
      (CURRENT_DATE - INTERVAL '45 days')::DATE,
      (CURRENT_DATE + INTERVAL '120 days')::DATE,
      33, '#64748b', TRUE,
      ARRAY['inventory','integration','procurement'],
      '[
        {"id":"c1","text":"Evaluate vendor options (3 shortlisted)","checked":true,"checked_at":null},
        {"id":"c2","text":"Present ROI analysis to leadership","checked":true,"checked_at":null},
        {"id":"c3","text":"Await Q3 budget approval","checked":false,"checked_at":null},
        {"id":"c4","text":"Contract negotiation","checked":false,"checked_at":null},
        {"id":"c5","text":"API integration development","checked":false,"checked_at":null},
        {"id":"c6","text":"Staff training & rollout","checked":false,"checked_at":null}
      ]'::jsonb
    ) RETURNING id INTO v_p;

    INSERT INTO project_members (project_id, user_id, role) VALUES
      (v_p, v_user2_id, 'owner'),
      (v_p, v_admin_id, 'member'),
      (v_p, v_user1_id, 'viewer');
  END IF;

END $$;
