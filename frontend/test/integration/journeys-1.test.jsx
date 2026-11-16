import { beforeAll, describe, expect, it } from 'vitest'
import { Browser, any, db, dialog, freshDatabase, gone, idOf, press, screen, type, within, fireEvent } from './harness.jsx'

beforeAll(freshDatabase)

describe('signing in, sessions and registration (real backend)', () => {
  const aarav = new Browser()
  it('a wrong password shows the real error; the right one opens the dashboard', async () => {
    aarav.mount('/login')
    expect(await any('Welcome back')).toBe(true)
    type('Email', 'aarav@skillmatch.dev'); type('Password', 'WrongPassw0rd1'); await press('Log in')
    expect(await any('Incorrect email or password.')).toBe(true)
    type('Password', 'Password@123'); await press('Log in')
    expect(await any('Welcome back, Aarav')).toBe(true)
    expect(await any('Skill match opportunities')).toBe(true)
  })
  it('the session survives a page reload, and a freelancer is kept out of company pages', async () => {
    aarav.mount('/freelancer/dashboard')
    expect(await any('Welcome back, Aarav')).toBe(true)
    aarav.mount('/company/dashboard')
    expect(await any('My Proposals')).toBe(true)
    expect(screen.queryAllByText('Post a project')).toHaveLength(0)
  })
  it('logging out ends the session on the server, so protected pages go back to the login page', async () => {
    aarav.mount('/freelancer/dashboard'); await any('Welcome back, Aarav')
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' })); fireEvent.click(await screen.findByRole('menuitem', { name: 'Log out' }))
    expect(await any('Welcome back')).toBe(true)
    aarav.mount('/freelancer/proposals')
    expect(await any('Welcome back')).toBe(true)    // redirected to /login
  })
  it('registering a company signs in at once; the same email again is refused with the real message', async () => {
    const b = new Browser(); b.mount('/register'); await any('Create your account')
    fireEvent.click(screen.getByLabelText(/^Company/)); type('Company name', 'Orbit Systems'); type('Email', 'orbit@example.com'); type('Password', 'Str0ngPassw0rd'); type('Confirm password', 'Str0ngPassw0rd')
    await press('Create account')
    expect(await any('Recent activity')).toBe(true)
    expect((await db.query("SELECT role FROM users WHERE email = 'orbit@example.com'")).rows[0].role).toBe('COMPANY')
    const again = new Browser(); again.mount('/register'); await any('Create your account')
    type('Full name', 'Someone Else'); type('Email', 'ORBIT@example.com'); type('Password', 'Str0ngPassw0rd'); type('Confirm password', 'Str0ngPassw0rd'); await press('Create account')
    expect(await any('An account with this email already exists.')).toBe(true)
  })
})

describe('the freelancer journey (Aarav)', () => {
  const aarav = new Browser()
  beforeAll(() => aarav.login('aarav@skillmatch.dev'))

  it('browses and searches real projects, ranked for him', async () => {
    aarav.mount('/projects')
    expect(await any(/5 projects found/)).toBe(true)
    expect(screen.getAllByText('Skill match').length).toBeGreaterThan(1)
    type('Search projects', 'inventory')
    expect(await any(/1 project found/)).toBe(true)
    expect(screen.getAllByText('Inventory Management Dashboard').length).toBeGreaterThan(0)
  })
  it('submits a proposal; it shows up as Pending; a second attempt is refused', async () => {
    const p7 = await idOf("SELECT id FROM projects WHERE title = 'Warehouse Route Optimizer'")
    aarav.mount(`/projects/${p7}/proposal`); await any('Submit a proposal')
    await press('Submit proposal')
    expect(await any(/Write at least 50 characters/)).toBe(true)
    type('Cover letter', 'I have built route planning tools before and can deliver this module on schedule with clear updates.'); type('Bid amount (₹)', '55000'); type('Estimated completion (days)', '35')
    await press('Submit proposal')
    expect(await any('Proposal submitted')).toBe(true)
    aarav.mount('/freelancer/proposals')
    expect(await any('Warehouse Route Optimizer')).toBe(true)
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0)
    aarav.mount(`/projects/${p7}/proposal`)
    expect(await any("You've already submitted a proposal")).toBe(true)
  })
  it('sees his shortlisted proposal with the live demo countdown', async () => {
    const pr1 = await idOf("SELECT pr.id FROM proposals pr JOIN projects p ON p.id = pr.project_id JOIN users u ON u.id = pr.freelancer_id WHERE p.title = 'E-commerce Website' AND u.email = 'aarav@skillmatch.dev'")
    aarav.mount(`/freelancer/proposals/${pr1}`)
    expect(await any('Congratulations! You have been shortlisted.')).toBe(true)
    expect(await any(/Demo expires in \d+ hours?/)).toBe(true)
  })
  it('edits his profile, and the portfolio survives every kind of round trip', async () => {
    aarav.mount('/freelancer/profile'); expect(await any('Kirana Cart')).toBe(true)
    fireEvent.click(screen.getByText('Edit profile')); await any('Years of experience')
    type('Headline', 'Senior full-stack developer'); await press('Save changes')
    expect(await any('Profile updated.')).toBe(true)
    expect(await any('Senior full-stack developer')).toBe(true)
    expect((await db.query("SELECT headline FROM freelancer_profiles fp JOIN users u ON u.id = fp.user_id WHERE u.email = 'aarav@skillmatch.dev'")).rows[0].headline).toBe('Senior full-stack developer')

    // an item with NO link is stored as null; sending the whole list back (as the page does) must still work
    await db.query("UPDATE portfolio_items SET url = NULL WHERE title = 'Clinic Booking Portal'")
    aarav.mount('/freelancer/profile'); await any('Kirana Cart')
    fireEvent.click(screen.getByRole('button', { name: /Add project/ }))
    const d = await dialog()
    type('Title', 'Billing Portal'); type('Description', 'A self-service billing portal for a small clinic network.'); type('Project URL (optional)', 'https://example.com/billing')
    await press('Add project', d)
    expect(await any('Portfolio project added.')).toBe(true)
    expect(await any('Billing Portal')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Remove Billing Portal' })); const c = await dialog(); await press('Remove', c)
    expect(await any('Portfolio project removed.')).toBe(true)
    expect(await gone('Billing Portal')).toBe(true)
    expect(screen.getAllByText('Kirana Cart').length).toBeGreaterThan(0)   // the others are untouched
  })
})
