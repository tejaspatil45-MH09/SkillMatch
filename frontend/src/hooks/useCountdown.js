import { useEffect, useState } from 'react'
// Milliseconds remaining until `target`, re-rendered every 15s. UI hint only: the server decides access.
export function useCountdown(target) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!target) return
    const id = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(id)
  }, [target])
  return target ? Math.max(0, Date.parse(target) - now) : 0
}
