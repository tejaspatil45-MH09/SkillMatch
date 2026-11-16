// CSV export of the analytics report: ONE long, spreadsheet-friendly table with the columns Section, Metric, Group, Value.
// It is built from the very same report object the dashboard shows, so the two can never disagree.

// Names are user-controlled text. A cell starting with = + - @ (or a tab / carriage return) can run as a FORMULA when the
// file is opened in Excel or Sheets, so such text gets a leading apostrophe. Numbers are never touched.
const text = (v) => {
  let s = v === null || v === undefined ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const value = (v) => (typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : text(v))

const days = (seconds) => (seconds === null ? null : Math.round((seconds / 86400) * 10) / 10)

export function reportRows(r) {
  const rows = []
  const add = (section, metric, group, v) => rows.push([section, metric, group ?? '', v ?? null])
  const f = r.filters

  add('Report', 'Generated at (UTC)', '', r.generatedAt)
  add('Report', 'Date range', f.range, f.label)
  add('Report', 'Range start (UTC, inclusive)', '', f.from ?? 'No limit')
  add('Report', 'Range end (UTC, exclusive)', '', f.to ?? 'No limit')
  add('Report', 'Project status filter', '', f.projectStatus ?? 'All')
  add('Report', 'Hiring status filter', '', f.hiringStatus ?? 'All')

  const p = r.projects
  add('Projects', 'Total projects posted', '', p.total)
  add('Projects', 'Active projects (open + in progress)', '', p.active)
  add('Projects', 'Open projects', '', p.open)
  add('Projects', 'Projects in progress', '', p.inProgress)
  add('Projects', 'Completed projects', '', p.completed)
  add('Projects', 'Cancelled projects', '', p.cancelled)
  for (const s of p.byStatus) add('Project status distribution', s.status, '', s.count)
  for (const m of p.monthly) add('Projects posted per month', m.month, '', m.count)

  const h = r.hirings
  add('Hirings', 'Total hirings', '', h.total)
  add('Hirings', 'Successful hires (completed)', '', h.successful)
  add('Hirings', 'Ongoing hirings', '', h.ongoing)
  add('Hirings', 'Cancelled hirings', '', h.cancelled)
  add('Hirings', 'Hiring success rate (%, completed / (completed + cancelled))', '', h.successRate)
  add('Hirings', 'Average days from project posted to hire', `based on ${h.timeToHire.sampleSize} hirings`, days(h.timeToHire.seconds))
  if (h.timeToHire.excluded) add('Hirings', 'Hirings left out of that average (start date before project date)', '', h.timeToHire.excluded)
  for (const m of h.monthly) for (const [label, key] of [['Completed', 'completed'], ['Ongoing', 'ongoing'], ['Cancelled', 'cancelled']]) add('Hirings started per month', m.month, label, m[key])

  const pr = r.proposals
  add('Proposals', 'Total proposals submitted', '', pr.total)
  add('Proposals', 'Accepted proposals', '', pr.accepted)
  add('Proposals', 'Rejected proposals', '', pr.rejected)
  add('Proposals', 'Pending proposals', '', pr.pending)
  add('Proposals', 'Shortlisted proposals', '', pr.shortlisted)
  add('Proposals', 'Withdrawn proposals', '', pr.withdrawn)
  add('Proposals', 'Proposal acceptance rate (%, accepted / submitted)', '', pr.acceptanceRate)

  const fr = r.freelancers
  add('Freelancers', 'Registered freelancers (all time)', '', fr.total)
  add('Freelancers', 'Active freelancers (now)', '', fr.active)
  add('Freelancers', 'Suspended freelancers (now)', '', fr.suspended)
  add('Freelancers', 'Freelancers registered in the selected period', '', fr.registeredInRange)
  add('Freelancers', 'Average freelancer rating (1-5)', `${fr.averageRating.reviews} reviews of ${fr.averageRating.freelancers} freelancers`, fr.averageRating.value)
  fr.topByCompleted.forEach((x, i) => add('Top freelancers by completed projects', x.name, `#${i + 1}`, x.count))
  r.skills.demand.forEach((x, i) => add('Most demanded skills (projects requiring the skill)', x.name, `#${i + 1}`, x.projects))

  const co = r.companies
  add('Companies', 'Registered companies (all time)', '', co.total)
  add('Companies', 'Active companies (now)', '', co.active)
  add('Companies', 'Suspended companies (now)', '', co.suspended)
  add('Companies', 'Companies registered in the selected period', '', co.registeredInRange)
  co.topByProjects.forEach((x, i) => add('Top companies by projects posted', x.name, `#${i + 1}`, x.count))
  co.topByHirings.forEach((x, i) => add('Top companies by successful hirings', x.name, `#${i + 1}`, x.count))

  for (const u of r.unavailable) add('Not available', u.metric, u.reason, null)
  if (r.monthsTruncated) add('Report', 'Note', 'Monthly figures show only the most recent 60 months', null)
  return rows
}

export function toCsv(r) {
  const lines = [['Section', 'Metric', 'Group', 'Value'].join(',')]
  for (const [section, metric, group, v] of reportRows(r)) lines.push([text(section), text(metric), text(group), value(v)].join(','))
  return `\uFEFF${lines.join('\r\n')}\r\n`     // BOM so Excel reads names as UTF-8
}

export const csvFilename = (r) => `skillmatch-analytics-${r.filters.range}-${r.generatedAt.slice(0, 10).replaceAll('-', '')}.csv`
