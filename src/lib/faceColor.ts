/** A point in a 0–1 box (across, down). */
type Pt = readonly [number, number];

/** How deep the strip round the edge is that the color's taken from, as a share of the picture's shorter side. */
const EDGE_DEPTH = 0.12;
/** Shades this close (per channel, out of 256) count as the same color. */
const SHADE_STEP = 32;

/** Whether a point lies inside a shape. */
function inside(p: Pt, shape: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
    const [xi, yi] = shape[i];
    const [xj, yj] = shape[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** How far a point is from a shape's outline. */
function toEdge(p: Pt, shape: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < shape.length; i++) {
    const a = shape[i];
    const b = shape[(i + 1) % shape.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)));
  }
  return best;
}

const SQUARE: Pt[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/**
 * The color a die with this picture on a face takes (as #rrggbb): the commonest around the edge of the shape it
 * shows in (`outline`, 0–1 across and down the picture; none for the whole of it), where the die's sides meet the
 * face. Like shades count together, and it's the average of those (a real color of the picture's, not a muddy mix).
 * `data` is its pixels, 4 bytes each (red, green, blue, alpha), `width` by `height`.
 */
export function edgeColor(data: ArrayLike<number>, width: number, height: number, outline: Pt[] | null): string {
  const shape = outline ?? SQUARE;
  // Distances measured in the picture's own proportions, so the strip's as deep along every side.
  const sx = width / Math.min(width, height);
  const sy = height / Math.min(width, height);
  const scaled = shape.map(([x, y]) => [x * sx, y * sy] as Pt);
  const groups = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p: Pt = [((x + 0.5) / width) * sx, ((y + 0.5) / height) * sy];
      if (!inside(p, scaled) || toEdge(p, scaled) > EDGE_DEPTH) continue;
      const i = (y * width + x) * 4;
      // See-through parts show the die, not the picture.
      if (data[i + 3] < 128) continue;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      const key = Math.floor(r / SHADE_STEP) * 64 + Math.floor(g / SHADE_STEP) * 8 + Math.floor(b / SHADE_STEP);
      const group = groups.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      groups.set(key, { n: group.n + 1, r: group.r + r, g: group.g + g, b: group.b + b });
    }
  }
  let top = { n: 0, r: 128, g: 128, b: 128 };
  for (const group of groups.values()) if (group.n > top.n) top = group;
  const n = Math.max(1, top.n);
  return `#${[top.r, top.g, top.b].map((v) => Math.round(top.n ? v / n : v).toString(16).padStart(2, '0')).join('')}`;
}
