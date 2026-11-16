import clsx from 'clsx'
export default function Avatar({ name = '', src, size = 'md', className }) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  const dims = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-20 text-xl' }[size]
  return src
    ? <img src={src} alt={name} className={clsx('rounded-full object-cover', dims, className)} />
    : <span role="img" aria-label={name} className={clsx('inline-flex items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700', dims, className)}>{initials}</span>
}
