import { useCallback, useEffect, useRef, useState } from 'react'

// Drives skeletons / error states / empty states uniformly: { data, loading, error, reload }
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const alive = useRef(true)
  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }))
    fn().then((data) => alive.current && setState({ data, loading: false, error: null }),
      (error) => alive.current && setState({ data: null, loading: false, error }))
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { alive.current = true; run(); return () => { alive.current = false } }, [run])
  return { ...state, reload: run }
}
