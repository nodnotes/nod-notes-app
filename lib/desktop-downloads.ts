/**
 * Desktop download artifact URLs for /download and marketing CTAs.
 * Override via NEXT_PUBLIC_DESKTOP_*_URL when GitHub Releases (or a CDN) is wired.
 */

/** Default GitHub Releases base — replace owner/repo if the public repo name differs. */
const DEFAULT_RELEASES_BASE =
  'https://github.com/nodnotes/nod-notes-app/releases/latest/download' // Official app repo Releases

/** True when installer CTAs should show on /download (explicit URLs or shipped Releases). */
export function desktopDownloadsPublished(): boolean {
  // Explicit CDN/env always wins; otherwise show GitHub latest links once Releases exist.
  if (
    process.env.NEXT_PUBLIC_DESKTOP_MAC_URL?.trim() ||
    process.env.NEXT_PUBLIC_DESKTOP_WIN_URL?.trim() ||
    process.env.NEXT_PUBLIC_DESKTOP_LINUX_URL?.trim()
  ) {
    return true
  }
  // Default on — assets live under nodnotes/nod-notes-app Releases (desktop-v*).
  return process.env.NEXT_PUBLIC_DESKTOP_DOWNLOADS !== 'false'
}

/** macOS .dmg — arm64/x64 depends on what electron-builder published. */
export function desktopMacDownloadUrl(): string {
  return (
    process.env.NEXT_PUBLIC_DESKTOP_MAC_URL?.trim() || // Explicit CDN / Release asset
    `${DEFAULT_RELEASES_BASE}/Nod-Notes-mac.dmg` // Convention matching electron-builder artifactName
  )
}

/** Windows NSIS installer. */
export function desktopWindowsDownloadUrl(): string {
  return (
    process.env.NEXT_PUBLIC_DESKTOP_WIN_URL?.trim() ||
    `${DEFAULT_RELEASES_BASE}/Nod-Notes-win.exe`
  )
}

/** Optional Linux AppImage — shown on /download but not a primary CTA. */
export function desktopLinuxDownloadUrl(): string {
  return (
    process.env.NEXT_PUBLIC_DESKTOP_LINUX_URL?.trim() ||
    `${DEFAULT_RELEASES_BASE}/Nod-Notes-linux.AppImage`
  )
}
