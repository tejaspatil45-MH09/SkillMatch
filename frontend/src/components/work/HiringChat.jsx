import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import clsx from 'clsx'
import Card from '../ui/Card'
import Button from '../ui/Button'
import ErrorState from '../ui/ErrorState'
import { Skeleton } from '../ui/LoadingSpinner'
import { useNotifications } from '../../context/NotificationContext'
import { messageService } from '../../services/messageService'
import { formatDateTime } from '../../utils/formatters'
import { MESSAGE_MAX } from '../../utils/validators'

const POLL_MS = 15000

// The private conversation between the two parties of a hiring. Messages are rendered as plain text only
// (React escapes them, links are never auto-created), and nothing here exposes contact details.
export default function HiringChat({ hiringId, viewerId, otherName, readOnly, onRead }) {
  const { refresh: refreshBadge } = useNotifications()
  const [messages, setMessages] = useState(null)
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef(null)
  const onReadRef = useRef(onRead)
  onReadRef.current = onRead
  const count = messages?.length ?? 0

  const load = useCallback(async (initial = false) => {
    try {
      const list = await messageService.list(hiringId)
      setMessages(list); setError(null)
      if (list.some((m) => m.senderId !== viewerId && !m.readAt)) {
        await messageService.markRead(hiringId)       // opening the conversation is what marks it read
        refreshBadge(); onReadRef.current?.()
      }
    } catch (e) { if (initial) setError(e) }          // a failed background refresh keeps what is already on screen
  }, [hiringId, viewerId, refreshBadge])

  useEffect(() => {
    load(true)
    const id = setInterval(() => { if (document.visibilityState === 'visible') load() }, POLL_MS)
    return () => clearInterval(id)
  }, [load])
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'nearest' }) }, [count])

  async function send(e) {
    e?.preventDefault()
    const body = draft.trim()
    if (!body) return setSendError('Write a message first.')
    if (body.length > MESSAGE_MAX) return setSendError(`Keep messages under ${MESSAGE_MAX} characters.`)
    setSending(true); setSendError('')
    try { const m = await messageService.send(hiringId, body); setMessages((list) => [...(list ?? []), m]); setDraft('') }
    catch (err) { setSendError(err.fields?.body?.[0] ?? err.message) }      // the draft is kept so nothing is lost
    finally { setSending(false) }
  }
  const lastMine = messages && [...messages].reverse().find((m) => m.senderId === viewerId)

  return (
    <Card className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4"><MessageSquare className="size-5 text-slate-500" aria-hidden /><h2 className="font-semibold text-slate-900">Conversation with {otherName}</h2></div>
      {error ? <div className="p-4"><ErrorState message={error.message} onRetry={() => { setError(null); load(true) }} /></div>
        : !messages ? <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-3/4" />)}</div>
        : (
          <div role="log" aria-live="polite" aria-label="Messages" className="max-h-96 min-h-48 space-y-3 overflow-y-auto p-5">
            {!messages.length && <p className="py-8 text-center text-slate-500">No messages yet. Say hello or ask a question about the project.</p>}
            {messages.map((m) => {
              const mine = m.senderId === viewerId
              return (
                <div key={m.id} className={clsx('flex flex-col', mine ? 'items-end' : 'items-start')}>
                  <div className={clsx('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2', mine ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-900')}>{m.body}</div>
                  <p className="mt-1 text-xs text-slate-500">{mine ? 'You' : m.senderName} · {formatDateTime(m.createdAt)}{mine && m.id === lastMine?.id && ` · ${m.readAt ? 'Seen' : 'Delivered'}`}</p>
                </div>)
            })}
            <div ref={endRef} />
          </div>)}
      <div className="border-t border-slate-100 p-4">
        {readOnly ? <p className="text-slate-500">{readOnly}</p> : (
          <form onSubmit={send} noValidate>
            <label htmlFor="chat-draft" className="sr-only">Write a message</label>
            <textarea id="chat-draft" rows={2} value={draft} maxLength={MESSAGE_MAX} onChange={(e) => { setDraft(e.target.value); setSendError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e) }} placeholder="Write a message…" aria-invalid={!!sendError}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-500 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20" />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p role={sendError ? 'alert' : undefined} className={clsx('text-xs', sendError ? 'text-red-600' : 'text-slate-500')}>{sendError || 'Only you and the other party can see this. Ctrl+Enter to send.'}</p>
              <Button type="submit" size="sm" loading={sending} disabled={!draft.trim()}><Send className="size-4" aria-hidden />Send</Button>
            </div>
          </form>)}
      </div>
    </Card>
  )
}
