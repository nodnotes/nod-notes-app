'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, Menu } from 'lucide-react'
import { NodNotesIcon } from '@/components/nod-notes-icon'
import { createClient } from '@/lib/supabase/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const PRODUCT_LINKS = [
  { href: '/product', label: 'Overview' },
  { href: '/product#brainstorm', label: 'Brainstorming' },
  { href: '/product#workflow', label: 'Meeting notes' },
  { href: '/product#research', label: 'Research' },
] as const

const NAV_LINKS = [
  { href: '/developer', label: 'Developers' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/help', label: 'Help' },
] as const

const CTA_CLASS =
  'inline-flex h-9 min-[900px]:h-10 items-center justify-center rounded-xl bg-blue-500 px-5 min-[900px]:px-6 text-base font-medium text-white hover:bg-blue-600 transition-colors'

const NAV_LINK_CLASS =
  'text-base font-medium text-foreground/80 hover:text-foreground transition-colors'

export function HomeTopNav() {
  const router = useRouter()
  const [signedIn, setSignedIn] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSignedIn(!!session)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setSignedIn(false)
    router.push('/login')
  }

  return (
    <nav className="sticky top-0 z-50 h-14 min-[900px]:h-16 overflow-visible bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="relative flex h-full w-full items-center justify-between px-5 min-[900px]:px-8">
        <Link
          href="/"
          className="relative z-10 inline-flex items-center text-2xl min-[900px]:text-3xl leading-none opacity-90 hover:opacity-100 transition-opacity"
          aria-label="Nod Notes"
        >
          <NodNotesIcon nodIdle className="mr-1 h-[1cap] w-auto shrink-0 text-gray-700" />
          <span data-home-brand-nod className="font-young-serif font-normal text-blue-500">
            Nod
          </span>
        </Link>

        <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-7 min-[900px]:flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={`${NAV_LINK_CLASS} inline-flex items-center gap-1 outline-none`}
              >
                Product
                <ChevronDown className="h-4 w-4 opacity-70" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[180px]">
              {PRODUCT_LINKS.map((link) => (
                <DropdownMenuItem key={link.href} asChild>
                  <Link href={link.href}>{link.label}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={NAV_LINK_CLASS}>
              {link.label}
            </Link>
          ))}
        </div>

        <div className="relative z-10 flex items-center gap-3 min-[900px]:gap-5">
          {signedIn ? (
            <button
              type="button"
              onClick={handleLogout}
              className={`hidden min-[900px]:inline ${NAV_LINK_CLASS}`}
            >
              Log out
            </button>
          ) : null}
          <Link href={signedIn ? '/board' : '/login'} className={CTA_CLASS}>
            {signedIn ? 'Open Nod' : 'Get started'}
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="min-[900px]:hidden h-9 w-9 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                aria-label="Menu"
              >
                <Menu className="h-6 w-6" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              {PRODUCT_LINKS.map((link) => (
                <DropdownMenuItem key={link.href} asChild>
                  <Link href={link.href}>{link.label}</Link>
                </DropdownMenuItem>
              ))}
              {NAV_LINKS.map((link) => (
                <DropdownMenuItem key={link.href} asChild>
                  <Link href={link.href}>{link.label}</Link>
                </DropdownMenuItem>
              ))}
              {signedIn ? (
                <DropdownMenuItem onSelect={handleLogout}>Log out</DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  )
}
