# PRD — Car Show Judging App

> Product Requirements Doc. Keep it short, decision-oriented, and honest about
> what's in vs. out of scope. If a section has nothing to say, write "N/A" —
> don't pad.

## 1. Overview

A phone-first installable web app (PWA) for judges at the "Corvettes on the Island" Corvette show. A single judge enters a car's registration number, walks through ~70 scoring sub-items recording ¼-point deductions with photo evidence, and submits a final 200-point score that ties back to the car's registration record. The same app is reusable across annual shows.

## 2. Goals

- Replace paper-based judging with a structured, photo-backed digital record.
- Capture scores at the source so there's no post-show data entry.
- Give judges photo evidence for every deduction so they can defend scores to car owners.
- Make the app reusable for the show year-over-year with no code rebuild — just configuration.

## 3. Non-Goals

- Not a multi-judge consensus tool — a car has exactly one judge.
- Not a public-facing scoreboard or live results display (separate concern).
- Not a registration system — registration data lives elsewhere (see Open Questions).
- Not an iOS or Android compiled native app — PWA only.

## 4. User Stories

- As a **judge**, I want to sign in with my name and the event password so the system tracks whose scores are whose.
- As a **judge**, I want to enter a car's registration number and see the owner / year / make / model / color so I can confirm I'm scoring the right car.
- As a **judge**, I want to walk through scoring sections one at a time on my phone so I don't lose my place.
- As a **judge**, I want to enter point deductions in ¼-point increments per sub-item so I can score precisely.
- As a **judge**, I want the app to prompt me to take a photo whenever I record a deduction so I have evidence for that issue.
- As a **judge**, I want to review the full breakdown before submitting so I can fix mistakes.
- As a **show organizer**, I want each year's results stored separately so I can review prior shows.

## 5. Functional Requirements

1. Judge logs in with first name, last name, and a shared event password (stored in `.env`). Names are normalized (trimmed, title-cased) on save.
2. Judge enters a car's registration number. App looks it up and displays owner / year / make / model / color for confirmation.
3. App presents the rubric one section at a time: Interior → Exterior → Engine/Engine Bay → Bonus.
4. Each sub-item shows its name, max points, and a deduction input restricted to ¼-point increments.
5. When deduction > 0, the app prompts the judge to take a photo using the phone's native camera; the photo is saved with the deduction.
6. App computes per-sub-item scores (max − deduction), subsection subtotals, section subtotals, and the overall score (out of 200) automatically.
7. Save-as-you-go: each sub-item is saved to the server as soon as the judge moves to the next sub-item.
8. Review screen shows the full breakdown with all attached photos before final submit.
9. On submit, the score record is persisted with judge name, registration #, show ID, every per-sub-item deduction, photo references, and a snapshot of the rubric values used.
10. The app is installable to a phone home screen as a PWA (manifest + icons).
11. The system has one "active show" at a time; new judging sessions auto-attach to the active show.
12. The scoring rubric is stored as data and editable per-show without code changes.

## 6. Non-Functional Requirements

- **Performance:** Score submission completes within 3 seconds on 4G mobile (including photo upload). App shell loads in under 2 seconds on first open.
- **Security:** Follows `SECURITY.md`. Event password lives in `.env` only. No client data hardcoded. `.env` is gitignored.
- **Accessibility:** Tap targets ≥44×44px. Sufficient color contrast for outdoor sunlight viewing.
- **Browser/Device support:** Latest 2 versions of Safari (iOS) and Chrome (Android). Phone-first at 375px+; tablet/desktop are bonuses.
- **Connectivity (v1):** Online-only with save-as-you-go after every sub-item. App shell is cached so the app *opens* even with no signal.
- **Reusability:** New shows require only a new `shows` row plus optional rubric edits — no code change.

## 7. Success Metrics

- ≥ 95% of judging sessions completed and submitted without judge-reported errors.
- Every recorded deduction has a corresponding photo (validated at submit time).
- Zero post-show data entry needed — all scores live in the database the moment the show ends.
- App reused for the next year's show with no rewrite, only configuration changes.

## 8. Open Questions

- **Database integration approach.** Three options pending partner conversation: (1a) read-only from partner's Postgres + our own DB for writes, (1b) full read/write to partner's Postgres, (2) snapshot import before each show.
- **Photo storage location.** Phase 1 uses the deploy host's filesystem. Long-term options (Supabase Storage / S3 / filesystem) pending partner conversation.
- **Hosting platform.** Render or Railway are leading candidates. Decide before deploy.
- **App icon design.** Placeholder icons in v1; real Corvettes-on-the-Island branding swapped in later.
- **Offline mode (v2).** Whether to invest in full offline-with-sync depends on observed signal quality at the v1 show. Out of v1 scope.
- **Show-day onboarding.** How is the URL + password distributed to judges (email, printed handout, QR code at check-in)? Not blocking dev; settle before show day.
