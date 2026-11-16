# SkillMatch

A freelancing platform that connects **companies** and **freelancers** by skills, with **secure, single-use demo access**.
This repository is the complete **frontend** (React + Vite + Tailwind). There is no backend yet: a mock API layer stands in for the
future Node.js + Express + PostgreSQL service and can be swapped out without touching the UI.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

Sign in with a demo account (password for all: `Password@123`). On the login page, buttons fill these in for you.

| Role | Email | Notes |
|---|---|---|
| Freelancer | `aarav@skillmatch.dev` | Has a shortlisted proposal with a live demo, a completed project, reviews. Also `rohan@`, `priya@`, `kunal@skillmatch.dev` |
| Company | `hr@technova.dev` | Has proposals to review. Also `team@pixelcraft.dev`, `projects@innovatelabs.dev` |
| Admin | `admin@skillmatch.dev` | Seeded only. There is no admin registration |

Data is kept in your browser (`localStorage`). Use **profile menu → Reset demo data** to restore the original sample data (handy before a presentation).

Seed data deliberately starts each demo state in a different place: one demo is *available* (about 8 hours left), one is *viewed*, one is *expired*.

## What is included

- **Public:** landing page, login, register (freelancer or company), forgot password.
- **Freelancer:** dashboard, profile and portfolio (add/remove), project discovery (search, skill, budget and deadline filters, sorting, skill-match %), project details, proposal form (one per project), proposals list and details, withdraw, demo submission and re-issue, hirings, reviews.
- **Company:** dashboard, company profile, project create/edit/close, proposal review (shortlist, reject, accept and hire), proposals inbox, freelancer profile view, secure demo viewing, hirings, mark as completed, cancel hiring, reviews.
- **Admin:** dashboard with chart, users (suspend/reinstate), projects, reports (resolve), skills (add/remove with usage counts).
- **Everyone:** notifications with live unread badge, report button on profiles and projects.

## Secure demo access

A freelancer submits a demo link for a shortlisted proposal. The company that owns the project can open it:

1. only the owning company can open it,
2. **once**,
3. within **24 hours of submission** (the window starts when the demo is submitted),
4. after a confirmation step ("This will use your one-time view"), so a misclick or refresh doesn't burn the only view.

The UI shows *Demo available / Demo expires in N hours / Demo viewed / Demo expired / Access denied*. The demo URL is returned **only** by `POST /api/demos/:id/access`; no list or detail payload ever contains it.
If a company misses the window, the freelancer can issue a new one.

**What this does not do:** it cannot stop screenshots, screen recording, or someone copying the link after it has been revealed. It is platform-level access control, and the UI says so. For stronger protection, serve uploaded demo files through one-time tokens from the backend instead of external links.

## Architecture

```
src/
  components/   ui/ (Button, Input, Modal, Table, ...)  layout/  landing/  project/  proposal/  profile/  demo/  hiring/  review/  report/
  pages/        public/ auth/ freelancer/ company/ admin/ projects/ shared/
  services/     apiClient.js + one service per domain (the UI only ever calls these)
  data/         mockServer.js (stand-in API) + mockDb.js (localStorage store) + seed files
  context/      AuthContext, NotificationContext, ToastContext
  hooks/        useAsync, useDebounce, useCountdown, useReport
  routes/       AppRoutes, ProtectedRoute (+GuestRoute), RouteEffects
  utils/        constants, formatters, validators, skillMatch, ApiError
```

- **State:** React Context, `useState` and a small `useAsync` hook. No Redux.
- **Styling:** Tailwind v4 with an indigo brand scale, Inter, rounded cards, subtle shadows. One shared status-to-colour map keeps badges consistent.
- **Charts:** Recharts, loaded lazily (admin dashboard only).
- **Role checks in the UI are cosmetic.** `ProtectedRoute` only hides pages; every rule that matters is enforced in the (mock) server and must be enforced again by the real backend.

## Connecting the real backend

The backend now exists (see `../backend`). `src/services/apiClient.js` is still the only file that knows whether the app is mocked.

```bash
npm run dev          # in-browser mock API (no backend needed)
npm run dev:real     # real API: needs the backend running on :5000; Vite proxies /api to it
npm run build:real   # production build for the real API
```

`dev:real` uses `vite --mode real`, which loads `.env.real` (`VITE_USE_MOCK=false`), so it works the same in PowerShell, cmd and bash. The browser only talks to one origin; Vite forwards `/api` to `http://localhost:5000` (override with `API_PROXY_TARGET`), so the session cookie is first-party.

Contract with the backend:

- JSON in and out. Errors are `{ "message": "...", "code": "..." }` with the right HTTP status; the UI branches on codes such as `DUPLICATE_PROPOSAL`, `EMAIL_TAKEN`, `ACCESS_DENIED`, `DEMO_VIEWED`, `DEMO_EXPIRED`, `INVALID_TOKEN`.
- Session via an **httpOnly, SameSite=Lax cookie**; `GET /api/auth/me` restores the session on refresh.
- `skillMatch` is computed by the server.
- `src/data/mockServer.js` remains the readable spec of every response shape, and `test/contract` proves the real API still matches it.

New in this version: the `/reset-password?token=...` page that completes the password-reset email flow.

### Endpoints the UI calls (49)

| Method | Path | Who |
|---|---|---|
| `POST` | `/api/auth/login` | Public |
| `POST` | `/api/auth/register` | Public |
| `POST` | `/api/auth/forgot-password` | Public |
| `GET` | `/api/auth/me` | Any signed-in user |
| `POST` | `/api/auth/logout` | Any signed-in user |
| `GET` | `/api/profiles/:id` | Any signed-in user |
| `PUT` | `/api/profiles/me` | Any signed-in user |
| `GET` | `/api/skills` | Any signed-in user |
| `GET` | `/api/projects` | Any signed-in user |
| `GET` | `/api/projects/:id` | Any signed-in user |
| `GET` | `/api/company/projects` | Company |
| `POST` | `/api/projects` | Company |
| `PUT` | `/api/projects/:id` | Company (owner) |
| `POST` | `/api/projects/:id/close` | Company (owner) |
| `POST` | `/api/projects/:id/proposals` | Freelancer |
| `GET` | `/api/proposals/mine` | Freelancer |
| `GET` | `/api/company/proposals` | Company |
| `GET` | `/api/projects/:id/proposals` | Company (owner) |
| `GET` | `/api/proposals/:id` | Owner company or freelancer |
| `POST` | `/api/proposals/:id/shortlist` | Company (owner) |
| `POST` | `/api/proposals/:id/reject` | Company (owner) |
| `POST` | `/api/proposals/:id/withdraw` | Freelancer (owner) |
| `POST` | `/api/proposals/:id/accept` | Company (owner) |
| `POST` | `/api/proposals/:id/demo` | Freelancer (owner) |
| `GET` | `/api/proposals/:id/demo` | Owner company or freelancer |
| `POST` | `/api/demos/:id/access` | Company (owner) |
| `POST` | `/api/demos/:id/reissue` | Freelancer (owner) |
| `GET` | `/api/hirings` | Freelancer or Company |
| `POST` | `/api/hirings/:id/complete` | Company (owner) |
| `POST` | `/api/hirings/:id/cancel` | Company (owner) |
| `POST` | `/api/reviews` | Hiring participant |
| `GET` | `/api/reviews` | Any signed-in user |
| `GET` | `/api/notifications` | Any signed-in user |
| `POST` | `/api/notifications/read-all` | Any signed-in user |
| `POST` | `/api/notifications/:id/read` | Any signed-in user |
| `GET` | `/api/freelancer/dashboard` | Freelancer |
| `GET` | `/api/company/dashboard` | Company |
| `GET` | `/api/admin/stats` | Admin |
| `GET` | `/api/admin/users` | Admin |
| `POST` | `/api/admin/users/:id/suspend` | Admin |
| `POST` | `/api/admin/users/:id/reinstate` | Admin |
| `GET` | `/api/admin/projects` | Admin |
| `GET` | `/api/admin/reports` | Admin |
| `POST` | `/api/reports` | Any signed-in user |
| `POST` | `/api/admin/reports/:id/resolve` | Admin |
| `GET` | `/api/admin/skills` | Admin |
| `POST` | `/api/admin/skills` | Admin |
| `DELETE` | `/api/admin/skills/:id` | Admin |
| `POST` | `/api/dev/reset` | Public |

## Backend requirements (security checklist)

The frontend assumes the server does all of the following:

- **Authorise on every request**: role *and* ownership (a company may only touch its own projects, proposals and hirings; a freelancer only their own). Return `403`, never rely on hidden UI.
- **Demo access must be atomic.** Consume the view and check expiry in one statement, for example `UPDATE demos SET viewed_at = now() WHERE id = $1 AND viewed_at IS NULL AND expires_at > now() RETURNING url`, so two simultaneous requests cannot both succeed. Never include the URL in any other response. Log access attempts.
- **Passwords:** hash with argon2id or bcrypt; rate-limit login, register and forgot-password; use a tokenised, expiring reset link; return the same message whether or not an email exists.
- **Cookies/CSRF:** httpOnly + Secure + SameSite cookies; add CSRF protection if you use `SameSite=None`. Keep secrets, JWT keys and DB credentials server-side only.
- **Validate input again** (the client's validators are for usability only). Accept only `http(s)` demo and portfolio URLs, bound text lengths, and escape on output.
- **Enforce state transitions:** only `PENDING` can be shortlisted; only `SHORTLISTED` can be accepted or get a demo; accepting rejects the other proposals and moves the project to `IN_PROGRESS` in one transaction; only `OPEN` projects can be edited; reviews only after `COMPLETED`, once per party.
- **Constraints worth putting in the schema:** `UNIQUE (project_id, freelancer_id)` on proposals, `UNIQUE (hiring_id, reviewer_id)` on reviews, a demo row with `expires_at` and `viewed_at`, and admin users created by seed/migration only.
- **Suspended users** must be rejected on every authenticated request, not just at login.

## Accessibility

Semantic landmarks and a skip link, labelled form fields with `aria-invalid` and `role="alert"` errors, status badges that always include text, modals with focus trap, Escape and focus restore, a keyboard-operable account menu, an accessible star rating (native radios), live regions for toasts and results, page titles that follow the page heading, and reduced-motion-aware scrolling.
An automated axe-core scan of every major page and two modals reports no violations (colour-contrast was excluded because it needs real rendering).

## How this was verified, and what wasn't

Verified during development (automated, in a simulated browser against the mock backend): every role's main flows, form validation, the demo access rules and states, the hire/complete/review lifecycle, notifications, admin actions, route guards, keyboard and focus behaviour of modals and menus, and an axe-core accessibility scan. The source passes ESLint, and the production build succeeds.

**Not verified:** rendering in a real browser. Layouts were reviewed from the code for 320, 375, 768, 1024 and 1440 px and adjusted (tables become cards below `md`, headers and cards stack on narrow screens, wide content scrolls inside its own container), and colour contrast was checked by reasoning about the Tailwind palette, not measured. Please do a quick manual pass at those widths, especially: landing hero, proposal cards, demo access panel, admin tables, and any open modal at 320 px.

## Decisions that refine the original spec

- Only **shortlisted** proposals can be accepted (so the demo step is meaningful); there is a **Withdraw** action for pending/shortlisted proposals.
- **Close project** sets status `CANCELLED`; **Cancel hiring** (with a reason) also sets the project to `CANCELLED`.
- The 24-hour demo window starts at **submission**; the freelancer can **re-issue** a window.
- The freelancer **Portfolio** nav item became a section of Profile; the company **Proposals** nav item is an inbox across projects.
- **Reports** are user reports about profiles and projects, created with a Report button and resolved by admins.
- Project edits are limited to `OPEN` projects, and required skills lock once proposals exist.

## Known limitations / future work

No real backend, email, file or image uploads (avatars, logos and portfolio images show placeholders), messaging between company and freelancer, payments or escrow (the UI says "hire", never "pay"), or a freelancer directory for companies. Experience entries on a freelancer profile are display-only. Notifications poll every minute; WebSockets or server-sent events can replace that.
