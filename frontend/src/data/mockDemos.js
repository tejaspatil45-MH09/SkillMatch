// Demo URLs live only here (the "database"). They are never returned by list/detail endpoints.
const D = (id, proposalId, url, description, submittedHoursAgo, viewedHoursAgo = null) => ({ id, proposalId, url, description, submittedHoursAgo, viewedHoursAgo })
export const buildDemos = (t) => [
  D('d1', 'pr1', 'https://demo.example.com/kirana-hardware', 'Working cart and product listing with seeded catalogue data.', 16),
  D('d2', 'pr5', 'https://demo.example.com/forecast-notebook', 'Notebook with the baseline model and error metrics.', 20, 12),
  D('d3', 'pr6', 'https://demo.example.com/checkout-prototype', 'Clickable Figma prototype of the new checkout.', 30),
].map(({ submittedHoursAgo, viewedHoursAgo, ...d }) => ({
  ...d, submittedAt: t.ago(0, submittedHoursAgo), expiresAt: t.ago(0, submittedHoursAgo - 24), viewedAt: viewedHoursAgo ? t.ago(0, viewedHoursAgo) : null }))
