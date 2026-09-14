import { cn } from '@/lib/utils' // Merge caller size classes with the lucide canvas

/**
 * Utility-bar open: Lucide Layers stack. Top sheet is Scan (snapshot) cut
 * from the same flat isometric hexagon as Layers’ solid top tile — not a
 * squarer upright frame — so it sits at the same angle as the chevrons below.
 */
export function UtilityOpenIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24" // Lucide canvas so h-4 matches other top-bar glyphs
      fill="none" // Stroke-only, same as Layers / Scan
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(className)}
      aria-hidden="true" // Parent button owns Show sidebar
    >
      <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" /> {/* Middle sheet — Lucide Layers */}
      <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" /> {/* Back sheet — Lucide Layers */}
      <path d="M15.56 3.42 L12.83 2.18 a2 2 0 0 0 -1.66 0 L8.44 3.42" /> {/* Snapshot on the layer’s top cap */}
      <path d="M5.33 4.84 L2.6 6.08 a1 1 0 0 0 0 1.83 L5.33 9.15" /> {/* Snapshot on the layer’s left thickness */}
      <path d="M8.45 10.58 L11.18 11.82 a2 2 0 0 0 1.66 0 L15.57 10.58" /> {/* Snapshot on the layer’s bottom cap */}
      <path d="M18.69 9.16 L21.42 7.92 a1 1 0 0 0 0 -1.83 L18.69 4.85" /> {/* Snapshot on the layer’s right thickness */}
    </svg>
  )
}
