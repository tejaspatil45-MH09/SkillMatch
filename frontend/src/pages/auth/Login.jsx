import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import Input from '../../components/ui/Input'
import PasswordInput from '../../components/ui/PasswordInput'
import Button from '../../components/ui/Button'
import { useAuth } from '../../context/AuthContext'
import { validateLogin } from '../../utils/validators'
import { ROLE_HOME } from '../../utils/constants'

const SHOW_DEMO = import.meta.env.VITE_USE_MOCK !== 'false'
const DEMO = [['Freelancer', 'aarav@skillmatch.dev'], ['Company', 'hr@technova.dev'], ['Admin', 'admin@skillmatch.dev']]

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const from = useLocation().state?.from
  const [values, setValues] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)
  const set = (k) => (e) => { setValues((v) => ({ ...v, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })) }

  async function onSubmit(e) {
    e.preventDefault(); setFormError('')
    const errs = validateLogin(values); setErrors(errs)
    if (Object.keys(errs).length) return
    setLoading(true)
    try { const user = await login(values); navigate(from ?? ROLE_HOME[user.role], { replace: true }) }
    catch (err) { setFormError(err.message); setLoading(false) }
  }

  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Welcome back</h1>
      <p className="mt-1 text-slate-500">Log in to continue to SkillMatch.</p>
      {formError && <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{formError}</div>}
      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        <Input label="Email" type="email" autoComplete="email" value={values.email} onChange={set('email')} error={errors.email} placeholder="you@example.com" />
        <PasswordInput label="Password" autoComplete="current-password" value={values.password} onChange={set('password')} error={errors.password} />
        <div className="text-right"><Link to="/forgot-password" className="font-medium text-brand-600 hover:text-brand-700">Forgot password?</Link></div>
        <Button type="submit" loading={loading} className="w-full">Log in</Button>
      </form>
      <p className="mt-6 text-center text-slate-500">New to SkillMatch? <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">Create an account</Link></p>
      {SHOW_DEMO && (
        <div className="mt-6 rounded-lg bg-slate-50 p-3">
          <p className="mb-2 text-xs font-medium text-slate-600">Demo accounts (password: Password@123)</p>
          <div className="flex flex-wrap gap-2">
            {DEMO.map(([label, email]) => <button key={email} type="button" onClick={() => { setValues({ email, password: 'Password@123' }); setErrors({}) }}
              className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100">{label}</button>)}
          </div>
        </div>
      )}
    </>
  )
}
