import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

const BASE = 'SkillMatch'
export default function RouteEffects() {
  const { pathname } = useLocation()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) first.current = false
    else { window.scrollTo?.(0, 0); document.getElementById('main')?.focus({ preventScroll: true }) }
    // Pages render asynchronously, so keep the title in sync with the page's h1 for a few seconds
    const setTitle = () => {
      const h1 = document.querySelector('main h1')?.textContent?.trim()
      document.title = pathname === '/' ? `${BASE}: find the right talent` : h1 ? `${h1} · ${BASE}` : BASE
    }
    setTitle()
    const observer = new MutationObserver(setTitle)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    const stop = setTimeout(() => observer.disconnect(), 6000)
    return () => { observer.disconnect(); clearTimeout(stop) }
  }, [pathname])
  return null
}
