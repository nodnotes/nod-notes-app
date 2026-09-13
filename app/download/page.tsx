import type { Metadata } from 'next'
import { Check } from 'lucide-react'
import { HomeTopNav } from '@/components/home-top-nav'
import { HomeFooter } from '@/components/home-footer'
import { DownloadHero } from '@/components/download-hero'
import {
  desktopDownloadsPublished,
  desktopLinuxDownloadUrl,
  desktopMacDownloadUrl,
  desktopWindowsDownloadUrl,
} from '@/lib/desktop-downloads'

export const metadata: Metadata = {
  title: 'Download — Nod Notes',
  description: 'Download the Nod Notes desktop app for macOS, Windows, and Linux.',
}

const FEATURES = [
  'Same boards as the web — frames, threads, and TipTap editing',
  'Opens in its own window with a native menu bar',
  'Signed-in session stays with your Nod Notes account',
  'External links (OAuth, docs) open in your browser',
] as const

export default function DownloadPage() {
  const published = desktopDownloadsPublished()
  const linuxUrl = process.env.NEXT_PUBLIC_DESKTOP_LINUX_URL?.trim()
    ? desktopLinuxDownloadUrl()
    : undefined // No Linux AppImage in desktop-v0.1.0 yet
  const links = {
    mac: desktopMacDownloadUrl(),
    windows: desktopWindowsDownloadUrl(),
    linux: linuxUrl,
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground" data-home-page>
      <HomeTopNav />

      <main>
        <section className="relative z-10 container mx-auto px-4 min-[900px]:px-6 py-16 min-[900px]:py-24 text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Desktop app
          </p>
          <h1 className="mb-4 font-young-serif text-[clamp(2rem,5vw,3.5rem)] font-bold tracking-[0.02em] text-foreground leading-[1.1]">
            Nod Notes for your computer
          </h1>
          <p className="mx-auto mb-12 max-w-xl font-notes-sans text-lg min-[900px]:text-xl text-gray-600">
            A dedicated window for your boards — same product as the web, installed like any other
            desktop app.
          </p>

          <DownloadHero links={links} published={published} />
        </section>

        <section className="border-t border-border bg-muted/20">
          <div className="container mx-auto max-w-2xl px-4 min-[900px]:px-6 py-16">
            <h2 className="mb-8 text-center font-young-serif text-2xl min-[900px]:text-3xl tracking-tight">
              What you get
            </h2>
            <ul className="space-y-4 text-left">
              {FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" aria-hidden />
                  <span className="text-[16px] leading-7 text-foreground/85">{feature}</span>
                </li>
              ))}
            </ul>
            <p className="mt-10 text-left text-sm text-muted-foreground space-y-3">
              <span className="block font-medium text-foreground/80">macOS install</span>
              <span className="block">
                Open the DMG and double-click <strong className="text-foreground/90">Install Nod Notes</strong>{' '}
                (don’t only drag the app to Applications). Dragging alone leaves a Gatekeeper
                quarantine that macOS falsely calls “damaged.”
              </span>
              <span className="block">
                Or fix an already-installed copy once in Terminal:
              </span>
              <code className="block rounded-lg bg-muted px-3 py-2 text-[13px] text-foreground overflow-x-auto">
                xattr -cr &quot;/Applications/Nod Notes.app&quot;
              </code>
              <span className="block">
                Apple Developer signing + notarization will remove this step later.
              </span>
            </p>
          </div>
        </section>
      </main>

      <HomeFooter />
    </div>
  )
}
