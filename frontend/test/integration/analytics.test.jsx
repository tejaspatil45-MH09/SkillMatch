import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Browser, any, db, fireEvent, freshDatabase, gone, press, screen, type, wait, within } from './harness.jsx'
import { saveTextFile } from '../../src/utils/download'

// The browser cannot save a file here; everything up to the moment of saving is the real thing.
vi.mock('../../src/utils/download', () => ({ saveTextFile: vi.fn() }))

// The real React app, the real Express API and the real (throwaway test) database: no mock data anywhere.
beforeAll(freshDatabase)

describe('admin reports & analytics on the real backend', () => {
  const admin = new Browser(), freelancer = new Browser()
  beforeAll(async () => { await admin.login('admin@skillmatch.dev'); await freelancer.login('aarav@skillmatch.dev') })
  const count = async (sql, params = []) => (await db.query(sql, params)).rows[0].n
  const metric = (name) => within(screen.getByRole('region', { name }))
  const filters = () => screen.getByTestId('applied-filters').textContent
  // "Key metrics", the filter buttons and "All time" are on screen BEFORE the first report arrives, so seeing them proves nothing
  // about loading. The "Showing ..." line only exists once a report has been received: wait for that before interacting.
  const reportLoaded = () => wait(() => { screen.getByTestId('applied-filters') })
  // Wait until the applied filters read a given way. On timeout the error says what the page was showing instead.
  const showing = (pattern) => wait(() => { const now = filters(); if (!pattern.test(now)) throw new Error(`expected the applied filters to match ${pattern}, but the page shows: "${now}"`) })

  it('the admin finds Analytics in the navigation', async () => {
    admin.mount('/admin/dashboard')
    expect(await any('Analytics')).toBe(true)
  })
it('shows the live totals straight from the database', async () => {
   await import('../../src/pages/admin/Analytics.jsx')
  admin.mount('/admin/analytics')
  await wait(() => screen.getByText('Reports & analytics'))
await wait(() => screen.getByText('Key metrics'))

  const projects = await count('SELECT count(*)::int AS n FROM projects')
  const hirings = await count('SELECT count(*)::int AS n FROM hirings')
  const proposals = await count('SELECT count(*)::int AS n FROM proposals')

  await wait(() => {
    metric('Projects posted').getByText(String(projects))
    metric('Hirings').getByText(String(hirings))
    metric('Proposals submitted').getByText(String(proposals))
  })

  expect(filters()).toContain('All time')
  expect(screen.getByText('Cancelled hirings by cancellation date')).toBeTruthy()
})
  it('changing the date range and the status filters changes the numbers to match the database', async () => {
    admin.mount('/admin/analytics'); await any('Key metrics'); await reportLoaded()
    await press('30 days'); expect(await any('Last 30 days')).toBe(true)
    const recent = await count("SELECT count(*)::int AS n FROM projects WHERE created_at >= now() - interval '30 days'")
    await wait(() => metric('Projects posted').getByText(String(recent)))
    await press('All time'); await showing(/Showing All time/)      // the report for "All time" has really replaced the 30-day one (the button called "All time" is always on screen)
    fireEvent.change(screen.getByLabelText('Project status'), { target: { value: 'COMPLETED' } })
    await showing(/projects: Completed/)
    const completed = await count("SELECT count(*)::int AS n FROM projects WHERE status = 'COMPLETED'")
    await wait(() => metric('Projects posted').getByText(String(completed)))
    fireEvent.change(screen.getByLabelText('Hiring status'), { target: { value: 'CANCELLED' } })
    await showing(/hirings: Cancelled/)
    expect(screen.getByText('Reset filters')).toBeTruthy()
    await press('Reset filters'); await showing(/projects: all statuses · hirings: all statuses/)
  })
  it('a custom range is validated, then a period with no activity shows dashes and plain messages', async () => {
    admin.mount('/admin/analytics'); await any('Key metrics'); await reportLoaded()      // "Apply range" is disabled until the first report has loaded
    await press('Custom')
    expect(screen.getByRole('button', { name: 'Apply range' }).disabled).toBe(false)
    type('From date', '2000-01-31'); type('To date', '2000-01-01'); await press('Apply range')
    expect(await any('The end date must be on or after the start date.')).toBe(true)
    type('From date', '2000-01-01'); type('To date', '2000-01-31'); await press('Apply range')
    expect(await any('2000-01-01 to 2000-01-31')).toBe(true)
    await wait(() => { if (screen.queryAllByText('No data for this period and filters.').length !== 7) throw 0 })
    await wait(() => metric('Hiring success rate').getByText('–'))
    expect(document.body.textContent).not.toMatch(/NaN|undefined/)
  })
  it('exports the CSV for the applied filters and hands it to the browser', async () => {
    admin.mount('/admin/analytics'); await any('Key metrics')
    await press('7 days'); await any('Last 7 days')
    await press('Export CSV')
    await wait(() => expect(saveTextFile).toHaveBeenCalled())
    const [filename, text] = saveTextFile.mock.calls.at(-1)
    expect(filename).toMatch(/^skillmatch-analytics-7d-\d{8}\.csv$/)
    expect(text).toContain('Section,Metric,Group,Value'); expect(text).toContain('Report,Date range,7d,Last 7 days')
    expect(text).toMatch(/Projects,Total projects posted,,\d+/)
    expect(await any('Report downloaded.')).toBe(true)
  })
  it('only an admin gets any of it', async () => {
    expect((await freelancer.api('get', '/admin/analytics')).status).toBe(403)
    expect((await freelancer.api('get', '/admin/analytics/export')).status).toBe(403)
    freelancer.mount('/admin/analytics')
    expect(await gone('Reports & analytics')).toBe(true); expect(await gone('Key metrics')).toBe(true)
  })
})
