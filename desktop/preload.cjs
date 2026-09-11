'use strict' // Preload runs in an isolated world before the page scripts

const { contextBridge, ipcRenderer } = require('electron') // Safe API surface into the renderer

/**
 * Expose desktop helpers: platform marker + update IPC for the More menu / Help.
 * No Node primitives beyond this bridge.
 */
contextBridge.exposeInMainWorld('nodnotesDesktop', {
  isDesktop: true, // Always true inside this shell
  platform: process.platform, // 'darwin' | 'win32' | 'linux'
  getVersion: () => ipcRenderer.invoke('nodnotes:get-version'), // e.g. "0.1.1"
  getUpdateStatus: () => ipcRenderer.invoke('nodnotes:get-update-status'), // Last known status
  checkForUpdates: () => ipcRenderer.invoke('nodnotes:check-updates'), // Kick electron-updater
  quitAndInstall: () => ipcRenderer.invoke('nodnotes:install-update'), // Restart into new build
  onUpdateStatus: (callback) => {
    const handler = (_event, payload) => {
      callback(payload) // { status, version?, percent?, message? }
    }
    ipcRenderer.on('nodnotes:update-status', handler)
    return () => ipcRenderer.removeListener('nodnotes:update-status', handler)
  },
})

/** Tag <html> so CSS can pad for traffic lights and enable window-drag regions. */
function markDesktopRoot() {
  const root = document.documentElement // Page <html>
  if (!root) return
  root.classList.add('nn-desktop', `nn-desktop-${process.platform}`)
  root.dataset.nnDesktop = process.platform
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', markDesktopRoot, { once: true })
} else {
  markDesktopRoot()
}
