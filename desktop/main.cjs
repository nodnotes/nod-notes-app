'use strict' // CommonJS Electron entry — keep plain JS so no transpile step

const path = require('path') // Resolve preload + local assets relative to this file
const {
  app, // Electron app lifecycle
  BrowserWindow, // Chromium window that hosts Nod Notes
  shell, // Open http(s) links in the system browser
  Menu, // Native app menu (macOS + Windows)
} = require('electron')
const { setupAutoUpdater } = require('./updater.cjs') // GitHub Releases → in-app update button

/** Production site the shell loads when no env override is set. */
const DEFAULT_APP_URL = 'https://nodnotes.com' // Same origin as the live Next app

/** Dev override — root `npm run desktop` sets this to http://localhost:3031. */
const APP_URL = (process.env.NODNOTES_APP_URL || DEFAULT_APP_URL).replace(/\/$/, '') // Strip trailing slash for join safety

/** Origins we keep inside the Electron window (app + local Next). */
const INTERNAL_HOSTS = new Set([
  'nodnotes.com', // Production apex
  'www.nodnotes.com', // www alias
  'nod-notes.vercel.app', // Vercel fallback host
  'localhost', // Local Next (`npm run dev`)
  '127.0.0.1', // Alternate loopback
])

/** Single main window reference so activate / deep-link can focus it. */
let mainWindow = null // Lazily created in createWindow

/**
 * True when a URL should stay inside the desktop shell.
 * External http(s) (OAuth provider pages, docs on other domains) open in the browser.
 */
function isInternalUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl) // Throws on invalid strings
    if (parsed.protocol === 'nodnotes:') return true // Custom protocol deep links
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false // Never load file:/data: etc.
    return INTERNAL_HOSTS.has(parsed.hostname) // Hostname allowlist only
  } catch {
    return false // Malformed → treat as external / deny navigation
  }
}

/** Build the native application menu (File / Edit / View / Window / Help). */
function buildAppMenu() {
  const isMac = process.platform === 'darwin' // macOS gets the app-name first menu
  const template = [
    ...(isMac
      ? [
          {
            label: app.name, // Product name from package.json / electron-builder
            submenu: [
              { role: 'about' }, // Standard About Nod Notes
              {
                label: 'Check for Updates…',
                click: () => {
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.executeJavaScript(
                      'window.nodnotesDesktop && window.nodnotesDesktop.checkForUpdates()'
                    )
                  }
                },
              },
              { type: 'separator' },
              { role: 'services' }, // macOS Services submenu
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        ...(isMac
          ? []
          : [
              {
                label: 'Check for Updates…',
                click: () => {
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.executeJavaScript(
                      'window.nodnotesDesktop && window.nodnotesDesktop.checkForUpdates()'
                    )
                  }
                },
              },
              { type: 'separator' },
            ]),
        isMac ? { role: 'close' } : { role: 'quit' },
      ], // Quit lives under File on Windows/Linux
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, // Soft reload of the web app
        { role: 'forceReload' }, // Bypass cache
        { role: 'toggleDevTools' }, // Useful while developing against localhost
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front' }] // Bring all windows to front
          : [{ role: 'close' }]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Nod Notes on the web',
          click: () => {
            shell.openExternal(DEFAULT_APP_URL) // Always production site, not localhost
          },
        },
        {
          label: 'Download page',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.loadURL(`${APP_URL}/download`) // In-shell (auth-gated)
            } else {
              shell.openExternal(`${DEFAULT_APP_URL}/download`)
            }
          },
        },
        {
          label: 'Check for Updates…',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.executeJavaScript(
                'window.nodnotesDesktop && window.nodnotesDesktop.checkForUpdates()'
              )
            }
          },
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template)) // Apply once at startup
}

/** Create (or recreate) the main BrowserWindow and load the Nod Notes URL. */
function createWindow() {
  const isMac = process.platform === 'darwin' // Notion-style traffic lights live in the web top bar
  const isWin = process.platform === 'win32' // Windows 11 overlay buttons instead of a native title strip

  mainWindow = new BrowserWindow({
    width: 1440, // Comfortable board workspace default
    height: 900,
    minWidth: 900, // Below this, board chrome gets cramped
    minHeight: 600,
    title: 'Nod Notes', // Mission Control / taskbar label — not drawn as a title strip
    backgroundColor: '#0f0f0f', // Match dark board chrome; avoids a bright flash under hidden titlebar
    show: false, // Reveal after ready-to-show to prevent white flicker
    autoHideMenuBar: isWin, // Windows: hide menu until Alt
    // Notion-like: no OS title strip — traffic lights / caption buttons sit on the web top bar
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset', // Hide title text; keep inset traffic lights
          trafficLightPosition: { x: 16, y: 18 }, // Align with 52px board top bar
        }
      : {
          titleBarStyle: 'hidden', // Drop the native Windows/Linux title bar
          ...(isWin
            ? {
                titleBarOverlay: {
                  color: '#0f0f0f00', // Transparent overlay so board chrome shows through
                  symbolColor: '#e5e7eb', // Light caption button glyphs on dark chrome
                  height: 52, // Match board top-bar height (`panelHeight`)
                },
              }
            : { frame: false }), // Linux: fully frameless; web bar is the drag surface
        }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), // Tiny bridge; no nodeIntegration
      contextIsolation: true, // Hard requirement for security
      nodeIntegration: false, // Web app must not see Node APIs
      sandbox: true, // Extra isolation for the renderer
      spellcheck: true, // TipTap / inputs benefit from OS spellcheck
    },
  })

  // Keep the OS chrome title short if the page sets a long document.title
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault() // Don't mirror long SEO titles into the window
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle('Nod Notes')
  })

  // Show once Chromium has painted to avoid a blank flash under the hidden titlebar
  mainWindow.once('ready-to-show', () => {
    if (mainWindow) mainWindow.show() // Null-safe if closed during load
  })

  // Keep in-app navigations inside the shell; send everything else to the browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url)) {
      return { action: 'allow' } // window.open to same origin → new Electron window later if needed
    }
    shell.openExternal(url) // OAuth / external help links
    return { action: 'deny' } // Do not spawn another Electron window for strangers
  })

  // Same policy for top-level navigations (link clicks, location.assign)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isInternalUrl(url)) return // Stay in-shell for Nod Notes hosts
    event.preventDefault() // Block leaving the allowlisted origins
    shell.openExternal(url) // Hand off to the default browser
  })

  mainWindow.on('closed', () => {
    mainWindow = null // Allow GC + recreate on macOS activate
  })

  mainWindow.loadURL(APP_URL) // Remote Next app (prod or local)
}

/** Focus an existing window or create one (macOS dock click / second launch). */
function focusOrCreateWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore() // Un-minimize first
    mainWindow.focus() // Bring to front
    return
  }
  createWindow() // Cold start path
}

// Single-instance: second launches focus the first (and can carry deep-link argv)
const gotLock = app.requestSingleInstanceLock() // False if another Nod Notes is running
if (!gotLock) {
  app.quit() // Leave the existing instance in charge
} else {
  app.on('second-instance', (_event, argv) => {
    focusOrCreateWindow() // User double-clicked the app again
    const deepLink = argv.find((arg) => typeof arg === 'string' && arg.startsWith('nodnotes://'))
    if (deepLink && mainWindow) {
      mainWindow.loadURL(mapDeepLinkToAppUrl(deepLink)) // Optional protocol handler
    }
  })

  // Register nodnotes:// so board share links can open the desktop app later
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('nodnotes', process.execPath, [path.resolve(process.argv[1])]) // Dev: electron .
    }
  } else {
    app.setAsDefaultProtocolClient('nodnotes') // Packaged build
  }

  app.whenReady().then(() => {
    setupAutoUpdater(() => mainWindow) // GitHub Releases feed + IPC for More menu
    buildAppMenu() // Native menus before first paint
    createWindow() // Primary window

    app.on('activate', () => {
      // macOS: clicking the dock icon with no windows open recreates one
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else focusOrCreateWindow()
    })
  })

  // macOS keeps the app alive with no windows; other platforms quit
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  // macOS open-url (nodnotes:// from another app)
  app.on('open-url', (event, url) => {
    event.preventDefault() // We handle navigation ourselves
    focusOrCreateWindow()
    if (mainWindow && url.startsWith('nodnotes://')) {
      mainWindow.loadURL(mapDeepLinkToAppUrl(url))
    }
  })
}

/**
 * Map nodnotes://board/ID → https://host/board/ID (or localhost in dev).
 * Supports both nodnotes://board/ID (host=board) and nodnotes:///board/ID.
 */
function mapDeepLinkToAppUrl(deepLink) {
  try {
    const parsed = new URL(deepLink) // Custom scheme URI
    const hostPart = parsed.hostname || '' // First path segment when using host form
    const pathPart = parsed.pathname || '' // Remaining path
    const joined = `${hostPart}${pathPart}`.replace(/^\/+/, '') // e.g. board/uuid
    const withQuery = `${joined}${parsed.search}${parsed.hash}` // Keep query/hash
    if (!withQuery || withQuery === '/') return APP_URL // Bare nodnotes:// → home
    return `${APP_URL}/${withQuery}` // Absolute app URL
  } catch {
    return APP_URL // Bad URI → safe default
  }
}

// mapDeepLinkToAppUrl lives below; no unused ipcMain stub
