import { useId } from 'react'
import clsx from 'clsx'

const field = 'block w-full rounded-lg border bg-white px-3 py-2 text-slate-900 placeholder:text-slate-500 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20'

export function Input({ label, error, hint, multiline, adornment, className, ...props }) {
  const id = useId()
  const Tag = multiline ? 'textarea' : 'input'
  return (
    <div className={className}>
      {label && <label htmlFor={id} className="mb-1.5 block font-medium text-slate-700">{label}</label>}
      <div className="relative">
        <Tag id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-e` : undefined}
          rows={multiline ? 5 : undefined}
          className={clsx(field, adornment && 'pr-11', error ? 'border-red-500' : 'border-slate-300')} {...props} />
        {adornment && <div className="absolute inset-y-0 right-1 flex items-center">{adornment}</div>}
      </div>
      {error ? <p id={`${id}-e`} role="alert" className="mt-1.5 text-xs text-red-600">{error}</p>
        : hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}
export default Input
