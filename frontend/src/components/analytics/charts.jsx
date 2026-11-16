import clsx from 'clsx'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Card from '../ui/Card'

export const PALETTE = { brand: '#4f46e5', green: '#059669', red: '#dc2626', sky: '#0284c7', amber: '#d97706' }
export const STATUS_COLORS = { OPEN: PALETTE.sky, IN_PROGRESS: PALETTE.brand, COMPLETED: PALETTE.green, CANCELLED: PALETTE.red }
const AXIS = { fontSize: 12, tickLine: false }
const short = (name) => (name.length > 16 ? `${name.slice(0, 15)}…` : name)

// A titled card around one chart. `summary` is read aloud (the drawing itself is hidden from screen readers), and the
// `footer` lists the same figures as text. Empty data shows a plain message instead of a blank or broken chart.
export function ChartCard({ title, subtitle, empty, summary, children, footer, className }) {
  return (
    <Card className={clsx('p-6', className)}>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      {empty
        ? <p role="status" className="mt-4 rounded-lg border border-dashed border-slate-300 px-4 py-12 text-center text-slate-500">No data for this period and filters.</p>
        : <><div className="mt-4 h-64" role="img" aria-label={summary}>{children}</div>{footer}</>}
    </Card>
  )
}

export const FigureList = ({ items }) => (
  <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">{items.map(([label, value]) => <li key={label}>{label}: <span className="font-medium text-slate-700">{value}</span></li>)}</ul>
)

export function TrendLine({ data, name }) {      // data: [{ label, value }]
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" {...AXIS} /><YAxis allowDecimals={false} {...AXIS} /><Tooltip />
        <Line type="monotone" dataKey="value" name={name} stroke={PALETTE.brand} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function StatusDonut({ data }) {          // data: [{ name, value, color }]
  const shown = data.filter((d) => d.value > 0)
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={shown} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2}>{shown.map((d) => <Cell key={d.name} fill={d.color} />)}</Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function StackedBars({ data }) {          // data: [{ label, Completed, Ongoing, Cancelled }]
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" {...AXIS} /><YAxis allowDecimals={false} {...AXIS} /><Tooltip cursor={{ fill: '#f1f5f9' }} /><Legend iconType="circle" />
        <Bar dataKey="Completed" stackId="h" fill={PALETTE.green} /><Bar dataKey="Ongoing" stackId="h" fill={PALETTE.brand} /><Bar dataKey="Cancelled" stackId="h" fill={PALETTE.red} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function RankBars({ data, color = PALETTE.brand, unit }) {      // data: [{ name, value }], already sorted
  const rows = data.map((d) => ({ ...d, label: short(d.name) }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 16, top: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} {...AXIS} /><YAxis type="category" dataKey="label" width={112} {...AXIS} />
        <Tooltip cursor={{ fill: '#f1f5f9' }} labelFormatter={(_, p) => p?.[0]?.payload?.name} />
        <Bar dataKey="value" name={unit} fill={color} radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
