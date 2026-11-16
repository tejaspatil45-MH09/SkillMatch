import { useEffect, useRef, useState } from 'react'

// Accessible menu: closes on outside click / Escape (focus returns to the trigger), arrow keys move between items
export default function Dropdown({ trigger, label = 'Account menu', children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const triggerRef = useRef(null)
  useEffect(() => {
    if (!open) return
    ref.current?.querySelector('[role=menuitem]')?.focus()
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus() } }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const move = (e) => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return
    e.preventDefault()
    const items = [...ref.current.querySelectorAll('[role=menuitem]')], i = items.indexOf(document.activeElement)
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
  }
  return (
    <div ref={ref} className="relative">
      <button ref={triggerRef} onClick={() => setOpen((o) => !o)} aria-label={label} aria-haspopup="menu" aria-expanded={open} className="rounded-full">{trigger}</button>
      {open && <div role="menu" onKeyDown={move} onClick={() => setOpen(false)} className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">{children}</div>}
    </div>
  )
}
export const DropdownItem = ({ icon: Icon, children, ...props }) => (
  <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-700 hover:bg-slate-100" {...props}>
    {Icon && <Icon className="size-4 text-slate-500" aria-hidden />}{children}
  </button>
)
