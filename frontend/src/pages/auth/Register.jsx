import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, Building2, UserRound } from 'lucide-react'
import clsx from 'clsx'
import Input from '../../components/ui/Input'
import PasswordInput from '../../components/ui/PasswordInput'
import Button from '../../components/ui/Button'
import { useAuth } from '../../context/AuthContext'
import { validateRegister } from '../../utils/validators'
import { ROLE_HOME } from '../../utils/constants'

const ROLES = [
  { value: 'FREELANCER', label: 'Freelancer', hint: 'Find projects and submit proposals', icon: UserRound },
  { value: 'COMPANY', label: 'Company', hint: 'Post projects and hire talent', icon: Building2 },
]

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState({ role: 'FREELANCER', name: '', email: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)
  const set = (k) => (e) => { setValues((v) => ({ ...v, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })) }

  async function onSubmit(e) {
    e.preventDefault(); setFormError('')
    const errs = validateRegister(values); setErrors(errs)
    if (Object.keys(errs).length) return
    setLoading(true)
    try {
      const { name, email, password, role } = values
      const user = await register({ name: name.trim(), email: email.trim(), password, role })
      navigate(ROLE_HOME[user.role], { replace: true })
    } catch (err) {
      if (err.code === 'EMAIL_TAKEN') setErrors({ email: err.message }); else setFormError(err.message)
      setLoading(false)
    }
  }

  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Create your account</h1>
      <p className="mt-1 text-slate-500">Choose how you'll use SkillMatch.</p>
      {formError && <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{formError}</div>}
      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        <fieldset>
          <legend className="mb-1.5 font-medium text-slate-700">I am a</legend>
          <div className="grid grid-cols-2 gap-3">
            {ROLES.map(({ value, label, hint, icon: Icon }) => (
              <label key={value} className={clsx('flex cursor-pointer flex-col gap-1 rounded-lg border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-600',
                values.role === value ? 'border-brand-600 bg-brand-50' : 'border-slate-300 hover:bg-slate-50')}>
                <input type="radio" name="role" value={value} checked={values.role === value} onChange={set('role')} className="sr-only" />
                <Icon className={clsx('size-5', values.role === value ? 'text-brand-600' : 'text-slate-500')} aria-hidden />
                <span className="font-medium text-slate-900">{label}</span>
                <span className="text-xs text-slate-500">{hint}</span>
              </label>
            ))}
          </div>
          {errors.role && <p role="alert" className="mt-1.5 text-xs text-red-600">{errors.role}</p>}
        </fieldset>
        <Input label={values.role === 'COMPANY' ? 'Company name' : 'Full name'} autoComplete={values.role === 'COMPANY' ? 'organization' : 'name'} value={values.name} onChange={set('name')} error={errors.name} />
        <Input label="Email" type="email" autoComplete="email" value={values.email} onChange={set('email')} error={errors.email} placeholder="you@example.com" />
        <PasswordInput label="Password" autoComplete="new-password" value={values.password} onChange={set('password')} error={errors.password} hint="At least 8 characters, with a letter and a number." />
        <PasswordInput label="Confirm password" autoComplete="new-password" value={values.confirmPassword} onChange={set('confirmPassword')} error={errors.confirmPassword} />
        <Button type="submit" loading={loading} className="w-full">Create account</Button>
      </form>
      <p className="mt-6 text-center text-slate-500">Already have an account? <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">Log in</Link></p>
    </>
  )
}
