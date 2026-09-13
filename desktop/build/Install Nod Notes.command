#!/bin/bash
# Double-click from the DMG: install to Applications, clear Gatekeeper quarantine, launch.
set -euo pipefail

APP_NAME="Nod Notes.app"
DEST="/Applications/${APP_NAME}"
# This .command sits next to Nod Notes.app on the DMG volume
SOURCE="$(cd "$(dirname "$0")" && pwd)/${APP_NAME}"

echo "Installing Nod Notes…"

if [ ! -d "$SOURCE" ]; then
  osascript -e 'display dialog "Could not find Nod Notes.app next to this installer. Drag Nod Notes into Applications, then run:\n\nxattr -cr \"/Applications/Nod Notes.app\"" buttons {"OK"} default button 1 with icon stop'
  exit 1
fi

# Replace any previous copy
rm -rf "$DEST"
ditto "$SOURCE" "$DEST"

# Chrome/Safari quarantine makes Gatekeeper say the app is "damaged" when unsigned
xattr -cr "$DEST"

echo "Installed to ${DEST}"
open "$DEST"

osascript -e 'display dialog "Nod Notes is installed and should open now.\n\n(Unsigned builds need this installer once per download until Apple signing is set up.)" buttons {"OK"} default button 1 with title "Nod Notes"'
