// Skill Match % = matched required skills / total required skills.
// The real backend will compute this; the UI only displays the returned value.
export function skillMatch(required = [], owned = []) {
  if (!required.length) return 0
  const have = new Set(owned.map((s) => s.toLowerCase()))
  return Math.round((required.filter((s) => have.has(s.toLowerCase())).length / required.length) * 100)
}
