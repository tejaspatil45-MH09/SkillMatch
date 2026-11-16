// Generic responsive table: a real <table> from md up, stacked cards below.
// columns: [{ key, header, render?(row), primary?: true (card title), className? }]
export default function Table({ columns, rows, rowKey = 'id', caption }) {
  const cell = (c, row) => (c.render ? c.render(row) : row[c.key])
  const primary = columns.find((c) => c.primary) ?? columns[0]
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="w-full text-left">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{columns.map((c) => <th key={c.key} scope="col" className="px-5 py-3 font-medium">{c.header}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map((r) => <tr key={r[rowKey]} className="align-top hover:bg-slate-50/60">{columns.map((c) => <td key={c.key} className={`px-5 py-4 ${c.className ?? ''}`}>{cell(c, r)}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {rows.map((r) => (
          <li key={r[rowKey]} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="font-medium text-slate-900">{cell(primary, r)}</div>
            <dl className="mt-3 space-y-2">{columns.filter((c) => c !== primary).map((c) => <div key={c.key} className="flex items-start justify-between gap-4"><dt className="shrink-0 text-xs text-slate-500">{c.header}</dt><dd className="text-right text-slate-700">{cell(c, r)}</dd></div>)}</dl>
          </li>))}
      </ul>
    </>
  )
}
