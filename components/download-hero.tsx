'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Apple, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'

type DesktopPlatform = 'mac' | 'windows' | 'linux' | 'other'

type DownloadLinks = {
  mac: string // .dmg URL
  windows: string // .exe URL
  linux?: string // AppImage URL — omit until a Linux build is published
}

/** Infer OS from the user agent for the primary download button. */
function detectPlatform(ua: string): DesktopPlatform {
  const lower = ua.toLowerCase() // Normalize once
  if (lower.includes('mac os') || lower.includes('macintosh')) return 'mac'
  if (lower.includes('windows')) return 'windows'
  if (lower.includes('linux') && !lower.includes('android')) return 'linux'
  return 'other' // Phones / unknown — show both CTAs equally
}

type DownloadHeroProps = {
  links: DownloadLinks // Server-resolved artifact URLs
  published: boolean // False until NEXT_PUBLIC_DESKTOP_*_URL is set
}

/** Client hero: OS-aware primary CTA + secondary platform buttons. */
export function DownloadHero({ links, published }: DownloadHeroProps) {
  const [platform, setPlatform] = useState<DesktopPlatform>('other') // SSR-safe default

  useEffect(() => {
    setPlatform(detectPlatform(navigator.userAgent)) // Run only after hydration
  }, [])

  const primary = useMemo(() => {
    if (platform === 'mac') {
      return { href: links.mac, label: 'Download for macOS', icon: 'apple' as const }
    }
    if (platform === 'windows') {
      return { href: links.windows, label: 'Download for Windows', icon: 'windows' as const }
    }
    if (platform === 'linux' && links.linux) {
      return { href: links.linux, label: 'Download for Linux', icon: 'linux' as const }
    }
    return { href: links.mac, label: 'Download for macOS', icon: 'apple' as const } // Default lead with Mac
  }, [platform, links])

  if (!published) {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="max-w-md text-center text-[16px] leading-7 text-muted-foreground">
          Desktop installers are built and will appear here once published. Until then, use Nod Notes
          in the browser — same boards and account.
        </p>
        <Link
          href="/board"
          className="inline-flex h-12 min-w-[240px] items-center justify-center rounded-xl bg-blue-500 px-8 text-base font-medium text-white hover:bg-blue-600 transition-colors"
        >
          Back to boards
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <a
        href={primary.href}
        className="inline-flex h-12 min-w-[240px] items-center justify-center gap-2 rounded-xl bg-blue-500 px-8 text-base font-medium text-white hover:bg-blue-600 transition-colors"
      >
        {primary.icon === 'apple' ? (
          <Apple className="h-5 w-5" aria-hidden />
        ) : (
          <Monitor className="h-5 w-5" aria-hidden />
        )}
        {primary.label}
      </a>
      <p className="text-sm text-muted-foreground">Or get another build:</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <PlatformChip href={links.mac} label="macOS" active={platform === 'mac'} />
        <PlatformChip href={links.windows} label="Windows" active={platform === 'windows'} />
        {links.linux ? (
          <PlatformChip href={links.linux} label="Linux" active={platform === 'linux'} />
        ) : null}
      </div>
      <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
        Prefer the browser?{' '}
        <Link href="/board" className="font-medium text-blue-600 hover:text-blue-700">
          Back to your boards
        </Link>
        — same account, no install.
      </p>
    </div>
  )
}

function PlatformChip({
  href,
  label,
  active,
}: {
  href: string
  label: string
  active: boolean
}) {
  return (
    <a
      href={href}
      className={cn(
        'inline-flex h-10 items-center justify-center rounded-full border px-5 text-sm font-medium transition-colors',
        active
          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
          : 'border-border text-foreground/80 hover:border-foreground/30 hover:text-foreground'
      )}
    >
      {label}
    </a>
  )
}
