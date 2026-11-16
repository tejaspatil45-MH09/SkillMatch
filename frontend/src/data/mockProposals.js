const cl = (n) => `I have worked on similar projects and can deliver this in a clear, well-tested way. ${n}`
const R = (id, projectId, freelancerId, bidAmount, estimatedDays, status, ago, note) => ({ id, projectId, freelancerId, bidAmount, estimatedDays, status, ago, coverLetter: cl(note) })
export const buildProposals = (t) => [
  R('pr1', 'p1', 'u-f1', 34000, 24, 'SHORTLISTED', 2, 'I recently built a grocery storefront with the same stack.'),
  R('pr2', 'p1', 'u-f3', 38000, 28, 'PENDING', 2, 'I can handle the front end and align it with your designs.'),
  R('pr3', 'p1', 'u-f4', 30000, 30, 'REJECTED', 3, 'My background is backend services.'),
  R('pr4', 'p2', 'u-f1', 36000, 30, 'SHORTLISTED', 5, 'Dashboards with role-based access are my specialty.'),
  R('pr5', 'p4', 'u-f2', 52000, 32, 'SHORTLISTED', 8, 'I built a demand forecaster for a retail chain.'),
  R('pr6', 'p3', 'u-f3', 21000, 14, 'SHORTLISTED', 4, 'Mobile checkout flows are a regular part of my work.'),
  R('pr7', 'p5', 'u-f4', 44000, 28, 'ACCEPTED', 22, 'Billing systems in Spring Boot are my daily work.'),
  R('pr8', 'p6', 'u-f1', 16000, 15, 'ACCEPTED', 58, 'I can ship this quickly with Tailwind.'),
  R('pr9', 'p7', 'u-f2', 60000, 40, 'PENDING', 1, 'I can prototype the optimiser in Python first.'),
].map(({ ago, ...p }) => ({ ...p, createdAt: t.ago(ago) }))
