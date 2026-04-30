# SECURITY.md

Security rules for this project. These are non-negotiable.

## Secrets & Credentials

1. Never log, print, or echo API keys, tokens, passwords, or client data — not in
   console output, not in debug files, not in commit messages, not in error
   messages shown to users.
2. Always load secrets from environment variables (`.env` files in development,
   platform secret managers in production). Never hardcode them in source files.
3. Always confirm `.env` is listed in `.gitignore` before any commit. The
   committed reference is `.env.example` — placeholder values only.
4. Never commit credentials, API keys, private keys, or client data to git. If
   a secret is committed by mistake, rotate it immediately — removing the file
   from the latest commit is not enough.

## Third-Party Tools & Uploads

5. Warn the user BEFORE uploading any code, prompt, or data to a third-party
   tool — diagram renderers, pastebins, gists, online formatters, AI playgrounds.
   Once data leaves the machine, it may be cached or indexed even if "deleted."
6. Treat client data — lead lists, CRM exports, customer info from Go High
   Level / Supabase / Airtable, support transcripts — as sensitive. Confirm
   with the user before reading, copying, or transforming any of it.

## Dependencies & Supply Chain

7. Confirm with the user before installing any new package or dependency.
8. Pin dependency versions (`package-lock.json`, `requirements.txt`, etc.) and
   commit the lock file.
9. Do not disable security features (signature verification, TLS validation,
   sandbox flags) to make something work. Fix the underlying issue.

## Destructive Operations

10. Never run `rm -rf`, `git push --force` to a shared branch, `DROP TABLE`,
    `git reset --hard`, or any operation that destroys work or shared state
    without explicit user confirmation for that specific action.
11. Approval to do something destructive once is not approval to do it again
    in a different context.

## When in Doubt

12. Stop and ask. The cost of a 10-second confirmation is always lower than
    the cost of a leaked secret or a deleted branch.
