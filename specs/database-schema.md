# Database Schema — `judging` database

> Draft for review. **No tables created yet.** Marc approves this doc, then we
> turn it into `db/schema.sql`.
>
> This file describes only the **`judging`** database (the new one we own).
> The existing `corvetteisland` database is read-only and we never modify it.

## 1. Design Philosophy

Five rules drive every table below:

1. **Two-database model.** All judging-app data lives here. Customer data stays in `corvetteisland`. We reference customers by their `participant` number — no foreign key, because Postgres can't enforce FKs across databases. The app validates the participant before saving.
2. **Rubric is data, not code.** Sections, subsections, items, and max points all live in tables. Editing the rubric for next year is an SQL update, not a code change.
3. **Per-show rubric.** Each show owns its own rubric rows. Editing show 2027's rubric leaves show 2026's rubric untouched.
4. **Frozen snapshots on every deduction.** When a judge submits a score, we copy the rubric item's name and max points into the `deductions` row. If someone edits the rubric later, archived scores stay readable and accurate.
5. **¼-point precision.** All point columns are `numeric(5,2)` so 0.25 / 0.50 / 0.75 work cleanly. Application code enforces the ¼-increment rule; the DB just stores the number.

## 2. Tables at a Glance

| Table | Purpose | Rows / show (rough) |
|---|---|---|
| `shows` | One row per annual show; one is "active" at a time | 1 (per year) |
| `judges` | One row per unique judge across all shows | ~5–20 ever |
| `rubric_sections` | Top level: Interior / Exterior / Engine Bay / Bonus | 4 per show |
| `rubric_subsections` | Mid level groupings inside a section | ~10–20 per show |
| `rubric_items` | Leaf scoring items (~70 per show) | ~70 per show |
| `judging_sessions` | One judge scoring one car | hundreds |
| `deductions` | One row per (session × rubric item) the judge scored | tens of thousands |
| `photos` | Photos attached to a deduction | tens of thousands |

## 3. Relationships (text diagram)

```
shows ──────────────────────┐
  │                         │
  ├─ rubric_sections        │
  │    └─ rubric_subsections│
  │         └─ rubric_items │
  │              ▲          │
  │              │          │
  └─ judging_sessions ──────┘
        │   │
        │   └─ judge_id ─→ judges
        │   └─ participant (int) ──→ corvetteisland.customers.participant  (cross-DB; no FK)
        │
        └─ deductions
             │   └─ rubric_item_id ─→ rubric_items
             │
             └─ photos
```

## 4. Tables in Detail

### 4.1 `shows`

| Column | Type | Notes |
|---|---|---|
| `id` | `serial PK` | |
| `name` | `text not null` | e.g. "Corvettes on the Island 2026" |
| `year` | `integer not null` | |
| `event_date` | `date` | The actual day of the show (single-day event). |
| `location` | `text` | Optional. Where the show is held, e.g. "Pleasure Island Marina". |
| `description` | `text` | Optional. Organizer notes about this specific show, e.g. "~50 entries this year." |
| `is_active` | `boolean not null default false` | Only one row may be `true` at a time |
| `is_locked` | `boolean not null default false` | Once locked, no rubric or session edits |
| `created_at` | `timestamptz default now()` | |
| `updated_at` | `timestamptz default now()` | |

**Constraint:** partial unique index `(is_active) WHERE is_active = true` — DB-enforced "only one active show."

### 4.2 `judges`

| Column | Type | Notes |
|---|---|---|
| `id` | `serial PK` | |
| `firstname` | `text not null` | Already title-cased and trimmed at login |
| `lastname` | `text not null` | Already title-cased and trimmed at login |
| `email` | `text` | Optional. Judge's contact email — set by the organizer (admin SQL); not used for login. |
| `phone` | `text` | Optional. Judge's contact phone — same idea, organizer-managed. |
| `is_active` | `boolean not null default true` | Lets the organizer disable a judge without deleting their row (e.g., judge can't make it). Inactive judges can't log in. |
| `notes` | `text` | Optional. Organizer-only free-text notes, e.g. *"Experienced — prefers Interior."* Not shown to the judge. |
| `created_at` | `timestamptz default now()` | |
| `last_login_at` | `timestamptz` | |

**Constraint:** `unique (firstname, lastname)` — one row per unique name pair. A returning judge next year reuses the same row.

**Note on contact info:** the login flow only requires first + last name + shared event password. `email` and `phone` are metadata for organizer use (sending judges their assignments, thank-you notes, etc.), populated via admin SQL — not collected at login.

### 4.3 `rubric_sections`

| Column | Type | Notes |
|---|---|---|
| `id` | `serial PK` | |
| `show_id` | `int not null FK → shows(id)` | |
| `name` | `text not null` | "Interior", "Exterior", "Engine Bay", "Bonus" |
| `description` | `text` | Optional. Shown to the judge as a sub-header when they enter the section, as a quick reminder of what to look at. e.g. for Engine Bay: *"Open the Hood/Rear Hatch (for mid-engine C8's). Score what you can see."* |
| `display_order` | `integer not null` | For sorting in the UI |
| `max_points` | `numeric(5,2) not null` | 50 / 100 / 40 / 10 |
| `scoring_mode` | `text not null default 'deduct'` | Either `'deduct'` or `'award'`. Drives the section's UI behavior and the initial value of new `deductions` rows for items in that section. |

**Constraints:**
- `unique (show_id, name)`.
- `CHECK (scoring_mode IN ('deduct', 'award'))`.

**How `scoring_mode` works (Bonus polarity fix):**
- **`'deduct'` mode** (default — used for Interior, Exterior, Engine Bay): the judge starts with full points and *subtracts* points for flaws. New `deductions` rows for items in this section are initialized with `deduction_amount = 0` (perfect). UI label: *"Points to deduct."*
- **`'award'` mode** (used for Bonus): the judge starts with zero bonus and *awards* points for upgrades. New `deductions` rows for items in this section are initialized with `deduction_amount = frozen_max_points` (no bonus given). UI label: *"Bonus points to award."* The app translates the awarded value back to internal `deduction_amount = max_points − awarded` before saving, so the math (`score = max − deduction_amount`) and the database storage are identical to deduct mode.

### 4.4 `rubric_subsections`

| Column | Type | Notes |
|---|---|---|
| `id` | `serial PK` | |
| `section_id` | `int not null FK → rubric_sections(id)` | |
| `name` | `text not null` | e.g. "Seats", "Body Panel Fit", "Compartment Paint Finish" |
| `description` | `text` | Optional. Shown to the judge as a sub-header when they enter the subsection, as a quick reminder of what to look at. e.g. for Seats: *"Check leather/fabric, stitching, seatbacks, and discoloration."* |
| `display_order` | `integer not null` | |

**Constraint:** `unique (section_id, name)` — parallel to `rubric_sections`; prevents two subsections with the same name inside the same section.

### 4.5 `rubric_items`

The leaf-level sub-items the judge actually scores.

| Column | Type | Notes |
|---|---|---|
| `id` | `serial PK` | |
| `subsection_id` | `int not null FK → rubric_subsections(id)` | |
| `name` | `text not null` | e.g. "Overall Cleanliness", "Lack of Scratches" |
| `display_order` | `integer not null` | |
| `max_points` | `numeric(5,2) not null` | Per-item max. Ranges 2–10 in the active rubric (most items are 2 or 3 pts; Body Condition items are 10 pts). |
| `notes` | `text` | Optional judging guidance shown to the judge |

**Constraint:** `unique (subsection_id, name)` — parallel to `rubric_sections` and `rubric_subsections`; prevents two items with the same name inside one subsection.

**No generation-specific filtering.** Every rubric item applies to every Corvette generation. The C8's mid-engine layout only changes *where the judge looks* (rear hatch instead of front hood), and that nuance is captured in the `description` text on the Engine Bay section (see 4.3) — not in conditional schema. The "Trunk/Frunk Areas" subsection covers both cases descriptively: pre-C8 cars have a rear trunk only, C8s have both a rear trunk and a frunk; the same 5 criteria evaluate whatever storage the car has.

### 4.6 `judging_sessions`

One in-progress or completed scoring of one car by one judge.

| Column | Type | Notes |
|---|---|---|
| `id` | `serial PK` | |
| `show_id` | `int not null FK → shows(id)` | |
| `judge_id` | `int not null FK → judges(id)` | |
| `participant` | `integer not null` | Cross-DB reference to `corvetteisland.customers.participant`. Validated by the app, not DB. |
| `started_at` | `timestamptz default now()` | |
| `submitted_at` | `timestamptz` | NULL until final submit |
| `is_complete` | `boolean not null default false` | True only after submit |
| `total_deductions` | `numeric(5,2)` | Frozen at submit |
| `total_score` | `numeric(5,2)` | Frozen at submit (200 − total_deductions) |
| `interior_score` | `numeric(5,2)` | Frozen at submit. Pre-computed Interior subtotal (max 50). |
| `exterior_score` | `numeric(5,2)` | Frozen at submit. Pre-computed Exterior subtotal (max 100). |
| `engine_bay_score` | `numeric(5,2)` | Frozen at submit. Pre-computed Engine Bay subtotal (max 40). |
| `bonus_score` | `numeric(5,2)` | Frozen at submit. Pre-computed Bonus subtotal (max 10). |
| `judge_notes` | `text` | Optional. Holistic comment on the car captured at submit time, e.g. *"Outstanding frame-off restoration."* Distinct from per-deduction notes. |
| `award` | `text` | Optional. Recorded by the organizer after the show, e.g. *"Best in C8"*, *"1st Place Overall"*. Nullable. |
| `created_at` | `timestamptz default now()` | |
| `updated_at` | `timestamptz default now()` | |

**Constraint:** `unique (show_id, participant)` — a car gets exactly one judging session per show. (PRD: "a car has exactly one judge.")

**Tradeoff note on the 4 per-section subtotals:** these columns hardcode the Corvette show's four section names into the schema. That's intentional for v1 (the rubric structure is fixed) but means a future show with a different section structure would need a migration. The SaaS version (`Car-Show-Judge`) will use a different approach (a `session_section_scores` table with one row per section per session), since organizers will define their own section names there.

### 4.7 `deductions`

One row per rubric item the judge actually entered a deduction for. Items with 0 deductions still get a row so we know they were reviewed (and to capture the frozen snapshot).

| Column | Type | Notes |
|---|---|---|
| `id` | `serial PK` | |
| `judging_session_id` | `int not null FK → judging_sessions(id) ON DELETE CASCADE` | |
| `rubric_item_id` | `int not null FK → rubric_items(id)` | |
| `deduction_amount` | `numeric(5,2) not null default 0` | App AND database enforce ¼-increment + ≤ frozen_max_points (see CHECK constraint below). |
| **Frozen snapshot fields:** | | |
| `frozen_item_name` | `text not null` | Snapshot of rubric_items.name |
| `frozen_max_points` | `numeric(5,2) not null` | Snapshot of rubric_items.max_points |
| `frozen_subsection_name` | `text not null` | Snapshot |
| `frozen_section_name` | `text not null` | Snapshot |
| `notes` | `text` | Optional judge note |
| `created_at` | `timestamptz default now()` | |
| `updated_at` | `timestamptz default now()` | |

**Constraints:**
- `unique (judging_session_id, rubric_item_id)` — only one deduction row per rubric item per session.
- `CHECK (deduction_amount >= 0 AND deduction_amount <= frozen_max_points AND (deduction_amount * 4)::int = deduction_amount * 4)` — defense-in-depth at the DB level: deduction must be ≥ 0, ≤ the frozen item max, and a clean ¼-point multiple. *Note: if a future show wants finer or coarser increments (½-pt, ⅛-pt), this constraint will need a migration.*

**Why "frozen" fields:** the implementation plan calls out the risk of rubric drift breaking archived scores. Copying the values at scoring time means we can pull up a 2026 session in 2030 and still see exactly what was scored, even if the rubric was reorganized.

### 4.8 `photos`

| Column | Type | Notes |
|---|---|---|
| `id` | `serial PK` | |
| `deduction_id` | `int not null FK → deductions(id) ON DELETE CASCADE` | |
| `filepath` | `text not null` | Relative path under `uploads/` (Phase 1: filesystem) |
| `original_filename` | `text` | What the phone called it |
| `file_size_bytes` | `integer` | |
| `mime_type` | `text` | |
| `caption` | `text` | Optional. One-line annotation the judge can type when attaching the photo, e.g. *"Crack near sunroof seal."* |
| `created_at` | `timestamptz default now()` | |

**Phase 1 storage:** local filesystem in `uploads/`. The PRD has an open question on long-term storage (Supabase / S3). When that's resolved, we add a `storage_provider` column or migrate paths — not now.

## 5. Indexes Worth Adding Up Front

```
CREATE UNIQUE INDEX shows_one_active        ON shows (is_active) WHERE is_active = true;
CREATE UNIQUE INDEX judges_name_unique      ON judges (firstname, lastname);
CREATE UNIQUE INDEX rubric_section_show     ON rubric_sections (show_id, name);
CREATE UNIQUE INDEX rubric_subsection_sec   ON rubric_subsections (section_id, name);
CREATE UNIQUE INDEX rubric_item_subsection  ON rubric_items (subsection_id, name);
CREATE UNIQUE INDEX session_show_part       ON judging_sessions (show_id, participant);
CREATE UNIQUE INDEX deduction_unique        ON deductions (judging_session_id, rubric_item_id);
CREATE INDEX        deductions_session      ON deductions (judging_session_id);
CREATE INDEX        photos_deduction        ON photos (deduction_id);
```

## 6. Resolved Decisions

All open decisions from the original draft are now closed. Captured here for historical context — every choice below is reflected in the body of the spec.

- ~~Subsections required or optional?~~ → **Required.** Every item lives under a subsection.
- ~~Generation filter on rubric items?~~ → **Removed entirely.** No items differ by generation; engine-location anatomy is described in section text instead.
- ~~`is_locked` on shows?~~ → **Kept.** Column ships in v1 (default false); enforcement may follow later.
- ~~Session-level rubric snapshot?~~ → **Skipped.** Per-deduction frozen snapshots are sufficient; no `rubric_snapshot JSONB` on `judging_sessions`.
- ~~Per-deduction notes?~~ → **Kept.** Optional one-line text alongside each deduction; useful for defending a score with a photo + short explanation.

## 7. What Is **Not** In This Schema

- **No `registrations` table** — replaced by reading `corvetteisland.customers` live, since the partner-DB question is now resolved.
- **No `users` / admin / roles table.** v1 admin is SQL-only per implementation plan.
- **No notification / email tables.** Out of scope per PRD.
- **No audit log.** `updated_at` columns are the only history we keep in v1.

## 8. Migration Path When Open Questions Resolve

- **If photo storage moves off filesystem:** add `storage_provider` and `storage_key` columns to `photos`; backfill existing rows; deprecate `filepath`.
- **If we add full offline-with-sync (v2):** add `client_id` (UUID) and `synced_at` columns to `judging_sessions` and `deductions` so a phone-generated session can dedupe on sync.
- **If multi-judge consensus ever happens:** drop the `unique (show_id, participant)` constraint and add an `is_primary` flag to `judging_sessions`.
