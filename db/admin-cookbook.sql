-- ============================================================================
-- Car Show Judging App — admin cookbook
-- ----------------------------------------------------------------------------
-- All show admin happens via SQL in v1 (no web UI). This file is a recipe
-- book — copy a section, edit names / years / IDs, and run.
--
-- Connect to the `judging` database (NOT `corvetteisland`):
--   psql -h 127.0.0.1 -U postgres -d judging
--
-- The app respects two flags on each show:
--   is_active  — exactly one show may be active at a time (DB-enforced).
--   is_locked  — no writes allowed against a locked show. Reads still work.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Inspect the current state
-- ----------------------------------------------------------------------------
-- Lists every show with its flags and a session count, newest first.

SELECT s.id, s.name, s.year, s.event_date, s.is_active, s.is_locked,
       (SELECT COUNT(*) FROM judging_sessions WHERE show_id = s.id) AS sessions
  FROM shows s
 ORDER BY s.year DESC;


-- ----------------------------------------------------------------------------
-- 2. Lock the current show (after the event ends)
-- ----------------------------------------------------------------------------
-- Freezes all writes against this show. New sessions, edits, photo uploads,
-- and submits will all return 409 from the API. Readers can still pull the
-- archived data forever.

UPDATE shows
   SET is_locked  = true,
       updated_at = NOW()
 WHERE is_active = true;


-- ----------------------------------------------------------------------------
-- 3. Activate a different show
-- ----------------------------------------------------------------------------
-- Only one show may have is_active = true (partial unique index). Run BOTH
-- statements in order: deactivate first, THEN activate the next — otherwise
-- the unique index blocks the second update.

BEGIN;
UPDATE shows SET is_active = false, updated_at = NOW() WHERE is_active = true;
UPDATE shows SET is_active = true,  updated_at = NOW() WHERE id = 999;  -- ← new show id
COMMIT;


-- ----------------------------------------------------------------------------
-- 4. Create next year's show + clone the current rubric
-- ----------------------------------------------------------------------------
-- Drops a new shows row, then copies the active show's sections / subsections
-- / items so the next year's rubric starts as a working copy. Edit it
-- afterwards (UPDATE rubric_items SET max_points = …, etc.) without
-- affecting any archived data.
--
-- Run OUTSIDE the show (not on event day). Edit the name and year first.

DO $$
DECLARE
  source_show_id INT := (SELECT id FROM shows WHERE is_active = true LIMIT 1);
  new_show_id    INT;
  sec            RECORD;
  new_sec_id     INT;
  sub            RECORD;
  new_sub_id     INT;
BEGIN
  -- ↓ EDIT THESE FOR THE NEW SHOW ↓
  INSERT INTO shows (name, year, is_active, is_locked)
  VALUES ('Corvettes on the Island 2027', 2027, false, false)
  RETURNING id INTO new_show_id;

  FOR sec IN
    SELECT * FROM rubric_sections WHERE show_id = source_show_id ORDER BY display_order
  LOOP
    INSERT INTO rubric_sections (show_id, name, description, display_order, max_points, scoring_mode)
    VALUES (new_show_id, sec.name, sec.description, sec.display_order, sec.max_points, sec.scoring_mode)
    RETURNING id INTO new_sec_id;

    FOR sub IN
      SELECT * FROM rubric_subsections WHERE section_id = sec.id ORDER BY display_order
    LOOP
      INSERT INTO rubric_subsections (section_id, name, description, display_order)
      VALUES (new_sec_id, sub.name, sub.description, sub.display_order)
      RETURNING id INTO new_sub_id;

      INSERT INTO rubric_items (subsection_id, name, display_order, max_points, notes)
      SELECT new_sub_id, name, display_order, max_points, notes
        FROM rubric_items
       WHERE subsection_id = sub.id;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Created show id=% from source show id=%', new_show_id, source_show_id;
END $$;


-- ----------------------------------------------------------------------------
-- 5. Reset a show's judging data (TESTING ONLY — destructive)
-- ----------------------------------------------------------------------------
-- Deletes ALL sessions, deductions, and photos for one show. Does NOT touch
-- the rubric. Use to wipe a test run between dress rehearsals. The CASCADEs
-- on photos.deduction_id and deductions.judging_session_id mean deleting
-- sessions takes their deductions and photo rows with them.
--
-- This does NOT remove the actual photo files from uploads/ — clean those
-- up with `rm uploads/*.png uploads/*.jpg` separately, or leave them
-- (they're orphaned but harmless).

DELETE FROM judging_sessions WHERE show_id = 999;  -- ← target show id


-- ----------------------------------------------------------------------------
-- 6. Yearly turnover cheat sheet
-- ----------------------------------------------------------------------------
-- Right after this year's show ends:
--   1. Lock the current show           → section 2
--
-- Before next year's show:
--   2. Clone rubric for the new show   → section 4
--   3. Edit the new rubric in place    → UPDATE rubric_items SET max_points = …
--   4. Activate the new show           → section 3
