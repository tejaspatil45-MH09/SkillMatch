// Pure helpers for the admin analytics page (no React, no network), so they can be tested on their own.

export const RANGE_OPTIONS = [['7d', '7 days'], ['30d', '30 days'], ['3m', '3 months'], ['1y', '1 year'], ['all', 'All time'], ['custom', 'Custom']]
export const PROJECT_STATUS_OPTIONS = [['', 'All projects'], ['OPEN', 'Open'], ['IN_PROGRESS', 'In progress'], ['COMPLETED', 'Completed'], ['CANCELLED', 'Cancelled']]
export const HIRING_STATUS_OPTIONS = [['', 'All hirings'], ['ACTIVE', 'Ongoing'], ['COMPLETED', 'Completed'], ['CANCELLED', 'Cancelled']]
export const DEFAULT_FILTERS = { range: 'all', from: '', to: '', projectStatus: '', hiringStatus: '' }

// What the server's custom range accepts: real dates from 2000 to 2100, at most five years long
const isRealDay = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && d.getUTCFullYear() >= 2000 && d.getUTCFullYear() <= 2100
}

// Returns { from?, to?, form? }: a message per problem, empty when the filters can be sent
export function validateFilters(f) {
  if (f.range !== 'custom') return {}
  const e = {}
  if (!f.from) e.from = 'Choose a start date.'
  else if (!isRealDay(f.from)) e.from = 'Enter a real date between 2000 and 2100.'
  if (!f.to) e.to = 'Choose an end date.'
  else if (!isRealDay(f.to)) e.to = 'Enter a real date between 2000 and 2100.'
  if (!e.from && !e.to) {
    if (f.from > f.to) e.to = 'The end date must be on or after the start date.'
    else if ((Date.parse(f.to) - Date.parse(f.from)) / 864e5 > 1830) e.to = 'Choose a range of 5 years or less.'
  }
  return e
}

// Only what the server needs: dates only for a custom range, and no blank values
export function filtersToQuery(f) {
  const q = { range: f.range }
  if (f.range === 'custom') { q.from = f.from; q.to = f.to }
  if (f.projectStatus) q.projectStatus = f.projectStatus
  if (f.hiringStatus) q.hiringStatus = f.hiringStatus
  return q
}

export const isDefaultFilters = (f) => JSON.stringify(filtersToQuery(f)) === JSON.stringify(filtersToQuery(DEFAULT_FILTERS))

const number = new Intl.NumberFormat('en-IN')
export const formatCount = (n) => (n === null || n === undefined ? '–' : number.format(n))
// Rates arrive as percentages (75 = 75%). null means "cannot be calculated", which is never shown as 0%.
export const formatPercent = (p) => (p === null || p === undefined ? '–' : `${Number.isInteger(p) ? p : p.toFixed(1)}%`)
export const formatRating = (v) => (v === null || v === undefined ? '–' : `${v.toFixed(2).replace(/\.?0+$/, '')} / 5`)
export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '–'
  if (seconds < 60) return '< 1 min'
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  if (seconds < 86400) return `${Math.round((seconds / 3600) * 10) / 10} hours`
  const days = Math.round((seconds / 86400) * 10) / 10
  return `${days} ${days === 1 ? 'day' : 'days'}`
}
// "2001-03" -> "Mar 2001" (months are UTC calendar months, like the server's)
export const monthLabel = (key) => { const [y, m] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }) }
export const hasAny = (list, pick = (x) => x.count) => list.some((x) => pick(x) > 0)
export const csvFilename = (f, today = new Date()) => `skillmatch-analytics-${f.range}-${today.toISOString().slice(0, 10).replaceAll('-', '')}.csv`
