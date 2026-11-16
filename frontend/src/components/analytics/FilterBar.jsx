import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { FileText } from 'lucide-react'
import Card from '../ui/Card'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Button from '../ui/Button'
import { DEFAULT_FILTERS, HIRING_STATUS_OPTIONS, PROJECT_STATUS_OPTIONS, RANGE_OPTIONS, isDefaultFilters, validateFilters } from '../../utils/analytics'

// `value` = the filters currently applied. Presets and the status lists apply at once; a custom range is
// checked and applied with its own button, so a half-typed date never triggers a request.
export default function FilterBar({ value, onApply, onExport, exporting, busy }) {
  const [showCustom, setShowCustom] = useState(value.range === 'custom')
  const [from, setFrom] = useState(value.from)
  const [to, setTo] = useState(value.to)
  const [errors, setErrors] = useState({})
  useEffect(() => { setShowCustom(value.range === 'custom'); setFrom(value.from); setTo(value.to); setErrors({}) }, [value])

  const pickRange = (range) => {
    if (range === 'custom') { setShowCustom(true); return }
    setShowCustom(false); setErrors({})
    if (range !== value.range) onApply({ ...value, range })
  }
  const applyCustom = (e) => {
    e.preventDefault()
    const next = { ...value, range: 'custom', from, to }
    const errs = validateFilters(next); setErrors(errs)
    if (!Object.keys(errs).length) onApply(next)
  }
  const activeRange = showCustom ? 'custom' : value.range
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p id="range-label" className="mb-1.5 font-medium text-slate-700">Date range</p>
          <div role="group" aria-labelledby="range-label" className="flex flex-wrap gap-1.5">
            {RANGE_OPTIONS.map(([key, label]) => (
              <button key={key} type="button" aria-pressed={activeRange === key} onClick={() => pickRange(key)}
                className={clsx('h-10 rounded-lg px-3.5 font-medium ring-1 ring-inset transition-colors', activeRange === key ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>{label}</button>))}
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Select label="Project status" className="sm:w-44" value={value.projectStatus} options={PROJECT_STATUS_OPTIONS} onChange={(e) => onApply({ ...value, projectStatus: e.target.value })} />
          <Select label="Hiring status" className="sm:w-44" value={value.hiringStatus} options={HIRING_STATUS_OPTIONS} onChange={(e) => onApply({ ...value, hiringStatus: e.target.value })} />
          <Button variant="secondary" loading={exporting} disabled={busy} onClick={onExport} title="Downloads the report for the filters applied now"><FileText className="size-4" aria-hidden />Export CSV</Button>
        </div>
      </div>
      {showCustom && (
        <form onSubmit={applyCustom} noValidate className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
          <Input label="From date" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setErrors((x) => ({ ...x, from: undefined })) }} error={errors.from} min="2000-01-01" max="2100-12-31" />
          <Input label="To date" type="date" value={to} onChange={(e) => { setTo(e.target.value); setErrors((x) => ({ ...x, to: undefined })) }} error={errors.to} min="2000-01-01" max="2100-12-31" />
          <Button type="submit" className="sm:mt-7" disabled={busy}>Apply range</Button>
        </form>)}
      {!isDefaultFilters(value) && <div className="mt-3"><button type="button" onClick={() => onApply(DEFAULT_FILTERS)} className="font-medium text-brand-600 hover:text-brand-700">Reset filters</button></div>}
    </Card>
  )
}
