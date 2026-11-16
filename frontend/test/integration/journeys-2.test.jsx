import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Browser, any, db, dialog, freshDatabase, gone, idOf, mail, press, screen, type, wait, within, fireEvent } from './harness.jsx'

beforeAll(freshDatabase)
const URL_SECRET = 'https://demo.example.com/supplier-portal-prototype'

describe('a project from posting to reviews: company (TechNova) and freelancer (Priya), both on the real backend', () => {
  const company = new Browser(), freelancer = new Browser()
  let projectId, proposalId
  beforeAll(async () => { await company.login('hr@technova.dev'); await freelancer.login('priya@skillmatch.dev') })

  it('the company posts a project through the real form', async () => {
    company.mount('/company/projects/create'); await any('Create a project')
    type('Project title', 'Supplier Portal'); type('Description', 'A portal where suppliers upload invoices and track payment status.')
    type('Minimum budget (₹)', '30000'); type('Maximum budget (₹)', '45000'); type('Deadline', '2099-01-01')
    fireEvent.click(await screen.findByRole('button', { name: 'React' })); await press('Post project')
    expect(await any('Supplier Portal')).toBe(true)
    projectId = await idOf("SELECT id FROM projects WHERE title = 'Supplier Portal'")
    expect((await db.query('SELECT status FROM projects WHERE id = $1', [projectId])).rows[0].status).toBe('OPEN')
  })
  it('the freelancer finds it and applies', async () => {
    freelancer.mount('/projects'); expect(await any('Supplier Portal')).toBe(true)
    freelancer.mount(`/projects/${projectId}/proposal`); await any('Submit a proposal')
    type('Cover letter', 'I design and build supplier-facing portals and can deliver this project on schedule with clear updates.'); type('Bid amount (₹)', '40000'); type('Estimated completion (days)', '25')
    await press('Submit proposal'); expect(await any('Proposal submitted')).toBe(true)
    proposalId = await idOf('SELECT id FROM proposals WHERE project_id = $1', [projectId])
  })
  it('the company is told, reviews the proposal and shortlists it', async () => {
    company.mount('/notifications'); expect(await any(/Priya Deshmukh submitted a proposal for "Supplier Portal"/)).toBe(true)
    company.mount(`/company/projects/${projectId}/proposals`)
    expect(await any('Priya Deshmukh')).toBe(true)
    await press('Shortlist'); expect(await any('Waiting for the freelancer to submit a demo.')).toBe(true)
  })
  it('the freelancer is told and submits a demo', async () => {
    freelancer.mount('/notifications'); expect(await any('Your proposal for "Supplier Portal" has been shortlisted.')).toBe(true)
    freelancer.mount(`/freelancer/proposals/${proposalId}/demo`); await any('Submit a demo')
    type('Demo URL', URL_SECRET); type('Demo description', 'A clickable prototype with sample invoices and the payment status view.')
    await press('Submit demo'); expect(await any('Demo Submitted')).toBe(true); expect(await any('Waiting for Company Review')).toBe(true)
  })
  it('the company opens the demo exactly once; the link never appears again', async () => {
    company.mount(`/company/proposals/${proposalId}/demo`)
    expect(await any('Demo available')).toBe(true)
    expect(document.body.innerHTML).not.toContain(URL_SECRET)          // not before the view
    await press('View Demo'); const d = await dialog(); expect(within(d).getAllByText(/one-time view/).length).toBeGreaterThan(0); await press('View demo', d)
    expect(await any('Demo Viewed')).toBe(true); expect(await any('Access to this demo has been consumed.')).toBe(true)
    expect(screen.getByRole('link', { name: /Open demo/ }).getAttribute('href')).toBe(URL_SECRET)
    company.mount(`/company/proposals/${proposalId}/demo`)             // a reload
    expect(await any('Demo Already Viewed')).toBe(true)
    expect(document.body.innerHTML).not.toContain(URL_SECRET)
    expect(screen.getByRole('button', { name: 'View Demo' }).disabled).toBe(true)
    freelancer.mount('/notifications'); expect(await any('Your demo for "Supplier Portal" was viewed.')).toBe(true)
  })
  it('the company hires; the freelancer sees it', async () => {
    company.mount(`/company/projects/${projectId}/proposals`); await any('Priya Deshmukh')
    await press('Accept and hire'); const d = await dialog(); expect(within(d).getByText(/All other proposals will be rejected/)).toBeTruthy(); await press('Accept and hire', d)
    expect(await any('Accepted')).toBe(true)
    expect((await db.query('SELECT status FROM projects WHERE id = $1', [projectId])).rows[0].status).toBe('IN_PROGRESS')
    freelancer.mount('/freelancer/hirings'); expect(await any('Supplier Portal')).toBe(true); expect(await any('Reviews open when the project is completed.')).toBe(true)
  })
  it('the company completes the project and both sides review each other', async () => {
    company.mount('/company/hirings'); await any('Priya Deshmukh')
    fireEvent.click(screen.getAllByRole('button', { name: 'Mark as Completed' })[0]); const d = await dialog()
    expect(within(d).getByText('Are you sure you want to mark this project as completed?')).toBeTruthy(); await press('Mark as Completed', d)
    expect(await any('Review freelancer')).toBe(true)
    fireEvent.click(screen.getAllByRole('button', { name: 'Review freelancer' })[0]); const r = await dialog()
    fireEvent.click(within(r).getByLabelText('5 stars')); type('Comment', 'Great collaboration and quick turnaround.'); await press('Submit review', r)
    expect(await any('Your review')).toBe(true)

    freelancer.mount('/freelancer/hirings'); expect(await any('Their review')).toBe(true)
    fireEvent.click(screen.getAllByRole('button', { name: 'Review company' })[0]); const fr = await dialog()
    fireEvent.click(within(fr).getByLabelText('4 stars')); type('Comment', 'Clear requirements and prompt feedback.'); await press('Submit review', fr)
    expect(await any('Your review')).toBe(true)
    freelancer.mount('/freelancer/profile'); expect(await any('Great collaboration and quick turnaround.')).toBe(true)
    company.mount('/company/profile'); expect(await any('Clear requirements and prompt feedback.')).toBe(true)
  })
  it('the unread badge counts real notifications and clears when they are read', async () => {
    freelancer.mount('/notifications'); await any('Mark all as read')
    await wait(() => { if (!screen.queryAllByRole('link', { name: /Notifications, \d+ unread/ }).length) throw 0 })
    await press('Mark all as read')
    await wait(() => { if (screen.queryAllByRole('link', { name: /unread/ }).length) throw 0 })
    expect(await any('All notifications marked as read.')).toBe(true)
  })
})

describe('demo states on the real backend (seeded data)', () => {
  const pixelcraft = new Browser(), technova = new Browser(), innovate = new Browser()
  beforeAll(async () => { await Promise.all([pixelcraft.login('team@pixelcraft.dev'), technova.login('hr@technova.dev'), innovate.login('projects@innovatelabs.dev')]) })
  const prFor = (email, title) => idOf('SELECT pr.id FROM proposals pr JOIN projects p ON p.id = pr.project_id JOIN users u ON u.id = pr.freelancer_id WHERE u.email = $1 AND p.title = $2', [email, title])

  it('an expired demo says so, and a stranger is simply denied', async () => {
    const pr6 = await prFor('priya@skillmatch.dev', 'Mobile App UI Redesign')
    pixelcraft.mount(`/company/proposals/${pr6}/demo`)
    expect(await any('Demo Expired')).toBe(true); expect(await any('No access is available because the 24-hour access window has expired.')).toBe(true)
    expect(screen.getByRole('button', { name: 'View Demo' }).disabled).toBe(true)
    technova.mount(`/company/proposals/${pr6}/demo`)
    expect(await any('Access Denied')).toBe(true); expect(screen.queryAllByRole('button', { name: 'View Demo' })).toHaveLength(0)
  })
  it('an already-viewed demo says so', async () => {
    innovate.mount(`/company/proposals/${await prFor('rohan@skillmatch.dev', 'Sales Forecasting Model')}/demo`)
    expect(await any('Demo Already Viewed')).toBe(true)
  })
})

describe('the admin console on the real backend', () => {
  const admin = new Browser(), rohan = new Browser()
  beforeAll(async () => { await admin.login('admin@skillmatch.dev'); await rohan.login('rohan@skillmatch.dev') })
  // The dashboard and its charting library are loaded on demand (React.lazy). Load them once here, under the generous hook
  // timeout, so the first test measures the page showing its numbers and not how long a cold module load took.
  beforeAll(async () => { await import('../../src/pages/admin/Dashboard.jsx') })
  const rowOf = (name) => screen.getAllByText(name)[0].closest('tr')

  it('shows the platform numbers', async () => {
    admin.mount('/admin/dashboard')
    // Same requirement as before (the label must appear within the harness wait), but a failure now prints what the page was
    // actually showing (spinner, error message, blank) instead of just "expected false to be true".
    await wait(() => screen.getAllByText('Total users'))
    expect(await any('Projects by status')).toBe(true)
  })
  it('suspending a user signs them out at once; reinstating lets them back in', async () => {
    admin.mount('/admin/users'); await any('Rohan Patil')
    await press('Suspend', rowOf('Rohan Patil')); const d = await dialog(); await press('Suspend', d)
    expect(await any('Rohan Patil was suspended.')).toBe(true)
    rohan.mount('/freelancer/dashboard'); expect(await any('Welcome back')).toBe(true)                 // his session is gone: login page
    type('Email', 'rohan@skillmatch.dev'); type('Password', 'Password@123'); await press('Log in')
    expect(await any('This account has been suspended.')).toBe(true)
    admin.mount('/admin/users'); await any('Rohan Patil')
    await press('Reinstate', rowOf('Rohan Patil')); await press('Reinstate', await dialog())
    expect(await any('Rohan Patil was reinstated.')).toBe(true)
    rohan.mount('/login'); await any('Welcome back'); type('Email', 'rohan@skillmatch.dev'); type('Password', 'Password@123'); await press('Log in')
    expect(await any('Welcome back, Rohan')).toBe(true)
  })
  it('resolves a report, and adds then retires a skill', async () => {
    admin.mount('/admin/reports'); await any('Customer Support Chatbot Backend')
    fireEvent.click(screen.getAllByRole('button', { name: 'Resolve' })[0]); expect(await any('Report marked as resolved.')).toBe(true)
    admin.mount('/admin/skills'); await any('24 skills')
    type('New skill name', 'GraphQL'); await press('Add skill'); expect(await any('25 skills')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Remove GraphQL' })); await press('Remove', await dialog())
    expect(await any('24 skills')).toBe(true); expect(await gone('GraphQL')).toBe(true)
  })
  it('the audit trail recorded what the admin did', async () => {
    const actions = (await db.query('SELECT action FROM admin_audit_log ORDER BY id')).rows.map((r) => r.action)
    expect(actions).toEqual(['USER_SUSPENDED', 'USER_REINSTATED', 'REPORT_RESOLVED', 'SKILL_ADDED', 'SKILL_RETIRED'])
  })
})

describe('forgot and reset password, end to end', () => {
  it('the emailed link sets a new password once, and the old one stops working', async () => {
    const b = new Browser(); b.mount('/forgot-password'); await any('Reset your password')
    type('Email', 'kunal@skillmatch.dev'); await press('Send reset link'); expect(await any('Check your email')).toBe(true)
    await vi.waitFor(() => expect(mail.find((m) => m.to === 'kunal@skillmatch.dev')).toBeTruthy())
    const token = mail.findLast((m) => m.to === 'kunal@skillmatch.dev').text.match(/token=([\w-]+)/)[1]

    b.mount(`/reset-password?token=${token}`); await any('Choose a new password')
    type('New password', 'NewPassw0rd1'); type('Confirm new password', 'Different1Password'); await press('Set new password')
    expect(await any('Passwords do not match.')).toBe(true)
    type('Confirm new password', 'NewPassw0rd1'); await press('Set new password')
    expect(await any('Password updated')).toBe(true)

    const old = new Browser(); old.mount('/login'); await any('Welcome back')
    type('Email', 'kunal@skillmatch.dev'); type('Password', 'Password@123'); await press('Log in'); expect(await any('Incorrect email or password.')).toBe(true)
    type('Password', 'NewPassw0rd1'); await press('Log in'); expect(await any('Welcome back, Kunal')).toBe(true)

    b.mount(`/reset-password?token=${token}`); await any('Choose a new password')   // the same link again
    type('New password', 'Another1Password'); type('Confirm new password', 'Another1Password'); await press('Set new password')
    expect(await any(/invalid or has expired/)).toBe(true)
  })
  it('a link without a token explains itself', async () => {
    new Browser().mount('/reset-password'); expect(await any('This reset link is incomplete')).toBe(true)
  })
})
