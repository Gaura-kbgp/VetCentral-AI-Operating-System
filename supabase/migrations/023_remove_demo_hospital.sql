-- Migration 023: Remove demo 'Main Veterinary Hospital' inserted by setup_all.sql
DO $$
DECLARE
  v_hospital_id UUID;
BEGIN
  SELECT id INTO v_hospital_id
  FROM hospitals
  WHERE slug = 'main';

  IF v_hospital_id IS NULL THEN
    RAISE NOTICE 'Main Veterinary Hospital not found — nothing to do';
    RETURN;
  END IF;

  DELETE FROM user_hospital_roles     WHERE hospital_id = v_hospital_id;
  DELETE FROM departments             WHERE hospital_id = v_hospital_id;
  DELETE FROM channels                WHERE hospital_id = v_hospital_id;
  DELETE FROM calendar_events         WHERE hospital_id = v_hospital_id;
  DELETE FROM projects                WHERE hospital_id = v_hospital_id;
  DELETE FROM hospital_announcements  WHERE hospital_id = v_hospital_id;

  DELETE FROM hospitals WHERE id = v_hospital_id;

  RAISE NOTICE 'Removed Main Veterinary Hospital (id: %)', v_hospital_id;
END $$;
