import { buildUsers } from './mockUsers'
import { buildProjects, SKILLS } from './mockProjects'
import { buildProposals } from './mockProposals'
import { buildDemos } from './mockDemos'
import { buildHirings, buildReviews, buildNotifications, buildReports } from './mockMisc'

const KEY = 'skillmatch_mock_db_v1'
const HOUR = 36e5
const store = typeof localStorage !== 'undefined' ? localStorage : null

// Time helpers: ago(days, hours) is in the past, later(hours) is in the future
const times = (now = Date.now()) => ({
  ago: (d = 0, h = 0) => new Date(now - d * 24 * HOUR - h * HOUR).toISOString(),
  later: (h) => new Date(now + h * HOUR).toISOString(),
})

function seed() {
  const t = times()
  return { users: buildUsers(t), projects: buildProjects(t), proposals: buildProposals(t), demos: buildDemos(t),
    hirings: buildHirings(t), reviews: buildReviews(t), notifications: buildNotifications(t), reports: buildReports(t),
    skills: SKILLS.map((name, i) => ({ id: `s${i + 1}`, name })), counter: 100 }
}

let db = null
export function getDb() {
  if (db) return db
  try { db = JSON.parse(store?.getItem(KEY)) } catch { db = null }
  return (db ??= seed())
}
export const save = () => { try { store?.setItem(KEY, JSON.stringify(db)) } catch { /* storage full or blocked */ } }
export function resetDb() { db = seed(); save(); return db }
export const uid = (prefix) => `${prefix}-${getDb().counter++}`
