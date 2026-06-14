-- Migration 029: Attendance Records
-- Creates attendance_records table for daily employee attendance tracking.

CREATE TABLE IF NOT EXISTS attendance_records (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid        NOT NULL,
  employee_id    uuid        NOT NULL,
  hospital_id    uuid,
  date           date        NOT NULL DEFAULT CURRENT_DATE,
  status         text        NOT NULL DEFAULT 'present'
                               CHECK (status IN ('present','late','absent','on_leave','remote')),
  check_in_time  timestamptz,
  check_out_time timestamptz,
  notes          text,
  recorded_by    uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_org_date      ON attendance_records (org_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_records (employee_id, date);

-- ── Seed today's attendance for all active employees ──────────────────────────
DO $$
DECLARE
  v_org_id   uuid;
  v_emp      RECORD;
  v_statuses text[]  := ARRAY['present','present','present','late','present','remote','absent','on_leave','present','present'];
  v_idx      integer := 0;
  v_status   text;
  v_checkin  timestamptz;
  v_mins     integer;
BEGIN
  SELECT id INTO v_org_id FROM organizations LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE NOTICE 'No organization found — skipping attendance seed';
    RETURN;
  END IF;

  FOR v_emp IN
    SELECT DISTINCT ON (uhr.user_id)
      uhr.user_id    AS employee_id,
      uhr.hospital_id,
      p.org_id
    FROM user_hospital_roles uhr
    JOIN profiles p ON p.id = uhr.user_id
    WHERE p.org_id = v_org_id
      AND p.is_active IS NOT FALSE
    ORDER BY uhr.user_id, uhr.granted_at NULLS LAST
  LOOP
    v_status := v_statuses[(v_idx % array_length(v_statuses, 1)) + 1];

    v_mins := CASE
      WHEN v_status = 'present' THEN  8 * 60 + (v_idx % 45)
      WHEN v_status = 'late'    THEN  9 * 60 + 10 + (v_idx % 45)
      WHEN v_status = 'remote'  THEN  8 * 60 + 30 + (v_idx % 20)
      ELSE NULL
    END;

    v_checkin := CASE
      WHEN v_mins IS NOT NULL THEN
        (CURRENT_DATE::timestamp + make_interval(mins => v_mins))::timestamptz
      ELSE NULL
    END;

    INSERT INTO attendance_records (org_id, employee_id, hospital_id, date, status, check_in_time)
    VALUES (v_org_id, v_emp.employee_id, v_emp.hospital_id, CURRENT_DATE, v_status, v_checkin)
    ON CONFLICT (employee_id, date) DO NOTHING;

    v_idx := v_idx + 1;
  END LOOP;

  RAISE NOTICE 'Migration 029 complete — attendance seeded for % employee(s)', v_idx;
END $$;
