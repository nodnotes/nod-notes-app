'use strict' // CommonJS — packaged with the Electron shell

const { autoUpdater } = require('electron-updater') // Reads GitHub Releases latest-*.yml
const { dialog, ipcMain } = require('electron') // Native prompt + renderer bridge

/** @typedef {'idle'|'checking'|'available'|'downloading'|'ready'|'current'|'error'|'dev'} UpdateStatus */

/** @type {{ status: UpdateStatus, version?: string, percent?: number, message?: string }} */
let lastStatus = { status: 'idle' } // Last event for late-joining renderers

/** @type {import('electron').BrowserWindow | null} */
let statusTarget = null // Window that receives update-status events

/** Push status to the web app (and cache for getStatus). */
function broadcast(payload) {
  lastStatus = payload // Remember for invoke('get-status')
  if (statusTarget && !statusTarget.isDestroyed()) {
    statusTarget.webContents.send('nodnotes:update-status', payload) // Preload → window callback
  }
}

/** Wire autoUpdater events once per app lifetime. */
function setupAutoUpdater(getMainWindow) {
  autoUpdater.autoDownload = true // Download as soon as an update is found
  autoUpdater.autoInstallOnAppQuit = true // Apply on quit if user never clicks Restart

  // Prefer GitHub public feed (owner/repo from package.json build.publish)
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => {
    broadcast({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    broadcast({ status: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', (info) => {
    broadcast({ status: 'current', version: info.version })
  })

  autoUpdater.on('download-progress', (progress) => {
    broadcast({
      status: 'downloading',
      percent: Math.round(progress.percent || 0), // 0–100 for UI
    })
  })

  autoUpdater.on('update-downloaded', async (info) => {
    broadcast({ status: 'ready', version: info.version })
    const win = getMainWindow() // Current main window for the modal
    if (!win || win.isDestroyed()) return
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: 'A new version of Nod Notes is ready.',
      detail: `Version ${info.version} has been downloaded. Restart to install.`,
    })
    if (response === 0) {
      autoUpdater.quitAndInstall(false, true) // Install + relaunch
    }
  })

  autoUpdater.on('error', (err) => {
    broadcast({
      status: 'error',
      message: err?.message || String(err),
    })
  })

  // IPC from preload / web UI
  ipcMain.handle('nodnotes:get-version', () => {
    const { app } = require('electron')
    return app.getVersion() // desktop/package.json version
  })

  ipcMain.handle('nodnotes:get-update-status', () => lastStatus)

  ipcMain.handle('nodnotes:check-updates', async (event) => {
    statusTarget = require('electron').BrowserWindow.fromWebContents(event.sender)
    const { app } = require('electron')
    if (!app.isPackaged) {
      // `electron .` has no asar update channel — point people at Releases
      broadcast({
        status: 'dev',
        message: 'Updates only apply to the installed desktop app.',
      })
      return lastStatus
    }
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      broadcast({
        status: 'error',
        message: err?.message || String(err),
      })
    }
    return lastStatus
  })

  ipcMain.handle('nodnotes:install-update', () => {
    const { app } = require('electron')
    if (!app.isPackaged) return false
    autoUpdater.quitAndInstall(false, true)
    return true
  })

  // Quiet startup check a few seconds after launch (packaged only)
  const { app } = require('electron')
  if (app.isPackaged) {
    setTimeout(() => {
      statusTarget = getMainWindow()
      autoUpdater.checkForUpdates().catch(() => {
        // Network / feed errors already go through the 'error' event
      })
    }, 8000)
  }
}

module.exports = { setupAutoUpdater, broadcast }
