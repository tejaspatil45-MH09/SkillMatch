import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../src/context/ToastContext'
import FilterBar from '../src/components/analytics/FilterBar'
import AnalyticsReport from '../src/components/analytics/AnalyticsReport'
import Analytics from '../src/pages/admin/Analytics'
import { adminService } from '../src/services/adminService'
import { saveTextFile } from '../src/utils/download'
import { ApiError } from '../src/utils/ApiError'
import { DEFAULT_FILTERS } from '../src/utils/analytics'

// The analytics UI on its own: the service layer is replaced so each test controls exactly what "the server" answers.
// (The same screens against the real backend and database are covered in integration/analytics.test.jsx.)
vi.mock('../src/utils/download', () => ({ saveTextFile: vi.fn() }))
vi.mock('../src/services/adminService', () => ({ adminService: { getAnalytics: vi.fn(), exportAnalytics: vi.fn() } }))

const ranked = (rows) => rows.map(([name, count], i) => ({ id: `id${i}`, name, count, suspended: false }))
const report = (label = 'All time', over = {}) => ({
  generatedAt: '2026-10-31T10:00:00.000Z', monthsTruncated: false,
  filters: { range: 'all', label, from: null, to: null, projectStatus: null, hiringStatus: null },
  projects: { total: 6, open: 2, inProgress: 1, active: 3, completed: 2, cancelled: 1, byStatus: [{ status: 'OPEN', count: 2 }, { status: 'IN_PROGRESS', count: 1 }, { status: 'COMPLETED', count: 2 }, { status: 'CANCELLED', count: 1 }], monthly: [{ month: '2001-03', count: 2 }, { month: '2001-04', count: 3 }, { month: '2001-05', count: 1 }] },
  hirings: { total: 6, successful: 3, ongoing: 2, cancelled: 1, concluded: 4, successRate: 75, timeToHire: { seconds: 483840, sampleSize: 5, excluded: 1 }, monthly: [{ month: '2001-03', completed: 1, ongoing: 1, cancelled: 0, total: 2 }] },
  proposals: { total: 10, accepted: 4, rejected: 2, pending: 2, shortlisted: 1, withdrawn: 1, acceptanceRate: 40 },
  freelancers: { total: 8, active: 7, suspended: 1, registeredInRange: 2, topByCompleted: ranked([['Bob Fixture', 2], ['Ann Fixture', 1]]), averageRating: { value: 3.5, reviews: 2, freelancers: 2 } },
  companies: { total: 4, active: 3, suspended: 1, registeredInRange: 2, topByProjects: ranked([['Alpha Fixture Co', 3]]), topByHirings: ranked([['Alpha Fixture Co', 2]]) },
  skills: { demand: [{ id: 's1', name: 'React', projects: 3 }, { id: 's2', name: 'Node.js', projects: 2 }] },
  unavailable: [{ metric: 'Cancelled hirings by cancellation date', reason: 'A hiring stores why it was cancelled but not when.' }],
  ...over,
})
const emptyReport = () => report('Empty', {
  monthsTruncated: true,
  projects: { total: 0, open: 0, inProgress: 0, active: 0, completed: 0, cancelled: 0, byStatus: ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((status) => ({ status, count: 0 })), monthly: [{ month: '2000-01', count: 0 }] },
  hirings: { total: 0, successful: 0, ongoing: 0, cancelled: 0, concluded: 0, successRate: null, timeToHire: { seconds: null, sampleSize: 0, excluded: 0 }, monthly: [{ month: '2000-01', completed: 0, ongoing: 0, cancelled: 0, total: 0 }] },
  proposals: { total: 0, accepted: 0, rejected: 0, pending: 0, shortlisted: 0, withdrawn: 0, acceptanceRate: null },
  freelancers: { total: 0, active: 0, suspended: 0, registeredInRange: 0, topByCompleted: [], averageRating: { value: null, reviews: 0, freelancers: 0 } },
  companies: { total: 0, active: 0, suspended: 0, registeredInRange: 0, topByProjects: [], topByHirings: [] }, skills: { demand: [] },
})
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const metric = (name) => within(screen.getByRole('region', { name }))

beforeEach(() => { vi.clearAllMocks() })
afterEach(cleanup)

describe('the filter bar', () => {
  const setup = (value = DEFAULT_FILTERS, extra = {}) => { const onApply = vi.fn(), onExport = vi.fn(); render(<FilterBar value={value} onApply={onApply} onExport={onExport} {...extra} />); return { onApply, onExport } }

  it('starts on "All time" with nothing else open', () => {
    setup()
    expect(screen.getByRole('button', { name: 'All time' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
    expect(screen.queryByLabelText('From date')).toBeNull(); expect(screen.queryByText('Reset filters')).toBeNull()
  })
  it('a preset applies at once; clicking the range that is already applied does nothing', () => {
    const { onApply } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'All time' })); expect(onApply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '30 days' })); expect(onApply).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, range: '30d' })
  })
  it('every preset from the brief is offered', () => {
    setup(); for (const label of ['7 days', '30 days', '3 months', '1 year', 'Custom']) expect(screen.getByRole('button', { name: label })).toBeTruthy()
  })
  it('"Custom" only opens the date fields; nothing is requested until the range is applied', () => {
    const { onApply } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    expect(screen.getByLabelText('From date')).toBeTruthy(); expect(screen.getByLabelText('To date')).toBeTruthy(); expect(onApply).not.toHaveBeenCalled()
  })
  it('a custom range is checked before it is applied', () => {
    const { onApply } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply range' }))
    expect(screen.getByText('Choose a start date.')).toBeTruthy(); expect(screen.getByText('Choose an end date.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2001-03-05' } }); fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2001-03-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply range' }))
    expect(screen.getByText('The end date must be on or after the start date.')).toBeTruthy()
    expect(onApply).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2001-03-31' } })
    expect(screen.queryByText('The end date must be on or after the start date.')).toBeNull()      // typing clears the message
    fireEvent.click(screen.getByRole('button', { name: 'Apply range' }))
    expect(onApply).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, range: 'custom', from: '2001-03-05', to: '2001-03-31' })
  })
  it('the project and hiring status lists apply at once and keep the other filters', () => {
    const { onApply } = setup({ ...DEFAULT_FILTERS, range: '7d' })
    fireEvent.change(screen.getByLabelText('Project status'), { target: { value: 'COMPLETED' } })
    expect(onApply).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, range: '7d', projectStatus: 'COMPLETED' })
    fireEvent.change(screen.getByLabelText('Hiring status'), { target: { value: 'CANCELLED' } })
    expect(onApply).toHaveBeenLastCalledWith({ ...DEFAULT_FILTERS, range: '7d', hiringStatus: 'CANCELLED' })
  })
  it('"Reset filters" appears only when something is filtered, and restores the defaults', () => {
    const { onApply } = setup({ ...DEFAULT_FILTERS, range: '7d', projectStatus: 'OPEN' })
    fireEvent.click(screen.getByText('Reset filters')); expect(onApply).toHaveBeenCalledWith(DEFAULT_FILTERS)
  })
  it('export is a button that can be disabled while the first report loads', () => {
    const { onExport } = setup(DEFAULT_FILTERS, { busy: false })
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/ })); expect(onExport).toHaveBeenCalledTimes(1)
    cleanup(); const second = setup(DEFAULT_FILTERS, { busy: true })
    expect(screen.getByRole('button', { name: /Export CSV/ }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/ })); expect(second.onExport).not.toHaveBeenCalled()
  })
})

describe('the report', () => {
  const show = (data, loading = false) => render(<MemoryRouter><AnalyticsReport data={data} loading={loading} /></MemoryRouter>)

  it('shows the numbers the server calculated, each with its working', () => {
    show(report())
    expect(metric('Projects posted').getByText('6')).toBeTruthy(); expect(metric('Projects posted').getByText('3 active · 2 completed · 1 cancelled')).toBeTruthy()
    expect(metric('Hiring success rate').getByText('75%')).toBeTruthy(); expect(metric('Hiring success rate').getByText('3 of 4 finished hirings were completed')).toBeTruthy()
    expect(metric('Proposal acceptance rate').getByText('40%')).toBeTruthy()
    expect(metric('Average time to hire').getByText('5.6 days')).toBeTruthy(); expect(metric('Average time to hire').getByText(/1 left out/)).toBeTruthy()
    expect(metric('Average freelancer rating').getByText('3.5 / 5')).toBeTruthy()
    expect(metric('Registered freelancers').getByText('8')).toBeTruthy()
    expect(screen.getByText('Not available')).toBeTruthy(); expect(screen.getByText('A hiring stores why it was cancelled but not when.')).toBeTruthy()
  })
  it('describes every chart in words for people who cannot see it', () => {
    show(report())
    expect(screen.getByRole('img', { name: 'Projects posted per month: Mar 2001 2, Apr 2001 3, May 2001 1' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Project status distribution: Open 2, In progress 1, Completed 2, Cancelled 1' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Most popular skills: React 3, Node.js 2' })).toBeTruthy()
    expect(screen.getByRole('img', { name: /Top companies by projects posted: Alpha Fixture Co 3/ })).toBeTruthy()
  })
  it('an empty period shows dashes and plain messages, never 0%, NaN or a blank chart', () => {
    const { container } = show(emptyReport())
    for (const name of ['Hiring success rate', 'Proposal acceptance rate', 'Average time to hire', 'Average freelancer rating']) expect(metric(name).getByText('–')).toBeTruthy()
    expect(metric('Hiring success rate').getByText('No finished hirings in this period')).toBeTruthy()
    expect(metric('Average freelancer rating').getByText('No reviews in this period')).toBeTruthy()
    expect(screen.getAllByText('No data for this period and filters.')).toHaveLength(7)
    expect(screen.getAllByText('Nothing to rank in this period.')).toHaveLength(4)
    expect(screen.getByText(/most recent 60 months/)).toBeTruthy()
    expect(container.textContent).not.toMatch(/NaN|undefined|Infinity/)
  })
  it('placeholders while the first report loads, and a dimmed (not blank) report while a new one loads', () => {
    const first = show(null, true)
    expect(first.container.querySelectorAll('section[aria-label]')).toHaveLength(9); expect(first.container.textContent).not.toMatch(/NaN|undefined/); expect(screen.queryByText('Not available')).toBeNull()
    cleanup(); const again = show(report(), true)
    expect(again.container.firstChild.getAttribute('aria-busy')).toBe('true'); expect(metric('Projects posted').getByText('6')).toBeTruthy()
  })
  it('names are shown as plain text, so a name that looks like markup or a formula does nothing', () => {
    const evil = report('All time', { companies: { ...report().companies, topByProjects: [{ id: 'x', name: '<img src=x onerror=alert(1)>=HYPERLINK("x")', count: 2, suspended: true }] } })
    const { container } = show(evil)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getAllByText('<img src=x onerror=alert(1)>=HYPERLINK("x")').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Suspended').length).toBeGreaterThan(0)
  })
})

describe('the page', () => {
  const mount = () => render(<MemoryRouter><ToastProvider><Analytics /></ToastProvider></MemoryRouter>)

  it('loads the all-time report first and shows which filters it applied', async () => {
    adminService.getAnalytics.mockResolvedValue(report('All time'))
    mount()
    expect(await screen.findByText('Key metrics')).toBeTruthy()
    expect(adminService.getAnalytics).toHaveBeenCalledWith({ range: 'all' })
    expect(screen.getByTestId('applied-filters').textContent).toContain('All time')
    expect(screen.getByRole('link', { name: 'moderation reports' }).getAttribute('href')).toBe('/admin/reports')      // the user-submitted reports live elsewhere
  })
  it('asks for exactly the filters chosen, without blanks', async () => {
    adminService.getAnalytics.mockResolvedValue(report())
    mount(); await screen.findByText('Key metrics')
    fireEvent.click(screen.getByRole('button', { name: '3 months' }))
    await waitFor(() => expect(adminService.getAnalytics).toHaveBeenLastCalledWith({ range: '3m' }))
    fireEvent.change(screen.getByLabelText('Project status'), { target: { value: 'COMPLETED' } })
    await waitFor(() => expect(adminService.getAnalytics).toHaveBeenLastCalledWith({ range: '3m', projectStatus: 'COMPLETED' }))
  })
  it('when filters are changed quickly, only the newest answer is ever shown (a slow, older answer is ignored)', async () => {
    const seven = deferred(), thirty = deferred()
    adminService.getAnalytics.mockImplementation((q) => (q.range === '7d' ? seven.promise : q.range === '30d' ? thirty.promise : Promise.resolve(report('All time'))))
    mount(); await screen.findByText('Key metrics')
    fireEvent.click(screen.getByRole('button', { name: '7 days' })); fireEvent.click(screen.getByRole('button', { name: '30 days' }))
    thirty.resolve(report('Last 30 days'))                         // the newest request answers first
    await waitFor(() => expect(screen.getByTestId('applied-filters').textContent).toContain('Last 30 days'))
    seven.resolve(report('Last 7 days'))                           // then the older one limps in
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByTestId('applied-filters').textContent).toContain('Last 30 days'); expect(screen.getByTestId('applied-filters').textContent).not.toContain('Last 7 days')
  })
  it('three quick changes answered out of order (newest, oldest, middle) still end on the newest', async () => {
    const answers = { '7d': deferred(), '30d': deferred(), '3m': deferred() }
    adminService.getAnalytics.mockImplementation((q) => answers[q.range]?.promise ?? Promise.resolve(report('All time')))
    mount(); await screen.findByTestId('applied-filters')
    for (const name of ['7 days', '30 days', '3 months']) fireEvent.click(screen.getByRole('button', { name }))
    answers['3m'].resolve(report('Last 3 months')); await waitFor(() => expect(screen.getByTestId('applied-filters').textContent).toContain('Last 3 months'))
    answers['7d'].resolve(report('Last 7 days')); answers['30d'].resolve(report('Last 30 days'))
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByTestId('applied-filters').textContent).toContain('Last 3 months')
  })
  it('an older request that FAILS after a newer one succeeded does not put the page into an error state', async () => {
    const seven = deferred(), thirty = deferred()
    adminService.getAnalytics.mockImplementation((q) => (q.range === '7d' ? seven.promise : q.range === '30d' ? thirty.promise : Promise.resolve(report('All time'))))
    mount(); await screen.findByTestId('applied-filters')
    fireEvent.click(screen.getByRole('button', { name: '7 days' })); fireEvent.click(screen.getByRole('button', { name: '30 days' }))
    thirty.resolve(report('Last 30 days')); await waitFor(() => expect(screen.getByTestId('applied-filters').textContent).toContain('Last 30 days'))
    seven.reject(new ApiError(500, 'The older request failed.', 'INTERNAL'))
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('alert')).toBeNull(); expect(screen.queryByText(/The older request failed/)).toBeNull()
    expect(screen.getByTestId('applied-filters').textContent).toContain('Last 30 days')
  })
  it('the newest request failing is still reported even though older answers are ignored', async () => {
    const seven = deferred(), thirty = deferred()
    adminService.getAnalytics.mockImplementation((q) => (q.range === '7d' ? seven.promise : q.range === '30d' ? thirty.promise : Promise.resolve(report('All time'))))
    mount(); await screen.findByTestId('applied-filters')
    fireEvent.click(screen.getByRole('button', { name: '7 days' })); fireEvent.click(screen.getByRole('button', { name: '30 days' }))
    seven.resolve(report('Last 7 days'))                                              // ignored: not the newest
    thirty.reject(new ApiError(500, 'The newest request failed.', 'INTERNAL'))
    expect((await screen.findByRole('alert')).textContent).toContain('The newest request failed.')
    expect(screen.getByTestId('applied-filters').textContent).not.toContain('Last 7 days')      // the ignored answer did not sneak in
    expect(screen.getByTestId('applied-filters').textContent).toContain('All time')            // the previous report stays on screen
  })
  it('leaving the page while requests are in flight: late answers and failures are ignored without errors', async () => {
    const seven = deferred(), thirty = deferred(), consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    adminService.getAnalytics.mockImplementation((q) => (q.range === '7d' ? seven.promise : q.range === '30d' ? thirty.promise : Promise.resolve(report('All time'))))
    const view = mount(); await screen.findByTestId('applied-filters')
    fireEvent.click(screen.getByRole('button', { name: '7 days' })); fireEvent.click(screen.getByRole('button', { name: '30 days' }))
    view.unmount()
    seven.resolve(report('Last 7 days')); thirty.reject(new ApiError(500, 'Too late.', 'INTERNAL'))
    await new Promise((r) => setTimeout(r, 50))
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
  it('a failed first load shows the error with a retry that works', async () => {
    adminService.getAnalytics.mockRejectedValueOnce(new ApiError(500, 'The report could not be built.', 'INTERNAL')).mockResolvedValue(report())
    mount()
    expect((await screen.findByRole('alert')).textContent).toContain('The report could not be built.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Key metrics')).toBeTruthy(); expect(adminService.getAnalytics).toHaveBeenCalledTimes(2)
  })
  it('with the mock API it explains that the real backend is needed, instead of a raw error or a pointless retry', async () => {
    adminService.getAnalytics.mockRejectedValue(new ApiError(404, 'No route for GET /admin/analytics', 'NOT_FOUND'))
    mount()
    expect((await screen.findByRole('alert')).textContent).toContain('need the real backend')
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })
  it('a failed refresh keeps the report on screen and says it is out of date', async () => {
    adminService.getAnalytics.mockResolvedValueOnce(report('All time')).mockRejectedValueOnce(new ApiError(0, 'Cannot reach the server. Check your connection.', 'NETWORK'))
    mount(); await screen.findByText('Key metrics')
    fireEvent.click(screen.getByRole('button', { name: '7 days' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Cannot reach the server.')
    expect(screen.getByRole('alert').textContent).toContain('previous load'); expect(screen.getByText('Key metrics')).toBeTruthy()
  })
  it('exports the filters that are applied (not ones still being typed) and downloads the CSV', async () => {
    adminService.getAnalytics.mockResolvedValue(report())
    adminService.exportAnalytics.mockResolvedValue('\uFEFFSection,Metric,Group,Value\r\nProjects,Total projects posted,,6\r\n')
    mount(); await screen.findByText('Key metrics')
    fireEvent.click(screen.getByRole('button', { name: '30 days' })); await waitFor(() => expect(adminService.getAnalytics).toHaveBeenLastCalledWith({ range: '30d' }))
    fireEvent.click(screen.getByRole('button', { name: 'Custom' })); fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2001-03-01' } })   // typed, never applied
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }))
    await waitFor(() => expect(saveTextFile).toHaveBeenCalledTimes(1))
    expect(adminService.exportAnalytics).toHaveBeenCalledWith({ range: '30d' })
    const [filename, text] = saveTextFile.mock.calls[0]
    expect(filename).toMatch(/^skillmatch-analytics-30d-\d{8}\.csv$/); expect(text).toContain('Projects,Total projects posted,,6')
    expect(await screen.findByText('Report downloaded.')).toBeTruthy()
  })
  it('a failed export says why and downloads nothing', async () => {
    adminService.getAnalytics.mockResolvedValue(report())
    adminService.exportAnalytics.mockRejectedValue(new ApiError(403, 'You do not have permission to do this.', 'FORBIDDEN'))
    mount(); await screen.findByText('Key metrics')
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }))
    expect(await screen.findByText('You do not have permission to do this.')).toBeTruthy()
    expect(saveTextFile).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Export CSV/ }).hasAttribute('disabled')).toBe(false)      // and it can be tried again
  })
})
