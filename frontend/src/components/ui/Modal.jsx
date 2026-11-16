import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import Button from './Button'

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

export default function Modal({ open, onClose, title, children, footer, wide }) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    const el = ref.current
    // Start on the first form field if there is one, otherwise on the dialog itself
    ;(el.querySelector('input:not([type=radio]),textarea,select') ?? el).focus()
    const onKey = (e) => {
      if (e.key === 'Escape') return closeRef.current()
      if (e.key !== 'Tab') return
      const items = [...el.querySelectorAll(FOCUSABLE)]
      if (!items.length) return e.preventDefault()
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.() }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`relative max-h-[90vh] w-full overflow-y-auto rounded-xl bg-white p-6 shadow-lg outline-none ${wide ? 'max-w-xl' : 'max-w-md'}`}>
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close"><X className="size-4" /></Button>
        </div>
        <div className="text-slate-600">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  )
}
