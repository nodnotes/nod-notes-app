import Link from 'next/link'
import { ChevronDown, Languages } from 'lucide-react'
import { NodNotesIcon } from '@/components/nod-notes-icon'

/** Column headings match Notion’s small uppercase muted labels */
const COL_HEAD =
  'mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground'

/** Body links — dark, quiet hover */
const COL_LINK =
  'block text-[15px] leading-7 text-foreground/85 transition-colors hover:text-foreground'

/** Homepage section titles — Product column only */
const PRODUCT_LINKS = [
  { href: '/#notes-and-presentations', label: 'Notes and presentations' },
  { href: '/#connections-and-automations', label: 'Connections and frame automations' },
  { href: '/#brainstorm-with-ai', label: 'Brainstorm with AI' },
  { href: '/#get-started', label: 'Ready to map your ideas?' },
] as const

/** Notion-style marketing footer — brand left, section links right, legal bar below */
export function HomeFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="bg-background">
      <div className="px-8 pt-16 pb-10 min-[900px]:pt-20 min-[900px]:pb-12">
        <div className="flex flex-col gap-12 min-[900px]:flex-row min-[900px]:gap-16 lg:gap-24">
          <div className="min-w-0 shrink-0 min-[900px]:w-[min(280px,28%)]">
            <Link
              href="/"
              className="inline-flex items-center text-2xl leading-none opacity-90 transition-opacity hover:opacity-100"
              aria-label="Nod Notes"
            >
              <NodNotesIcon className="mr-1.5 h-[1.1cap] w-auto shrink-0 text-gray-700" />
              <span className="font-young-serif font-normal text-blue-500">Nod</span>
            </Link>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4 min-[900px]:gap-x-10">
            <div>
              <h3 className={COL_HEAD}>Product</h3>
              <ul className="space-y-0.5">
                {PRODUCT_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={COL_LINK}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 text-sm text-muted-foreground min-[900px]:mt-16 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
          <p>© {year} Nod Notes</p>
          <div
            className="inline-flex h-9 w-fit items-center gap-1.5 rounded-full border border-border px-3 text-foreground/80"
            aria-label="Language: English (US)"
          >
            <Languages className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            <span>English (US)</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
          </div>
        </div>
      </div>
    </footer>
  )
}
