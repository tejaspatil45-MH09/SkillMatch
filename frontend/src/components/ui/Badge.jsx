import clsx from 'clsx'
import { STATUS_STYLES } from '../../utils/constants'
import { labelize } from '../../utils/formatters'

// Status badge: text label always present, never colour alone
export function StatusBadge({ status }) {
  return <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', STATUS_STYLES[status] ?? STATUS_STYLES.COMPLETED)}>{labelize(status)}</span>
}
export default function Badge({ children, className }) {
  return <span className={clsx('inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700', className)}>{children}</span>
}
