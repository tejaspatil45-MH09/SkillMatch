import { ExternalLink, ImageOff, Trash2 } from 'lucide-react'
import Card from '../ui/Card'
import Button from '../ui/Button'
export default function PortfolioCard({ item, onDelete }) {
  return (
    <Card className="overflow-hidden">
      {item.image ? <img src={item.image} alt={item.title} className="h-36 w-full object-cover" />
        : <div className="flex h-36 items-center justify-center bg-slate-100 text-slate-400" role="img" aria-label={`${item.title} preview not available`}><ImageOff className="size-7" aria-hidden /></div>}
      <div className="p-4">
        <h3 className="font-semibold text-slate-900">{item.title}</h3>
        <p className="mt-1 line-clamp-2 text-slate-600">{item.description}</p>
        <div className="mt-3 flex items-center justify-between">
          {item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-brand-600 hover:text-brand-700">View project<ExternalLink className="size-3.5" aria-hidden /></a> : <span />}
          {onDelete && <Button variant="ghost" size="sm" onClick={() => onDelete(item)} aria-label={`Remove ${item.title}`}><Trash2 className="size-4" /></Button>}
        </div>
      </div>
    </Card>
  )
}
