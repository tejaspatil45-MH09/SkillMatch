import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import Input from './Input'

export default function PasswordInput(props) {
  const [show, setShow] = useState(false)
  return (
    <Input {...props} type={show ? 'text' : 'password'} adornment={
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}
        className="rounded-md p-2 text-slate-500 hover:text-slate-700">
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>} />
  )
}
