import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import PasswordInput from '../../components/ui/PasswordInput'
import Button from '../../components/ui/Button'
import { authService } from '../../services/authService'
import { validateReset } from '../../utils/validators'

// Reached from the link in the password-reset email: /reset-password?token=...
export default function ResetPassword() {
  const token = useSearchParams()[0].get('token') ?? ''
  const [values, setValues] = useState({ password: '', confirmPassword: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const set = (k) => (e) => { setValues((v) => ({ ...v, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })) }

  async function onSubmit(e) {
    e.preventDefault(); setFormError('')
    const errs = validateReset(values); setErrors(errs)
    if (Object.keys(errs).length) return
    setLoading(true)
    try { await authService.resetPassword({ token, password: values.password }); setDone(true) }
    catch (err) { setFormError(err.message); setLoading(false) }
  }

  if (!token) return (
    <div className="text-center">
      <h1 className="text-xl font-semibold text-slate-900">This reset link is incomplete</h1>
      <p className="mt-2 text-slate-500">Open the link from your email again, or request a new one.</p>
      <Button as={Link} to="/forgot-password" className="mt-6 w-full">Request a new link</Button>
    </div>
  )
  if (done) return (
    <div className="text-center">
      <CheckCircle2 className="mx-auto size-10 text-green-600" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold text-slate-900">Password updated</h1>
      <p className="mt-2 text-slate-500">You can now log in with your new password. Any other devices were signed out.</p>
      <Button as={Link} to="/login" className="mt-6 w-full">Go to log in</Button>
    </div>
  )
  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Choose a new password</h1>
      <p className="mt-1 text-slate-500">Pick something you haven't used before.</p>
      {formError && <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-red-700"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{formError} <Link to="/forgot-password" className="font-medium underline">Request a new link</Link></span></div>}
      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        <PasswordInput label="New password" autoComplete="new-password" value={values.password} onChange={set('password')} error={errors.password} hint="At least 8 characters, with a letter and a number." />
        <PasswordInput label="Confirm new password" autoComplete="new-password" value={values.confirmPassword} onChange={set('confirmPassword')} error={errors.confirmPassword} />
        <Button type="submit" loading={loading} className="w-full">Set new password</Button>
      </form>
    </>
  )
}
