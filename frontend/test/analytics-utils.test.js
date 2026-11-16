import { describe, expect, it } from 'vitest'
import { DEFAULT_FILTERS, csvFilename, filtersToQuery, formatCount, formatDuration, formatPercent, formatRating, hasAny, isDefaultFilters, monthLabel, validateFilters } from '../src/utils/analytics'

// Pure helpers behind the admin analytics page: no network, no React.
describe('number formatting never invents a value', () => {
  it('a missing figure is a dash, and a real zero is shown as zero', () => {
    expect([formatPercent(null), formatPercent(undefined), formatRating(null), formatDuration(null), formatCount(null)]).toEqual(['–', '–', '–', '–', '–'])
    expect([formatPercent(0), formatCount(0), formatDuration(0)]).toEqual(['0%', '0', '< 1 min'])
  })
  it('percentages, ratings and durations read naturally', () => {
    expect([formatPercent(75), formatPercent(66.7), formatPercent(100)]).toEqual(['75%', '66.7%', '100%'])
    expect([formatRating(3.5), formatRating(4), formatRating(3.25)]).toEqual(['3.5 / 5', '4 / 5', '3.25 / 5'])
    expect([formatDuration(30), formatDuration(90), formatDuration(5400), formatDuration(86400), formatDuration(483840)]).toEqual(['< 1 min', '2 min', '1.5 hours', '1 day', '5.6 days'])
    expect(formatCount(1234567)).toBe('12,34,567')
    expect(monthLabel('2001-03')).toBe('Mar 2001')
  })
  it('hasAny tells empty series from real ones', () => {
    expect(hasAny([{ count: 0 }, { count: 0 }])).toBe(false)
    expect(hasAny([{ count: 0 }, { count: 2 }])).toBe(true)
    expect(hasAny([{ total: 0 }, { total: 1 }], (m) => m.total)).toBe(true)
    expect(hasAny([])).toBe(false)
  })
})

describe('custom range validation mirrors the server', () => {
  const custom = (from, to) => validateFilters({ range: 'custom', from, to })
  it('presets need no dates', () => { for (const range of ['7d', '30d', '3m', '1y', 'all']) expect(validateFilters({ range, from: '', to: '' })).toEqual({}) })
  it('needs both dates', () => expect(custom('', '')).toEqual({ from: 'Choose a start date.', to: 'Choose an end date.' }))
  it('accepts a one-day range and rejects a reversed one', () => {
    expect(custom('2001-03-01', '2001-03-01')).toEqual({})
    expect(Object.keys(custom('2001-03-05', '2001-03-01'))).toEqual(['to'])
  })
  it('rejects impossible dates, dates outside 2000-2100 and ranges over five years', () => {
    expect(Object.keys(custom('2001-02-30', '2001-03-01'))).toEqual(['from'])
    expect(Object.keys(custom('1999-12-31', '2001-01-01'))).toEqual(['from'])
    expect(Object.keys(custom('2001-01-01', '2101-01-01'))).toEqual(['to'])
    expect(Object.keys(custom('2001-01-01', '2007-01-01'))).toEqual(['to'])
    expect(custom('2000-01-01', '2005-01-01')).toEqual({})
  })
})

describe('what is sent to the server', () => {
  it('only the parameters that matter, with no blanks', () => {
    expect(filtersToQuery(DEFAULT_FILTERS)).toEqual({ range: 'all' })
    expect(filtersToQuery({ range: '30d', from: '2001-01-01', to: '2001-02-01', projectStatus: '', hiringStatus: 'ACTIVE' })).toEqual({ range: '30d', hiringStatus: 'ACTIVE' })
    expect(filtersToQuery({ range: 'custom', from: '2001-01-01', to: '2001-02-01', projectStatus: 'OPEN', hiringStatus: '' })).toEqual({ range: 'custom', from: '2001-01-01', to: '2001-02-01', projectStatus: 'OPEN' })
  })
  it('knows when the filters are the defaults (so "Reset" is only offered when it would change something)', () => {
    expect(isDefaultFilters(DEFAULT_FILTERS)).toBe(true)
    expect(isDefaultFilters({ ...DEFAULT_FILTERS, from: '2001-01-01' })).toBe(true)      // a leftover date means nothing outside a custom range
    expect(isDefaultFilters({ ...DEFAULT_FILTERS, range: '7d' })).toBe(false)
    expect(isDefaultFilters({ ...DEFAULT_FILTERS, projectStatus: 'OPEN' })).toBe(false)
  })
  it('names the download after the range and the day', () => expect(csvFilename({ range: '30d' }, new Date('2026-10-31T10:00:00Z'))).toBe('skillmatch-analytics-30d-20261031.csv'))
})
