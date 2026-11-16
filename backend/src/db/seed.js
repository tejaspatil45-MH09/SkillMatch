import argon2 from 'argon2'

// Development/demo data: the same people, projects and demo states the frontend's mock server uses,
// so switching the frontend from mock to real API feels identical.
export const DEMO_PASSWORD = 'Password@123'
const HOUR = 36e5

const SKILLS = ['React', 'Node.js', 'PostgreSQL', 'Python', 'C++', 'JavaScript', 'TypeScript', 'Tailwind CSS', 'Express', 'MongoDB', 'UI/UX Design', 'Figma', 'Django', 'Flutter', 'Java', 'Spring Boot', 'Docker', 'AWS', 'Data Analysis', 'Machine Learning', 'SEO', 'WordPress', 'Git', 'REST APIs']

const USERS = [
  { key: 'admin', name: 'Meera Kulkarni', email: 'admin@skillmatch.dev', role: 'ADMIN', joined: 200 },
  { key: 'f1', name: 'Aarav Sharma', email: 'aarav@skillmatch.dev', role: 'FREELANCER', joined: 120,
    p: { headline: 'Full-stack developer', location: 'Pune, Maharashtra', years: 3, bio: 'I build web applications with React and Node.js. Recently shipped two e-commerce platforms for small retailers.',
      skills: ['React', 'Node.js', 'PostgreSQL', 'JavaScript', 'Tailwind CSS', 'Express', 'REST APIs'],
      portfolio: [['Kirana Cart', 'Online grocery storefront with inventory sync.', 'https://example.com/kirana-cart'], ['Clinic Booking Portal', 'Appointment scheduling for a multi-doctor clinic.', 'https://example.com/clinic-booking']],
      experience: [['Junior Developer', 'Webwise Infotech', '2023 - 2024', 'Built client dashboards in React.']] } },
  { key: 'f2', name: 'Rohan Patil', email: 'rohan@skillmatch.dev', role: 'FREELANCER', joined: 100,
    p: { headline: 'Python and ML engineer', location: 'Nagpur, Maharashtra', years: 4, bio: 'Data-focused engineer building forecasting models and Django backends.',
      skills: ['Python', 'Django', 'PostgreSQL', 'Docker', 'Machine Learning', 'Data Analysis'], portfolio: [['Demand Forecaster', 'Time-series model for a retail chain.', 'https://example.com/forecaster']], experience: [] } },
  { key: 'f3', name: 'Priya Deshmukh', email: 'priya@skillmatch.dev', role: 'FREELANCER', joined: 90,
    p: { headline: 'Product designer', location: 'Mumbai, Maharashtra', years: 5, bio: 'I design clear, accessible interfaces for mobile and web products.',
      skills: ['UI/UX Design', 'Figma', 'React', 'Tailwind CSS'], portfolio: [['FinTrack App', 'Personal finance app redesign.', 'https://example.com/fintrack']], experience: [] } },
  { key: 'f4', name: 'Kunal Joshi', email: 'kunal@skillmatch.dev', role: 'FREELANCER', joined: 80,
    p: { headline: 'Backend engineer', location: 'Bengaluru, Karnataka', years: 6, bio: 'Java and C++ developer focused on reliable backend services.',
      skills: ['C++', 'Java', 'Spring Boot', 'PostgreSQL', 'Docker'], portfolio: [], experience: [] } },
  { key: 'c1', name: 'TechNova Solutions', email: 'hr@technova.dev', role: 'COMPANY', joined: 150,
    p: { description: 'Software products for logistics and retail businesses.', website: 'https://technova.example.com', location: 'Pune, Maharashtra', industry: 'Software' } },
  { key: 'c2', name: 'PixelCraft Technologies', email: 'team@pixelcraft.dev', role: 'COMPANY', joined: 140,
    p: { description: 'Digital design and branding studio.', website: 'https://pixelcraft.example.com', location: 'Mumbai, Maharashtra', industry: 'Design' } },
  { key: 'c3', name: 'InnovateLabs', email: 'projects@innovatelabs.dev', role: 'COMPANY', joined: 130,
    p: { description: 'Applied data and fintech products.', website: 'https://innovatelabs.example.com', location: 'Bengaluru, Karnataka', industry: 'Fintech' } },
]

// key, company, title, description, min, max, deadline (days ahead), skills, status, posted (days ago)
const PROJECTS = [
  ['p1', 'c1', 'E-commerce Website', 'Build a storefront for our regional hardware catalogue: product listing, cart, order tracking, and an admin panel for stock updates. We have designs ready.', 25000, 40000, 30, ['React', 'Node.js', 'PostgreSQL'], 'OPEN', 3],
  ['p2', 'c1', 'Inventory Management Dashboard', 'Internal dashboard for warehouse stock levels with low-stock alerts, CSV import, and role-based views for managers and staff.', 30000, 45000, 45, ['React', 'Express', 'PostgreSQL', 'Tailwind CSS'], 'OPEN', 6],
  ['p3', 'c2', 'Mobile App UI Redesign', "Redesign the onboarding and checkout screens of our client's food delivery app. Deliverables: Figma files and a short usability review.", 15000, 25000, 21, ['UI/UX Design', 'Figma'], 'OPEN', 4],
  ['p4', 'c3', 'Sales Forecasting Model', 'Develop a monthly sales forecasting model from three years of transaction data, with a notebook and a short methodology report.', 40000, 60000, 40, ['Python', 'Machine Learning', 'Data Analysis'], 'OPEN', 9],
  ['p5', 'c3', 'Billing Microservice', 'Create a billing microservice handling invoices and recurring charges, with Docker deployment and API documentation.', 35000, 50000, 35, ['Java', 'Spring Boot', 'PostgreSQL', 'Docker'], 'IN_PROGRESS', 25],
  ['p6', 'c2', 'Company Portfolio Website', 'Responsive portfolio website with case study pages and a contact form.', 12000, 20000, 20, ['React', 'Tailwind CSS'], 'COMPLETED', 60],
  ['p7', 'c1', 'Warehouse Route Optimizer', 'Implement a route optimisation module that reduces delivery distance for our warehouse fleet.', 45000, 70000, 50, ['C++', 'Python'], 'OPEN', 2],
  ['p8', 'c3', 'Customer Support Chatbot Backend', 'Backend for a rules-based support chatbot with conversation logging.', 20000, 30000, 25, ['Node.js', 'MongoDB', 'Express'], 'CANCELLED', 35],
]

// key, project, freelancer, bid, days, status, submitted (days ago), note
const PROPOSALS = [
  ['pr1', 'p1', 'f1', 34000, 24, 'SHORTLISTED', 2, 'I recently built a grocery storefront with the same stack.'],
  ['pr2', 'p1', 'f3', 38000, 28, 'PENDING', 2, 'I can handle the front end and align it with your designs.'],
  ['pr3', 'p1', 'f4', 30000, 30, 'REJECTED', 3, 'My background is backend services.'],
  ['pr4', 'p2', 'f1', 36000, 30, 'SHORTLISTED', 5, 'Dashboards with role-based access are my specialty.'],
  ['pr5', 'p4', 'f2', 52000, 32, 'SHORTLISTED', 8, 'I built a demand forecaster for a retail chain.'],
  ['pr6', 'p3', 'f3', 21000, 14, 'SHORTLISTED', 4, 'Mobile checkout flows are a regular part of my work.'],
  ['pr7', 'p5', 'f4', 44000, 28, 'ACCEPTED', 22, 'Billing systems in Spring Boot are my daily work.'],
  ['pr8', 'p6', 'f1', 16000, 15, 'ACCEPTED', 58, 'I can ship this quickly with Tailwind.'],
  ['pr9', 'p7', 'f2', 60000, 40, 'PENDING', 1, 'I can prototype the optimiser in Python first.'],
]
const LETTER = 'I have worked on similar projects and can deliver this in a clear, well-tested way.'

export async function seed(client, { now = Date.now() } = {}) {
  const ago = (d = 0, h = 0) => new Date(now - (d * 24 + h) * HOUR)
  const later = (h) => new Date(now + h * HOUR)
  const one = async (sql, params) => (await client.query(sql, params)).rows[0]

  await client.query('TRUNCATE users, skills RESTART IDENTITY CASCADE')   // cascades to every dependent table
  const hash = await argon2.hash(DEMO_PASSWORD)

  const S = {}
  for (const name of SKILLS) S[name] = (await one('INSERT INTO skills (name) VALUES ($1) RETURNING id', [name])).id

  const U = {}
  for (const u of USERS) {
    U[u.key] = (await one('INSERT INTO users (name, email, password_hash, role, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id', [u.name, u.email, hash, u.role, ago(u.joined)])).id
    if (u.role === 'FREELANCER') {
      const p = u.p
      await client.query('INSERT INTO freelancer_profiles (user_id, headline, location, experience_years, bio) VALUES ($1,$2,$3,$4,$5)', [U[u.key], p.headline, p.location, p.years, p.bio])
      for (const s of p.skills) await client.query('INSERT INTO freelancer_skills (user_id, skill_id) VALUES ($1,$2)', [U[u.key], S[s]])
      for (const [title, description, url] of p.portfolio) await client.query('INSERT INTO portfolio_items (user_id, title, description, url) VALUES ($1,$2,$3,$4)', [U[u.key], title, description, url])
      for (const [role, org, period, summary] of p.experience) await client.query('INSERT INTO experiences (user_id, role, org, period, summary) VALUES ($1,$2,$3,$4,$5)', [U[u.key], role, org, period, summary])
    }
    if (u.role === 'COMPANY') {
      const p = u.p
      await client.query('INSERT INTO company_profiles (user_id, description, website, location, industry) VALUES ($1,$2,$3,$4,$5)', [U[u.key], p.description, p.website, p.location, p.industry])
    }
  }

  const P = {}
  for (const [key, company, title, description, min, max, deadlineDays, skills, status, posted] of PROJECTS) {
    P[key] = (await one('INSERT INTO projects (company_id, title, description, budget_min, budget_max, deadline, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [U[company], title, description, min, max, later(deadlineDays * 24), status, ago(posted)])).id
    for (const s of skills) await client.query('INSERT INTO project_skills (project_id, skill_id) VALUES ($1,$2)', [P[key], S[s]])
  }

  const PR = {}
  for (const [key, project, freelancer, bid, days, status, submitted, note] of PROPOSALS) {
    PR[key] = (await one('INSERT INTO proposals (project_id, freelancer_id, cover_letter, bid_amount, estimated_days, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [P[project], U[freelancer], `${LETTER} ${note}`, bid, days, status, ago(submitted)])).id
  }

  // Demo states: one available (~8h left), one viewed, one expired. The 24h window starts at submission.
  const demos = [
    ['pr1', 'https://demo.example.com/kirana-hardware', 'Working cart and product listing with seeded catalogue data.', 16, null, 'f1'],
    ['pr5', 'https://demo.example.com/forecast-notebook', 'Notebook with the baseline model and error metrics.', 20, 12, 'f2'],
    ['pr6', 'https://demo.example.com/checkout-prototype', 'Clickable Figma prototype of the new checkout.', 30, null, 'f3'],
  ]
  for (const [pr, url, description, submittedHoursAgo, viewedHoursAgo, owner] of demos) {
    const submitted = ago(0, submittedHoursAgo)
    const d = await one('INSERT INTO demos (proposal_id, url, description, submitted_at, expires_at, viewed_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [PR[pr], url, description, submitted, new Date(submitted.getTime() + 24 * HOUR), viewedHoursAgo ? ago(0, viewedHoursAgo) : null])
    await client.query("INSERT INTO demo_access_log (demo_id, user_id, outcome, created_at) VALUES ($1,$2,'SUBMITTED',$3)", [d.id, U[owner], submitted])
    if (viewedHoursAgo) await client.query("INSERT INTO demo_access_log (demo_id, user_id, outcome, created_at) VALUES ($1,$2,'GRANTED',$3)", [d.id, U.c3, ago(0, viewedHoursAgo)])
  }

  const H1 = await one("INSERT INTO hirings (proposal_id, project_id, freelancer_id, company_id, status, start_date) VALUES ($1,$2,$3,$4,'ACTIVE',$5) RETURNING id", [PR.pr7, P.p5, U.f4, U.c3, ago(12)])
  const H2 = await one("INSERT INTO hirings (proposal_id, project_id, freelancer_id, company_id, status, start_date, completed_at) VALUES ($1,$2,$3,$4,'COMPLETED',$5,$6) RETURNING id", [PR.pr8, P.p6, U.f1, U.c2, ago(40), ago(10)])
  await client.query('INSERT INTO reviews (hiring_id, reviewer_id, reviewee_id, rating, comment, created_at) VALUES ($1,$2,$3,5,$4,$5)', [H2.id, U.c2, U.f1, 'Delivered ahead of schedule and communicated clearly throughout.', ago(9)])

  const notes = [
    ['f1', 'SHORTLISTED', 'Your proposal for "E-commerce Website" has been shortlisted.', `/freelancer/proposals/${PR.pr1}`, false, ago(1)],
    ['f1', 'SHORTLISTED', 'Your proposal for "Inventory Management Dashboard" has been shortlisted.', `/freelancer/proposals/${PR.pr4}`, false, ago(2)],
    ['f1', 'COMPLETED', 'Project "Company Portfolio Website" has been marked completed.', '/freelancer/hirings', true, ago(10)],
    ['c1', 'PROPOSAL', 'Priya Deshmukh submitted a proposal for "E-commerce Website".', `/company/projects/${P.p1}/proposals`, false, ago(2)],
    ['c1', 'DEMO', 'Aarav Sharma submitted a demo for "E-commerce Website".', `/company/proposals/${PR.pr1}/demo`, false, ago(0, 16)],
    ['c3', 'DEMO_VIEWED', 'You viewed the demo from Rohan Patil.', `/company/projects/${P.p4}/proposals`, true, ago(0, 12)],
  ]
  for (const [user, type, message, link, read, at] of notes) await client.query('INSERT INTO notifications (user_id, type, message, link, read, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [U[user], type, message, link, read, at])

  await client.query('INSERT INTO reports (reporter_id, target_project_id, reason, created_at) VALUES ($1,$2,$3,$4)', [U.f2, P.p8, 'Project description asks for unpaid work samples.', ago(5)])
  await client.query('INSERT INTO reports (reporter_id, target_user_id, reason, created_at) VALUES ($1,$2,$3,$4)', [U.c1, U.f4, 'Profile claims certifications that could not be verified.', ago(3)])

  return counts(client)
}

export async function counts(client) {
  const tables = ['users', 'skills', 'projects', 'proposals', 'demos', 'hirings', 'reviews', 'notifications', 'reports']
  const out = {}
  for (const t of tables) out[t] = Number((await client.query(`SELECT count(*) FROM ${t}`)).rows[0].count)
  return out
}
