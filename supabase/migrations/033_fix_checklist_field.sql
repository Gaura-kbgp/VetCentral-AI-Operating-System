-- ============================================================
-- Migration 033: Normalize checklist field 'completed' → 'checked'
-- The app code reads item.checked but seed data used item.completed
-- ============================================================

UPDATE projects
SET
  checklist = (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',         item->>'id',
        'text',       item->>'text',
        'checked',    COALESCE(
                        (item->>'checked')::boolean,
                        (item->>'completed')::boolean,
                        false
                      ),
        'checked_at', item->>'checked_at'
      )
      ORDER BY ordinality
    )
    FROM jsonb_array_elements(checklist) WITH ORDINALITY AS t(item, ordinality)
  ),
  -- Recalculate progress_pct from the corrected checklist
  progress_pct = (
    SELECT CASE
      WHEN count(*) = 0 THEN progress_pct
      ELSE ROUND(
        100.0 * SUM(
          CASE WHEN COALESCE(
            (item->>'checked')::boolean,
            (item->>'completed')::boolean,
            false
          ) THEN 1 ELSE 0 END
        ) / count(*)
      )
    END
    FROM jsonb_array_elements(checklist) AS item
  )
WHERE
  checklist IS NOT NULL
  AND jsonb_array_length(checklist) > 0;
