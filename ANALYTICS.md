# Admin reports and analytics

Admin console → **Analytics** (`/admin/analytics`). Live statistics, charts, filters and a CSV export, calculated by the existing Express API from the existing PostgreSQL tables.

> **Verification status: read "What was and was not verified" at the end first.** This was built in a sandbox with no PostgreSQL, so the SQL has not been executed against a database and no test suite has been run.

## What already existed, and what this extends

There was **no analytics section** to enhance. `/admin/reports` is the *moderation inbox* (abuse reports users file about profiles and projects), and the admin Dashboard is a small snapshot (user counts, projects by status). Nothing was replaced or changed in either.

This adds, inside the existing admin module:

* the page `Analytics` (new sidebar entry, lazy-loaded like the Dashboard so charts only load for admins);
* two read-only endpoints on the existing admin router, so the existing `requireAuth` + `requireRole('ADMIN')` guard covers them automatically;
* nothing else: **no migration, no new dependency, no new table, no stored or hard-coded numbers**. The mock server and seed data are untouched.

## Every metric, and exactly how it is calculated

| Metric you asked for | Definition | Source |
|---|---|---|
| Total projects posted | projects created in the period | `projects.created_at` |
| Active projects | `OPEN` + `IN_PROGRESS` (same definition as the existing Dashboard) | `projects.status` |
| Projects in progress | status `IN_PROGRESS` | `projects.status` |
| Completed / cancelled projects | status `COMPLETED` / `CANCELLED` | `projects.status` |
| Projects posted monthly | count per calendar month (UTC), empty months shown as 0 | `projects.created_at` |
| Total hirings | hirings that started in the period | `hirings.start_date` |
| Successful hires | hirings with status `COMPLETED` | `hirings.status` |
| Ongoing / cancelled hirings | status `ACTIVE` / `CANCELLED` | `hirings.status` |
| **Hiring success rate** | completed ÷ (completed + cancelled). Ongoing hirings are not failures. **No finished hirings → "–", not 0%** | `hirings.status` |
| **Average time to hire** | `hirings.start_date − projects.created_at`, averaged. A hiring dated *before* its own project (bad data) is left out of the average and reported ("1 left out") | `hirings`, `projects` |
| Total freelancers / companies | all registered accounts of that role (all time) | `users` |
| Active / suspended | **current** status (a snapshot of now) | `users.status` |
| Registered in period | accounts created in the period | `users.created_at` |
| Top 10 freelancers by completed projects | completed hirings per freelancer (a completed hiring is a completed project: one live hiring per project) | `hirings` |
| Most demanded skills | number of projects (posted in the period) that require the skill, top 10 | `project_skills` |
| **Average freelancer rating** | mean of every rating received by a freelancer, in the period. Ratings of companies are excluded. No reviews → "–" | `reviews` |
| Top companies by projects posted / by successful hirings | counts per company, top 10 (suspended companies are flagged, not hidden) | `projects`, `hirings` |
| Total / accepted / rejected / pending proposals | proposals submitted in the period, by status. "Rejected" includes proposals closed automatically when another proposal on the project was accepted | `proposals` |
| **Proposal acceptance rate** | accepted ÷ all submitted. No proposals → "–" | `proposals` |

Two extra proposal statuses exist in the schema (`SHORTLISTED`, `WITHDRAWN`); they are shown separately so the parts always add up to the total.

## How the filters work

* **Date range** (7 days, 30 days, 3 months, 1 year, custom; plus **All time**, the default, which I added because seeded and older data would otherwise look empty) selects records by **when they were created**: project posted, proposal submitted, hiring started, review written, account registered. Each record is counted with its **current** status. Presets reach back from now; a custom range is whole days in UTC, both ends included. Custom ranges must be real dates between 2000 and 2100, at most 5 years long.
* **Project status** filters projects *and* the proposals, hirings, skills and reviews that belong to those projects.
* **Hiring status** filters hirings, the rankings built from them, and the reviews of those hirings.
* Filters combine (they only narrow). Account totals are not affected by status filters (accounts have no project or hiring status).
* Months on charts are UTC calendar months, capped at the most recent 60 (the page says so when it applies).

## Metrics that cannot be reliably calculated (shown on the page, not faked)

| Not shown | Why |
|---|---|
| Cancelled hirings by **cancellation date**; projects completed or cancelled **per month** | The database stores *why* a hiring was cancelled but not *when*, and a project stores only its current status. The charts therefore group hirings by the month they **started** (split by current status) and projects by the month they were **posted**. |
| Active / suspended accounts **for a past period** | An account stores only its current status. The numbers are a snapshot of now; the date range only changes "registered in period". |
| Time from **proposal to acceptance** | A proposal does not record when it was accepted (`updated_at` changes on any edit). "Average time to hire" is measured from project posting to hiring start instead. |

## API

Both are `GET`, admin only (`401` signed out, `403` for freelancers and companies), never cached (`Cache-Control: no-store`).

`GET /api/admin/analytics` and `GET /api/admin/analytics/export` take the same query:

| Parameter | Values |
|---|---|
| `range` | `7d`, `30d`, `3m`, `1y`, `all` (default), `custom` |
| `from`, `to` | `YYYY-MM-DD`, **required with and only allowed with** `custom` |
| `projectStatus` | `OPEN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |
| `hiringStatus` | `ACTIVE`, `COMPLETED`, `CANCELLED` |

Anything else (unknown or repeated parameters, bad dates, reversed or over-long ranges) is `400 VALIDATION` with `fields`; never ignored, never a 500.

* **JSON**: `{ generatedAt, filters, monthsTruncated, projects, hirings, proposals, freelancers, companies, skills, unavailable }`. Rates are percentages with one decimal or `null` when they cannot be calculated.
* **CSV**: one long table with columns `Section,Metric,Group,Value`, UTF-8 with a BOM (so Excel reads names correctly), built from the **same report object** as the JSON so the two cannot disagree. Unknown values are blank, never `0`. Names that start with `=`, `+`, `-` or `@` get a leading apostrophe so a company called `=HYPERLINK(...)` cannot run as a spreadsheet formula.

**Consistency:** all queries of one report run inside a single read-only, repeatable-read transaction, so every figure describes the same instant (totals always add up even while data is changing).

## Frontend

* `Analytics` page: filters, 9 key-metric cards (each shows its working, e.g. "3 of 4 finished hirings were completed"), four trend charts (line, donut, stacked bar, horizontal bar), three Top-5 ranking charts, detailed statistics, Top-10 tables, "how it is calculated" and "not available" panels.
* Loading skeletons; a dimmed (not blank) report while a new filter loads; empty-period messages instead of empty charts; a clear error with retry; with the mock API (`npm run dev`) a plain explanation that the real backend is needed.
* **Stale-response protection.** Every report request gets a number from a counter that only ever goes up and is never reset. A request may change what is on screen (the report, the loading state or the error message) only if it is still the newest request **and** the page is still open. An older answer is ignored, and so is an older *failure*, so clicking filters quickly can never show a superseded report or an error for a superseded request. The newest request's own failure is still shown, with the previous report kept on screen. Answers or failures that arrive after leaving the page are dropped without any state update. (The first version reset its counter on every filter change, which defeated the check; found by the test suite and fixed in the second round.)
* "Apply range" and "Export CSV" are disabled until the first report has loaded; the date presets and status lists are not (changing them simply supersedes the first request).
* Every chart has a text description for screen readers and its figures listed as text; names render as plain text.

## Tests added

| File | What it covers |
|---|---|
| `backend/test/analytics.test.js` | A committed, hand-computed fixture in 2001 (exact numbers for every metric); range edges (record exactly on the start counts, exactly on the exclusive end does not); a hiring whose project is outside the range; a hiring dated before its project; filters (project, hiring, both); empty ranges (nulls, zero-filled months); splitting a range adds back up; presets are nested; all-time vs independently written SQL; 60-month cap; CSV structure, same numbers as JSON, formula and quote escaping; admin-only on both endpoints; 19 malformed filters rejected on both endpoints; read-only (no rows or audit entries written); simultaneous requests; consistent snapshot while rows are being inserted |
| `backend/test/hardening.test.js` | the two new routes added to the expected-route list; the suite's generated checks (401/403, garbage query strings never a 5xx, no leaked internals) apply to them automatically |
| `frontend/test/analytics-utils.test.js` | number/percent/duration formatting, filter validation, query building |
| `frontend/test/analytics-ui.test.jsx` | filter bar behaviour, report rendering (numbers, accessible descriptions, empty period, loading, plain-text names), page behaviour (requests, errors, retry, export), and the stale-response protection: answers arriving out of order (newest first, oldest first, three quick changes), an older request that fails, the newest request that fails, leaving the page mid-request |
| `frontend/test/integration/analytics.test.jsx` | the real React app against the real Express API and test database: totals equal plain SQL counts, filters change numbers, custom range validation, empty period, CSV hand-off, non-admin refused. Tests that interact right after opening the page first wait for the first report (the "Showing ..." line appears only once a report has been received), and wait for the applied-filters line to change instead of looking for buttons that are always on screen |
| `frontend/test/integration/journeys-2.test.jsx` (existing test, adjusted) | the admin dashboard test now loads the lazily-loaded dashboard once in a `beforeAll`, and its "Total users" check prints what the page was showing if it fails; the requirement itself is unchanged |

Run (test database only; the suites refuse any database whose name does not contain `test`):

```bash
npm --prefix backend test                        # all backend suites
npm --prefix backend test -- test/analytics.test.js
npm --prefix frontend test                       # frontend + integration
npm --prefix frontend run build                  # production build
```

## Files

**New:** `backend/src/modules/admin/analytics.js`, `analyticsCsv.js` · `backend/test/analytics.test.js` · `frontend/src/pages/admin/Analytics.jsx`, `frontend/src/components/analytics/{AnalyticsReport,FilterBar}.jsx`, `charts.jsx` · `frontend/src/utils/{analytics,download}.js` · `frontend/test/analytics-utils.test.js`, `analytics-ui.test.jsx`, `integration/analytics.test.jsx` · this file.
**Changed (small, additive):** `backend/src/modules/admin/routes.js` (2 routes), `schema.js` (query validation), `backend/test/hardening.test.js` (expected-route list) · `frontend/src/routes/AppRoutes.jsx` (route), `utils/constants.js` (nav item), `services/apiClient.js` (`api.text`), `services/adminService.js` (2 calls), `test/integration/harness.jsx` (fake fetch also answers `.text()`), `test/integration/journeys-2.test.jsx` (dashboard test loads the lazy page first) · `README.md` (pointer).

## What was and was not verified

### Reported by the project owner after the first test run
Backend: all 335 tests passed, including all 33 analytics tests against real PostgreSQL (so the SQL is verified). Frontend: 61 of 65 passed; the 4 failures are what the second round addresses (see below).

### Second round (stale responses, test synchronisation, dashboard timeout)

| Failure | Cause | Resolution |
|---|---|---|
| `analytics-ui` stale-response test | **Application bug.** The effect's cleanup reset the request counter on every filter change, so two quick requests shared one id and the older answer could overwrite the newer | `Analytics.jsx`: counter never reset; a separate mounted flag handles leaving the page; both success and failure of an older request are ignored |
| `integration/analytics` date/status filters | The same bug, exposed by a test step that raced two requests (it looked for the always-visible "All time" button instead of waiting for the new report) | App fix above; the test now waits for the applied-filters line to read "All time" before changing the status |
| `integration/analytics` custom range | **Test timing.** "Key metrics" is on screen before the first report arrives; "Apply range" is disabled until then, so the click was ignored | The test waits for the first report (the "Showing ..." line) and asserts the button is enabled |
| `integration/journeys-2` dashboard | **Not related to analytics**: nothing on the dashboard's code path changed (the test, the config and the dashboard are identical to the original project). No application bug was found. The most likely cause is the cold load of the lazily-loaded chart bundle inside the harness's 10-second wait, but this is **not confirmed** | Test-only: the bundle is loaded once under the 60-second hook timeout, and the assertion keeps its strength but now reports what the page showed if it fails |

**Executed in the build sandbox (second round):** the real `Analytics` page, `FilterBar`, `AnalyticsReport` and toast context were bundled with real React and driven in a real browser (Chromium) with a fake data service whose answers the test controls. Ten scenarios were run against the previously delivered code and against the fixed code:

* before the fix 4 failed (stale answer overwrites the newest; the "All time, then status" race; an older request's failure puts the page into an error state; three quick changes answered out of order); after the fix all 10 pass;
* also passing before and after: the newest request's failure is still reported with the previous report kept, leaving the page mid-request causes no console errors or state updates, the app's StrictMode double-load ends on the newest answer, ordinary sequential filtering, and the first-load state (heading visible, no "Showing ..." line, "Apply range" disabled and its click ignored, then enabled once the report arrives).

Only recharts, lucide-react, react-router-dom and clsx were replaced by stand-ins in that run (they are not installed in the sandbox), as was the data service.

**Not executed (please run):**

* The vitest suites, frontend and backend, after these changes (`npm --prefix frontend test`): the adjusted integration tests, the new `analytics-ui` tests and the `journeys-2` change are written and syntax-checked but were not run, because the sandbox has no vitest, jsdom or PostgreSQL.
* `npm --prefix frontend run build`, and the page in your own browser (real Recharts rendering, the file download).
* Whether the dashboard fix cures that failure. If `journeys-2` still fails, the failure message will now include the page contents; send it to me. Running that file on its own, and in the Phase 9 copy, separates a test-order effect from something else.

### Earlier verification (first round, still valid)
* The real `analytics.js`, `analyticsCsv.js` and the filter schema were run against a fake database client (placeholders and parameters of all 13 statements, month zero-filling, status pivot, rates, null handling, 60-month cap, preset dates, empty data, CSV formula neutralising). The schema ran on zod 3.23; the project uses zod 4.
* The route discovery used by the hardening suite finds both routes (62 in total).
* The real React components were server-rendered (figures, accessible chart descriptions, empty period, loading and refetching states, filter bar states).
* Formatting and validation helpers were executed directly; all changed files parse and every import resolves.

## Known limitations

* Each report runs about 13 aggregate queries over whole tables. Fine at this scale; if the tables grow to millions of rows, add indexes on the `created_at` / `start_date` columns (deliberately not done here, to avoid a migration).
* Rankings and rates use "records created in the period, with their status today". A recently started cohort will naturally look less complete than an old one.
* "3 months" and "1 year" count back from the current moment by calendar months/years. At a month end this can roll over (31 July minus 3 months lands on 1 May, because 31 April does not exist), so the window can be a day or two shorter than expected.
* Exports are not written to the admin audit log (the log's action list would need a migration). They contain names, never email addresses.
* Charts are drawn with Recharts' defaults; colours are not the only signal (every series has a text label and figures).
