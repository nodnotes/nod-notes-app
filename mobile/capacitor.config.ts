import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Thin native shell — same model as desktop/ Electron:
 * load the hosted Next app (or localhost) instead of bundling a static export.
 *
 * Re-run `npm run mobile:sync` after changing NODNOTES_APP_URL so iOS picks it up.
 */
const appUrl = (process.env.NODNOTES_APP_URL || 'https://nodnotes.com').replace(/\/$/, '')

const config: CapacitorConfig = {
  appId: 'com.nodnotes.app', // Match Electron desktop appId
  appName: 'Nod Notes',
  webDir: 'www', // Placeholder only; server.url is the real origin
  server: {
    url: appUrl, // Prod site or local Next (see root package.json scripts)
    cleartext: true, // Allow http:// for LAN / localhost during dev
    allowNavigation: [
      'nodnotes.com',
      'www.nodnotes.com',
      'nod-notes.vercel.app',
      'localhost',
      '127.0.0.1',
      '*.supabase.co', // Auth / OAuth redirects that must stay in-WebView
    ],
  },
  ios: {
    // Edge-to-edge WebView — safe areas applied in CSS (html.nn-capacitor)
    contentInset: 'never',
    preferredContentMode: 'mobile',
    scheme: 'App', // Xcode scheme name (Capacitor default) — not the product display name
  },
  plugins: {
    StatusBar: {
      style: 'DARK', // Dark icons on light board chrome
      overlaysWebView: true, // Draw under status bar; CSS clears chrome via safe-area insets
    },
    Keyboard: {
      resize: 'body', // Keep board viewport aligned when the keyboard opens
    },
  },
}

export default config
