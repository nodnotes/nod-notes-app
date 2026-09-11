/** Capacitor runtime globals when the page runs inside the iOS/Android shell. */
type NodNotesCapacitorBridge = {
  isNativePlatform: () => boolean
  getPlatform: () => string // 'ios' | 'android' | 'web'
}

declare global {
  interface Window {
    /** Present when Capacitor injects its runtime into the WebView. */
    Capacitor?: NodNotesCapacitorBridge
  }
}

export {}
