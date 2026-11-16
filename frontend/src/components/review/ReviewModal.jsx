import { useState } from 'react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'
import RatingInput from '../ui/RatingInput'

export default function ReviewModal({ open, onClose, targetName, onSubmit }) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  async function submit(e) {
    e.preventDefault()
    const errs = {}
    if (!rating) errs.rating = 'Choose a rating from 1 to 5 stars.'
    if (comment.trim().length < 10) errs.comment = 'Write a short comment (at least 10 characters).'
    else if (comment.length > 500) errs.comment = 'Keep the comment under 500 characters.'
    setErrors(errs); if (Object.keys(errs).length) return
    setSaving(true); try { await onSubmit({ rating, comment: comment.trim() }) } finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title={`Review ${targetName}`}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <p>How was your experience working with {targetName}?</p>
        <RatingInput value={rating} onChange={(n) => { setRating(n); setErrors((x) => ({ ...x, rating: undefined })) }} error={errors.rating} />
        <Input multiline label="Comment" value={comment} onChange={(e) => { setComment(e.target.value); setErrors((x) => ({ ...x, comment: undefined })) }} error={errors.comment} />
        <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Submit review</Button></div>
      </form>
    </Modal>
  )
}
