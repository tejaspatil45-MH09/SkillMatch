import { useState } from 'react'
import { Flag } from 'lucide-react'
import Button from '../components/ui/Button'
import ReportModal from '../components/report/ReportModal'
import { useToast } from '../context/ToastContext'
import { reportService } from '../services/reportService'

// Returns a ready-made "Report" button + its modal for a user or project
export function useReport({ targetType, targetId, label }) {
  const [open, setOpen] = useState(false)
  const toast = useToast()
  async function submit(reason) {
    try { await reportService.createReport({ targetType, targetId, reason }); toast('Report sent. Our team will review it.'); setOpen(false) }
    catch (e) { toast(e.message, 'error'); if (e.status === 409) setOpen(false) }
  }
  return {
    button: <Button variant="ghost" size="sm" onClick={() => setOpen(true)}><Flag className="size-4" aria-hidden />Report</Button>,
    modal: open && <ReportModal open onClose={() => setOpen(false)} targetLabel={label} onSubmit={submit} />,
  }
}
