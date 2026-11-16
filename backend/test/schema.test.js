import { describe, expect, it } from 'vitest'
import { db, inTx, expectPgError, mkUser, mkProject, mkProposal } from './helpers.js'

describe('schema', () => {
  it('creates every expected table', async () => {
    const { rows } = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1")
    const names = rows.map((r) => r.table_name)
    for (const t of ['users', 'freelancer_profiles', 'company_profiles', 'skills', 'freelancer_skills', 'project_skills', 'portfolio_items', 'experiences', 'projects', 'proposals', 'demos', 'demo_access_log', 'hirings', 'reviews', 'notifications', 'reports', 'password_reset_tokens', 'work_submissions', 'hiring_messages'])
      expect(names).toContain(t)
  })

  describe('users and profiles', () => {
    it('emails are unique regardless of case', () => inTx(async (c) => {
      await c.query("INSERT INTO users (name, email, password_hash, role) VALUES ('Ann One','Ann@Example.com','x','FREELANCER')")
      await expectPgError(c, '23505', "INSERT INTO users (name, email, password_hash, role) VALUES ('Ann Two','ann@example.COM','x','FREELANCER')")
    }))
    it('rejects malformed emails and one-letter names', () => inTx(async (c) => {
      await expectPgError(c, '23514', "INSERT INTO users (name, email, password_hash, role) VALUES ('Ann One','not-an-email','x','FREELANCER')")
      await expectPgError(c, '23514', "INSERT INTO users (name, email, password_hash, role) VALUES ('A','a@b.co','x','FREELANCER')")
    }))
    it('a freelancer profile can only belong to a FREELANCER (and a company profile to a COMPANY)', () => inTx(async (c) => {
      const company = await mkUser(c, 'COMPANY'), freelancer = await mkUser(c, 'FREELANCER')
      await expectPgError(c, '23503', 'INSERT INTO freelancer_profiles (user_id) VALUES ($1)', [company])
      await expectPgError(c, '23503', 'INSERT INTO company_profiles (user_id) VALUES ($1)', [freelancer])
    }))
    it('unknown roles are rejected by the enum', () => inTx(async (c) => {
      await expectPgError(c, '22P02', "INSERT INTO users (name, email, password_hash, role) VALUES ('Bad Role','b@r.co','x','SUPERUSER')")
    }))
    it('users with activity cannot be hard-deleted (suspend instead)', () => inTx(async (c) => {
      const company = await mkUser(c, 'COMPANY'); await mkProject(c, company)
      await expectPgError(c, '23503', 'DELETE FROM users WHERE id = $1', [company])
    }))
  })

  describe('projects', () => {
    it('only a COMPANY can own a project', () => inTx(async (c) => {
      const freelancer = await mkUser(c, 'FREELANCER')
      await expectPgError(c, '23503', "INSERT INTO projects (company_id, title, description, budget_min, budget_max, deadline) VALUES ($1,'Some title','A description long enough to pass the check.',1,2,now())", [freelancer])
    }))
    it('budget must be positive and min <= max', () => inTx(async (c) => {
      const co = await mkUser(c, 'COMPANY')
      const ins = "INSERT INTO projects (company_id, title, description, budget_min, budget_max, deadline) VALUES ($1,'Some title','A description long enough to pass the check.',$2,$3,now())"
      await expectPgError(c, '23514', ins, [co, 5000, 1000])
      await expectPgError(c, '23514', ins, [co, 0, 1000])
    }))
    it('rejects too-short titles and descriptions', () => inTx(async (c) => {
      const co = await mkUser(c, 'COMPANY')
      await expectPgError(c, '23514', "INSERT INTO projects (company_id, title, description, budget_min, budget_max, deadline) VALUES ($1,'Hi','A description long enough to pass the check.',1,2,now())", [co])
      await expectPgError(c, '23514', "INSERT INTO projects (company_id, title, description, budget_min, budget_max, deadline) VALUES ($1,'Good title','too short',1,2,now())", [co])
    }))
    it('skill names are unique ignoring case', () => inTx(async (c) => {
      await c.query("INSERT INTO skills (name) VALUES ('GraphQL')")
      await expectPgError(c, '23505', "INSERT INTO skills (name) VALUES ('graphql')")
    }))
  })

  describe('proposals', () => {
    it('only a FREELANCER can submit a proposal', () => inTx(async (c) => {
      const co = await mkUser(c, 'COMPANY'), other = await mkUser(c, 'COMPANY'), p = await mkProject(c, co)
      await expectPgError(c, '23503', 'INSERT INTO proposals (project_id, freelancer_id, cover_letter, bid_amount, estimated_days) VALUES ($1,$2,$3,100,5)', [p, other, 'x'.repeat(60)])
    }))
    it('one proposal per freelancer per project (duplicate -> unique violation)', () => inTx(async (c) => {
      const co = await mkUser(c, 'COMPANY'), f = await mkUser(c, 'FREELANCER'), p = await mkProject(c, co)
      await mkProposal(c, p, f)
      await expectPgError(c, '23505', 'INSERT INTO proposals (project_id, freelancer_id, cover_letter, bid_amount, estimated_days) VALUES ($1,$2,$3,100,5)', [p, f, 'y'.repeat(60)])
    }))
    it('bid and days must be in range; cover letter long enough', () => inTx(async (c) => {
      const co = await mkUser(c, 'COMPANY'), f = await mkUser(c, 'FREELANCER'), p = await mkProject(c, co)
      const ins = 'INSERT INTO proposals (project_id, freelancer_id, cover_letter, bid_amount, estimated_days) VALUES ($1,$2,$3,$4,$5)'
      await expectPgError(c, '23514', ins, [p, f, 'x'.repeat(60), 0, 5])
      await expectPgError(c, '23514', ins, [p, f, 'x'.repeat(60), 100, 0])
      await expectPgError(c, '23514', ins, [p, f, 'x'.repeat(60), 100, 366])
      await expectPgError(c, '23514', ins, [p, f, 'short', 100, 5])
    }))
  })

  describe('demos', () => {
    const setup = async (c) => { const co = await mkUser(c, 'COMPANY'), f = await mkUser(c, 'FREELANCER'), p = await mkProject(c, co); return mkProposal(c, p, f, 'SHORTLISTED') }
    const ins = 'INSERT INTO demos (proposal_id, url, description, expires_at) VALUES ($1,$2,$3,now() + interval \'24 hours\')'
    it('accepts http(s) links and rejects other schemes', () => inTx(async (c) => {
      const pr = await setup(c)
      for (const bad of ['javascript:alert(1)', 'data:text/html,<h1>x</h1>', 'file:///etc/passwd', 'ftp://x.example.com/a', 'https://has space.com'])
        await expectPgError(c, '23514', ins, [pr, bad, 'A description that is long enough.'])
      await c.query(ins, [pr, 'https://demo.example.com/app', 'A description that is long enough.'])
    }))
    it('one demo per proposal; expiry must be after submission', () => inTx(async (c) => {
      const pr = await setup(c)
      await c.query(ins, [pr, 'https://demo.example.com/a', 'A description that is long enough.'])
      await expectPgError(c, '23505', ins, [pr, 'https://demo.example.com/b', 'Another description that is long enough.'])
      const pr2 = await setup(c)
      await expectPgError(c, '23514', "INSERT INTO demos (proposal_id, url, description, submitted_at, expires_at) VALUES ($1,'https://a.example.com','A description that is long enough.', now(), now() - interval '1 hour')", [pr2])
    }))
  })

  describe('hirings', () => {
    async function accepted(c) {
      const co = await mkUser(c, 'COMPANY'), f = await mkUser(c, 'FREELANCER'), p = await mkProject(c, co), pr = await mkProposal(c, p, f, 'ACCEPTED')
      return { co, f, p, pr }
    }
    const ins = "INSERT INTO hirings (proposal_id, project_id, freelancer_id, company_id) VALUES ($1,$2,$3,$4)"
    it('a hiring must agree with its proposal and the project owner', () => inTx(async (c) => {
      const a = await accepted(c), stranger = await mkUser(c, 'FREELANCER'), otherCo = await mkUser(c, 'COMPANY')
      await expectPgError(c, '23503', ins, [a.pr, a.p, stranger, a.co])   // wrong freelancer
      await expectPgError(c, '23503', ins, [a.pr, a.p, a.f, otherCo])     // wrong company
      await c.query(ins, [a.pr, a.p, a.f, a.co])
    }))
    it('at most one live hiring per project, but a cancelled one can be replaced', () => inTx(async (c) => {
      const a = await accepted(c), f2 = await mkUser(c, 'FREELANCER'), pr2 = await mkProposal(c, a.p, f2, 'ACCEPTED')
      await c.query(ins, [a.pr, a.p, a.f, a.co])
      await expectPgError(c, '23505', ins, [pr2, a.p, f2, a.co])
      await c.query("UPDATE hirings SET status='CANCELLED', cancel_reason='Scope changed completely' WHERE proposal_id=$1", [a.pr])
      await c.query(ins, [pr2, a.p, f2, a.co])
    }))
    it('completed_at is set exactly when COMPLETED; cancellation needs a reason', () => inTx(async (c) => {
      const a = await accepted(c)
      await expectPgError(c, '23514', "INSERT INTO hirings (proposal_id, project_id, freelancer_id, company_id, status) VALUES ($1,$2,$3,$4,'COMPLETED')", [a.pr, a.p, a.f, a.co])
      await expectPgError(c, '23514', "INSERT INTO hirings (proposal_id, project_id, freelancer_id, company_id, status, completed_at) VALUES ($1,$2,$3,$4,'ACTIVE',now())", [a.pr, a.p, a.f, a.co])
      await expectPgError(c, '23514', "INSERT INTO hirings (proposal_id, project_id, freelancer_id, company_id, status, cancel_reason) VALUES ($1,$2,$3,$4,'CANCELLED','no')", [a.pr, a.p, a.f, a.co])
    }))
  })

  describe('reviews', () => {
    it('rating 1-5, one review per reviewer per hiring, no self-review', () => inTx(async (c) => {
      const co = await mkUser(c, 'COMPANY'), f = await mkUser(c, 'FREELANCER'), p = await mkProject(c, co), pr = await mkProposal(c, p, f, 'ACCEPTED')
      const h = (await c.query("INSERT INTO hirings (proposal_id, project_id, freelancer_id, company_id, status, completed_at) VALUES ($1,$2,$3,$4,'COMPLETED',now()) RETURNING id", [pr, p, f, co])).rows[0].id
      const ins = 'INSERT INTO reviews (hiring_id, reviewer_id, reviewee_id, rating, comment) VALUES ($1,$2,$3,$4,$5)'
      await expectPgError(c, '23514', ins, [h, co, f, 6, 'x'])
      await expectPgError(c, '23514', ins, [h, co, f, 0, 'x'])
      await expectPgError(c, '23514', ins, [h, co, co, 5, 'x'])
      await c.query(ins, [h, co, f, 5, 'Great'])
      await expectPgError(c, '23505', ins, [h, co, f, 4, 'Again'])
      await c.query(ins, [h, f, co, 4, 'Good client'])   // the other party can still review
    }))
  })

  describe('reports', () => {
    it('exactly one target; no self-reports', () => inTx(async (c) => {
      const a = await mkUser(c, 'FREELANCER'), b = await mkUser(c, 'COMPANY'), p = await mkProject(c, b)
      const reason = 'This is a sufficiently detailed reason.'
      await expectPgError(c, '23514', 'INSERT INTO reports (reporter_id, reason) VALUES ($1,$2)', [a, reason])
      await expectPgError(c, '23514', 'INSERT INTO reports (reporter_id, target_user_id, target_project_id, reason) VALUES ($1,$2,$3,$4)', [a, b, p, reason])
      await expectPgError(c, '23514', 'INSERT INTO reports (reporter_id, target_user_id, reason) VALUES ($1,$1,$2)', [a, reason])
      await expectPgError(c, '23514', 'INSERT INTO reports (reporter_id, target_user_id, reason) VALUES ($1,$2,$3)', [a, b, 'too short'])
    }))
    it('one OPEN report per reporter per target; allowed again once resolved', () => inTx(async (c) => {
      const a = await mkUser(c, 'FREELANCER'), b = await mkUser(c, 'COMPANY'), p = await mkProject(c, b)
      const reason = 'This is a sufficiently detailed reason.'
      await c.query('INSERT INTO reports (reporter_id, target_project_id, reason) VALUES ($1,$2,$3)', [a, p, reason])
      await expectPgError(c, '23505', 'INSERT INTO reports (reporter_id, target_project_id, reason) VALUES ($1,$2,$3)', [a, p, reason])
      await c.query("UPDATE reports SET status='RESOLVED', resolved_at=now() WHERE reporter_id=$1", [a])
      await c.query('INSERT INTO reports (reporter_id, target_project_id, reason) VALUES ($1,$2,$3)', [a, p, reason])
    }))
  })

  it('portfolio items and experience keep insertion order even when inserted in one transaction', () => inTx(async (c) => {
    const f = await mkUser(c, 'FREELANCER')
    for (const t of ['first', 'second', 'third', 'fourth', 'fifth']) {
      await c.query("INSERT INTO portfolio_items (user_id, title, description) VALUES ($1,$2,'A description long enough.')", [f, t])
      await c.query("INSERT INTO experiences (user_id, role, org, period) VALUES ($1,$2,'Org','2024')", [f, t])
    }
    const p = await c.query('SELECT title FROM portfolio_items WHERE user_id = $1 ORDER BY sort_order', [f])
    const e = await c.query('SELECT role FROM experiences WHERE user_id = $1 ORDER BY sort_order', [f])
    expect(p.rows.map((r) => r.title)).toEqual(['first', 'second', 'third', 'fourth', 'fifth'])
    expect(e.rows.map((r) => r.role)).toEqual(['first', 'second', 'third', 'fourth', 'fifth'])
  }))

  it('updated_at moves forward when a row changes', () => inTx(async (c) => {
    const co = await mkUser(c, 'COMPANY'), p = await mkProject(c, co)
    await c.query("UPDATE projects SET created_at = now() - interval '1 day', updated_at = now() - interval '1 day' WHERE id = $1", [p])
    await c.query("UPDATE projects SET title = 'Renamed project' WHERE id = $1", [p])
    const { rows } = await c.query("SELECT updated_at > now() - interval '1 minute' AS fresh FROM projects WHERE id = $1", [p])
    expect(rows[0].fresh).toBe(true)
  }))
})
