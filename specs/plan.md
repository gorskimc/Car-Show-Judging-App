# Implementation Plan — Car Show Judging App

> The plan is the bridge between PRD.md (what + why) and code (how).
> Keep it tight. Steps should be small enough to ship one at a time.

## 1. Goal

Build, test locally, and deploy a working v1 of the Car Show Judging App: judges sign in on their phone, enter a registration number, score a car using the 200-point rubric and optionally documenting deductions with photos, and submit a complete record to Postgres. Reusable for the next annual show.

## 2. Approach

- **Chosen approach:** Vanilla static-PWA frontend + Express API + Postgres. Rubric stored as data (sections / subsections / items) so it's editable per-show. Photos saved to local filesystem in v1. Online-only with save-as-you-go. Multi-show via a `shows` table with one "active show."
- **Two-database integration:** Read-only access to the partner's `corvetteisland` Postgres (specifically the `customers` table) for registrant lookups; read-write access to a new `judging` database that we own for everything else (judges, rubric, sessions, deductions, photos). Locally for dev, both databases live on the same Postgres server cloned from production. The full schema is captured in `specs/database-schema.md`.
- **Why this and not a single-page React app + native mobile build:** This stack is the lowest-friction path that hits every requirement. PWA covers iPhone + Android with one codebase, no app stores, no compilation. Express + Postgres matches the existing stack. Vanilla JS keeps the frontend auditable and avoids build-tool maintenance for a low-volume annual app.
- **Trade-off accepted:** No offline-mode-with-sync in v1, no native app shell. Revisit only if v1 reveals real connectivity problems at the show venue.

## 3. Steps

1. **Set up the Node project.** Create `package.json`, install `express` / `pg` / `dotenv` / `express-session` / `multer` (with explicit user approval each time). Write `server.js` that serves `public/` and a `/health` endpoint. Verify `node server.js` boots.
2. **Define the database schema.** Write `db/schema.sql` for the **`judging`** database, following `specs/database-schema.md` as the authoritative source. Tables: `shows`, `judges`, `rubric_sections`, `rubric_subsections`, `rubric_items`, `judging_sessions`, `deductions`, `photos`. Inline-comment each table's purpose. No `registrations` table — registrant data is read live from `corvetteisland.customers` (see Step 6).
3. **Seed the rubric.** Write `db/seed.sql` loading the full rubric for the active show: 4 sections (Interior 50, Exterior 100, Engine Bay 40, Bonus 10) with `scoring_mode = 'deduct'` for the first three and `'award'` for Bonus; ~16 subsections; ~71 sub-items. No registrant seeding — registrants come from `corvetteisland.customers`.
4. **Build the database connections and one-shot setup script.** `db/connection.js` exports **two** `pg` pools: one for `corvetteisland` (read-only, customer lookup) and one for `judging` (read-write). Both read `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `CUSTOMERS_DB` / `JUDGING_DB` from `.env` (no `DATABASE_URL`). `scripts/setup-db.js` creates the `judging` database (if missing), runs schema + seed against it, and never touches `corvetteisland`.
5. **Build the auth route and login screen.** `routes/auth.js` (POST login: validate name + shared password, normalize name, store in session). `public/index.html` is the login screen. Verify a judge can log in.
6. **Build the registration lookup.** `routes/registrations.js` (`GET /registrations/:participant` against `corvetteisland.customers` → firstname / lastname / year / make / model / bodytype / color / generation). Filter to `paid = true AND checkedin = true`. Add the "enter reg #, confirm car" screen as the first step after login. Note: judges enter what they call a "registration number" — internally that's the `customers.participant` column.
7. **Build the rubric API and judging screens.** `routes/rubric.js` serves the rubric structure (sections including `scoring_mode`, subsections, items). `public/judging.html` walks one sub-item at a time and renders the input differently per mode: *"Points to deduct"* (default 0) for `'deduct'` sections; *"Bonus points to award"* (default 0) for `'award'` sections. Internally both store as `deduction_amount` — for award mode, the app converts via `deduction_amount = max_points − awarded`.
8. **Add photo capture for deductions.** Add an optional photo affordance to every rubric item. The judge may attach zero or more photos via `<input type="file" capture="environment">` to document an issue (or upgrade) that may need review after judging. No photo is ever required to submit.
9. **Build the score-submission flow.** `routes/sessions.js` (create session, save deductions) and `routes/photos.js` (upload via `multer` to `uploads/`, link to deduction). `public/review.html` shows computed totals before final submit.
10. **Make it a real PWA.** Add `public/manifest.json`, placeholder icons in `public/icons/`, `public/service-worker.js` to cache the app shell. Verify "Add to Home Screen" works on iPhone and Android.
11. **Add the active-show concept.** Admin endpoint or config flag to set the active show. All new sessions auto-attach to it.
12. **End-to-end test on a real phone** over local Wi-Fi. Walk a full mock judging session start to finish; fix any gaps.
13. **Deploy to a real host.** Pick Render or Railway, provision the `judging` Postgres there, and set environment variables: `EVENT_PASSWORD`, `SESSION_SECRET`, plus two sets of PG vars — one pointing at the deployed `judging` DB, one at the partner's `corvetteisland`. Production may target a different `corvetteisland` host than the local clone (the partner's hosted Postgres). Deploy. Test on phones over cellular.
14. **Decide on long-term photo storage.** Same trigger as the partner conversation — once it's done, decide on Supabase Storage / S3 / continued filesystem.

---

**Resolved during planning** *(no longer open steps — kept here for context)*:
- ~~Partner-DB integration approach.~~ → **Option 1a: live read-only** from `corvetteisland.customers`. Our app owns a separate `judging` database for writes.
- ~~Subsection / generation / snapshot / etc. schema decisions.~~ → All resolved in `specs/database-schema.md` §6.

## 4. Risks

- **Risk:** Bad cellular at the show venue causes save failures mid-session. — **Watch for:** consistent failed POSTs during the test phone walkthrough; do a venue site survey before show day.
- **Risk:** Photo uploads exceed mobile data limits or the server's disk fills up. — **Watch for:** photo file sizes >2MB per deduction during testing; consider client-side compression before upload.
- **Risk:** Production partner-DB differs from the local clone (different host, credentials, or schema drift since the dump). — **Watch for:** confirm column names + types against the production `corvetteisland.customers` before deploy. Local clone schema is already validated.
- **Risk:** Judges find the ¼-point deduction input cumbersome on a phone. — **Watch for:** project owner's feedback during the local walkthrough.
- **Risk:** Rubric data drifts year-over-year and breaks archived scores. — **Watch for:** any rubric edit that changes max points on existing sub-items. Mitigation: snapshot the rubric values into each `judging_session` at submit time so historical scores stay intact.

## 5. Validation

- **Step 1:** `node server.js` boots; `GET /health` returns 200.
- **Steps 2–4:** `psql` shows all tables created with expected columns; seed query counts match the rubric (Interior 25 sub-items / Exterior 28 / Engine Bay 13 / Bonus 5; max points sum to 200).
- **Step 5:** Correct password logs in; wrong password is rejected; session cookie persists across reloads.
- **Step 6:** Known `participant` (paid + checked in) → loads correct car details; unknown / unpaid / not-yet-checked-in → clear "not found" message.
- **Steps 7–8:** Judge can walk through a full car, enter deductions, attach photos, and the in-memory state matches what's saved.
- **Step 9:** Submitted score round-trips: stored in DB, retrievable, all photos present, totals compute to expected value.
- **Step 10:** PWA installs to home screen on iPhone (Safari) and Android (Chrome); app opens with airplane mode on (cached shell loads).
- **Step 12:** Project owner completes a full mock session on a real phone with no UX blockers.
- **Step 13:** Same flow works against the deployed environment from a phone on cellular.

## 6. Out of Scope

- iOS / Android compiled native apps.
- Multi-judge consensus or judge handoff mid-car.
- Public scoreboard / live results display.
- Email or SMS notifications to car owners.
- Paid features, billing, subscriptions.
- Offline-mode-with-sync (v2 only if needed).
- Long-term cloud photo storage (Supabase Storage / S3) — Phase 1 uses filesystem.
- Real Corvettes-on-the-Island branding (placeholder icons in v1).
- Admin web UI for managing shows / rubric / registrations (v1 admin happens via SQL).
