-- ============================================================================
-- Car Show Judging App — `judging` database schema
-- ----------------------------------------------------------------------------
-- This file creates the schema for the `judging` database, which holds all
-- judging-app-owned data: judges, rubric, sessions, deductions, and photos.
--
-- Customer / registrant data is NOT here — it lives in the partner's
-- `corvetteisland` database, which is read-only from this app's perspective.
-- Postgres does not support cross-database foreign keys, so
-- `judging_sessions.participant` references `corvetteisland.customers.participant`
-- as a soft (app-validated) reference.
--
-- Authoritative design source: specs/database-schema.md
--
-- This script is intended to run once against an empty `judging` database.
-- It is NOT idempotent — re-running will fail. To reset, drop the database
-- and re-run. The `scripts/setup-db.js` orchestrator will handle drop + recreate.
--
-- `updated_at` columns are NOT auto-updated by triggers. The application
-- layer is expected to set `updated_at = NOW()` on every UPDATE.
-- ============================================================================

BEGIN;


-- ----------------------------------------------------------------------------
-- shows
-- One row per annual car show. Exactly one row may have is_active = TRUE at
-- a time (DB-enforced). is_locked freezes rubric edits and session edits
-- once a show is over.
-- ----------------------------------------------------------------------------
CREATE TABLE shows (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  year         INTEGER NOT NULL,
  event_date   DATE,
  location     TEXT,
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DB-enforced "only one active show": partial unique index. A regular UNIQUE
-- constraint can't include a WHERE clause, so this lives outside CREATE TABLE.
CREATE UNIQUE INDEX shows_one_active
  ON shows (is_active)
  WHERE is_active = TRUE;


-- ----------------------------------------------------------------------------
-- judges
-- One row per unique judge across all shows. A returning judge next year
-- reuses their existing row (matched by firstname + lastname).
-- ----------------------------------------------------------------------------
CREATE TABLE judges (
  id             SERIAL PRIMARY KEY,
  firstname      TEXT NOT NULL,
  lastname       TEXT NOT NULL,
  email          TEXT,
  phone          TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at  TIMESTAMPTZ,
  CONSTRAINT judges_name_unique UNIQUE (firstname, lastname)
);


-- ----------------------------------------------------------------------------
-- rubric_sections
-- Top-level scoring categories per show (e.g., Interior, Exterior, Engine
-- Bay, Bonus). Bonus uses scoring_mode = 'award' to invert polarity: items
-- start at zero and the judge awards points for upgrades. The other
-- sections use the default 'deduct' mode (start at full points, deduct for
-- flaws).
-- ----------------------------------------------------------------------------
CREATE TABLE rubric_sections (
  id             SERIAL PRIMARY KEY,
  show_id        INTEGER NOT NULL REFERENCES shows(id),
  name           TEXT NOT NULL,
  description    TEXT,
  display_order  INTEGER NOT NULL,
  max_points     NUMERIC(5,2) NOT NULL,
  scoring_mode   TEXT NOT NULL DEFAULT 'deduct',
  CONSTRAINT rubric_section_show_unique UNIQUE (show_id, name),
  CONSTRAINT rubric_section_mode_valid  CHECK (scoring_mode IN ('deduct', 'award'))
);


-- ----------------------------------------------------------------------------
-- rubric_subsections
-- Mid-level groupings inside a section (e.g., Seats, Body Panel Fit,
-- Compartment Paint Finish). Every rubric item lives under a subsection.
-- ----------------------------------------------------------------------------
CREATE TABLE rubric_subsections (
  id             SERIAL PRIMARY KEY,
  section_id     INTEGER NOT NULL REFERENCES rubric_sections(id),
  name           TEXT NOT NULL,
  description    TEXT,
  display_order  INTEGER NOT NULL,
  CONSTRAINT rubric_subsection_section_unique UNIQUE (section_id, name)
);


-- ----------------------------------------------------------------------------
-- rubric_items
-- Leaf-level scoring criteria the judge actually evaluates (e.g., "Overall
-- Cleanliness", "Lack of Scratches"). max_points is the per-item ceiling.
-- ----------------------------------------------------------------------------
CREATE TABLE rubric_items (
  id             SERIAL PRIMARY KEY,
  subsection_id  INTEGER NOT NULL REFERENCES rubric_subsections(id),
  name           TEXT NOT NULL,
  display_order  INTEGER NOT NULL,
  max_points     NUMERIC(5,2) NOT NULL,
  notes          TEXT,
  CONSTRAINT rubric_item_subsection_unique UNIQUE (subsection_id, name)
);


-- ----------------------------------------------------------------------------
-- judging_sessions
-- One row per (judge × car) being scored at a given show. `participant` is
-- a soft cross-DB reference to `corvetteisland.customers.participant`
-- (Postgres can't enforce FKs across databases — the app validates).
-- Per-section subtotals (interior_score, exterior_score, etc.) are
-- denormalized at submit time for fast leaderboard reads.
-- ----------------------------------------------------------------------------
CREATE TABLE judging_sessions (
  id                 SERIAL PRIMARY KEY,
  show_id            INTEGER NOT NULL REFERENCES shows(id),
  judge_id           INTEGER NOT NULL REFERENCES judges(id),
  participant        INTEGER NOT NULL,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at       TIMESTAMPTZ,
  is_complete        BOOLEAN NOT NULL DEFAULT FALSE,
  total_deductions   NUMERIC(5,2),
  total_score        NUMERIC(5,2),
  interior_score     NUMERIC(5,2),
  exterior_score     NUMERIC(5,2),
  engine_bay_score   NUMERIC(5,2),
  bonus_score        NUMERIC(5,2),
  judge_notes        TEXT,
  award              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT session_show_part_unique UNIQUE (show_id, participant)
);

-- Lookup: list a judge's sessions across shows.
CREATE INDEX sessions_judge ON judging_sessions (judge_id);


-- ----------------------------------------------------------------------------
-- deductions
-- One row per (session × rubric item). Items the judge marked perfect get a
-- row too (deduction_amount = 0) so we know they were reviewed. The frozen_*
-- columns capture a snapshot of rubric values at scoring time so archived
-- scores stay intact even if the rubric is reorganized later.
--
-- The CHECK constraint enforces three rules at the DB level:
--   1. deduction_amount >= 0 (no negative deductions)
--   2. deduction_amount <= frozen_max_points (can't deduct more than the item is worth)
--   3. (deduction_amount * 4)::INTEGER = deduction_amount * 4  (¼-point increments only)
-- ----------------------------------------------------------------------------
CREATE TABLE deductions (
  id                       SERIAL PRIMARY KEY,
  judging_session_id       INTEGER NOT NULL REFERENCES judging_sessions(id) ON DELETE CASCADE,
  rubric_item_id           INTEGER NOT NULL REFERENCES rubric_items(id),
  deduction_amount         NUMERIC(5,2) NOT NULL DEFAULT 0,
  frozen_item_name         TEXT NOT NULL,
  frozen_max_points        NUMERIC(5,2) NOT NULL,
  frozen_subsection_name   TEXT NOT NULL,
  frozen_section_name      TEXT NOT NULL,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT deduction_unique UNIQUE (judging_session_id, rubric_item_id),
  CONSTRAINT deduction_amount_valid CHECK (
    deduction_amount >= 0
    AND deduction_amount <= frozen_max_points
    AND (deduction_amount * 4)::INTEGER = deduction_amount * 4
  )
);

-- Lookup: load all deductions for a session in one query.
CREATE INDEX deductions_session ON deductions (judging_session_id);


-- ----------------------------------------------------------------------------
-- photos
-- One row per photo attached to a deduction. A single deduction may have
-- multiple photos. Phase 1 stores the file under uploads/ on local
-- filesystem; long-term storage (S3 / Supabase Storage) is TBD.
-- ON DELETE CASCADE: deleting a deduction removes its photo rows (the
-- physical files would need to be cleaned by the app).
-- ----------------------------------------------------------------------------
CREATE TABLE photos (
  id                 SERIAL PRIMARY KEY,
  deduction_id       INTEGER NOT NULL REFERENCES deductions(id) ON DELETE CASCADE,
  filepath           TEXT NOT NULL,
  original_filename  TEXT,
  file_size_bytes    INTEGER,
  mime_type          TEXT,
  caption            TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookup: load all photos for a deduction.
CREATE INDEX photos_deduction ON photos (deduction_id);


COMMIT;
