import { useId } from 'react'
export default function Select({ label, options, className, ...props }) {
  const id = useId()
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="mb-1.5 block font-medium text-slate-700">{label}</label>}
      <select id={id} className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20" {...props}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
}
