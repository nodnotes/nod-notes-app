import { cn } from '@/lib/utils'

type NodNotesWordmarkProps = {
  className?: string
  /** Tailwind text size class, e.g. `text-2xl` */
  sizeClass?: string
}

/** Product wordmark — "Nod" in blue */
export function NodNotesWordmark({ className, sizeClass = 'text-2xl' }: NodNotesWordmarkProps) {
  return (
    <span
      className={cn('font-bold tracking-tight', sizeClass, className)}
      aria-label="Nod Notes"
    >
      <span className="text-blue-500">Nod</span>
    </span>
  )
}
