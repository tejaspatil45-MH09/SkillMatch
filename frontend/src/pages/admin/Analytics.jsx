import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import Button from '../../components/ui/Button'
import ErrorState from '../../components/ui/ErrorState'
import FilterBar from '../../components/analytics/FilterBar'
import AnalyticsReport from '../../components/analytics/AnalyticsReport'
import { useToast } from '../../context/ToastContext'
import { adminService } from '../../services/adminService'
import { DEFAULT_FILTERS, csvFilename, filtersToQuery } from '../../utils/analytics'
import { saveTextFile } from '../../utils/download'

// The mock API (npm run dev) has no analytics endpoints: say so plainly instead of showing a raw error
const needsBackend = (e) => /No route for/.test(e?.message ?? '')
const NEEDS_BACKEND = 'Reports and analytics need the real backend. Start it and run the website with "npm run dev:real".'

export default function Analytics() {
  const toast = useToast()
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const [exporting, setExporting] = useState(false)
  const latest = useRef(0)        // id of the newest request: it only ever counts up and is never reset
  const mounted = useRef(true)    // false once the page has been left (set in its own effect so filter changes cannot touch it)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  // Only the newest request may update the screen, and never after the page was left. An older answer, success or
  // failure, is ignored completely, so clicking filters quickly can never show (or report an error for) an older request.
  const load = useCallback(async (f) => {
    const mine = ++latest.current
    const newest = () => mounted.current && mine === latest.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await adminService.getAnalytics(filtersToQuery(f))
      if (newest()) setState({ data, loading: false, error: null })
    } catch (error) { if (newest()) setState((s) => ({ data: s.data, loading: false, error })) }
  }, [])
  useEffect(() => { load(filters) }, [filters, load])

  async function exportCsv() {
    setExporting(true)
    try { saveTextFile(csvFilename(filters), await adminService.exportAnalytics(filtersToQuery(filters))); toast('Report downloaded.') }
    catch (e) { toast(e.message, 'error') }
    finally { if (mounted.current) setExporting(false) }
  }

  const { data, loading, error } = state
  return (
    <div>
      <PageHeader title="Reports & analytics" description="Platform activity, calculated live from the database."
        action={<Button variant="secondary" onClick={() => load(filters)} loading={loading && !!data}><RefreshCw className="size-4" aria-hidden />Refresh</Button>} />
      <div className="space-y-6">
        <FilterBar value={filters} onApply={setFilters} onExport={exportCsv} exporting={exporting} busy={loading && !data} />
        {error && !data
          ? <ErrorState message={needsBackend(error) ? NEEDS_BACKEND : error.message} onRetry={needsBackend(error) ? undefined : () => load(filters)} />
          : <>
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error.message} The figures below are from the previous load. <button type="button" className="font-medium underline" onClick={() => load(filters)}>Try again</button></p>}
            <AnalyticsReport data={data} loading={loading} />
          </>}
        <p className="text-xs text-slate-500">Looking for reports users have submitted about profiles or projects? See <Link to="/admin/reports" className="font-medium text-brand-600 hover:text-brand-700">moderation reports</Link>.</p>
      </div>
    </div>
  )
}
