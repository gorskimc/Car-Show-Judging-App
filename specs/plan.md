# Implementation Plan — Car Show Judging App

> The plan is the bridge between PRD.md (what + why) and code (how).
> Keep it tight. Steps should be small enough to ship one at a time.

## 1. Goal

Build, test locally, and deploy a working v1 of the Car Show Judging App: judges sign in on their phone, enter a registration number, score a car using the 200-point rubric with photo-backed deductions, and submit a complete record to Postgres. Reusable for the next annual show.

## 2. Approach

- **Chosen approach:** Vanilla static-PWA frontend + Express API + Postgres. Rubric stored as data (sections / subsections / items) so it's editable per-show. Photos saved to local filesystem in v1. Online-only with save-as-you-go. Multi-show via a `shows` table with one "active show."
- **Why this and not a single-page React app + native mobile build:** This stack is the lowest-friction path that hits every requirement. PWA covers iPhone + Android with one codebase, no app stores, no compilation. Express + Postgres matches the existing stack. Vanilla JS keeps the frontend auditable and avoids build-tool maintenance for a low-volume annual app.
- **Trade-off accepted:** No offline-mode-with-sync in v1, no native app shell. Revisit only if v1 reveals real connectivity problems at the show venue.

## 3. Steps

1. **Set up the Node project.** Create `package.json`, install `express` / `pg` / `dotenv` / `express-session` / `multer` (with explicit user approval each time). Write `server.js` that serves `public/` and a `/health` endpoint. Verify `node server.js` boots.
2. **Define the database schema.** Write `db/schema.sql` for tables: `shows`, `judges`, `registrations`, `rubric_sections`, `rubric_subsections`, `rubric_items`, `judging_sessions`, `deductions`, `photos`. Inline-comment each table's purpose.
3. **Seed the rubric and test data.** Write `db/seed.sql` loading all ~70 sub-items (Interior 50, Exterior 100, Engine 40, Bonus 10) plus a handful of placeholder registrations until the partner-DB question is resolved.
4. **Build the database connection and one-shot setup script.** `db/connection.js` (pg pool reading `DATABASE_URL` from `.env`) plus `scripts/setup-db.js` to run schema + seed.
5. **Build the auth route and login screen.** `routes/auth.js` (POST login: validate name + shared password, normalize name, store in session). `public/index.html` is the login screen. Verify a judge can log in.
6. **Build the registration lookup.** `routes/registrations.js` (GET by registration number → owner / year / make / model / color). Add the "enter reg #, confirm car" screen as the first step after login.
7. **Build the rubric API and judging screens.** `routes/rubric.js` serves the rubric structure. `public/judging.html` walks one sub-item at a time, accepts ¼-point deductions, holds them client-side until submit.
8. **Add photo capture for deductions.** When deduction > 0, prompt camera capture (`<input type="file" capture="environment">`). Store photos in client memory until submit. Validate at submit-time that every deduction has a photo.
9. **Build the score-submission flow.** `routes/sessions.js` (create session, save deductions) and `routes/photos.js` (upload via `multer` to `uploads/`, link to deduction). `public/review.html` shows computed totals before final submit.
10. **Make it a real PWA.** Add `public/manifest.json`, placeholder icons in `public/icons/`, `public/service-worker.js` to cache the app shell. Verify "Add to Home Screen" works on iPhone and Android.
11. **Add the active-show concept.** Admin endpoint or config flag to set the active show. All new sessions auto-attach to it.
12. **End-to-end test on a real phone** over local Wi-Fi. Walk a full mock judging session start to finish; fix any gaps.
13. **Deploy to a real host.** Pick Render or Railway, set up Postgres there, set environment variables (`DATABASE_URL`, `SESSION_SECRET`, `EVENT_PASSWORD`), deploy. Test on phones over cellular.
14. **Decide on partner-DB integration.** Once that conversation happens, replace the seeded `registrations` table with the chosen approach (live read / read-write / snapshot).
15. **Decide on long-term photo storage.** Same trigger — once the partner conversation is done.

## 4. Risks

- **Risk:** Bad cellular at the show venue causes save failures mid-session. — **Watch for:** consistent failed POSTs during the test phone walkthrough; do a venue site survey before show day.
- **Risk:** Photo uploads exceed mobile data limits or the server's disk fills up. — **Watch for:** photo file sizes >2MB per deduction during testing; consider client-side compression before upload.
- **Risk:** Partner-DB integration introduces a schema mismatch we don't see today. — **Watch for:** confirm column names and types in the partner's `registrations` table the moment access lands.
- **Risk:** Judges find the ¼-point deduction input cumbersome on a phone. — **Watch for:** project owner's feedback during the local walkthrough.
- **Risk:** Rubric data drifts year-over-year and breaks archived scores. — **Watch for:** any rubric edit that changes max points on existing sub-items. Mitigation: snapshot the rubric values into each `judging_session` at submit time so historical scores stay intact.

## 5. Validation

- **Step 1:** `node server.js` boots; `GET /health` returns 200.
- **Steps 2–4:** `psql` shows all tables created with expected columns; seed query counts match the rubric (Interior 25 sub-items / Exterior 28 / Engine 13 / Bonus 5; max points sum to 200).
- **Step 5:** Correct password logs in; wrong password is rejected; session cookie persists across reloads.
- **Step 6:** Known registration → loads correct car details; unknown registration → clear "not found" message.
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
- Real registration data integration (deferred until partner conversation).
- Long-term cloud photo storage (Supabase Storage / S3) — Phase 1 uses filesystem.
- Real Corvettes-on-the-Island branding (placeholder icons in v1).
- Admin web UI for managing shows / rubric / registrations (v1 admin happens via SQL).
