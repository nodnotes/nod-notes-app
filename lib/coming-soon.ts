/**
 * Launch gate: when COMING_SOON is on, only allowlisted emails can sign in.
 * Env: COMING_SOON=true|1|yes — EARLY_ACCESS_EMAILS=a@x.com,b@y.com
 */

/** True when production (or local) is in coming-soon launch mode. */
export function isComingSoon(): boolean {
  const raw = (process.env.COMING_SOON || '').trim().toLowerCase() // Normalize flag text
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on' // Common truthy spellings
}

/** Lowercase + trim so allowlist matches are case-insensitive. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase() // Canonical form for comparisons
}

/** Parse comma/whitespace-separated early-access allowlist from env. */
export function getEarlyAccessEmails(): Set<string> {
  const raw = process.env.EARLY_ACCESS_EMAILS || '' // Server-only; never expose to client
  const emails = raw
    .split(/[,;\s]+/) // Comma, semicolon, or whitespace separators
    .map(normalizeEmail)
    .filter(Boolean) // Drop empties from trailing commas
  return new Set(emails)
}

/** Whether this email may sign in while coming soon is active. */
export function isEarlyAccessEmail(email: string | null | undefined): boolean {
  if (!email) return false // No email → not allowed
  if (!isComingSoon()) return true // Gate off → all emails OK (normal product auth)
  const allow = getEarlyAccessEmails()
  if (allow.size === 0) return false // Coming soon with empty list → lock everyone out
  return allow.has(normalizeEmail(email))
}

/** Paths anyone may hit without an allowlisted session during coming soon. */
export function isComingSoonPublicPath(pathname: string): boolean {
  if (pathname === '/') return true // Gate (anon) or marketing homepage (signed-in)
  if (pathname === '/access') return true // Early-access sign-in
  if (pathname.startsWith('/auth/')) return true // Supabase callback + verify flows
  if (pathname.startsWith('/api/early-access')) return true // OTP + session gate APIs
  if (pathname.startsWith('/api/public-board')) return true // Homepage showcase master snapshots
  if (pathname.startsWith('/api/homepage-board')) return true // Legacy homepage board fetch
  if (pathname.startsWith('/api/webhooks/stripe')) return true // Stripe signs these; no session
  if (pathname.startsWith('/view/')) return true // Full-screen public showcase playground
  if (pathname === '/pricing' || pathname.startsWith('/docs') || pathname === '/support') {
    return true // Marketing help surfaces (download requires a signed-in session)
  }
  return false
}
