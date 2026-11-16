import { Link } from 'react-router-dom'
import Logo from './Logo'
export default function Footer() {
  const col = (title, links) => (
    <div><h2 className="font-semibold text-slate-900">{title}</h2>
      <ul className="mt-3 space-y-2">{links.map(([l, to]) => <li key={l}>{to.startsWith('/#') ? <a href={to} className="text-slate-600 hover:text-slate-900">{l}</a> : <Link to={to} className="text-slate-600 hover:text-slate-900">{l}</Link>}</li>)}</ul></div>
  )
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="max-w-xs"><Logo /><p className="mt-3 text-slate-500">Skill-based matching between companies and freelancers.</p></div>
        {col('Product', [['How it works', '/#how'], ['Features', '/#features'], ['Secure demos', '/#secure-demo']])}
        {col('Freelancers', [['Find projects', '/projects'], ['Create profile', '/register']])}
        {col('Companies', [['Post a project', '/register'], ['Log in', '/login']])}
      </div>
      <p className="border-t border-slate-100 py-5 text-center text-xs text-slate-500">© 2026 SkillMatch. Built as an MCA final-year project.</p>
    </footer>
  )
}
