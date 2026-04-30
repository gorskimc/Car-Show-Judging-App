# CLAUDE.md — Car Show Judging App

> Project memory for Claude Code. Keep this file short, specific, and current.
> Anything that is not committed-to-the-repo truth goes in `CLAUDE.local.md` instead.

## What This Project Is

A phone-first installable web app (PWA) for the "Corvettes on the Island" Corvette show. A single judge enters a car's registration number, walks through a structured 200-point scoring rubric, records ¼-point deductions with optional photos for each deduction, and submits the final score. Reusable across annual shows.

## Tech Stack

- **Language:** JavaScript (Node.js backend, vanilla JS frontend)
- **Framework / Runtime:** Node.js + Express
- **Database:** PostgreSQL (specific connection approach TBD — see Open Questions in PRD.md)
- **Hosting:** TBD — Render or Railway recommended. **Not Netlify** (Express is long-lived; Netlify is serverless).
- **Key dependencies:** `express`, `pg`, `dotenv`, `express-session`, `multer` (photo uploads)

## Coding Style

- Phone-first responsive design — minimum 375px width, touch targets ≥44px
- One responsibility per file: routes split by domain (`auth`, `registrations`, `sessions`, `photos`, etc.)
- No build step on the frontend — vanilla HTML/CSS/JS served as static files by Express
- Comments only when the WHY is non-obvious — never narrate WHAT the code does
- The scoring rubric lives as data in the database, not hardcoded

## Always Do

1. Explain your plan in plain English BEFORE writing any code.
2. Keep changes small and focused — one thing at a time.
3. After each edit, show the file path and a short summary of what changed.
4. Confirm before adding new dependencies, CDN links, or third-party scripts.
5. Treat scoring rubric data as a contract — confirm before changing structure or max points.

## Never Do

1. Never commit or push to git without my approval.
2. Never install new packages without asking first.
3. Never run destructive commands (rm, drop table, force push) without confirmation.
4. Never hardcode the shared event password — it lives in `.env`.
5. Never make sweeping refactors when only a small change was requested.
6. Never assume — if you're unsure what I want, ask.

## Project Notes

- **The show is Corvette-specific** — the rubric includes C8-specific notes (frunk + trunk).
- **Total score = 200 points**: Interior 50 + Exterior 100 + Engine/Engine Bay 40 + Bonus 10. Engine is 40, NOT 50 (the original rubric doc had a typo).
- **Judge enters deductions, not scores.** 0 = perfect for that item. App computes actual scores.
- **Phase 1 connectivity:** online with save-as-you-go after each sub-item. Full offline-mode-with-sync is deferred to v2.
- **Photo storage Phase 1:** filesystem (`uploads/`). May move to Supabase Storage / S3 later — pending partner conversation.
- **Database integration:** pending partner conversation (Option 1a read-only / 1b read-write / Option 2 snapshot). Phase 1 dev uses local Postgres with placeholder registration data.
- **Login:** judge first + last name (auto trimmed and title-cased) + shared event password from `.env`.
- **Multi-show:** `shows` table; one show is "active" at a time; rubric editable per-show; past shows archived but locked from edits.
