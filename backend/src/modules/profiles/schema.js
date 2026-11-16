import { z } from 'zod'

const text = (max) => z.string().trim().max(max)
const httpUrl = z.string().trim().max(500).refine((u) => u === '' || /^https?:\/\/\S+\.\S+$/i.test(u), 'Enter a full link starting with http:// or https://.')
const skillNames = z.array(z.string().trim().min(1).max(40)).max(30, 'Choose at most 30 skills.')

// Client-generated ids ("pf-123") are accepted and treated as "new"; the server assigns real ids.
const portfolioItem = z.strictObject({
  id: z.string().max(100).optional(),
  title: z.string().trim().min(1, 'Enter a title.').max(100),
  description: z.string().trim().min(10, 'Add a short description (at least 10 characters).').max(500),
  url: httpUrl.nullish(),   // the API returns null for "no link", and clients send the whole list back
  image: z.null({ error: 'Image upload is not supported yet.' }).optional(),
})
const experienceItem = z.strictObject({
  id: z.string().max(100).optional(),
  role: z.string().trim().min(1).max(100), org: z.string().trim().min(1).max(100), period: z.string().trim().min(1).max(50), summary: text(500).optional(),
})

const name = z.string().trim().min(2, 'Enter your name.').max(100)

export const freelancerUpdate = z.strictObject({
  name: name.optional(),
  profile: z.strictObject({
    headline: text(120), location: text(120), bio: text(1000),
    experienceYears: z.number().int().min(0).max(50), skills: skillNames,
    portfolio: z.array(portfolioItem).max(20, 'Add at most 20 portfolio projects.'),
    experience: z.array(experienceItem).max(20),
  }).partial().optional(),
})
export const companyUpdate = z.strictObject({
  name: name.optional(),
  profile: z.strictObject({ description: text(1000), website: httpUrl, location: text(120), industry: text(80) }).partial().optional(),
})
export const adminUpdate = z.strictObject({ name: name.optional() })
export const updateSchemaFor = (role) => ({ FREELANCER: freelancerUpdate, COMPANY: companyUpdate, ADMIN: adminUpdate })[role]
