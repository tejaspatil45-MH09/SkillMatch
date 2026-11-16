import clsx from 'clsx'
import { Loader2 } from 'lucide-react'

const variants = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'text-slate-600 hover:bg-slate-100',
}
const sizes = { sm: 'h-8 px-3', md: 'h-10 px-4', lg: 'h-11 px-6 text-base' }

export default function Button({ variant = 'primary', size = 'md', loading, disabled, className, children, as: Tag = 'button', ...props }) {
  return (
    <Tag
      disabled={disabled || loading}
      className={clsx('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50', variants[variant], sizes[size], className)}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </Tag>
  )
}
