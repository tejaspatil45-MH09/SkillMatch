# SkillMatch API

Express 5 + PostgreSQL backend for the SkillMatch frontend. **Status: Phases 0 to 9 of 9: complete** (scaffold, schema, seed data, authentication, profiles, skills, projects, proposals, notifications, dashboards, secure demos, hirings, reviews, reports, admin).
The remaining endpoints and business logic arrive in the next phases. See the plan below.

## Quick start

```bash
docker compose up -d            # Postgres 16 (+ a throwaway skillmatch_test database)
cp .env.example .env
npm install
npm run migrate                 # create the schema
npm run seed                    # demo data (identical to the frontend's mock data); add `-- --yes` to replace existing data
npm run dev                     # http://localhost:5000/api/health
npm test                        # 257 tests; needs TEST_DATABASE_URL (set in .env.example); WIPES that database on every run
```

No Docker? Any Postgres 13+ works: create two databases, point `DATABASE_URL` and `TEST_DATABASE_URL` at them. The test database name must contain "test"; the tests refuse to run otherwise.

Demo logins after seeding use the password `Password@123`: `aarav@skillmatch.dev` (freelancer), `hr@technova.dev` (company), `admin@skillmatch.dev` (admin).

## What exists so far

- **App skeleton:** Express 5 (async errors handled natively), helmet, JSON body limit, structured logging (pino), health check that reports `503 DB_DOWN` instead of crashing, graceful shutdown, validated environment (fails fast with a readable message).
- **Uniform errors:** every failure is `{ message, code, fields? }`, the shape the frontend already expects. Unexpected errors become a generic 500 and are logged, never returned. Database constraint errors map to 409/400 without leaking SQL.
- **Schema** (`migrations/001_init.sql`, reversible): 17 tables. Integrity lives in the database so a bug in application code cannot corrupt data:
  - one proposal per freelancer per project (`UNIQUE`), even under concurrent requests
  - role-correct references: only a COMPANY can own a project, only a FREELANCER can have a profile or submit a proposal
  - a hiring must agree with its proposal and with the project's owner (composite foreign keys)
  - at most one live (active or completed) hiring per project
  - `completed_at` is set exactly when a hiring is COMPLETED; cancelling needs a reason
  - reviews: rating 1-5, one per reviewer per hiring, no self-review
  - demos: only `http(s)` URLs, a 24-hour window (`expires_at > submitted_at`), one per proposal, plus an audit table (`demo_access_log`)
  - reports: exactly one target via two real foreign keys; one open report per reporter per target
  - emails and skill names unique ignoring case; users with activity cannot be hard-deleted (suspend instead)
- **Seed** (`npm run seed`): the frontend's demo data, including one demo that is available, one viewed and one expired. Refuses to run in production, and refuses to replace existing data without `--yes`.

## Authentication (Phase 2)

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/register` | `{ name, email, password, role }`, role is `FREELANCER` or `COMPANY` only. Logs the user in. `409 EMAIL_TAKEN` |
| `POST` | `/api/auth/login` | `401 INVALID_CREDENTIALS` is identical for wrong password and unknown email. `403 SUSPENDED` only after the password is proven |
| `POST` | `/api/auth/logout` | Destroys the session on the server |
| `GET` | `/api/auth/me` | Restores the session on page refresh (`401` when logged out) |
| `POST` | `/api/auth/forgot-password` | Always the same `200` answer. The link is emailed (or printed to the server log when `SMTP_HOST` is unset) |
| `POST` | `/api/auth/reset-password` | `{ token, password }`. Single use, 60-minute expiry, logs the user out everywhere |

Responses use the exact user shape the frontend expects (`{ user: { id, name, email, role, status, createdAt, profile } }`).

**Admin accounts** exist only via `ADMIN_PASSWORD=... node scripts/create-admin.js --email you@example.com --name "Your Name"` (or omit the variable to be prompted). The API cannot create admins.

**Security decisions**
- **Server-side sessions in Postgres** (httpOnly, `SameSite=Lax`, `Secure` in production, 7 days, sliding). Suspending a user or resetting a password revokes every session at once, which a stateless JWT cannot do. A new session id is issued on every login (session fixation).
- **Authorization is re-read from the database on every request** (`requireAuth`), so suspensions and role changes apply immediately. `requireRole` is the base for all later endpoints.
- **Passwords:** argon2id, length-capped at 128 characters so hashing cannot be used for denial of service, minimum 8 with a letter and a number. An unknown email still costs one hash verification, so response time doesn't reveal which accounts exist.
- **Reset tokens:** 256 random bits, only the SHA-256 hash is stored, consumed with one atomic `UPDATE ... RETURNING` so two simultaneous requests cannot both succeed, older links are invalidated when a new one is requested.
- **CSRF:** `SameSite=Lax` plus an `Origin` check on every state-changing request. **CORS** allows only the origins in `CORS_ORIGIN`, with credentials.
- **Rate limits** on login (per IP, and per IP+account; successful logins don't count), registration, forgot and reset. The limiter keys on IP+account rather than account alone so a stranger cannot lock the real owner out. The counters are in memory: with several server instances, switch to a shared store such as Redis.
- **Mass assignment:** request bodies are validated with strict schemas, so unexpected fields are rejected instead of silently ignored.
- Set `SESSION_SECRET` (at least 32 random characters) in production; the server refuses to start without it. In development a fixed default keeps you logged in across restarts.

## Profiles, skills and projects (Phase 3)

| Method | Path | Who | Notes |
|---|---|---|---|
| `GET` | `/api/skills` | signed in | Active skills only, case-insensitive alphabetical |
| `GET` | `/api/profiles/:id` | see below | Profile + `rating`, `reviewCount`, `profileCompletion`, `reviews`. Email only for the owner and admins |
| `PUT` | `/api/profiles/me` | signed in | Partial update. The accepted fields depend on your role; unknown fields are rejected |
| `GET` | `/api/projects` | signed in | OPEN projects. Query: `q`, `skills` (comma list, any-of), `minBudget`, `maxBudget`, `deadlineBefore`, `sort` = `match`/`newest`/`budget`/`deadline`. Max 200 rows |
| `GET` | `/api/projects/:id` | see below | |
| `POST` | `/api/projects` | company | `201`. Status, owner and ids can never be supplied by the client |
| `PUT` | `/api/projects/:id` | owner | OPEN only (`409 INVALID_STATE`); skills lock once proposals exist (`409 SKILLS_LOCKED`) |
| `POST` | `/api/projects/:id/close` | owner | Sets `CANCELLED`, rejects PENDING/SHORTLISTED proposals and notifies those freelancers, in one transaction |
| `GET` | `/api/company/projects` | company | Own projects, every status, with proposal counts |

**Who can see what**
- *Profiles:* yourself, admins, and the opposite side of the marketplace (freelancer to company and back). Not other freelancers, not rival companies, not admin accounts; suspended users are hidden. Anything not allowed looks like `404`.
- *Projects:* OPEN projects are visible to every signed-in user. In-progress, completed and cancelled projects are visible only to the owning company, admins, and freelancers who submitted a proposal; for everyone else they do not exist (`404`).

**Skill match** (matched required skills / total required skills, rounded) is computed **in SQL** inside the listing query, so sorting and display always agree. A test checks that it equals the frontend's formula for every freelancer and every project.

**Portfolio and experience** are replaced as a list. Items carrying one of your own real ids are updated in place; anything else (including ids copied from another user) is inserted as new; unlisted items are deleted. Another user's item cannot be modified this way (two independent guards).

**Retiring a skill** (admin, Phase 7) keeps it on existing profiles and projects but stops it being offered or newly added.

## Proposals, notifications and dashboards (Phase 4)

| Method | Path | Who | Notes |
|---|---|---|---|
| `POST` | `/api/projects/:id/proposals` | freelancer | `201`. `409 DUPLICATE_PROPOSAL` (one per project), `409 INVALID_STATE` (project not open) |
| `GET` | `/api/projects/:id/proposals` | owning company | Ranked by skill match, then newest |
| `GET` | `/api/proposals/mine` | freelancer | |
| `GET` | `/api/company/proposals` | company | Inbox across all of the company's projects |
| `GET` | `/api/proposals/:id` | freelancer, owning company, admin | `403` for anyone else |
| `POST` | `/api/proposals/:id/shortlist` | owning company | PENDING only |
| `POST` | `/api/proposals/:id/reject` | owning company | PENDING or SHORTLISTED |
| `POST` | `/api/proposals/:id/withdraw` | the freelancer | PENDING or SHORTLISTED |
| `POST` | `/api/proposals/:id/accept` | owning company | SHORTLISTED only. Returns the new hiring |
| `GET` | `/api/notifications` | signed in | Your own only, newest first |
| `POST` | `/api/notifications/read-all`, `/:id/read` | signed in | Someone else's notification is a `404` |
| `GET` | `/api/freelancer/dashboard`, `/api/company/dashboard` | by role | Counts, recommended projects / recent activity |

**Accepting a proposal is one transaction:** accept it, reject every other live proposal on the project, move the project to `IN_PROGRESS`, create the hiring, and write all the notifications. If any step fails, nothing changes.

**Concurrency design** (people really can click at the same moment):
- *Submit:* the unique `(project, freelancer)` constraint decides, so simultaneous double-submits give exactly one `201`. Submitting takes a shared lock on the project, so a simultaneous "close project" either rejects the new proposal too or makes the submit fail; a live proposal can never be left on a closed project.
- *Accept / reject / withdraw / shortlist:* the proposal row is locked first and its status is read **after** the lock is held, so whoever arrives second sees the first one's result and gets a clean `409`. Accept locks the project before its proposals (always in that order), so two simultaneous accepts queue up instead of deadlocking, and exactly one hire is made. The database also forbids a second live hiring per project as a last line of defence.
- Tests repeat each race several times; with the locks removed they fail reliably.

**Demos are never in a list.** Proposal payloads include demo *metadata* only (status, expiry). Never the URL, and the freelancer's demo description is shown only to that freelancer.

## Secure demo access (Phase 5)

| Method | Path | Who | Notes |
|---|---|---|---|
| `POST` | `/api/proposals/:id/demo` | the freelancer | `{ url, description }`. SHORTLISTED proposals only; one per proposal (`409 DUPLICATE_DEMO`). The 24-hour window starts now |
| `GET` | `/api/proposals/:id/demo` | the freelancer or the owning company | Status and timing only. `404 NO_DEMO` when none yet |
| `POST` | `/api/demos/:id/access` | the owning company | The **only** response that ever contains the link. `410 DEMO_VIEWED`, `410 DEMO_EXPIRED`, `410 DEMO_UNAVAILABLE` |
| `POST` | `/api/demos/:id/reissue` | the freelancer | A fresh 24-hour window, only after the last one was used or lapsed |

**The guarantee.** Opening a demo is one SQL statement:

```sql
UPDATE demos d SET viewed_at = now()
FROM proposals pr JOIN projects p ON p.id = pr.project_id
WHERE d.id = $1 AND pr.id = d.proposal_id AND p.company_id = $2        -- the owner
  AND pr.status IN ('SHORTLISTED', 'ACCEPTED')                          -- proposal still live
  AND d.viewed_at IS NULL AND d.expires_at > now()                      -- unused and in time
RETURNING d.url, d.description, d.viewed_at ...
```

Checking and consuming happen together, so there is no gap for two simultaneous requests to slip through: the database serialises them on the row and everyone after the first finds it already used. A test fires 20 simultaneous requests at one demo and requires exactly one `200`; it fails if the statement is replaced by a "read, then update" version.

**What never happens**
- The link is never in a list, a detail payload, a notification, a dashboard or a status check. A test sweeps 13 endpoints after a view to prove it.
- A stranger cannot tell whether a demo exists: wrong company, wrong role, admin, unknown id and unknown proposal all get the same `403 ACCESS_DENIED`. Only the owning company learns *why* it was refused (viewed / expired / unavailable).
- A refused request never consumes the view. A rate limit (per user) stops attempts being used to flood the audit log.
- Demo responses carry `Cache-Control: no-store`.
- Demo links must be plain `http(s)` URLs with a real host and no embedded credentials (`https://user:pass@evil.com` is refused), enforced in the API *and* by a database check.
- The freelancer's demo description is shown to that freelancer; the company receives it together with the link.

**Audit trail.** `demo_access_log` records every submit, grant, denial, "already viewed", "expired" and re-issue with the user and IP. It never stores the link. (Admin access to it arrives in Phase 7.)

**Honest limits.** This is platform-level access control. It cannot stop screenshots or screen recording, or the company copying the link once it has been revealed. Re-issuing opens one more view each time by design; the freelancer controls that, and every re-issue is logged and notified. For stronger protection, serve uploaded demo files through one-time tokens instead of external links.

## Hirings, reviews and reports (Phase 6)

| Method | Path | Who | Notes |
|---|---|---|---|
| `GET` | `/api/hirings` | freelancer, company | Your own, newest first, with both parties, the project and any reviews |
| `POST` | `/api/hirings/:id/complete` | the hiring company | ACTIVE only. Completes the hiring **and** the project, notifies the freelancer |
| `POST` | `/api/hirings/:id/cancel` | the hiring company | `{ reason }` (10 to 500 characters). Cancels the hiring **and** the project |
| `POST` | `/api/reviews` | either party | `{ hiringId, rating 1-5, comment 10-500 }`. Only after completion, once per person |
| `GET` | `/api/reviews?userId=` | anyone who may see that profile | |
| `POST` | `/api/reports` | signed-in non-admins | `{ targetType: USER or PROJECT, targetId, reason 20-1000 }`. 10 per hour per user |

**Rules the server enforces**
- Completing and cancelling lock the project first, then the hiring (the same order as accepting a proposal) and read the status only afterwards, so a simultaneous complete and cancel can never both succeed, and the project and hiring can never disagree.
- A review needs a COMPLETED hiring and a participant; the reviewee is always derived (the other party), never sent by the client. One review per person per hiring, even when sent simultaneously. A cancelled hiring cannot be reviewed.
- Ratings on profiles and project cards come straight from the reviews table.
- Reports can only target something the reporter is allowed to see, so the endpoint cannot be used to probe hidden profiles or projects. One open report per reporter per target; every active admin is notified.
- Cancelling a hiring cancels the project and leaves the accepted proposal as the record of who was hired. (Reopening the project for a new hire would be a deliberate product change.)

## Admin (Phase 7)

Everything under `/api/admin` is admin-only. The role check is applied **once to the whole router**, so an endpoint added later cannot be left open by accident; a test sends every endpoint a freelancer, a company and an anonymous caller.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/admin/stats` | Users, projects, open reports, and projects by status |
| `GET` | `/api/admin/users` | Everyone, newest first. Never any password data |
| `POST` | `/api/admin/users/:id/suspend`, `/reinstate` | Suspending deletes every session of that user in the **same transaction**. Admin accounts cannot be suspended. Repeating is harmless and logged once |
| `GET` | `/api/admin/projects` | Every project in every status |
| `GET` | `/api/admin/reports` | Reporter, target name and a link to it |
| `POST` | `/api/admin/reports/:id/resolve` | Records who and when. Repeating is harmless |
| `GET` / `POST` / `DELETE` | `/api/admin/skills` | List with usage counts, add, retire |
| `GET` | `/api/admin/demo-log` | Who submitted, opened, was refused or re-issued each demo (`?demoId=`). Never the link |
| `GET` | `/api/admin/audit-log` | Every moderation action: who, what, when |

**Retiring a skill** is a soft delete: profiles and projects that already have it keep it, but nobody can newly add it. Adding the same name again brings the *same* skill back, so old data lines up again.

**Moderation is traceable.** Suspensions, reinstatements, resolved reports and skill changes are written to `admin_audit_log` in the same transaction as the change, and only when something actually changed (five simultaneous suspensions of one user produce one entry).

**Suspension also hides and blocks the user's content** (see Hardening below).

## Hardening (Phase 8)

**Suspension side effects.** A suspended account's content is hidden and unusable until it is reinstated. Nothing is deleted or closed, so reinstating restores exactly what was there.
- *Company:* its projects leave listings and detail pages (for everyone but admins), stop accepting proposals, and cannot be reported.
- *Freelancer:* their proposals disappear from company lists and counts, cannot be shortlisted, rejected or accepted (they look "not found"), and their demos cannot be opened (the view is not used up).
- A company can still complete or cancel an existing hiring with a freelancer who was suspended, so work can be closed out.

**Found by fuzzing, then fixed.** A generated fuzz test sends garbage to every endpoint as every kind of user and requires: never a 5xx, always `{ message, code }`, no stack traces, SQL or file paths in any body. It found two real bugs, both now fixed and covered by their own tests:
1. A NUL character (`\u0000`) in any text made PostgreSQL error and the user got a 500. Such input is now refused with a `400` at the door, in bodies and query strings, at any depth (and absurd nesting is refused too).
2. A malformed URL such as `/api/profiles/%E0%A4%A` returned a 500. Client errors raised by Express or the body parser are now returned as `4xx`.

**Generated, not hand-maintained.** `test/routeTable.js` reads `app.js` and every `routes.js` to build the list of all 52 routes. From it the tests check that every non-public endpoint rejects an anonymous caller with `401`, and that every state-changing endpoint rejects a cross-site `Origin` with `403`. A new endpoint that forgets authentication fails the suite on its own.

**Also in this phase**
- Every `/api` response is `Cache-Control: no-store` (personal data must not sit in browser or proxy caches).
- A coarse per-IP limit on all of `/api` (600 requests per minute); the health check is exempt so monitors still work.
- Database `statement_timeout` (10 s) and `idle_in_transaction_session_timeout` (30 s): a runaway query or an abandoned transaction cannot hold connections or row locks forever.
- HTTP header and request timeouts, and a crash handler that logs and exits so the supervisor restarts a clean process.
- List endpoints are capped (200, or 500 for admin lists), newest first; tests prove the cap holds with 230 rows present.
- `Set-Cookie` and `Cookie` headers are redacted from logs. `npm audit` reports no known vulnerabilities in production dependencies.

## Production checklist

- Set `NODE_ENV=production`, a random `SESSION_SECRET` of at least 32 characters, `DATABASE_URL`, `CORS_ORIGIN` (the exact frontend origin) and `APP_URL`. Configure `SMTP_*` so password-reset emails are really sent.
- Serve over **HTTPS** only. The session cookie is `Secure` in production, and `trust proxy` is set for **one** proxy hop: adjust it to match your deployment, or client IPs (rate limits, audit log) will be wrong.
- Rate-limit counters are in memory. With more than one server instance, move them to a shared store such as Redis.
- Create the first admin with `scripts/create-admin.js`. Run `npm run migrate` on deploy. Never run `npm run seed` against real data (it refuses in production).
- Back up the database; the audit tables (`admin_audit_log`, `demo_access_log`) are part of your evidence trail.
- Known, accepted trade-offs: registration reveals whether an email is already registered (the UI needs it; it is rate-limited); re-issuing a demo window is unlimited but logged and notified; screenshots and copying of an opened demo cannot be prevented.

## Testing

Tests run against a **real Postgres** because the guarantees above (constraints, transactions) are exactly what a fake cannot prove. On every run the test database is wiped and the migrations are applied **up, down, then up again**.
257 tests cover the schema rules, the seed data (including the skill-match numbers, computed in SQL, agreeing with the frontend), transaction commit/rollback and connection release, the error handler, security headers, environment validation, and all of authentication: sessions, suspension and revocation, CSRF/CORS, password reset (including races), rate limiting and the admin script, then profiles (visibility matrix, partial edits, ownership of portfolio items), skills, and projects (listing filters/sorts/search including SQL-injection and wildcard cases, visibility, validation, edit rules, closing and concurrency), proposals (state machine, ownership, hiring transaction, four kinds of simultaneous-action races), notifications and both dashboards, and the secure demo flow (every refusal path, the exact 24-hour boundary, and simultaneous-access races), plus hirings, reviews and reports (ownership, completion rules, concurrent complete/cancel/review, report visibility) and a final database-wide consistency check, the admin area (role-by-endpoint access matrix, immediate suspension, audit trail, skill lifecycle, races), suspension side effects, and generated security checks (fuzzing, anonymous-access and cross-site matrices, headers, limits).

## Plan

| Phase | Scope | Status |
|---|---|---|
| 0 | Scaffold, config, error handling, health | done |
| 1 | Migrations and seed | done |
| 2 | Auth: register, login, logout, me, forgot/reset password, revocable server-side sessions | done |
| 3 | Profiles, skills, projects (filters, skill-match query, edit rules) | done |
| 4 | Proposals lifecycle, notifications, dashboards | done |
| 5 | Secure demos: atomic one-time access, audit log, re-issue | done |
| 6 | Hirings, reviews, reports | done |
| 7 | Admin endpoints and stats | done |
| 8 | Hardening: suspension side effects, fuzzing, security review | done |
| 9 | Connect the frontend, contract tests, API docs | done (see the root README) |

## Notes for connecting the frontend (Phase 9)

- Serve the API under the same origin as the frontend in development with a Vite proxy (`/api` to `http://localhost:5000`), or set `CORS_ORIGIN` and use cross-origin requests with cookies (the frontend's `apiClient` already sends `credentials: 'include'`).
- The frontend needs one new page, `/reset-password?token=...`, to finish the password-reset flow (it currently has only the request step).
