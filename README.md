# SkillMatch

> **Admin analytics:** the admin console has a new **Analytics** page (live statistics, charts, filters, CSV export). Metric definitions, API, tests and an honest verification status: see [`ANALYTICS.md`](ANALYTICS.md).

> **Phase 9** adds work submission, company review and a private conversation per hiring. Setup, API reference, demo accounts, manual checklist and honest verification status: see [`PHASE9.md`](PHASE9.md).

A freelancing platform that connects **companies** and **freelancers** by skills, with **secure, single-use demo access**.
A complete full-stack project: a React frontend, an Express + PostgreSQL backend, and a test suite that runs the real app against the real backend.

```
frontend/   React 19 + Vite + Tailwind + React Router       (the website)
backend/    Express 5 + PostgreSQL (plain SQL, migrations)   (the API: sessions, rules, audit logs)
docker-compose.yml   PostgreSQL 16 for development
```

## What it does

| | Freelancer | Company | Admin |
|---|---|---|---|
| | Profile, skills, portfolio, reviews | Company profile, post/edit/close projects | Dashboard and charts |
| | Browse projects ranked by **skill match %** | Review proposals ranked by fit | Suspend / reinstate users (instant) |
| | One proposal per project | Shortlist, reject, **accept and hire** | Resolve user reports |
| | Submit a **demo** once shortlisted | **Open the demo once** (24-hour window) | Manage skills, view audit logs |
| | Track hirings, review the company | Complete / cancel hirings, review freelancers | |

Everyone gets in-app notifications with a live unread badge, and can report a profile or project to the admins.

**Secure demo access** is the signature feature. A freelancer submits a demo link; the company that owns the project can open it **once**, within **24 hours**, after a confirmation step. Opening is a single atomic database statement (owner + unused + unexpired are checked and consumed together), so even 20 simultaneous requests yield exactly one success. The link is never in any list, detail, notification or log. This is platform-level access control: it cannot stop screenshots, screen recording, or someone copying the link once it has been revealed (the UI says so).

## Run it

You need **Node 20+** (and Docker, or any PostgreSQL 13+, for the real backend).

### Option 1: frontend only (no database, no backend)
```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```
The app runs on an in-browser mock API (data lives in your browser; *profile menu → Reset demo data* restores it).

### Option 2: the real thing
```bash
npm run setup                      # installs backend and frontend dependencies
docker compose up -d               # PostgreSQL (also creates a throwaway "skillmatch_test" database)
cp backend/.env.example backend/.env          # Windows PowerShell: Copy-Item backend\.env.example backend\.env
npm run db:migrate                 # create the tables
npm run db:seed                    # sample data (same people and projects as the mock)
npm run dev:api                    # terminal 1: API on http://localhost:5000
npm run dev:web                    # terminal 2: website on http://localhost:5173 (proxies /api to the API)
```
Open http://localhost:5173. The browser only ever talks to one origin: Vite forwards `/api` to Express, so the session cookie is first-party and there is nothing to configure for CORS.

**Demo logins** (password for all: `Password@123`): `aarav@skillmatch.dev` (freelancer, has a live demo waiting), `hr@technova.dev` (company), `admin@skillmatch.dev` (admin). More in `backend/README.md`. Password-reset emails are printed in the API terminal unless you set `SMTP_*`.

Create your own admin with: `cd backend && node scripts/create-admin.js --email you@example.com --name "Your Name"`.

## Tests

Three layers, all run against a **real PostgreSQL** (a throwaway database whose name contains "test"; it is wiped on every run):

```bash
# 1. in backend/.env set  TEST_DATABASE_URL=postgres://skillmatch:skillmatch@localhost:5432/skillmatch_test
npm test                           # backend suite, then the full-stack suite
```

| Suite | What it proves |
|---|---|
| **Backend** (`backend/test`, 257 tests) | Every endpoint and rule; schema constraints; concurrency (simultaneous submits, accepts, demo opens, suspensions); security (CSRF, fuzzing of all routes, access matrices generated from the source) |
| **End-to-end** (`frontend/test/integration`, 24 tests) | The real React app in a simulated browser against the real Express + PostgreSQL stack: sign-in and sessions, a project from posting to demo to hiring to reviews between two users, the admin console, password reset, demo states |
| **Contract** (`frontend/test/contract`, 4 tests) | The same ~70-step scenario is run against the frontend's mock API and the real API. The real API must contain every field the mock provides, with the same types and the same error codes. The 8 deliberate differences (for example, never revealing other users' emails) are listed explicitly, and a check proves the frontend never reads them |

Throughout development, the important tests were validated by **deliberately breaking the code** and confirming the tests failed.

### What was and was not verified
- Verified automatically: everything in the table above, plus a live run of the real Express and Vite servers driven with `curl` (login through the proxy, first-party HttpOnly cookie, CSRF refusal, no-store caching, logout).
- **Not verified:** how the pages *look* in a real browser at phone, tablet and desktop widths (layouts were reviewed from the code and a lint/axe accessibility scan passes, but nobody has viewed them); real email delivery (SMTP); load and performance at scale; deployment on your own infrastructure.

## Deploying (outline)

1. Build the site: `npm run build` creates `frontend/dist`.
2. Serve `frontend/dist` and the API from **one origin** behind HTTPS, for example with nginx:
```nginx
server {
  listen 443 ssl;  server_name skillmatch.example.com;
  root /srv/skillmatch/frontend/dist;
  location /api/ { proxy_pass http://127.0.0.1:5000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }
  location /     { try_files $uri /index.html; }
}
```
3. Backend environment: `NODE_ENV=production`, a random `SESSION_SECRET` (32+ characters), `DATABASE_URL`, `CORS_ORIGIN` and `APP_URL` set to the site's address, `SMTP_*` for real email. Run `npm run migrate` on every deploy and keep the process under a supervisor (systemd, pm2, Docker).
4. Read the **Production checklist** in `backend/README.md` (one proxy hop for `trust proxy`, shared rate-limit store if you run several instances, backups).

## Project history and decisions
The original specification was refined during the build; the decisions (accept only shortlisted proposals, a withdraw action, "close project" means cancelled, a 24-hour demo window that starts at submission with re-issue, user reports for the admin, suspension hiding the user's content) are recorded in `frontend/README.md` and `backend/README.md`. Out of scope: file uploads (avatars, logos, portfolio images, demo files), messaging between users, payments or escrow, and a freelancer directory.
