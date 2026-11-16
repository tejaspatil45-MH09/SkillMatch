import clsx from 'clsx'
export default function Section({ id, tone = 'white', eyebrow, title, subtitle, children }) {
  return (
    <section id={id} className={clsx('scroll-mt-16 py-16 sm:py-20', tone === 'muted' ? 'bg-slate-50' : 'bg-white')}>
      <div className="mx-auto max-w-6xl px-4">
        {title && (
          <div className="mx-auto mb-10 max-w-2xl text-center">
            {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-600">{eyebrow}</p>}
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
            {subtitle && <p className="mt-3 text-base text-slate-600">{subtitle}</p>}
          </div>
        )}
        {children}
      </div>
    </section>
  )
}
