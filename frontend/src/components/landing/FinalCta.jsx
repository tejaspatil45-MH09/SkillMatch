import { Link } from 'react-router-dom'
import Button from '../ui/Button'
export default function FinalCta() {
  return (
    <section className="bg-brand-600 py-16">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Ready to get started?</h2>
        <p className="mt-3 text-base text-brand-100">Create a free account and find your next project or your next hire.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button as={Link} to="/register" size="lg" className="!bg-white !text-brand-700 hover:!bg-brand-50">Create an account</Button>
          <Button as={Link} to="/projects" size="lg" variant="ghost" className="!text-white ring-1 ring-white/40 hover:!bg-white/10">Browse projects</Button>
        </div>
      </div>
    </section>
  )
}
