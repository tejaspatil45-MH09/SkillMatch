export const formatINR = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
export const formatDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
export const labelize = (s) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
export const formatDateTime = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
export const budgetRange = (p) => `${formatINR(p.budgetMin)} - ${formatINR(p.budgetMax)}`
export function timeAgo(d) {
  const mins = Math.floor((Date.now() - new Date(d)) / 6e4)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 1440) return `${Math.floor(mins / 60)} hr ago`
  const days = Math.floor(mins / 1440)
  return days < 30 ? `${days} day${days > 1 ? 's' : ''} ago` : formatDate(d)
}
export function timeUntil(d) {
  const mins = Math.ceil((new Date(d) - Date.now()) / 6e4)
  if (mins <= 0) return null
  if (mins < 60) return `${mins} minute${mins > 1 ? 's' : ''}`
  const h = Math.ceil(mins / 60)
  return h < 48 ? `${h} hour${h > 1 ? 's' : ''}` : `${Math.ceil(h / 24)} days`
}
// yyyy-mm-dd in local time, for <input type="date">
export const toDateInput = (iso) => { const d = new Date(iso), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
