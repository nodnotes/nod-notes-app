/** Marker injected by `desktop/preload.cjs` when running inside Electron. */
export type NodNotesUpdateStatus = {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'current' | 'error' | 'dev'
  version?: string
  percent?: number
  message?: string
}

export type NodNotesDesktopBridge = {
  isDesktop: true // Always true in the shell
  platform: NodeJS.Platform // OS string from Electron's process
  getVersion: () => Promise<string>
  getUpdateStatus: () => Promise<NodNotesUpdateStatus>
  checkForUpdates: () => Promise<NodNotesUpdateStatus>
  quitAndInstall: () => Promise<boolean>
  onUpdateStatus: (callback: (status: NodNotesUpdateStatus) => void) => () => void
}

declare global {
  interface Window {
    /** Present only in the Electron desktop shell. */
    nodnotesDesktop?: NodNotesDesktopBridge
  }
}

export {}
