// MOCK ONLY: plain-text passwords exist solely for the demo. Real auth moves to the backend.
export const DEMO_PASSWORD = 'Password@123'
export const buildUsers = (t) => [
  { id: 'u-admin', name: 'Meera Kulkarni', email: 'admin@skillmatch.dev', role: 'ADMIN', status: 'ACTIVE', createdAt: t.ago(200), profile: {} },
  { id: 'u-f1', name: 'Aarav Sharma', email: 'aarav@skillmatch.dev', role: 'FREELANCER', status: 'ACTIVE', createdAt: t.ago(120), profile: {
    headline: 'Full-stack developer', location: 'Pune, Maharashtra', experienceYears: 3, photo: null,
    bio: 'I build web applications with React and Node.js. Recently shipped two e-commerce platforms for small retailers.',
    skills: ['React', 'Node.js', 'PostgreSQL', 'JavaScript', 'Tailwind CSS', 'Express', 'REST APIs'],
    portfolio: [
      { id: 'pf1', title: 'Kirana Cart', description: 'Online grocery storefront with inventory sync.', image: null, url: 'https://example.com/kirana-cart' },
      { id: 'pf2', title: 'Clinic Booking Portal', description: 'Appointment scheduling for a multi-doctor clinic.', image: null, url: 'https://example.com/clinic-booking' } ],
    experience: [{ id: 'ex1', role: 'Junior Developer', org: 'Webwise Infotech', period: '2023 - 2024', summary: 'Built client dashboards in React.' }] } },
  { id: 'u-f2', name: 'Rohan Patil', email: 'rohan@skillmatch.dev', role: 'FREELANCER', status: 'ACTIVE', createdAt: t.ago(100), profile: {
    headline: 'Python and ML engineer', location: 'Nagpur, Maharashtra', experienceYears: 4, photo: null,
    bio: 'Data-focused engineer building forecasting models and Django backends.',
    skills: ['Python', 'Django', 'PostgreSQL', 'Docker', 'Machine Learning', 'Data Analysis'],
    portfolio: [{ id: 'pf3', title: 'Demand Forecaster', description: 'Time-series model for a retail chain.', image: null, url: 'https://example.com/forecaster' }], experience: [] } },
  { id: 'u-f3', name: 'Priya Deshmukh', email: 'priya@skillmatch.dev', role: 'FREELANCER', status: 'ACTIVE', createdAt: t.ago(90), profile: {
    headline: 'Product designer', location: 'Mumbai, Maharashtra', experienceYears: 5, photo: null,
    bio: 'I design clear, accessible interfaces for mobile and web products.',
    skills: ['UI/UX Design', 'Figma', 'React', 'Tailwind CSS'],
    portfolio: [{ id: 'pf4', title: 'FinTrack App', description: 'Personal finance app redesign.', image: null, url: 'https://example.com/fintrack' }], experience: [] } },
  { id: 'u-f4', name: 'Kunal Joshi', email: 'kunal@skillmatch.dev', role: 'FREELANCER', status: 'ACTIVE', createdAt: t.ago(80), profile: {
    headline: 'Backend engineer', location: 'Bengaluru, Karnataka', experienceYears: 6, photo: null,
    bio: 'Java and C++ developer focused on reliable backend services.',
    skills: ['C++', 'Java', 'Spring Boot', 'PostgreSQL', 'Docker'], portfolio: [], experience: [] } },
  { id: 'u-c1', name: 'TechNova Solutions', email: 'hr@technova.dev', role: 'COMPANY', status: 'ACTIVE', createdAt: t.ago(150), profile: {
    description: 'Software products for logistics and retail businesses.', website: 'https://technova.example.com', location: 'Pune, Maharashtra', industry: 'Software', logo: null } },
  { id: 'u-c2', name: 'PixelCraft Technologies', email: 'team@pixelcraft.dev', role: 'COMPANY', status: 'ACTIVE', createdAt: t.ago(140), profile: {
    description: 'Digital design and branding studio.', website: 'https://pixelcraft.example.com', location: 'Mumbai, Maharashtra', industry: 'Design', logo: null } },
  { id: 'u-c3', name: 'InnovateLabs', email: 'projects@innovatelabs.dev', role: 'COMPANY', status: 'ACTIVE', createdAt: t.ago(130), profile: {
    description: 'Applied data and fintech products.', website: 'https://innovatelabs.example.com', location: 'Bengaluru, Karnataka', industry: 'Fintech', logo: null } },
]
