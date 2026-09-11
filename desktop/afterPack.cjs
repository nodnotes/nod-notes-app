'use strict' // electron-builder afterPack — ad-hoc sign so macOS treats the bundle as a real app

const { execFileSync } = require('child_process') // Run codesign without a shell
const path = require('path') // Join appOutDir + product name

/**
 * Ad-hoc sign the .app after pack (no Apple Developer ID yet).
 * Combined with the DMG "Install Nod Notes.command" (clears quarantine), this avoids
 * the false "damaged and can’t be opened" dialog for many users.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return // macOS only
  const appName = `${context.packager.appInfo.productFilename}.app`
  const appPath = path.join(context.appOutDir, appName)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  })
}
