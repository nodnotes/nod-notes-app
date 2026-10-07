import { Position, getSmoothStepPath, type XYPosition } from 'reactflow'; // Sharp elbows + points
import { isSharpThreadAlgorithm, ThreadAlgorithm } from '../constants'; // Sharp stays ridged; linear stays straight
import { THREAD_TIP_SIZE } from '../ThreadTipNode'; // Free-end box the arrow is centered on

// This is directly lifted from the library - it is used to calculate
// the control points for the bezier curve, which can be converted to
// catmull-rom control points and used to create an editable bezier curve

function calculateControlOffset(distance: number, curvature: number): number {
  if (distance >= 0) {
    return 0.5 * distance;
  }

  return curvature * 25 * Math.sqrt(-distance);
}

export function getControlWithCurvature(
  pos: Position,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  c: number
): [number, number] {
  switch (pos) {
    case Position.Left:
      return [x1 - calculateControlOffset(x1 - x2, c), y1];
    case Position.Right:
      return [x1 + calculateControlOffset(x2 - x1, c), y1];
    case Position.Top:
      return [x1, y1 - calculateControlOffset(y1 - y2, c)];
    case Position.Bottom:
      return [x1, y1 + calculateControlOffset(y2 - y1, c)];
  }
}

/** Point on a cubic bezier at parameter `t`. */
function cubicAt(
  p0: XYPosition, // Start (source connection point)
  c1: XYPosition, // First control point (leaves along the source side)
  c2: XYPosition, // Second control point (arrives along the target side)
  p3: XYPosition, // End (target connection point)
  t: number // 0..1 along the curve
): XYPosition {
  const u = 1 - t; // Complement so we can write the standard Bernstein basis
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
  };
}

/** Args for the unbent Smooth thread path (settled edge or live connection preview). */
export type SmoothThreadBezierArgs = {
  sourceX: number // Source connection-point X in flow space
  sourceY: number // Source connection-point Y in flow space
  sourcePosition: Position // Side the thread leaves (Top = arch up)
  targetX: number // Target connection-point X in flow space
  targetY: number // Target connection-point Y in flow space
  targetPosition: Position // Side the thread arrives
  head?: number // Flow px the stroke stops short so the arrow tip lands on the target
};

/** Cubic path + midpoint knob for an unbent Smooth thread. */
export type SmoothThreadBezier = {
  path: string // SVG `d` for BaseEdge / connection line
  mid: XYPosition // t=0.5 on the cubic — hollow knob sits on the stroke
  p0?: XYPosition // Cubic start, set on the smooth cubic so avoidance can sample it
  c1?: XYPosition // Leave control
  c2?: XYPosition // Arrive control
  p3?: XYPosition // Stroke end (back of the arrow)
};

/** Flow length of the arrow for a stroke `strokeUser` units thick (about 2× the stroke). */
export function threadArrowLength(strokeUser: number): number {
  return 2 * Math.max(0, strokeUser) // Back of the head to the tip, in flow px
}

/**
 * Flow px the tip sits outside a frame.
 * The frame paints over its edge, so the tip stops short and the whole head stays visible.
 */
export function arrowFrameClearance(head: number): number {
  return Math.max(0, head) * 0.45 // Marker cap is ~0.1 of the head; the rest is air so the point stays visible
}

/** Connection point moved out along the side so the whole arrow sits outside the fill. */
export function arrowTipOutsideFrame(
  point: XYPosition, // Connection point on the fill
  side: Position, // Side the arrow arrives on
  head: number, // Arrow length, in flow px
  span?: number // Distance to the other end — keep a short thread from folding back
): XYPosition {
  const room = span == null ? Infinity : Math.max(0, span - head) // Space left after the head itself
  const gap = Math.min(arrowFrameClearance(head), room * 0.85) // Clear the fill, but leave a stroke
  const dir = connectionDirection(side) // Into the frame — step the opposite way
  return { x: point.x - dir.x * gap, y: point.y - dir.y * gap } // Tip lands here; the stroke still stops one head behind it
}

/** Keep the head from swallowing a short thread. */
export function clampArrowHead(head: number, span: number): number {
  return Math.min(Math.max(0, head), Math.max(0, span * 0.72)) // Leave a curve in front of the head
}

/** Way the arrow faces for a frame side. Left side points right. */
export function connectionDirection(side: Position): XYPosition {
  if (side === Position.Left) return { x: 1, y: 0 }; // Into the frame from the left
  if (side === Position.Right) return { x: -1, y: 0 }; // Into the frame from the right
  if (side === Position.Top) return { x: 0, y: 1 }; // Into the frame from above
  return { x: 0, y: -1 }; // Bottom side points up
}

/** Handle length for a Miro-like cubic. The hook is a wide arc, not a corner at the tip. */
function smoothHandle(along: number, span: number): number {
  const broad = Math.min(360, Math.max(72, span * 0.5)); // Half the gap — curvature is spread along the stroke
  if (along >= 0) return broad; // Already heading with the arrow
  const perp = Math.sqrt(Math.max(0, span * span - along * along)); // How far off the arrow axis the other end sits
  return Math.min(broad, Math.max(72, perp * 0.85)); // Turn back across that offset so a long reversal does not pinch
}

/** Unit direction the stroke leaves a side. */
function leaveDirection(side: Position): XYPosition {
  if (side === Position.Left) return { x: -1, y: 0 }; // Out the left
  if (side === Position.Right) return { x: 1, y: 0 }; // Out the right
  if (side === Position.Top) return { x: 0, y: -1 }; // Out the top
  return { x: 0, y: 1 }; // Out the bottom
}

/**
 * One cubic. Both handles are balanced so the bend stays round.
 * The end control sits on the arrow axis, so the tip meets the head at 180° without a straight neck.
 */
function pathIntoArrowBack(args: {
  sourceX: number // Start X
  sourceY: number // Start Y
  sourcePosition: Position // Side the stroke leaves
  targetX: number // Arrow tip X
  targetY: number // Arrow tip Y
  dirX: number // Arrow direction X (unit)
  dirY: number // Arrow direction Y (unit)
  head?: number // Flow px from the stroke end to the arrow tip (0 = stroke runs to the tip)
}): SmoothThreadBezier {
  const { sourceX, sourceY, sourcePosition, targetX, targetY, dirX, dirY } = args; // Unpack
  const spanToTip = Math.hypot(targetX - sourceX, targetY - sourceY) || 1; // Distance to the arrow tip
  const head = clampArrowHead(args.head ?? 0, spanToTip); // Stroke stops this far behind the tip
  const endX = targetX - dirX * head; // Flat back of the arrow
  const endY = targetY - dirY * head;
  const dx = endX - sourceX; // Span X to the back of the head
  const dy = endY - sourceY; // Span Y to the back of the head
  const span = Math.hypot(dx, dy) || 1; // Endpoint distance
  const out = leaveDirection(sourcePosition); // Unit leave direction
  const leave = smoothHandle(dx * out.x + dy * out.y, span); // How far to exit the source
  const arrive = smoothHandle(dx * dirX + dy * dirY, span); // How far behind the arrow to pull
  const c1x = sourceX + out.x * leave; // First control, perpendicular to the source side
  const c1y = sourceY + out.y * leave;
  const c2x = endX - dirX * arrive; // Second control, on the arrow axis
  const c2y = endY - dirY * arrive;
  const p0 = { x: sourceX, y: sourceY }; // Cubic start
  const c1 = { x: c1x, y: c1y }; // Leave control
  const c2 = { x: c2x, y: c2y }; // Arrive control — tangent at the back is the arrow
  const p3 = { x: endX, y: endY }; // Back of the arrow; the marker tip reaches the target
  return {
    path: `M${sourceX},${sourceY} C${c1x},${c1y} ${c2x},${c2y} ${endX},${endY}`, // Single smooth cubic, no straight neck
    mid: cubicAt(p0, c1, c2, p3, 0.5), // Knob on the arch
    p0, // Exposed so avoidance can sample the same cubic the stroke paints
    c1,
    c2,
    p3,
  };
}

/**
 * Unbent Smooth path.
 * One smooth cubic; the tip is tangent to the arrow.
 */
export function getSmoothThreadBezier(args: SmoothThreadBezierArgs): SmoothThreadBezier {
  const { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, head } = args; // Unpack flow endpoints + sides
  const dir = connectionDirection(targetPosition); // Arrow faces into the target side
  return pathIntoArrowBack({
    sourceX, // Frame-edge start
    sourceY,
    sourcePosition, // Leave along the source side
    targetX, // Arrow tip on the target side
    targetY,
    dirX: dir.x, // Straight run matches the arrow
    dirY: dir.y,
    head, // Stroke ends on the back; marker covers the rest
  });
}

/**
 * Points along the unbent Smooth cubic, including both stroke ends.
 * Avoidance samples these so a bow that leaves the straight chord still counts as a conflict.
 */
export function sampleSmoothThreadBezier(args: SmoothThreadBezierArgs, steps = 12): XYPosition[] {
  const curve = getSmoothThreadBezier(args); // Same cubic the stroke uses
  const { p0, c1, c2, p3 } = curve; // Controls from that cubic
  if (!p0 || !c1 || !c2 || !p3) return [curve.mid]; // Linear / sharp callers never hit this
  const n = Math.max(1, steps); // At least one step so the loop has a point
  const pts: XYPosition[] = []; // Samples from the connection point to the back of the arrow
  for (let i = 0; i <= n; i++) pts.push(cubicAt(p0, c1, c2, p3, i / n)); // Even steps along the cubic
  return pts;
}

/** Center of a board free-end node — the arrow tip sits here, not on a side handle. */
export function threadTipCenter(node: {
  positionAbsolute?: XYPosition | null // RF absolute flow origin when measured
  position: XYPosition // Fallback origin
  width?: number | null
  height?: number | null
}): XYPosition {
  const x = node.positionAbsolute?.x ?? node.position.x; // Flow X of the tip box
  const y = node.positionAbsolute?.y ?? node.position.y; // Flow Y of the tip box
  const w = node.width && node.width > 0 ? node.width : THREAD_TIP_SIZE; // Measured width, else the planted size
  const h = node.height && node.height > 0 ? node.height : THREAD_TIP_SIZE; // Measured height, else the planted size
  return { x: x + w / 2, y: y + h / 2 }; // Arrow tip is the center of that box
}

/**
 * Preview path while a thread is aimed at a frame side, before release.
 * The arrow faces the connection: left points right, right points left, top points down, bottom points up.
 */
export function getFrameConnectPreview(args: {
  sourceX: number // Source connection point X
  sourceY: number // Source connection point Y
  sourcePosition: Position // Side the thread left
  targetX: number // Pointer or snapped point X
  targetY: number // Pointer or snapped point Y
  targetSide: Position // Frame side being connected to
  head?: number // Flow px the stroke stops short of the pointer / snap
}): string {
  const { sourceX, sourceY, sourcePosition, targetX, targetY, targetSide, head } = args // Unpack ends + sides
  const dir = connectionDirection(targetSide) // Left side → arrow points right
  return pathIntoArrowBack({
    sourceX, // Drag start
    sourceY,
    sourcePosition, // Leave along the source side
    targetX, // Pointer or snapped point
    targetY,
    dirX: dir.x, // End tangent matches the arrow
    dirY: dir.y,
    head, // Preview stroke meets the back of the drag arrow
  }).path
}

/** Side the stroke approaches so a cardinal arrow points away from the connection point. */
export function boardTipArrivalSide(dx: number, dy: number): Position {
  // Dominant axis of (free end − connection point). Arrival side sits behind the arrow.
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? Position.Left : Position.Right; // +X arrives from the left
  return dy >= 0 ? Position.Top : Position.Bottom; // +Y arrives from above
}

/**
 * Free board end. The connection point is the center.
 * The stroke leaves along that point's side and arrives traveling away from it,
 * so the arrow (marker along the end tangent) points away from the point.
 */
export function getBoardTipBezier(args: {
  sourceX: number // Connection point X (the center)
  sourceY: number // Connection point Y
  sourcePosition: Position // Side the thread left (outward from the frame)
  targetX: number // Free end X
  targetY: number // Free end Y
  algorithm?: ThreadAlgorithm // Toolbar style; smooth is the Miro curve
  head?: number // Flow px the stroke stops short of the free end
}): SmoothThreadBezier {
  const { sourceX, sourceY, sourcePosition, targetX, targetY, algorithm, head } = args; // Unpack ends + style
  const dx = targetX - sourceX; // Away vector X (free end minus the connection point)
  const dy = targetY - sourceY; // Away vector Y
  const len = Math.hypot(dx, dy) || 1; // Distance; 1 keeps a zero-length drag from dividing by 0
  const ux = dx / len; // Unit away X — arrow axis
  const uy = dy / len; // Unit away Y
  const used = clampArrowHead(head ?? 0, len); // Same clamp the smooth cubic uses
  const endX = targetX - ux * used; // Stroke ends on the back of the head
  const endY = targetY - uy * used;
  if (algorithm === ThreadAlgorithm.Linear) {
    return {
      path: `M${sourceX},${sourceY} L${endX},${endY}`, // Straight ray; the arrow finishes the last stretch
      mid: { x: (sourceX + endX) / 2, y: (sourceY + endY) / 2 }, // Knob on the midpoint
    };
  }
  if (isSharpThreadAlgorithm(algorithm)) {
    const side = boardTipArrivalSide(dx, dy); // Cardinal side the last elbow travels
    const dir = connectionDirection(side); // Arrow axis for that side
    const [path, labelX, labelY] = getSmoothStepPath({
      sourceX, // Leave the connection point
      sourceY,
      sourcePosition, // Outward side
      targetX: targetX - dir.x * used, // Stop at the back of the head
      targetY: targetY - dir.y * used,
      targetPosition: side, // Last segment points away
      borderRadius: 8, // Same corner as the drag preview
    });
    return { path, mid: { x: labelX, y: labelY } }; // Knob on the sharp path's label point
  }
  return pathIntoArrowBack({
    sourceX, // Connection point
    sourceY,
    sourcePosition, // Leave along that side
    targetX, // Arrow tip
    targetY,
    dirX: ux, // Arrive traveling away from the connection point
    dirY: uy,
    head: used, // Already clamped
  });
}
