/**
 * A d6 as a real cube in 3D, for drawing it turned any way (lying on the table, or tumbling as it's rolled), seen
 * from a little above and to the left as the flat drawing always was: each side that faces the viewer, where it is
 * in the die's 0–1 box, how lit it is, and how its own square (for its pips or the player's art) maps onto it.
 *
 * Space: x to the right and y down the table (as on screen), z up off it. The view's an oblique one: a point `z`
 * up is drawn SLANT·z up and to the left, so the lower sides of a cube lying flat show below and to the right.
 */

export type Vec = [number, number, number];
export type Mat = [Vec, Vec, Vec];
/** A point in the die's 0–1 box. */
export type Pt = [number, number];

/** The cube's edge, as a share of the die's box, how far up-left a height is drawn, and where its middle's drawn. */
const EDGE = 0.8;
export const SLANT = 0.175;
const MIDDLE: Pt = [0.49, 0.49];
/** Where the light comes from (up and to the left), and how a side's lit by how squarely it faces it. */
export const LIGHT: Vec = [-0.3, -0.7, 0.65];
export const LIT = { base: -0.193, by: 0.358 };

/**
 * Each side: its number, which way it faces, and its own square's across (u) and down (v) directions (u × v is
 * the way it faces), so its pips and art sit the right way up. Opposite sides add up to 7.
 */
const SIDES: { value: number; n: Vec; u: Vec; v: Vec }[] = [
  { value: 1, n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { value: 6, n: [0, 0, -1], u: [1, 0, 0], v: [0, -1, 0] },
  { value: 2, n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { value: 5, n: [-1, 0, 0], u: [0, -1, 0], v: [0, 0, 1] },
  { value: 3, n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
  { value: 4, n: [0, -1, 0], u: [0, 0, -1], v: [1, 0, 0] },
];

// (Each of these is a worklet too: a die's tumble is worked out frame by frame on the animation thread. They're
// shared with the other dice: see lib/polyhedra.)
export function dot(a: Vec, b: Vec) {
  'worklet';
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function apply(m: Mat, p: Vec): Vec {
  'worklet';
  return [dot(m[0], p), dot(m[1], p), dot(m[2], p)];
}
export function times(a: Mat, b: Mat): Mat {
  'worklet';
  const cols: Vec[] = [0, 1, 2].map((j) => [b[0][j], b[1][j], b[2][j]] as Vec);
  return a.map((row) => cols.map((c) => dot(row, c)) as Vec) as Mat;
}

/** A turn of `rad` about an axis (through the middle). */
export function turnAbout(axis: Vec, rad: number): Mat {
  'worklet';
  const len = Math.hypot(...axis) || 1;
  const [x, y, z] = axis.map((a) => a / len);
  const [c, s, t] = [Math.cos(rad), Math.sin(rad), 1 - Math.cos(rad)];
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
  ];
}

/** How it lies showing `value`, turned `deg` clockwise on the table: that side up, its square the right way round. */
export function restingTurn(value: number, deg: number): Mat {
  const side = SIDES.find((s) => s.value === value) ?? SIDES[0];
  // The side's own across, down and outward to the table's across, down and up.
  const flat: Mat = [side.u, side.v, side.n];
  return times(turnAbout([0, 0, 1], (deg * Math.PI) / 180), flat);
}

/** A tumble as it's rolled: the axis it spins round, and how many whole turns it makes before it settles. */
export interface Tumble {
  axis: Vec;
  turns: number;
}

/** A tumble for a roll, from a number (the same each time for the same roll): a spin mostly end over end. */
export function tumbleFor(seed: number): Tumble {
  const a = ((seed * 137.508) % 360) * (Math.PI / 180);
  return { axis: [Math.cos(a), Math.sin(a), 0.35], turns: 2 + (seed % 3) * 0.5 };
}

/** Where a point in space is drawn, in the die's 0–1 box. */
export function drawn(p: Vec): Pt {
  'worklet';
  return [MIDDLE[0] + p[0] - SLANT * p[2], MIDDLE[1] + p[1] - SLANT * p[2]];
}

/** The smallest shape round some points that bulges nowhere inward. */
export function hullOf(pts: Pt[]): Pt[] {
  'worklet';
  const sorted = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Pt[]) => {
    const out: Pt[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 1e-9) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/** A side as drawn: its number, its corners, how lit it is (for `shade`), and its own square's map onto it. */
export interface DrawnSide {
  value: number;
  corners: Pt[];
  light: number;
  /** Its square (0–1 across and down) onto the box: a point (u, v) is drawn at origin + u·across + v·down. */
  origin: Pt;
  across: Pt;
  down: Pt;
}

/**
 * A d6 turned as `turn` says, drawn: the sides that face the viewer (they never overlap: it's a cube), and its
 * outline round all of it.
 */
export function drawCube(turn: Mat): { sides: DrawnSide[]; outline: Pt[] } {
  'worklet';
  const { slots, outline } = drawCubeSlots(turn);
  return { sides: slots.filter((s) => s.seen), outline };
}

/** A side as drawn (see DrawnSide), and whether it's seen at all (facing the viewer). */
export type SideSlot = DrawnSide & { seen: boolean };

/**
 * A d6 turned as `turn` says, drawn, with every side in its own place in the list (see SIDE_VALUES), seen or not:
 * for drawing each side in one place as it tumbles (shown only while it faces the viewer).
 */
export function drawCubeSlots(turn: Mat): { slots: SideSlot[]; outline: Pt[] } {
  'worklet';
  // Which way the viewer looks from (a side's seen if it faces this way at all).
  const toViewer: Vec = [SLANT, SLANT, 1];
  const half = EDGE / 2;
  const corners: Pt[] = [];
  const slots: SideSlot[] = [];
  for (const side of SIDES) {
    const n = apply(turn, side.n);
    const u = apply(turn, side.u).map((a) => a * EDGE) as Vec;
    const v = apply(turn, side.v).map((a) => a * EDGE) as Vec;
    const mid = n.map((a) => a * half) as Vec;
    // Its square's top-left corner (u = v = 0), and its edges along u and v, all drawn.
    const start: Vec = [0, 1, 2].map((k) => mid[k] - u[k] / 2 - v[k] / 2) as Vec;
    const at = (a: number, b: number) => drawn([0, 1, 2].map((k) => start[k] + a * u[k] + b * v[k]) as Vec);
    const quad = [at(0, 0), at(1, 0), at(1, 1), at(0, 1)];
    corners.push(...quad);
    const origin = at(0, 0);
    const across: Pt = [at(1, 0)[0] - origin[0], at(1, 0)[1] - origin[1]];
    const down: Pt = [at(0, 1)[0] - origin[0], at(0, 1)[1] - origin[1]];
    slots.push({ value: side.value, seen: dot(n, toViewer) > 1e-6, corners: quad, light: LIT.base + LIT.by * dot(n, LIGHT), origin, across, down });
  }
  return { slots, outline: hullOf(corners) };
}

/** Each side's number, in the order drawCubeSlots lists them. */
export const SIDE_VALUES = SIDES.map((s) => s.value);

/**
 * How a d6 is turned partway through its tumble (`t`, 0 just thrown to 1 at rest, eased): spun about the tumble's
 * axis, less and less, till it lies as it lands.
 */
export function tumblingTurn(rest: Mat, tumble: Tumble, t: number): Mat {
  'worklet';
  const left = 1 - t;
  return times(rest, turnAbout(tumble.axis, left * tumble.turns * Math.PI * 2));
}
