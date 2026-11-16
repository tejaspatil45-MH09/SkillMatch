export const isEmail = (v = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

export function validateLogin({ email, password }) {
  const e = {}
  if (!email.trim()) e.email = 'Enter your email address.'
  else if (!isEmail(email)) e.email = 'Enter a valid email address, like name@example.com.'
  if (!password) e.password = 'Enter your password.'
  return e
}

export function validateRegister({ name, email, password, confirmPassword, role }) {
  const e = {}
  if (!role) e.role = 'Choose how you will use SkillMatch.'
  if (name.trim().length < 2) e.name = role === 'COMPANY' ? 'Enter your company name.' : 'Enter your full name.'
  if (!isEmail(email)) e.email = 'Enter a valid email address, like name@example.com.'
  if (password.length < 8) e.password = 'Use at least 8 characters.'
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) e.password = 'Include at least one letter and one number.'
  if (!confirmPassword) e.confirmPassword = 'Re-enter your password.'
  else if (confirmPassword !== password) e.confirmPassword = 'Passwords do not match.'
  return e
}

export function validateProposal({ coverLetter, bidAmount, estimatedDays }) {
  const e = {}
  if (coverLetter.trim().length < 50) e.coverLetter = `Write at least 50 characters (${coverLetter.trim().length}/50).`
  else if (coverLetter.length > 2000) e.coverLetter = 'Keep the cover letter under 2000 characters.'
  const bid = Number(bidAmount)
  if (!bidAmount) e.bidAmount = 'Enter your bid amount.'
  else if (!Number.isFinite(bid) || bid <= 0) e.bidAmount = 'Bid must be a positive amount.'
  const days = Number(estimatedDays)
  if (!estimatedDays) e.estimatedDays = 'Enter the estimated number of days.'
  else if (!Number.isInteger(days) || days < 1 || days > 365) e.estimatedDays = 'Enter a whole number of days between 1 and 365.'
  return e
}
export function validatePortfolio({ title, description, url }) {
  const e = {}
  if (!title.trim()) e.title = 'Enter a title.'
  if (description.trim().length < 10) e.description = 'Add a short description (at least 10 characters).'
  if (url && !/^https?:\/\/\S+\.\S+/.test(url.trim())) e.url = 'Enter a full URL starting with http:// or https://.'
  return e
}
export function validateProfile({ name, headline, experienceYears, bio }) {
  const e = {}
  if (name.trim().length < 2) e.name = 'Enter your name.'
  if (!headline.trim()) e.headline = 'Add a short headline, like "Full-stack developer".'
  const y = Number(experienceYears)
  if (experienceYears === '' || !Number.isFinite(y) || y < 0 || y > 50) e.experienceYears = 'Enter years of experience (0 to 50).'
  if (bio.trim().length < 20) e.bio = 'Write a short bio (at least 20 characters).'
  return e
}

export function validateProject({ title, description, budgetMin, budgetMax, deadline, skills }) {
  const e = {}
  if (title.trim().length < 5) e.title = 'Enter a project title (at least 5 characters).'
  else if (title.trim().length > 100) e.title = 'Keep the title under 100 characters.'
  if (description.trim().length < 30) e.description = `Describe the project in at least 30 characters (${description.trim().length}/30).`
  const min = Number(budgetMin), max = Number(budgetMax)
  if (!budgetMin || !(min > 0)) e.budgetMin = 'Enter a minimum budget above 0.'
  if (!budgetMax || !(max > 0)) e.budgetMax = 'Enter a maximum budget above 0.'
  else if (min > max) e.budgetMax = 'Maximum budget must be at least the minimum.'
  if (!deadline) e.deadline = 'Choose a deadline.'
  else if (new Date(deadline + 'T23:59:59') < new Date()) e.deadline = 'Deadline must be in the future.'
  if (!skills.length) e.skills = 'Select at least one required skill.'
  return e
}
export function validateCompany({ name, description, website }) {
  const e = {}
  if (name.trim().length < 2) e.name = 'Enter your company name.'
  if (description.trim().length < 20) e.description = 'Describe your company in at least 20 characters.'
  if (website && !/^https?:\/\/\S+\.\S+/.test(website.trim())) e.website = 'Enter a full URL starting with http:// or https://.'
  return e
}

export function validateDemo({ url, description }) {
  const e = {}
  if (!url.trim()) e.url = 'Enter the link to your demo.'
  else if (!/^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]+$/i.test(url.trim())) e.url = 'Enter a full link starting with https:// (or http://).'
  if (description.trim().length < 20) e.description = `Describe what the company will see (at least 20 characters, ${description.trim().length}/20).`
  else if (description.length > 1000) e.description = 'Keep the description under 1000 characters.'
  return e
}

// ---- Work submission (the server checks all of this again; this is only for fast feedback)
const GITHUB_REPO = /^https:\/\/(www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\/\S*)?$/i
export function validateSubmission({ title, description, repoUrl, liveUrl }) {
  const e = {}
  if (title.trim().length < 3) e.title = 'Give the submission a title (at least 3 characters).'
  else if (title.trim().length > 120) e.title = 'Keep the title under 120 characters.'
  if (repoUrl.trim() && !GITHUB_REPO.test(repoUrl.trim())) e.repoUrl = 'Enter a GitHub repository link, like https://github.com/owner/repository.'
  if (liveUrl.trim() && !/^https?:\/\/[^\s/$.?#@][^\s@]*\.[^\s@]+$/i.test(liveUrl.trim())) e.liveUrl = 'Enter a full link starting with https:// (or http://).'
  if (description.length > 5000) e.description = 'Keep the notes under 5000 characters.'
  else if (!repoUrl.trim() && !liveUrl.trim() && description.trim().length < 20) e.description = 'Add a repository or live link, or describe what you are delivering (at least 20 characters).'
  return e
}
export function validateRevision({ feedback }) {
  const e = {}
  if (feedback.trim().length < 10) e.feedback = `Explain what needs to change (at least 10 characters, ${feedback.trim().length}/10).`
  else if (feedback.trim().length > 1000) e.feedback = 'Keep the explanation under 1000 characters.'
  return e
}
export const MESSAGE_MAX = 2000
// Only ever render a demo URL as a link if it is plain http(s)
export const isSafeUrl = (u = '') => /^https?:\/\//i.test(u)

export function validateReset({ password, confirmPassword }) {
  const e = {}
  if (password.length < 8) e.password = 'Use at least 8 characters.'
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) e.password = 'Include at least one letter and one number.'
  if (!confirmPassword) e.confirmPassword = 'Re-enter your new password.'
  else if (confirmPassword !== password) e.confirmPassword = 'Passwords do not match.'
  return e
}
