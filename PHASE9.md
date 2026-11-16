# Phase 9: Hiring communication and work submission

This folder is the Phase 8 project **plus** work submission, company review and a private conversation for every hiring.
The untouched Phase 8 project is next to it in the ZIP as `skillmatch-phase8-backup/`.

> **Read "Verification status" first.** The code was written and checked in a sandbox that had **no PostgreSQL and no network**,
> so the migration and every backend/frontend test were **not executed**. Nothing below claims a test passed. Run the steps in
> "Run the tests" before you trust it.

## What you get

| Area | Behaviour |
|---|---|
| Submit work | The hired freelancer submits a title, optional GitHub repository link, optional live link and notes. Each submission is a new **version**; nothing is ever overwritten. |
| Review | Only the hiring company can **approve** or **request a revision** (explanation required). Approval completes the hiring and the project in the same transaction, so reviews open exactly when work is accepted. |
| Revisions | Requesting a revision notifies the freelancer, who submits version N+1. Earlier versions, with the feedback they received, stay in the history. |
| Conversation | One private thread per hiring, between its two parties only. Timestamps, "Seen/Delivered", unread counts, one notification per burst of messages. |
| UI | `My Hirings` / `Hirings` list links to a new hiring page (`/freelancer/hirings/:id`, `/company/hirings/:id`) with the work area, submission history and conversation. |

**Not included: file attachments.** This project has no upload infrastructure (its README lists uploads as out of scope), and you asked
to reuse one "if available". I did not build an unreviewed, untestable upload pipeline into a security-hardened app. Links and notes
cover the deliverable for now. See "Known limitations".

## Workflow and status rules

`hirings.status` (existing) is unchanged: `ACTIVE`, `COMPLETED`, `CANCELLED`. A new `hirings.work_status` tracks the work:

| work_status | Meaning | Who can move it | Next |
|---|---|---|---|
| `IN_PROGRESS` (default, also for all existing hirings) | nothing submitted yet | freelancer submits | `SUBMITTED` |
| `SUBMITTED` | a version waits for review | company approves / requests revision | `APPROVED` / `REVISION_REQUESTED` |
| `REVISION_REQUESTED` | company asked for changes | freelancer resubmits | `SUBMITTED` |
| `APPROVED` | accepted; hiring is `COMPLETED` | none | none |

* All submission and review actions require `hirings.status = ACTIVE`. Everything else is `409 INVALID_STATE`.
* Submitting never completes anything. Only approval (or the existing "Mark as completed" button) does.
* **Existing rule kept:** the company can still complete a hiring directly. If a submission was waiting, completing it counts as approving it.
* Cancelling keeps all history; a submission waiting at that moment can no longer be reviewed.
* The database enforces the important parts too: only one open submission per hiring, `APPROVED` only on a `COMPLETED` hiring, only the hired
  freelancer can author and only the hiring company can review a submission, content can never be edited, reviewed rows are frozen, nothing is deleted.

## Database changes (`backend/migrations/005_work_submission.sql`)

Additive and reversible. No existing rows are modified, deleted or reseeded.

* New enums: `work_status`, `submission_status`; four new `notification_type` values: `WORK_SUBMITTED`, `REVISION_REQUESTED`, `WORK_APPROVED`, `MESSAGE`.
* `hirings`: new column `work_status` (default `IN_PROGRESS`), a CHECK (`APPROVED` ⇒ `COMPLETED`), and two UNIQUE constraints `(id, freelancer_id)` / `(id, company_id)` used as foreign-key targets.
* New table `work_submissions` (history, versions, links, feedback, immutability trigger).
* New table `hiring_messages` (ordered by an identity `seq`, `read_at`, sender-must-be-a-party trigger).
* **Down migration** drops all of the above and rebuilds `notification_type` without the new values. It deletes **only** notifications of those four new types, because Postgres cannot remove enum values in place.

## Setup and migration

```bash
# Back up first (always sensible before any migration)
pg_dump "$DATABASE_URL" > skillmatch-before-phase9.sql

npm run setup            # nothing new to install: no new dependencies were added
docker compose up -d     # PostgreSQL (if you use the bundled one)
npm run db:migrate       # applies 005 to your development database; additive, keeps your data
```

> Do **not** run `npm run db:seed` on a database you want to keep: the seed script empties the tables first (as in Phase 8).
> Roll back with `npm --prefix backend run migrate:down` (reverts one migration: 005).

### Run the tests (test database only)

`backend/.env` must define `TEST_DATABASE_URL` pointing at a throwaway database whose name contains `test` (default: `skillmatch_test`).
The suite refuses to run otherwise, wipes **only** that database, and proves `up → down → up` for every migration (including 005).

```bash
npm --prefix backend test                              # all backend suites, including test/work-submission.test.js
npm --prefix frontend test                             # frontend + contract + integration (also uses the test database)
npm --prefix backend test -- test/work-submission.test.js      # just the new file
```

## API reference

All routes live under `/api/hirings`. Every route needs a signed-in session (`401 UNAUTHENTICATED`), a CSRF-safe `Origin` for writes, and returns errors as `{ message, code, fields? }`.
"Party" = the hired freelancer or the hiring company. **Anyone else, including other companies, other freelancers and admins, gets `404 NOT_FOUND`** (admins get `403` from the role check), so another tenant's hiring is never revealed.

| Method and path | Role | Body | Success | Notable errors |
|---|---|---|---|---|
| `GET /api/hirings` | freelancer, company | | list of hirings, each now with `workStatus` and `unreadMessages` | |
| `GET /api/hirings/:id` | freelancer, company (party) | | one hiring (same shape) | 404 |
| `GET /api/hirings/:id/submissions` | party | | array of submissions, newest version first | 404 |
| `POST /api/hirings/:id/submissions` | **freelancer** (party) | `{ title, repoUrl?, liveUrl?, description? }` | `201` submission | 400 `VALIDATION` (+`fields`), 409 `INVALID_STATE`, 403, 404 |
| `POST /api/hirings/:id/submissions/:submissionId/approve` | **company** (party) | none | `{ submission, hiring }` | 409 `INVALID_STATE`, 404 |
| `POST /api/hirings/:id/submissions/:submissionId/request-revision` | **company** (party) | `{ feedback }` (10–1000 chars) | `{ submission, hiring }` | 400, 409, 404 |
| `GET /api/hirings/:id/messages` | party | | latest 200 messages, oldest first | 404 |
| `POST /api/hirings/:id/messages` | party | `{ body }` (1–2000 chars) | `201` message | 400, 409 `CONVERSATION_CLOSED`, 429 `RATE_LIMITED` (30/min/user) |
| `POST /api/hirings/:id/messages/read` | party | none | `{ ok: true, marked: n }` | 404 |

Existing `POST /api/hirings/:id/complete` and `/cancel` are unchanged apart from the waiting-submission rule above.

**Submission input rules (server-enforced, then enforced again by database CHECK constraints)**

* `title`: 3–120 characters. `description`: up to 5000. Unknown fields (`status`, `version`, `hiringId`, `submittedBy`, …) are rejected.
* `repoUrl`: `https://github.com/<owner>/<repo>[/…]` only (`www.` allowed). No credentials, no port, no look-alike hosts. Stored without query string or fragment.
* `liveUrl`: `http(s)` with a real dotted host and no embedded credentials, ≤ 500 characters.
* At least one deliverable: a link, **or** notes of 20+ characters. Blank strings count as "no link".

**Submission object:** `{ id, hiringId, version, title, description, repoUrl, liveUrl, status (SUBMITTED|APPROVED|REVISION_REQUESTED), feedback, submittedBy: { id, name }, submittedAt, reviewedAt }`
**Message object:** `{ id, hiringId, senderId, senderName, body, createdAt, readAt }` (no email addresses or other contact details).

**Notifications created** (in the same transaction as the change): `WORK_SUBMITTED` → company; `REVISION_REQUESTED` and `WORK_APPROVED` → freelancer; `MESSAGE` → the other party (at most one *unread* per conversation, cleared when they open it). Links point at `/company/hirings/:id` or `/freelancer/hirings/:id`.

**Security notes:** message and submission text is always rendered as plain text (never HTML, links are not auto-created); external links open with `rel="noopener noreferrer"` and only if plain http(s); a cancelled hiring or a suspended counterpart closes the conversation for writing without revealing which; submit/approve/revise lock the project then the hiring (the order used elsewhere), so concurrent actions serialise instead of deadlocking.

## Demo accounts (password for all: `Password@123`, after `npm run db:seed` on a *fresh* database)

| Role | Email | Use |
|---|---|---|
| Freelancer | `kunal@skillmatch.dev` | already has an ACTIVE hiring ("Billing Microservice") |
| Company | `projects@innovatelabs.dev` | the company on that hiring |
| Freelancer | `aarav@skillmatch.dev` | create a fresh hiring with TechNova (steps below) |
| Company | `hr@technova.dev` | |
| Other company / freelancer | `team@pixelcraft.dev`, `rohan@skillmatch.dev` | outsiders for the access checks |
| Admin | `admin@skillmatch.dev` | must be refused everywhere here |

Run the real backend (`npm run dev:api` and `npm run dev:web`). The mock mode (`npm run dev`) deliberately has no work or messaging endpoints and shows an explanatory message.

## Manual testing checklist

Use two browser profiles (or one normal and one private window).

**Happy path** (Kunal + Innovate Labs, or create a hiring: TechNova posts a project → Aarav proposes → TechNova shortlists and accepts)
- [ ] Freelancer: *My hirings* → project → page shows **Submit your work**; list shows the **Submit work** button.
- [ ] Submit with only a title: validation error under *Completion notes*. Add a GitHub link: succeeds, banner says waiting for review.
- [ ] Company sees a *new notification* and **Review work**; the page shows the version with working **Repository** / **Live demo** links.
- [ ] **Request revision** with fewer than 10 characters: blocked. With a real explanation: freelancer is notified and sees the feedback above the form, pre-filled.
- [ ] Freelancer submits again: history shows **Version 2** above **Version 1**, with version 1's feedback intact.
- [ ] Company **Approve work**: hiring becomes *Completed*, freelancer notified, both can now leave reviews from the list.
- [ ] After approval no further submit / approve / revise is possible.

**Conversation**
- [ ] Send messages both ways; timestamps show; the sender sees *Delivered* then *Seen* after the other side opens the page.
- [ ] The other side sees "N new messages" on the hirings list, and one notification only, however many messages arrive.
- [ ] Messages containing `<script>` or HTML appear as literal text.
- [ ] Cancel the hiring (as company): the conversation stays readable but cannot be written to.

**Access control**
- [ ] As `team@pixelcraft.dev`, `rohan@skillmatch.dev` and `admin@skillmatch.dev`: opening another party's hiring URL, its submissions or its messages is refused (not found / forbidden).
- [ ] Freelancer cannot see Approve/Request buttons; company cannot see the submit form.
- [ ] Existing flows still work: *Mark as Completed*, *Cancel hiring*, reviews, demos, proposals, profile pages.

**Edge cases**
- [ ] Double-click **Approve** or **Submit**: only one takes effect.
- [ ] Open the same hiring in two windows, approve in one, then try *Request revision* in the other: a clear "already reviewed" message and the page refreshes.

## Files

**New (backend):** `migrations/005_work_submission.sql`, `src/modules/submissions/{schema,service}.js`, `src/modules/messages/{schema,service}.js`, `src/modules/hirings/access.js`, `test/work-submission.test.js`
**Changed (backend):** `src/app.js`, `src/middleware/rateLimit.js` (message limiter), `src/modules/hirings/{routes,service,queries}.js`, `test/schema.test.js` and `test/hardening.test.js` (extra expected tables/routes, additive only)
**New (frontend):** `src/pages/shared/HiringDetail.jsx`, `src/components/work/{SubmitWorkForm,SubmissionCard,RequestRevisionModal,HiringChat}.jsx`, `src/services/{submissionService,messageService}.js`
**Changed (frontend):** `src/components/hiring/HiringsTable.jsx`, `src/routes/AppRoutes.jsx`, `src/pages/shared/Notifications.jsx`, `src/services/{apiClient,hiringService}.js`, `src/utils/{ApiError,constants,formatters,validators}.js`
No dependencies were added. The mock server and seed data are untouched.

## Verification status (honest)

**Checked in the build sandbox**

| Check | Result |
|---|---|
| Syntax of every backend `.js` file (`node --check`) | passed |
| Hardening suite's route discovery, run against the new source | finds **60** routes (was 52), no duplicates, all new routes included |
| Submission, revision and message validation: 54 cases (the same inputs the tests use) executed against the schemas | all behaved as the tests expect, **but on zod 3.23** (only version available here); the project uses **zod 4**, so this is indicative, not proof |
| Database link CHECK regexes cross-checked in JavaScript | normalised links pass, attack strings fail (Postgres's regex engine was not available) |
| Every new/changed frontend file parsed with esbuild; all relative and named imports resolve | passed |

**NOT verified: please run these**

* Migration `005` on PostgreSQL (up, down, up), including the enum rebuild in the down migration.
* **All backend tests**, new (`work-submission.test.js`, 45 cases in 8 groups covering the list you asked for) **and existing**. I changed `hirings` `complete()`, `listMine`, `loadHirings`, `rateLimit` and `app.js`, so the existing hirings/hardening/schema suites must be re-run too.
* Frontend tests, contract test, `npm run build`, and the UI in a real browser. Three icons (`MessageSquare`, `ClipboardCheck`, `GitBranch`) are not used elsewhere in the project; a build will confirm them.
* No frontend automated tests were written for the new pages; they are covered only by the manual checklist above.

If a test fails, it is most likely a typo-level problem in a new test or a SQL detail I could not execute. Send me the failure output and I will fix it.

## Test run 1 findings and fix (read this if you saw 9 failures)

First run against PostgreSQL: 300 tests, 291 passed, 9 failed, all in `work-submission.test.js`. **One root cause, no product bug found.**

* **Cause:** admin suspension deletes every session of the suspended user in the same transaction (existing, intended, and tested in `suspension.test.js`). The suspended user's next request is therefore "not logged in" (`401 UNAUTHENTICATED`); `403 SUSPENDED` only appears when a status is changed directly in the database while the session survives. My test asserted `403` after an *admin* suspension, so it failed, aborted before its `reinstate` line, and left the shared seed freelancer `aarav` suspended.
* **Cascade:** with `aarav` suspended, his sessions were gone (`401`, failures 1, 3, 8), his login was refused (`403`, failure 2), and the platform treats a suspended freelancer's proposals as not found, so `freshHiring()` could not create a hiring and every later test called `/api/hirings/undefined/...` (`404`, failures 4, 5, 6, 7, 9).
* **What this means:** failures 3-9 never exercised the submission, review or messaging logic with valid data, so they told us nothing about concurrency. They are the first real test of it.
* **Fix (tests only; production code unchanged):** suspension tests now use a dedicated freelancer and always restore in `finally`; the test helper fails loudly with the real cause; the 401 (admin suspend) and 403 (live session) paths each have an explicit regression test; the rate-limit test also proves per-user isolation, unlimited reads and that refused messages are not stored. Re-run the suite to confirm.

## Known limitations

* **No file attachments** (no upload infrastructure exists). Natural next step: add authenticated uploads with size/type/magic-byte checks and private storage, then attach files to `work_submissions`.
* Conversation updates by polling every 15 s (no websockets); only the latest 200 messages are shown.
* Messages cannot be edited or deleted; admins have no view of private conversations (moderation tooling for them is future work).
* Cancelling a hiring leaves a waiting submission in `SUBMITTED` (kept as history, no longer reviewable).
* A legacy hiring completed directly keeps `work_status = IN_PROGRESS` (nothing was ever submitted for it).
* Links are shown, never fetched or previewed by the server; the company opens them at their own judgement.
* Rate limiting is in memory like the rest of the app (single-instance).
