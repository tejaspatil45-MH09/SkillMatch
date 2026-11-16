import { createContext, useCallback, useContext, useState } from 'react'
import { CheckCircle2, XCircle, X } from 'lucide-react'

const ToastContext = createContext(null)
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const push = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500)
  }, [])
  const dismiss = (id) => setToasts((t) => t.filter((x) => x.id !== id))
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3.5 shadow-lg">
            {t.type === 'error' ? <XCircle className="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" aria-hidden />}
            <p className="flex-1 text-slate-700">{t.message}</p>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-slate-400 hover:text-slate-600"><X className="size-4" /></button>
          </div>))}
      </div>
    </ToastContext.Provider>
  )
}
export const useToast = () => useContext(ToastContext)
