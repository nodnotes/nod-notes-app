/**
 * Nod Notes help-center content — Notion-style IA, Nod Notes product language.
 * Official terms only: board, frame, block, thread, connection point (see DEFINITIONS.md).
 */

export type DocsBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'callout'; text: string }
  | { type: 'steps'; items: { title: string; body: string }[] }

export type DocsArticle = {
  slug: string
  title: string
  description: string
  body: DocsBlock[]
  related?: { category: string; slug: string }[]
}

export type DocsCategory = {
  slug: string
  title: string
  description: string
  icon: DocsIconId
  articles: DocsArticle[]
}

export type DocsIconId =
  | 'clipboard'
  | 'board'
  | 'frame'
  | 'thread'
  | 'share'
  | 'notion'
  | 'sparkles'
  | 'cards'
  | 'billing'
  | 'wrench'

export type DocsPopularTopic = {
  category: string
  slug: string
  title: string
  description: string
  icon: DocsIconId
}

export const DOCS_CATEGORIES: DocsCategory[] = [
  {
    slug: 'get-started',
    title: 'Get started',
    description: 'New to Nod Notes? Start here.',
    icon: 'clipboard',
    articles: [
      {
        slug: 'what-is-nod-notes',
        title: 'What is Nod Notes?',
        description: 'A spatial mind map for notes, ideas, and study — on boards you pan and zoom.',
        body: [
          {
            type: 'p',
            text: 'Nod Notes is a spatial mind map. You think on infinite boards: place frames of text, connect them with threads, nest boards inside boards, and optionally sync with Notion or brainstorm with Nod AI.',
          },
          {
            type: 'h2',
            text: 'The five building blocks',
          },
          {
            type: 'ul',
            items: [
              'Board — the surface you pan and zoom. Every map lives on a board.',
              'Frame — a box on the board that holds your writing.',
              'Block — one unit of text inside a frame (a paragraph, heading, list item, and so on). The ⋮⋮ grip belongs to the block.',
              'Thread — a line that connects two frames.',
              'Connection point — the knob on a frame edge that starts or receives a thread.',
            ],
          },
          {
            type: 'callout',
            text: 'In Nod Notes, “block” always means the TipTap line with the blue wash and ⋮⋮ — not the box on the board. The box is a frame.',
          },
          {
            type: 'h2',
            text: 'What you can do',
          },
          {
            type: 'ul',
            items: [
              'Capture notes and presentations as linked frames on a board.',
              'Brainstorm with Nod AI in Ask or Edit mode.',
              'Import Notion pages and databases onto a board and keep them in sync.',
              'Study with contextual flashcards and spaced repetition.',
              'Share a board with a public view or embed link.',
            ],
          },
          {
            type: 'h2',
            text: 'Local first, Notion when you want it',
          },
          {
            type: 'p',
            text: 'Frames, boards, flashcards, and drawings work without Notion. When you connect a workspace, you can import pages, map them spatially, edit on-site, and sync both ways — layout and threads stay in Nod Notes.',
          },
        ],
        related: [
          { category: 'get-started', slug: 'create-your-first-board' },
          { category: 'get-started', slug: 'glossary' },
        ],
      },
      {
        slug: 'create-an-account',
        title: 'Create an account and sign in',
        description: 'Sign up, verify email, and open your first board.',
        body: [
          {
            type: 'steps',
            items: [
              {
                title: 'Open Nod Notes',
                body: 'Go to nodnotes.com and choose Get started, or visit /signup directly.',
              },
              {
                title: 'Create your account',
                body: 'Enter your email and password. Confirm the address from the verification email if prompted.',
              },
              {
                title: 'Sign in',
                body: 'Use /login anytime. After you’re signed in, Open Nod takes you to your boards.',
              },
            ],
          },
          {
            type: 'h2',
            text: 'After you sign in',
          },
          {
            type: 'p',
            text: 'You’ll land on a board. Empty boards show the Nod mark and a hint: Click the board to add a frame. The first board after sign-in may also show short Virgil tips for Share, Connections, and the boards menu.',
          },
          {
            type: 'callout',
            text: 'If you expected a different email’s boards, sign out from the account menu and sign in with that address. Boards belong to the signed-in account.',
          },
        ],
        related: [
          { category: 'get-started', slug: 'create-your-first-board' },
          { category: 'manage-your-plan', slug: 'plans-and-billing' },
        ],
      },
      {
        slug: 'create-your-first-board',
        title: 'Create your first board',
        description: 'Click the board, type into a frame, and start mapping.',
        body: [
          {
            type: 'p',
            text: 'A board is an infinite surface. You never run out of room — pan and zoom instead of scrolling a long document.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Open a board',
                body: 'From the top bar, open the boards menu (hamburger) or go to /board. An empty board is titled New board until you rename it.',
              },
              {
                title: 'Add a frame',
                body: 'Click empty space on the board. An I-bar and ⋮⋮ appear. Start typing to create a frame at that point, or use the ⋮⋮ menu for Turn into, Duplicate, and more.',
              },
              {
                title: 'Rename the board',
                body: 'Click the title in the top bar. Press Enter or click away to save; Escape cancels.',
              },
              {
                title: 'Add another frame and connect them',
                body: 'Place a second frame. Hover a frame edge for the blue connection indicator, drag to another frame’s connection point, and release to create a thread.',
              },
            ],
          },
          {
            type: 'h2',
            text: 'Tips that save time',
          },
          {
            type: 'ul',
            items: [
              'Creating a frame never forces a zoom reset — your camera stays where you left it.',
              'Select a frame with a click-release before editing text. Dragging an unselected frame moves it.',
              'Use the boards menu to open, reorder, or jump between boards.',
            ],
          },
        ],
        related: [
          { category: 'boards', slug: 'navigate-boards' },
          { category: 'frames-and-blocks', slug: 'frames' },
          { category: 'threads-and-stacks', slug: 'threads' },
        ],
      },
      {
        slug: 'glossary',
        title: 'Glossary',
        description: 'Official Nod Notes terms — board, frame, block, thread, connection point.',
        body: [
          {
            type: 'p',
            text: 'Use these words in the product and in docs. Avoid synonyms that collide with TipTap or React Flow jargon.',
          },
          {
            type: 'h2',
            text: 'Board',
          },
          {
            type: 'p',
            text: 'The canvas you pan and zoom. Nested boards live under a parent via the board hierarchy. Route: /board/{id}.',
          },
          {
            type: 'h2',
            text: 'Frame',
          },
          {
            type: 'p',
            text: 'A box on a board that holds one or more blocks. Frames can be resized, colored, shaped, rotated, stacked, and connected with threads. Not a “card” or “panel.”',
          },
          {
            type: 'h2',
            text: 'Block',
          },
          {
            type: 'p',
            text: 'One TipTap content unit inside a frame. The blue wash and ⋮⋮ grip belong to the block. Dragging ⋮⋮ only moves the block after you select it with a ⋮⋮ click.',
          },
          {
            type: 'h2',
            text: 'Thread',
          },
          {
            type: 'p',
            text: 'A line between two frames. Not an “edge” or “arrow” in product copy.',
          },
          {
            type: 'h2',
            text: 'Connection point',
          },
          {
            type: 'p',
            text: 'The port on a frame that starts or receives a thread. Not a “handle,” “nodule,” or “node.”',
          },
          {
            type: 'callout',
            text: 'Notion pages keep the name “page” because they are Notion API objects — they are not Nod Notes boards.',
          },
        ],
        related: [
          { category: 'get-started', slug: 'what-is-nod-notes' },
          { category: 'frames-and-blocks', slug: 'blocks-and-grips' },
        ],
      },
    ],
  },
  {
    slug: 'boards',
    title: 'Boards',
    description: 'Pan, zoom, nest, and organize boards.',
    icon: 'board',
    articles: [
      {
        slug: 'navigate-boards',
        title: 'Navigate and organize boards',
        description: 'Boards menu, titles, nesting, and jumping between maps.',
        body: [
          {
            type: 'p',
            text: 'Every map is a board. Nested boards let you drill from a high-level map into detail without leaving the product model.',
          },
          {
            type: 'h2',
            text: 'Boards menu',
          },
          {
            type: 'ul',
            items: [
              'Open the top-left menu icon to see your boards.',
              'Hover opens the menu temporarily; click pins it open until you click the menu again or click the board.',
              'On phone, tap a row to open that board; hold ~450ms to reorder.',
            ],
          },
          {
            type: 'h2',
            text: 'Title and path',
          },
          {
            type: 'p',
            text: 'The top bar shows the current board title. Nested boards show an ancestor path (highest / … / parent / current). Hover a segment to browse siblings or nested boards; click to open.',
          },
          {
            type: 'h2',
            text: 'Nested boards from frames',
          },
          {
            type: 'p',
            text: 'Titling a frame can promote it into a linked child board. The parent shows a board link you can open in place or in a fuller view. Content that already lived in the frame moves onto a board-body frame on the new board.',
          },
        ],
        related: [
          { category: 'boards', slug: 'pan-and-zoom' },
          { category: 'frames-and-blocks', slug: 'board-links' },
        ],
      },
      {
        slug: 'pan-and-zoom',
        title: 'Pan, zoom, and Free nav',
        description: 'Move around an infinite board without losing your place.',
        body: [
          {
            type: 'p',
            text: 'Boards are infinite. Pan is unbounded. Zoom typically ranges from about 5% to 200%, and soft bounds expand as you place work near the edges.',
          },
          {
            type: 'h2',
            text: 'How to move',
          },
          {
            type: 'ul',
            items: [
              'Pan — drag the empty board (or use trackpad gestures).',
              'Zoom — pinch, or use Free nav / zoom controls near the minimap.',
              'Minimap — overview in the corner; drag the viewport to jump.',
            ],
          },
          {
            type: 'h2',
            text: 'Performance notes',
          },
          {
            type: 'p',
            text: 'Nod Notes only fully mounts nearby frame editors and keeps off-screen frames light. Notion database tables go fully live when their frame is selected, and show a compact preview when not.',
          },
          {
            type: 'callout',
            text: 'Creating or editing a frame does not recenter the camera. Use fit / Free nav when you want a full overview.',
          },
        ],
        related: [
          { category: 'boards', slug: 'navigate-boards' },
          { category: 'notion-connection', slug: 'databases' },
        ],
      },
      {
        slug: 'empty-board',
        title: 'Empty board and first-run tips',
        description: 'What you see before the first frame, and how chrome hints work.',
        body: [
          {
            type: 'p',
            text: 'An empty board shows the Nod mark and the line Click the board to add a frame. The mark nods occasionally while the board sits idle.',
          },
          {
            type: 'h2',
            text: 'First board after sign-in',
          },
          {
            type: 'p',
            text: 'Your first board may show Virgil handwriting tips pointing at Share / Connections and the boards menu. Those tips dismiss after you’ve used the product and do not return for returning signed-in users.',
          },
          {
            type: 'h2',
            text: 'Click to create',
          },
          {
            type: 'p',
            text: 'A left-click on empty space (with no frame selected) places an I-bar and ⋮⋮. Type to create a frame, or open the block menu from the grip before the frame exists.',
          },
        ],
        related: [
          { category: 'get-started', slug: 'create-your-first-board' },
          { category: 'frames-and-blocks', slug: 'frames' },
        ],
      },
    ],
  },
  {
    slug: 'frames-and-blocks',
    title: 'Frames & blocks',
    description: 'Write, select, shape, and nest content on the board.',
    icon: 'frame',
    articles: [
      {
        slug: 'frames',
        title: 'Frames',
        description: 'Boxes on the board that hold your writing.',
        body: [
          {
            type: 'p',
            text: 'A frame is the box you move around the board. It can hold one or many blocks, take a color or shape, rotate, resize, and connect to other frames with threads.',
          },
          {
            type: 'h2',
            text: 'Select vs edit',
          },
          {
            type: 'ul',
            items: [
              'Click-release an unselected frame to select it (blue adjust chrome).',
              'A second click places the caret so you can type.',
              'Drag an unselected frame to move it — it shows a transient blue box and does not stay selected.',
              'Delete/Backspace removes a selected frame before you’ve placed the caret; after the caret is in text, typing keys go to the editor.',
            ],
          },
          {
            type: 'h2',
            text: 'Resize, rotate, color, shape',
          },
          {
            type: 'p',
            text: 'Selected frames show resize and rotate chrome. Use the frame menu for colors and Shape (circle, diamond, and more). Default clears a silhouette. The blue adjust box stays upright while blocks and the shape rotate inside.',
          },
        ],
        related: [
          { category: 'frames-and-blocks', slug: 'blocks-and-grips' },
          { category: 'threads-and-stacks', slug: 'stacks' },
        ],
      },
      {
        slug: 'blocks-and-grips',
        title: 'Blocks and the ⋮⋮ grip',
        description: 'How blocks work inside a frame — and when ⋮⋮ moves a block vs the frame.',
        body: [
          {
            type: 'p',
            text: 'A block is one TipTap unit inside a frame. The ⋮⋮ grip and blue wash highlight that block.',
          },
          {
            type: 'h2',
            text: 'The important rule',
          },
          {
            type: 'ol',
            items: [
              'Select the frame first if you want to work with its chrome.',
              'Click ⋮⋮ to select that block and open its actions menu.',
              'Only after the block is armed does a ⋮⋮ drag move the block (reorder, drop into another frame, or extract onto the board as a new frame).',
              'If ⋮⋮ is not armed, dragging moves the frame instead.',
            ],
          },
          {
            type: 'callout',
            text: 'Never expect an unarmed ⋮⋮ drag to start a block move. That keeps accidental frame drags from stealing blocks.',
          },
          {
            type: 'h2',
            text: 'Formatting',
          },
          {
            type: 'p',
            text: 'Inside a selected frame’s editor you can use headings, lists, and the usual inline formatting. Turn into from the block menu changes the block type.',
          },
        ],
        related: [
          { category: 'frames-and-blocks', slug: 'frames' },
          { category: 'get-started', slug: 'glossary' },
        ],
      },
      {
        slug: 'board-links',
        title: 'Board links and nested pages',
        description: 'Turn a frame into a doorway to another board.',
        body: [
          {
            type: 'p',
            text: 'A board link is a special block that points at a child board. Inline and title variants show an icon beside the name, plus an Open control on hover.',
          },
          {
            type: 'h2',
            text: 'How they appear',
          },
          {
            type: 'ul',
            items: [
              'Titling a frame can promote it into a linked board.',
              'Notion imports often arrive as title-variant board links with a Notion mark when connected.',
              'Open menu actions include opening in an in-frame preview or a fuller board view.',
            ],
          },
          {
            type: 'p',
            text: 'Existing non-link content is moved onto a board-body frame on the new board — not duplicated every time you open it.',
          },
        ],
        related: [
          { category: 'boards', slug: 'navigate-boards' },
          { category: 'notion-connection', slug: 'import-pages' },
        ],
      },
    ],
  },
  {
    slug: 'threads-and-stacks',
    title: 'Threads & stacks',
    description: 'Connect frames and snap them into packs.',
    icon: 'thread',
    articles: [
      {
        slug: 'threads',
        title: 'Threads and connection points',
        description: 'Draw relationships between frames.',
        body: [
          {
            type: 'p',
            text: 'A thread is a line between two frames. You start it from a connection point — the port on a frame edge.',
          },
          {
            type: 'steps',
            items: [
              {
                title: 'Show the indicator',
                body: 'Select or hover near a frame edge until the blue connection indicator appears.',
              },
              {
                title: 'Drag toward another frame',
                body: 'Nearby frames reveal indicators while you drag. The board can auto-pan near the viewport edges.',
              },
              {
                title: 'Snap to a connection point',
                body: 'Release close to a connection point (~28px on screen). Releasing away from a point cancels the thread.',
              },
            ],
          },
          {
            type: 'callout',
            text: 'Connection points stay mounted on non-flashcard frames so settled threads can stay attached even when chrome is quiet.',
          },
        ],
        related: [
          { category: 'threads-and-stacks', slug: 'stacks' },
          { category: 'nod-ai', slug: 'ask-and-edit' },
        ],
      },
      {
        slug: 'stacks',
        title: 'Stack frames',
        description: 'Snap frames edge-to-edge, open a pack, and lock a side.',
        body: [
          {
            type: 'p',
            text: 'Drag a frame until its edge snaps flush to another frame’s adjust box. Both stay visible; a stack line appears in the gap on that side.',
          },
          {
            type: 'h2',
            text: 'What stacking does',
          },
          {
            type: 'ul',
            items: [
              'Each side (top, bottom, left, right) has its own stack tree.',
              'Frames attached on other sides nest with the pack when you stack.',
              'Snap alone does not lock — you can still pull frames apart.',
              'Click the stack line for Open stack, directional stack arrows, and Lock.',
            ],
          },
          {
            type: 'h2',
            text: 'Unlock and reattach',
          },
          {
            type: 'p',
            text: 'Unlock, then drag away to delink. The same drag can snap to another side or frame. Hover preview is fast (~100ms) so you can feel the snap before committing.',
          },
        ],
        related: [
          { category: 'frames-and-blocks', slug: 'frames' },
          { category: 'threads-and-stacks', slug: 'threads' },
        ],
      },
    ],
  },
  {
    slug: 'share-and-collaborate',
    title: 'Share & collaborate',
    description: 'Share boards, public views, and embeds.',
    icon: 'share',
    articles: [
      {
        slug: 'sharing-boards',
        title: 'Share a board',
        description: 'Use Share in the top bar to give others access.',
        body: [
          {
            type: 'p',
            text: 'Share lives in the top-right cluster of the board chrome (near Connections and sync). Open it to copy a link or adjust who can view the board.',
          },
          {
            type: 'h2',
            text: 'Public view',
          },
          {
            type: 'p',
            text: 'Public boards can open at /view/{id} — a full-screen view suited for presentations and read-only browsing. Showcase boards on the marketing homepage use the same path.',
          },
          {
            type: 'h2',
            text: 'Embed',
          },
          {
            type: 'p',
            text: 'Embeds use a lean /embed/{id} layout without the full boards sidebar chrome — ideal for in-frame previews and external hosts.',
          },
        ],
        related: [
          { category: 'share-and-collaborate', slug: 'permissions' },
          { category: 'get-started', slug: 'what-is-nod-notes' },
        ],
      },
      {
        slug: 'permissions',
        title: 'Permissions and access',
        description: 'Who can open, edit, and disconnect shared work.',
        body: [
          {
            type: 'p',
            text: 'Boards belong to the signed-in account that created them unless you explicitly share. Notion-connected content additionally respects which Notion pages you granted during OAuth.',
          },
          {
            type: 'ul',
            items: [
              'Local-only frames stay in Nod Notes until you share the board.',
              'Notion-linked frames sync under the connection you authorized — Edit permissions from the Notion panel changes which pages Nod Notes can see.',
              'Disconnecting Notion stops sync; it does not automatically delete local layout.',
            ],
          },
          {
            type: 'callout',
            text: 'If a collaborator cannot see a Notion-backed frame’s live content, confirm they have access in Notion and that the connection still includes that page.',
          },
        ],
        related: [
          { category: 'notion-connection', slug: 'connect-notion' },
          { category: 'share-and-collaborate', slug: 'sharing-boards' },
        ],
      },
    ],
  },
  {
    slug: 'notion-connection',
    title: 'Notion connection',
    description: 'Connect a workspace, import pages, and sync.',
    icon: 'notion',
    articles: [
      {
        slug: 'connect-notion',
        title: 'Connect your Notion workspace',
        description: 'OAuth connect, pin the Notion mark, and open the connection panel.',
        body: [
          {
            type: 'steps',
            items: [
              {
                title: 'Start Connections',
                body: 'From the board top bar, open More → Connections, or use the Notion mark once it is pinned.',
              },
              {
                title: 'Authorize Nod Notes',
                body: 'Complete the hosted Notion OAuth flow: pick the workspace, grant permissions, and select pages Nod Notes may access.',
              },
              {
                title: 'Find the Notion mark',
                body: 'After connect, a Notion mark pins left of Share by default. Click it anytime to open the Notion connection panel.',
              },
            ],
          },
          {
            type: 'h2',
            text: 'Connection panel',
          },
          {
            type: 'ul',
            items: [
              'Left: connection types — Import pages, Page body sync, Database sync.',
              'Main: Add Notion pages, search, page list, Edit permissions.',
              '··· next to Notion → Unpin (hides the mark without disconnecting).',
              'Danger zone → Disconnect (clears the pin preference so the next connect defaults pinned again).',
            ],
          },
        ],
        related: [
          { category: 'notion-connection', slug: 'import-pages' },
          { category: 'notion-connection', slug: 'page-sync' },
        ],
      },
      {
        slug: 'import-pages',
        title: 'Import Notion pages',
        description: 'Add a page as a frame, add a tree, or generate a mind map.',
        body: [
          {
            type: 'p',
            text: 'After you connect, Import pages opens a picker with Recently edited (top 10) and a full Library tree of everything granted via OAuth. Both sections start expanded; expand/collapse preferences persist.',
          },
          {
            type: 'h2',
            text: 'Add page as frame',
          },
          {
            type: 'p',
            text: 'Creates a title-variant board-link frame plus a nested Nod Notes board whose board-body holds the Notion content (or a database block for DBs).',
          },
          {
            type: 'h2',
            text: 'Add page tree / Generate mind map',
          },
          {
            type: 'p',
            text: 'Walks child pages and databases, places board-link frames, and draws parent→child threads so the Notion hierarchy becomes a spatial map. In-flight imports show Adding… / Adding tree… with Cancel.',
          },
          {
            type: 'callout',
            text: 'Create new in the picker opens Notion so you can mint a page, then return to import it.',
          },
        ],
        related: [
          { category: 'notion-connection', slug: 'page-sync' },
          { category: 'notion-connection', slug: 'databases' },
          { category: 'frames-and-blocks', slug: 'board-links' },
        ],
      },
      {
        slug: 'page-sync',
        title: 'Page body sync',
        description: 'Keep imported Notion pages live between Nod Notes and Notion.',
        body: [
          {
            type: 'p',
            text: 'Imported Notion pages on a board-body frame live-sync Nod Notes → Notion (debounced). Notion → Nod Notes is detected in the background about every 60 seconds; a sync icon turns blue when updates are pending.',
          },
          {
            type: 'ul',
            items: [
              'Page body sync applies to pages (not databases).',
              'Spatial layout and threads stay owned by Nod Notes.',
              'Edit permissions in the connection panel controls which Notion pages remain available.',
            ],
          },
        ],
        related: [
          { category: 'notion-connection', slug: 'import-pages' },
          { category: 'notion-connection', slug: 'databases' },
        ],
      },
      {
        slug: 'databases',
        title: 'Notion databases on a board',
        description: 'Embed database views, edit cells, and keep previews light.',
        body: [
          {
            type: 'p',
            text: 'Imported databases appear as database blocks inside frames. Selecting the frame mounts the full live table; unselected frames show a compact preview so pan/zoom stays fast.',
          },
          {
            type: 'ul',
            items: [
              'Views respect Notion filters, sorts, and quick filters when available.',
              'Cell edits patch the Notion page for that row.',
              'Linked embeds do not silently fall back to dumping the entire unfiltered database.',
            ],
          },
        ],
        related: [
          { category: 'boards', slug: 'pan-and-zoom' },
          { category: 'notion-connection', slug: 'connect-notion' },
        ],
      },
    ],
  },
  {
    slug: 'nod-ai',
    title: 'Work with Nod AI',
    description: 'Ask, Edit, customize your agent, and map with AI.',
    icon: 'sparkles',
    articles: [
      {
        slug: 'open-chat',
        title: 'Open the AI chat sidebar',
        description: 'Toggle Nod AI beside your board.',
        body: [
          {
            type: 'p',
            text: 'Nod AI lives in a right chat sidebar — hidden by default. Toggle it from the brand mark near the minimap / nav controls. Open/closed state persists across reloads.',
          },
          {
            type: 'ul',
            items: [
              'Desktop: the sidebar is a resizable sibling column (about 360px by default).',
              'Phone: chat opens as an overlay chat box.',
              'Threads and messages are separate from board frames — chats don’t clutter the map unless you Edit.',
            ],
          },
          {
            type: 'h2',
            text: 'Empty state',
          },
          {
            type: 'p',
            text: 'The empty chat shows the Nod mark. Hover Customize to open agent settings. New chat starts a fresh thread.',
          },
        ],
        related: [
          { category: 'nod-ai', slug: 'ask-and-edit' },
          { category: 'nod-ai', slug: 'customize-agent' },
        ],
      },
      {
        slug: 'ask-and-edit',
        title: 'Ask vs Edit',
        description: 'Talk about the board, or let AI create and rewrite frames.',
        body: [
          {
            type: 'h2',
            text: 'Ask',
          },
          {
            type: 'p',
            text: 'Ask streams an answer with a board context pack. It never auto-places frames — if you need creates, switch to Edit.',
          },
          {
            type: 'h2',
            text: 'Edit',
          },
          {
            type: 'p',
            text: 'Edit can surgically replace text in existing frames and create new frames plus threads. Inserts appear immediately as pending so you can watch the map grow. Edit can also assign smart frame colors for brainstorms and grouping.',
          },
          {
            type: 'callout',
            text: 'While streaming, the send control uses the Nod mark animation — not a generic spinner.',
          },
        ],
        related: [
          { category: 'nod-ai', slug: 'customize-agent' },
          { category: 'threads-and-stacks', slug: 'threads' },
        ],
      },
      {
        slug: 'customize-agent',
        title: 'Customize your agent',
        description: 'Instructions, skills, connections, default mode, and personal icons.',
        body: [
          {
            type: 'p',
            text: 'From the chat empty state, open Customize agent. The default name looks like “(workspace) Nod Notes agent” when Notion is connected.',
          },
          {
            type: 'ul',
            items: [
              'Instructions — how the agent should behave on your boards.',
              'Skills — capabilities you want emphasized.',
              'Connections — linked tools and Notion awareness.',
              'Default mode — Ask or Edit preference.',
              'Create new + — seed a custom agent and personalize its icon via the draw modal.',
            ],
          },
        ],
        related: [
          { category: 'nod-ai', slug: 'ask-and-edit' },
          { category: 'notion-connection', slug: 'connect-notion' },
        ],
      },
    ],
  },
  {
    slug: 'flashcards-and-study',
    title: 'Flashcards & study',
    description: 'Turn board context into cards you can rehearse.',
    icon: 'cards',
    articles: [
      {
        slug: 'contextual-flashcards',
        title: 'Contextual flashcards',
        description: 'Study from the ideas already on your board.',
        body: [
          {
            type: 'p',
            text: 'Nod Notes can surface flashcards from the material you’re already mapping — so study sits next to the same frames and threads you used to learn.',
          },
          {
            type: 'ul',
            items: [
              'Answers can stay hazed until you peek or reveal them.',
              'Spaced repetition helps you revisit cards over time instead of cramming once.',
              'Flashcard frames use a distinct interaction model — thread connection points stay on standard frames.',
            ],
          },
          {
            type: 'callout',
            text: 'Retrieval practice beats rereading for durable learning — use cards when you want memory, and the board when you want structure.',
          },
        ],
        related: [
          { category: 'flashcards-and-study', slug: 'study-sets' },
          { category: 'get-started', slug: 'what-is-nod-notes' },
        ],
      },
      {
        slug: 'study-sets',
        title: 'Study sets',
        description: 'Open a focused study surface from your sets.',
        body: [
          {
            type: 'p',
            text: 'Study sets group cards for a session. Open a set from /study-set/{id} when you want a dedicated rehearsal surface instead of the full board chrome.',
          },
          {
            type: 'p',
            text: 'Keep source frames on the board for context, and use the study set when you want rapid flip-through practice.',
          },
        ],
        related: [
          { category: 'flashcards-and-study', slug: 'contextual-flashcards' },
        ],
      },
    ],
  },
  {
    slug: 'manage-your-plan',
    title: 'Manage your plan',
    description: 'Free, Plus, Nod Pro, and billing.',
    icon: 'billing',
    articles: [
      {
        slug: 'plans-and-billing',
        title: 'Plans and billing',
        description: 'What Plus and Nod Pro include, and how trials work.',
        body: [
          {
            type: 'p',
            text: 'Start free on a blank board. Upgrade when you need more AI capacity, priority support, or export options.',
          },
          {
            type: 'h2',
            text: 'Plus — $4/month',
          },
          {
            type: 'p',
            text: 'Billed monthly. Good for regular mapping with upgraded limits.',
          },
          {
            type: 'h2',
            text: 'Nod Pro — $10/month',
          },
          {
            type: 'p',
            text: 'Recommended for power users. Same feature set emphasis as Plus with the Pro tier pricing — see /pricing for the live comparison.',
          },
          {
            type: 'h2',
            text: 'Included when you upgrade',
          },
          {
            type: 'ul',
            items: [
              'Unlimited conversations',
              'Advanced AI models',
              'Priority support',
              'Early access to new features',
              'Export and backup options',
            ],
          },
          {
            type: 'callout',
            text: 'Plans include a 7-day free trial. Cancel anytime from account billing.',
          },
        ],
        related: [
          { category: 'fix-a-problem', slug: 'account-help' },
        ],
      },
    ],
  },
  {
    slug: 'fix-a-problem',
    title: 'Fix a problem',
    description: 'Common fixes and how to reach support.',
    icon: 'wrench',
    articles: [
      {
        slug: 'common-issues',
        title: 'Common issues',
        description: 'Quick checks when something feels stuck.',
        body: [
          {
            type: 'h2',
            text: 'I can’t type in a frame',
          },
          {
            type: 'p',
            text: 'Select the frame first (click-release), then click again to place the caret. An unselected frame treats presses as move/select, not typing.',
          },
          {
            type: 'h2',
            text: '⋮⋮ is moving the whole frame',
          },
          {
            type: 'p',
            text: 'Click ⋮⋮ once to arm the block, then drag. Unarmed ⋮⋮ drags move the frame by design.',
          },
          {
            type: 'h2',
            text: 'Notion content looks stale',
          },
          {
            type: 'p',
            text: 'Check the sync icon near Share. Blue means pending Notion updates. Confirm the connection still includes that page under Edit permissions.',
          },
          {
            type: 'h2',
            text: 'Board feels slow with databases',
          },
          {
            type: 'p',
            text: 'Deselect database frames when you’re only panning — full live tables mount while selected; previews stay compact otherwise.',
          },
        ],
        related: [
          { category: 'frames-and-blocks', slug: 'blocks-and-grips' },
          { category: 'notion-connection', slug: 'page-sync' },
          { category: 'fix-a-problem', slug: 'account-help' },
        ],
      },
      {
        slug: 'account-help',
        title: 'Account and recovery',
        description: 'Sign-in, email verification, and getting help.',
        body: [
          {
            type: 'ul',
            items: [
              'Verification email missing — check spam, then try signing up again with the same address or contact support.',
              'Wrong account — log out from the top nav, then sign in with the email that owns the boards.',
              'Need a human — visit /support or email the address listed there.',
            ],
          },
          {
            type: 'p',
            text: 'We can help with accidental deletions and access issues — reach out with the board title, approximate time, and the account email.',
          },
        ],
        related: [
          { category: 'get-started', slug: 'create-an-account' },
          { category: 'manage-your-plan', slug: 'plans-and-billing' },
        ],
      },
    ],
  },
]

export const DOCS_POPULAR: DocsPopularTopic[] = [
  {
    category: 'get-started',
    slug: 'what-is-nod-notes',
    title: 'Getting started',
    description: 'New to Nod Notes? Start here!',
    icon: 'clipboard',
  },
  {
    category: 'nod-ai',
    slug: 'ask-and-edit',
    title: 'Nod AI',
    description: 'Learn Ask, Edit, and board-aware chat.',
    icon: 'sparkles',
  },
  {
    category: 'notion-connection',
    slug: 'connect-notion',
    title: 'Notion connection',
    description: 'Connect a workspace and import pages.',
    icon: 'notion',
  },
  {
    category: 'frames-and-blocks',
    slug: 'frames',
    title: 'Frames & blocks',
    description: 'Write in frames and use the ⋮⋮ grip.',
    icon: 'frame',
  },
  {
    category: 'share-and-collaborate',
    slug: 'sharing-boards',
    title: 'Sharing & permissions',
    description: 'Share boards, views, and embeds.',
    icon: 'share',
  },
  {
    category: 'threads-and-stacks',
    slug: 'threads',
    title: 'Threads & stacks',
    description: 'Connect frames and snap them into packs.',
    icon: 'thread',
  },
]

export const DOCS_SEARCH_CHIPS = [
  { label: 'Billing', category: 'manage-your-plan', slug: 'plans-and-billing' },
  { label: 'Notion sync', category: 'notion-connection', slug: 'page-sync' },
  { label: 'Frames', category: 'frames-and-blocks', slug: 'frames' },
  { label: 'Sharing', category: 'share-and-collaborate', slug: 'sharing-boards' },
] as const

export function getCategory(slug: string): DocsCategory | undefined {
  return DOCS_CATEGORIES.find((c) => c.slug === slug)
}

export function getArticle(
  categorySlug: string,
  articleSlug: string
): { category: DocsCategory; article: DocsArticle } | undefined {
  const category = getCategory(categorySlug)
  if (!category) return undefined
  const article = category.articles.find((a) => a.slug === articleSlug)
  if (!article) return undefined
  return { category, article }
}

export function getAllArticles(): {
  category: DocsCategory
  article: DocsArticle
}[] {
  return DOCS_CATEGORIES.flatMap((category) =>
    category.articles.map((article) => ({ category, article }))
  )
}

export function searchDocs(query: string): {
  category: DocsCategory
  article: DocsArticle
  score: number
}[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const terms = q.split(/\s+/).filter(Boolean)

  return getAllArticles()
    .map(({ category, article }) => {
      const hay = [
        article.title,
        article.description,
        category.title,
        ...article.body.flatMap((b) => {
          if (b.type === 'p' || b.type === 'h2' || b.type === 'h3' || b.type === 'callout')
            return [b.text]
          if (b.type === 'ul' || b.type === 'ol') return b.items
          if (b.type === 'steps') return b.items.flatMap((s) => [s.title, s.body])
          return []
        }),
      ]
        .join(' ')
        .toLowerCase()

      let score = 0
      for (const term of terms) {
        if (article.title.toLowerCase().includes(term)) score += 8
        if (article.description.toLowerCase().includes(term)) score += 4
        if (category.title.toLowerCase().includes(term)) score += 3
        if (hay.includes(term)) score += 1
      }
      return { category, article, score }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
}

export function articleHref(category: string, slug: string) {
  return `/docs/${category}/${slug}`
}

export function categoryHref(category: string) {
  return `/docs/${category}`
}
