-- Migration 028: Seed roles for all demo accounts
-- Assigns AppRoles based on the email pattern of demo.* accounts.
-- Safe to re-run (ON CONFLICT DO UPDATE).

DO $$
DECLARE
  v_org    UUID;
  v_user   RECORD;
  v_hosp   RECORD;
  v_role   app_role;
  assigned INT := 0;
BEGIN
  SELECT id INTO v_org FROM organizations LIMIT 1;
  IF v_org IS NULL THEN
    RAISE NOTICE 'No organization found — skipping demo role seed';
    RETURN;
  END IF;

  -- Loop over every profile whose email matches the demo pattern
  FOR v_user IN
    SELECT id, email FROM profiles WHERE email LIKE '%@vetcentral.demo' OR email LIKE '%@vetcentral.app'
  LOOP
    -- Derive the role from the email segment
    v_role := CASE
      WHEN v_user.email ILIKE '%super.admin%'      THEN 'super_admin'::app_role
      WHEN v_user.email ILIKE '%org.admin%'         THEN 'org_admin'::app_role
      WHEN v_user.email ILIKE '%hospital.admin%'    THEN 'hospital_admin'::app_role
      WHEN v_user.email ILIKE '%practice.manager%'  THEN 'practice_manager'::app_role
      WHEN v_user.email ILIKE '%.hr.%'              THEN 'hr'::app_role
      WHEN v_user.email ILIKE '%doctor%'
        OR v_user.email ILIKE '%vet.%'
        OR v_user.email ILIKE '%dvm%'               THEN 'doctor'::app_role
      WHEN v_user.email ILIKE '%csr%'               THEN 'csr'::app_role
      WHEN v_user.email ILIKE '%.va.%'
        OR v_user.email ILIKE '%vet.assistant%'     THEN 'va'::app_role
      WHEN v_user.email ILIKE '%marketing%'         THEN 'marketing'::app_role
      WHEN v_user.email ILIKE '%it.admin%'
        OR v_user.email ILIKE '%it_admin%'          THEN 'it_admin'::app_role
      ELSE 'viewer'::app_role
    END;

    -- Org-level roles go into org_user_roles (covers all hospitals)
    IF v_role IN ('super_admin', 'org_admin') THEN
      INSERT INTO org_user_roles (user_id, org_id, role, is_active)
      VALUES (v_user.id, v_org, v_role, true)
      ON CONFLICT (user_id, org_id) DO UPDATE
        SET role = v_role, is_active = true, expires_at = NULL;
      assigned := assigned + 1;

    ELSE
      -- Hospital-scoped roles: assign to every active hospital in the org
      FOR v_hosp IN
        SELECT id FROM hospitals WHERE org_id = v_org AND is_active = true
      LOOP
        INSERT INTO user_hospital_roles (user_id, hospital_id, role, is_active)
        VALUES (v_user.id, v_hosp.id, v_role, true)
        ON CONFLICT (user_id, hospital_id) DO UPDATE
          SET role = v_role, is_active = true, expires_at = NULL;
      END LOOP;
      assigned := assigned + 1;
    END IF;

    RAISE NOTICE '  → % (%) assigned role: %', v_user.email, v_user.id, v_role;
  END LOOP;

  RAISE NOTICE 'Migration 028 complete — % demo account(s) processed', assigned;
END $$;
