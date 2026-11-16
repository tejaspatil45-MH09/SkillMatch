import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, MailCheck } from 'lucide-react'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import { authService } from '../../services/authService'
import { isEmail } from '../../utils/validators'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    if (!isEmail(email)) return setError('Enter a valid email address, like name@example.com.')
    setLoading(true)
    try { await authService.forgotPassword(email.trim()); setSent(true) }
    catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  return sent ? (
    <div className="text-center">
      <MailCheck className="mx-auto size-10 text-brand-600" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold text-slate-900">Check your email</h1>
      <p className="mt-2 text-slate-500">If an account exists for <span className="font-medium text-slate-700">{email}</span>, we've sent a link to reset your password.</p>
      <Button as={Link} to="/login" variant="secondary" className="mt-6 w-full">Back to log in</Button>
    </div>
  ) : (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Reset your password</h1>
      <p className="mt-1 text-slate-500">Enter your email and we'll send you a reset link.</p>
      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} error={error} placeholder="you@example.com" />
        <Button type="submit" loading={loading} className="w-full">Send reset link</Button>
      </form>
      <Link to="/login" className="mt-6 flex items-center justify-center gap-1.5 font-medium text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" aria-hidden />Back to log in</Link>
    </>
  )
}
