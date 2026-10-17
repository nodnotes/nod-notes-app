# NodNotes definitions (official terms)

Source of truth for product language. Code identifiers may lag (`chatPanel`, `blockGroup`, `Edge`, `Handle`, `metadata.isBlock`). New copy, comments, and CONTEXT must use these words.

When the user says **block**, they mean the TipTap line (blue wash + ⋮⋮), not the box on the board.

## Official terms

| Term | Meaning | Not this | Code today |
|---|---|---|---|
| **Board** | The canvas you pan/zoom. Nested via `conversations.metadata.parent_id`. Route `/board/{id}`. | “page”, “map”, “canvas” (in product copy) | `conversations` row |
| **Frame** | Box on a board that holds text. Resize / lock / rotate chrome. Holds **one or more blocks**. | “card”, “panel”, “map card”, “block” | RF type `chatPanel`, `metadata.isBlock` |
| **Block** | One TipTap/ProseMirror content unit inside a frame (paragraph, heading, list item, …). ⋮⋮ + `.tt-block-highlight`. | The frame / RF node | `EditorBlockRef`, `tiptap-block-handles` |
| **Thread** | Line connecting two frames. | “edge”, “arrow”, “connector” | RF `Edge`, `panel_edges` |
| **Connection point** | Knob on a frame that starts / receives a thread. | “handle”, “nodule”, “node” | RF `Handle` |

**Deck** (Views / Capture): ordered set of **captures** you can **Present**. Not a board object. Prefer **deck** over “presentation” in product copy.

## What is not an official type

- **Block group** — not a product object. Multiple blocks in one **frame** is still a frame. RF type `blockGroup` is a legacy dashed wrapper around several frames; speak of it as frame chrome, not a “group”.
- **RF node** — React Flow canvas object (`Node`: id, type, position). Implementation only. Frames, the legacy wrapper, drawings, and shapes are all RF nodes.
- **Handle** (RF) — library name for a **connection point**. Do not use “handle” or “node” in product copy for thread ports. (⋮⋮ is a **block grip**, not a connection point.)
- **`metadata.isBlock`** — legacy flag meaning “this message is a **frame** on a board” (not flashcard/chat). It does **not** mean a TipTap block.

## Drag / selection rules (do not repeat the ⋮⋮ bug)

- Select the **frame** first — caret / text selection only after the frame is selected. Unselected: drag anywhere (including ⋮⋮) moves the frame.
- **Select** a frame on click release (not pointer-down). **Moving** shows a transient blue box only (no resize/connection/rotate chrome) and never leaves the frame selected.
- Click ⋮⋮ → select that **block** (+ actions menu). Only then does ⋮⋮ drag move that **block** (`nodrag` while armed).
- Unarmed ⋮⋮ drag (frame not selected, or block not selected via ⋮⋮ click) → drag the **frame**, not the block.
- Drag the **frame** (body / chrome) to move the box on the **board**.
- Armed ⋮⋮ drag → reorder blocks, drop into another frame, or extract onto the board as a new frame.
- Drag a **frame** near another’s **adjust box** edge to **align** (magnetize): both stay visible, parks at the natural sim-point gap with fill mids aligned. Align does **not** create a stack link.
- **Stack** (hide one frame under the other, Open stack, Lock frames) lives on the **thread menu** when a **thread** joins two **frames**. Stack under picks which frame stays visible (thread stroke hides; sim connection-point arrow stays). Open stack restores pre-stack positions so the thread looks as before. Lock moves the pair together; stack/open alone do not.
- Frame menu → **Shape** applies a silhouette (circle, diamond, …) to that **frame**; **Default** clears it. **Set default** (right of Default) saves the frame’s current shape for new frames (Add frame / I-bar). Boards / board preview remain the deep-hierarchy tool; shapes are on-board composition.
- Clicking an unselected frame selects it only (no frame menu). Clicking that **already-selected** frame or its **adjust box** opens the frame menu; I-bar on a later text click.

## Prefer in new writing

**board**, **frame**, **block**, **thread**, **connection point**, **deck** (ordered captures; action remains **Present**).

Avoid: page/map/canvas (for the board), card/panel/map card (for the frame), block group/group (as a type), edge/arrow (for the thread), handle/nodule/node (for the connection point), presentation (use **deck**).

Notion **pages** (Notion API objects) keep that name — they are not NodNotes boards.
