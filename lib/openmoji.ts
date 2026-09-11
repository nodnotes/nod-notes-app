// OpenMoji CDN helpers — artsy open-source emoji art (CC BY-SA 4.0), not Apple/Google native glyphs.

export const OPENMOJI_VERSION = '15.1.0' // Pin so CDN URLs stay stable across deploys

/** Build a color OpenMoji SVG URL from an emoji-mart `unified` hex string (e.g. `1f600` or `1f468-200d-1f4bb`). */
export function openmojiSvgUrl(unified: string): string {
  const hex = unified.toUpperCase() // OpenMoji filenames are uppercase hexcodes
  return `https://cdn.jsdelivr.net/npm/openmoji@${OPENMOJI_VERSION}/color/svg/${hex}.svg`
}

/** Convert a native emoji string to an OpenMoji-compatible unified hexcode. */
export function emojiNativeToUnified(native: string): string {
  const parts: string[] = [] // Collect code points as hex
  for (const ch of native) {
    // for…of yields full Unicode code points (handles surrogates)
    const cp = ch.codePointAt(0)
    if (cp == null) continue
    if (cp === 0xfe0f) continue // Drop variation selector — OpenMoji files usually omit FE0F
    parts.push(cp.toString(16).toUpperCase())
  }
  return parts.join('-')
}

/** Resolve an OpenMoji image URL from either unified hex or a native emoji character. */
export function openmojiUrlFromEmoji(opts: { unified?: string | null; native?: string | null }): string | null {
  if (opts.unified) return openmojiSvgUrl(opts.unified)
  if (opts.native) return openmojiSvgUrl(emojiNativeToUnified(opts.native))
  return null
}
