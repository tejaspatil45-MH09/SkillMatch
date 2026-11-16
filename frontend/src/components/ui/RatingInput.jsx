import { Star } from 'lucide-react'
// Accessible 1-5 star picker built from native radio inputs (arrow keys work out of the box)
export default function RatingInput({ value, onChange, error }) {
  return (
    <fieldset>
      <legend className="mb-1.5 font-medium text-slate-700">Rating</legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer rounded-md p-0.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-600">
            <input type="radio" name="rating" value={n} checked={value === n} onChange={() => onChange(n)} className="sr-only" />
            <Star aria-hidden className={`size-8 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300 hover:text-amber-300'}`} />
            <span className="sr-only">{n} {n === 1 ? 'star' : 'stars'}</span>
          </label>))}
      </div>
      {error && <p role="alert" className="mt-1.5 text-xs text-red-600">{error}</p>}
    </fieldset>
  )
}
