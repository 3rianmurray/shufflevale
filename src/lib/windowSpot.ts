// Where a menu window opens on iPad (see ActionSheet's `place`): directly above the finger that opened it, or, for a
// follow-up menu, where the last window was, moved off the thing it's for. Pure maths, so it can be tested.

export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point {
  w: number;
  h: number;
}

/** The room kept round a window and the screen's edges, and between a window and the thing it keeps clear of. */
const MARGIN = 12;
const GAP = 16;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Whether two rectangles overlap, with `pad` of room counted round the second. */
export function overlaps(a: Rect, b: Rect, pad = 8): boolean {
  return a.x < b.x + b.w + pad && b.x - pad < a.x + a.w && a.y < b.y + b.h + pad && b.y - pad < a.y + a.h;
}

/** The rectangle round a set of rectangles, or none for none. */
export function unionOf(rects: Rect[]): Rect | undefined {
  if (!rects.length) return undefined;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
}

export interface SpotArgs {
  screen: { w: number; h: number };
  /** The safe areas, top and bottom. */
  insets: { top: number; bottom: number };
  /** The window's own size. */
  size: { w: number; h: number };
  /** A fresh window: where the finger was. It opens directly above it (below it, if there's no room above). */
  at?: Point;
  /** A follow-up: where the last window was. It opens there. */
  from?: Rect;
  /** What the window is for, which it keeps off if it can (on the last window's side, or any other it finds). */
  avoid?: Rect;
}

/** The top-left corner for a window, on screen. */
export function placeWindow({ screen, insets, size, at, from, avoid }: SpotArgs): Point {
  const minY = insets.top + MARGIN;
  const maxY = screen.h - insets.bottom - size.h - MARGIN;
  const fit = (p: Point): Point => ({ x: clamp(p.x, MARGIN, screen.w - size.w - MARGIN), y: clamp(p.y, minY, maxY) });
  const box = (p: Point): Rect => ({ ...p, w: size.w, h: size.h });

  if (from) {
    const base = fit({ x: from.x, y: from.y });
    if (!avoid || !overlaps(box(base), avoid)) return base;
    // Over what it's for: moved to a side of it, the nearest that's clear (above, below, left or right).
    const sides = [
      fit({ x: base.x, y: avoid.y - GAP - size.h }),
      fit({ x: base.x, y: avoid.y + avoid.h + GAP }),
      fit({ x: avoid.x - GAP - size.w, y: base.y }),
      fit({ x: avoid.x + avoid.w + GAP, y: base.y }),
    ].filter((p) => !overlaps(box(p), avoid));
    sides.sort((a, b) => Math.hypot(a.x - base.x, a.y - base.y) - Math.hypot(b.x - base.x, b.y - base.y));
    return sides[0] ?? base;
  }

  if (at) {
    const x = at.x - size.w / 2;
    const above = at.y - GAP - size.h;
    // Directly above the finger, where there's room; else just below it.
    return fit({ x, y: above >= minY ? above : at.y + GAP });
  }

  return fit({ x: (screen.w - size.w) / 2, y: screen.h / 4 });
}
