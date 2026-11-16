export const buildHirings = (t) => [
  { id: 'h1', proposalId: 'pr7', projectId: 'p5', freelancerId: 'u-f4', companyId: 'u-c3', status: 'ACTIVE', startDate: t.ago(12), completedAt: null },
  { id: 'h2', proposalId: 'pr8', projectId: 'p6', freelancerId: 'u-f1', companyId: 'u-c2', status: 'COMPLETED', startDate: t.ago(40), completedAt: t.ago(10) },
]
export const buildReviews = (t) => [
  { id: 'rv1', hiringId: 'h2', reviewerId: 'u-c2', revieweeId: 'u-f1', rating: 5, comment: 'Delivered ahead of schedule and communicated clearly throughout.', createdAt: t.ago(9) },
]
export const buildNotifications = (t) => [
  { id: 'n1', userId: 'u-f1', type: 'SHORTLISTED', message: 'Your proposal for "E-commerce Website" has been shortlisted.', link: '/freelancer/proposals/pr1', read: false, createdAt: t.ago(1) },
  { id: 'n2', userId: 'u-f1', type: 'SHORTLISTED', message: 'Your proposal for "Inventory Management Dashboard" has been shortlisted.', link: '/freelancer/proposals/pr4', read: false, createdAt: t.ago(2) },
  { id: 'n3', userId: 'u-f1', type: 'COMPLETED', message: 'Project "Company Portfolio Website" has been marked completed.', link: '/freelancer/hirings', read: true, createdAt: t.ago(10) },
  { id: 'n4', userId: 'u-c1', type: 'PROPOSAL', message: 'Priya Deshmukh submitted a proposal for "E-commerce Website".', link: '/company/projects/p1/proposals', read: false, createdAt: t.ago(2) },
  { id: 'n5', userId: 'u-c1', type: 'DEMO', message: 'Aarav Sharma submitted a demo for "E-commerce Website".', link: '/company/proposals/pr1/demo', read: false, createdAt: t.ago(0, 16) },
  { id: 'n6', userId: 'u-c3', type: 'DEMO_VIEWED', message: 'You viewed the demo from Rohan Patil.', link: '/company/projects/p4/proposals', read: true, createdAt: t.ago(0, 12) },
]
export const buildReports = (t) => [
  { id: 'rp1', reporterId: 'u-f2', targetType: 'PROJECT', targetId: 'p8', reason: 'Project description asks for unpaid work samples.', status: 'OPEN', createdAt: t.ago(5) },
  { id: 'rp2', reporterId: 'u-c1', targetType: 'USER', targetId: 'u-f4', reason: 'Profile claims certifications that could not be verified.', status: 'OPEN', createdAt: t.ago(3) },
]
