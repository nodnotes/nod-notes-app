// Top-bar chrome fit — shrink live chat width (not prefs / not utility) so path+Share clear the utility toggle
// Chat floor matches `sidebar-context` CHAT_SIDEBAR_WIDTH — keep in sync.
// Utility panel width is never fit-shrunk; the mode-pill/close cluster is right-aligned in the overlay header.

/** Chat column minimum — fit shrinks toward this without writing `nodnotes-chat-sidebar-width`. */
const CHAT_SIDEBAR_WIDTH = 360

/**
 * Top-bar Share/More clear this much from the map’s right when utility is open.
 * Toggle shell is min body-card width (UTILITY_SIDEBAR_WIDTH − 12), right-aligned — keep in sync with `utility-sidebar` header.
 * = UTILITY_RIGHT_GAP(2) + header pr(6) + shell(140).
 */
export const UTILITY_TOGGLE_TOP_BAR_INSET_PX = 148

/** Air between the board path (or hamburger) and the Share / More cluster. */
const LEFT_RIGHT_GAP_PX = 8

/** Extra room required before growing chat / leaving the map dock again — stops threshold thrash. */
const EXPAND_SLOP_PX = 24

/** Inputs measured from the live top bar + current sidebar display widths. */
export type TopBarChromeFitInput = {
  leftMinWidth: number // Hamburger + cutoff path (ancestor icons + current icon)
  rightWidth: number // Share / favorite / More / utility-open cluster
  chatOpen: boolean // Desktop column open (fit may dock it)
  chatPreferredWidth: number // User/seam preference — restore target; never written by fit
  utilityOpen: boolean // Overlay open — only the right-aligned toggle steals top-bar space
  chatFitPhone: boolean // Fit forced the map dock last pass
  isPhoneLayout: boolean // Real phone breakpoint — phone owns docking; skip desktop fit
  windowWidth: number // Viewport width for map = window − chat column
}

/** Display-only chat width + whether chat must use the map dock. Utility width is untouched. */
export type TopBarChromeFitResult = {
  chatWidth: number // Live chat column (preferred unchanged)
  chatFitPhone: boolean // True → map dock so the utility toggle can sit at the map’s right edge
}

/**
 * If left chrome would collide with Share/More (left of the right-aligned utility toggle),
 * shrink chat toward 360, then dock chat — reverse on surplus. Never changes utility width.
 */
export function planTopBarChromeFit(input: TopBarChromeFitInput): TopBarChromeFitResult {
  // Phone layout already docks chat and hides Share while utility is open — don’t fight it
  if (input.isPhoneLayout) {
    return {
      chatWidth: Math.max(CHAT_SIDEBAR_WIDTH, Math.round(input.chatPreferredWidth)),
      chatFitPhone: false, // Real phone mode owns docking; clear any stale fit flag
    }
  }

  const need = input.leftMinWidth + input.rightWidth + LEFT_RIGHT_GAP_PX // Path + Share must both fit left of the toggle
  const preferredChat = Math.max(CHAT_SIDEBAR_WIDTH, Math.round(input.chatPreferredWidth))
  const toggleOcc = input.utilityOpen ? UTILITY_TOGGLE_TOP_BAR_INSET_PX : 0 // Body width does not steal the top-bar row

  // Usable strip for hamburger + path + Share (toggle inset only; chat column steals map width)
  const usableFor = (chatW: number, phone: boolean) => {
    const chatTakes = input.chatOpen && !phone ? chatW : 0 // Docked / closed → full window is the map
    const mapW = Math.max(0, input.windowWidth - chatTakes)
    return Math.max(0, mapW - toggleOcc)
  }

  // Least chat shrink from preferred that satisfies `usable >= need` (may set phone)
  const minShrink = (): TopBarChromeFitResult => {
    let chatW = preferredChat
    let phone = false
    let usable = usableFor(chatW, phone)

    if (usable < need && input.chatOpen) {
      chatW = Math.max(CHAT_SIDEBAR_WIDTH, chatW - (need - usable)) // Shrink column → map grows, toggle moves right
      usable = usableFor(chatW, phone)
    }
    if (usable < need && input.chatOpen) {
      phone = true // Still short → map dock frees the whole chat column
      chatW = preferredChat // Keep preferred ready for reverse restore
    }

    if (!input.chatOpen) {
      chatW = preferredChat
      phone = false
    }

    return {
      chatWidth: Math.round(chatW),
      chatFitPhone: phone,
    }
  }

  const tight = minShrink()

  // Preferred fits with slop → fully restore (no fit shrink / no dock)
  if (usableFor(preferredChat, false) >= need + EXPAND_SLOP_PX) {
    return {
      chatWidth: preferredChat,
      chatFitPhone: false,
    }
  }

  // Leave the map dock only when the chat minimum fits with slop
  if (tight.chatFitPhone || input.chatFitPhone) {
    const exitUsable = usableFor(CHAT_SIDEBAR_WIDTH, false)
    if (exitUsable >= need + EXPAND_SLOP_PX) {
      const room = exitUsable - need - EXPAND_SLOP_PX // Grow chat toward preferred with leftover
      const exitChat = Math.min(preferredChat, CHAT_SIDEBAR_WIDTH + Math.max(0, room))
      return {
        chatWidth: Math.round(exitChat),
        chatFitPhone: false,
      }
    }
    return tight // Stay docked
  }

  return tight // Stay at the least chat shrink that clears the overlap
}

/** True when applying the plan would change live chrome (skip setState otherwise). */
export function topBarChromeFitChanged(
  current: { chatWidth: number; chatFitPhone: boolean },
  next: TopBarChromeFitResult
) {
  return current.chatWidth !== next.chatWidth || current.chatFitPhone !== next.chatFitPhone
}
