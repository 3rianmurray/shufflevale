/**
 * The other dice (d4, d8, d10, d12, d20) as real solids in 3D, drawn as the d6 is (see lib/cube3d: the same view,
 * light and tumble): each face that faces the viewer, where it is in the die's 0–1 box, how lit it is, and how its
 * own frame maps onto it, for its number.
 */
import { apply, dot, drawn, hullOf, LIGHT, LIT, SLANT, times, turnAbout } from './cube3d.ts';
import type { Mat, Pt, Vec } from './cube3d.ts';

/**
 * A number on a face, in the face's own frame (its middle at 0, 0; 1 is as far as from its middle to the corner its
 * number's top points at; down is +y): where it sits, turned `rot` degrees, and how tall it is.
 */
export interface FaceLabel {
  value: number;
  x: number;
  y: number;
  rot: number;
  size: number;
}

/** A face: its corners (round it, as seen from outside), which way it faces, its middle, its frame, and its numbers. */
export interface PolyFace {
  verts: number[];
  n: Vec;
  c: Vec;
  /** Its frame: across and down (u × v is the way it faces), and how far 1 reaches (middle to corner). */
  u: Vec;
  v: Vec;
  reach: number;
  labels: FaceLabel[];
}

/** A die as a solid: its corners, its faces, and how it lies showing each number (unturned on the table). */
export interface PolyModel {
  sides: number;
  vertices: Vec[];
  faces: PolyFace[];
  rests: Record<number, Mat>;
}

const PHI = (1 + Math.sqrt(5)) / 2;

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scaled = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: Vec) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec): Vec => scaled(a, 1 / (len(a) || 1));
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const signs = [1, -1];

/** How big each die's drawn (its corners' reach from its middle, in the die's box), to sit as its flat drawing did. */
const SIZE: Record<number, number> = { 4: 0.52, 8: 0.56, 10: 0.5, 12: 0.52, 20: 0.5 };
/** How tall its numbers are (as a share of a face's middle-to-corner). */
const TEXT: Record<number, number> = { 4: 0.36, 8: 0.62, 10: 0.5, 12: 0.62, 20: 0.62 };

/** A solid's corners, and its faces as lists of them (each the corners lying furthest out along a face's way). */
function solid(sides: number): { vertices: Vec[]; faces: number[][] } {
  const byNormals = (vertices: Vec[], normals: Vec[]) => ({
    vertices,
    faces: normals.map((m) => {
      const most = Math.max(...vertices.map((p) => dot(p, m)));
      return vertices.flatMap((p, i) => (dot(p, m) > most - 1e-6 ? [i] : []));
    }),
  });
  const icosa: Vec[] = [];
  for (const a of signs) for (const b of signs) icosa.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]);
  const dodeca: Vec[] = [];
  for (const a of signs) for (const b of signs) for (const c of signs) dodeca.push([a, b, c]);
  // (Turned to match the icosahedron's, so each one's corners lie the way the other's faces face.)
  for (const a of signs) for (const b of signs) dodeca.push([0, a * PHI, b / PHI], [a / PHI, 0, b * PHI], [a * PHI, b / PHI, 0]);
  if (sides === 4) {
    const vertices: Vec[] = [
      [1, 1, 1],
      [1, -1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
    ];
    // Each face is the three corners but one (it faces away from that one).
    return { vertices, faces: vertices.map((_, skip) => [0, 1, 2, 3].filter((i) => i !== skip)) };
  }
  if (sides === 8) {
    const vertices: Vec[] = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    const normals: Vec[] = [];
    for (const a of signs) for (const b of signs) for (const c of signs) normals.push([a, b, c]);
    return byNormals(vertices, normals);
  }
  if (sides === 12) return byNormals(dodeca, icosa);
  if (sides === 20) return byNormals(icosa, dodeca);
  // A d10: a point at the top and bottom, two rings of five between, staggered, and ten kite faces. The rings sit
  // just so far from the middle that each kite is flat.
  const c = 0.105;
  const tip = (c * (1 + Math.cos(Math.PI / 5))) / (1 - Math.cos(Math.PI / 5));
  const ring = (k: number, turn: number, z: number): Vec => [Math.cos(((72 * k + turn) * Math.PI) / 180), Math.sin(((72 * k + turn) * Math.PI) / 180), z];
  const vertices: Vec[] = [[0, 0, tip], [0, 0, -tip]];
  for (let k = 0; k < 5; k++) vertices.push(ring(k, 0, c));
  for (let k = 0; k < 5; k++) vertices.push(ring(k, 36, -c));
  const up = (k: number) => 2 + (k % 5);
  const down = (k: number) => 7 + (k % 5);
  const faces: number[][] = [];
  for (let k = 0; k < 5; k++) faces.push([0, up(k), down(k), up(k + 1)], [1, down(k), up(k + 1), down(k + 1)]);
  return { vertices, faces };
}

/** A die of `sides` (4, 8, 10, 12 or 20) as a solid, numbered as a real one is (opposite faces adding to sides + 1). */
export function polyModel(sides: number): PolyModel {
  const raw = solid(sides);
  const far = Math.max(...raw.vertices.map(len));
  const vertices = raw.vertices.map((p) => scaled(p, SIZE[sides] / far));
  const faces: PolyFace[] = raw.faces.map((list) => {
    const c = scaled(list.reduce<Vec>((s, i) => [s[0] + vertices[i][0], s[1] + vertices[i][1], s[2] + vertices[i][2]], [0, 0, 0]), 1 / list.length);
    let n = unit(cross(sub(vertices[list[1]], vertices[list[0]]), sub(vertices[list[2]], vertices[list[0]])));
    if (dot(n, c) < 0) n = scaled(n, -1);
    // Round it, as seen from outside.
    const e1 = unit(sub(vertices[list[0]], c));
    const e2 = cross(n, e1);
    const verts = [...list].sort((a, b) => {
      const wa = sub(vertices[a], c);
      const wb = sub(vertices[b], c);
      return Math.atan2(dot(wa, e2), dot(wa, e1)) - Math.atan2(dot(wb, e2), dot(wb, e1));
    });
    // Its number's top points at its furthest corner (a d10's kite at its point).
    const apex = verts.reduce((a, b) => (len(sub(vertices[b], c)) > len(sub(vertices[a], c)) + 1e-9 ? b : a));
    const reach = len(sub(vertices[apex], c));
    const v = unit(sub(c, vertices[apex]));
    const u = cross(v, n);
    return { verts, n, c, u, v, reach, labels: [] };
  });
  const rests: Record<number, Mat> = {};
  if (sides === 4) {
    // A d4's numbers are at its corners: each face has the number of each of its corners by it, its top toward the
    // corner. It shows the number of the corner pointing up.
    for (const f of faces) {
      f.labels = f.verts.map((i) => {
        const w = sub(vertices[i], f.c);
        const x = dot(w, f.u) / f.reach;
        const y = dot(w, f.v) / f.reach;
        return { value: i + 1, x: x * 0.58, y: y * 0.58, rot: (Math.atan2(x, -y) * 180) / Math.PI, size: TEXT[4] };
      });
    }
    vertices.forEach((p, i) => {
      const n = unit(p);
      const other = vertices[(i + 1) % 4];
      const v = unit(sub(scaled(n, dot(other, n)), other));
      rests[i + 1] = [cross(v, n), v, n];
    });
  } else {
    // Opposite faces add to sides + 1.
    const numbered = new Map<PolyFace, number>();
    let next = 1;
    for (const f of faces) {
      if (numbered.has(f)) continue;
      const opposite = faces.find((g) => g !== f && !numbered.has(g) && dot(g.n, f.n) < -0.999);
      numbered.set(f, next);
      if (opposite) numbered.set(opposite, sides + 1 - next);
      next++;
    }
    for (const f of faces) {
      const value = numbered.get(f)!;
      f.labels = [{ value, x: 0, y: sides === 10 ? -0.08 : 0.04, rot: 0, size: TEXT[sides] }];
      rests[value] = [f.u, f.v, f.n];
    }
  }
  return { sides, vertices, faces, rests };
}

/** How a die lies showing `value`, turned `deg` clockwise on the table. */
export function restingPolyTurn(model: PolyModel, value: number, deg: number): Mat {
  return times(turnAbout([0, 0, 1], (deg * Math.PI) / 180), model.rests[value] ?? model.rests[1]);
}

/** A face as drawn: whether it's seen, its corners, how lit it is, and its frame (see PolyFace) in the die's box. */
export interface PolySlot {
  seen: boolean;
  corners: Pt[];
  light: number;
  origin: Pt;
  across: Pt;
  down: Pt;
}

/**
 * A die turned as `turn` says, drawn: every face in its own place in the list (seen or not), its outline round all
 * of it, and the number it shows as it's turned now (the face pointing up; a d4's corner). Worked out frame by
 * frame on the animation thread as it tumbles.
 */
export function drawPoly(model: PolyModel, turn: Mat): { slots: PolySlot[]; outline: Pt[]; top: number } {
  'worklet';
  const toViewer: Vec = [SLANT, SLANT, 1];
  const pts = model.vertices.map((p) => drawn(apply(turn, p)));
  // What's up: a d4's highest corner, or any other die's face pointing most nearly up.
  let top = 1;
  let highest = -Infinity;
  if (model.sides === 4) {
    model.vertices.forEach((p, i) => {
      const z = apply(turn, p)[2];
      if (z > highest) {
        highest = z;
        top = i + 1;
      }
    });
  } else {
    model.faces.forEach((f) => {
      const z = apply(turn, f.n)[2];
      if (z > highest) {
        highest = z;
        top = f.labels[0].value;
      }
    });
  }
  const slots = model.faces.map((f) => {
    const n = apply(turn, f.n);
    const u = apply(turn, f.u);
    const v = apply(turn, f.v);
    const k = f.reach;
    return {
      seen: dot(n, toViewer) > 1e-6,
      corners: f.verts.map((i) => pts[i]),
      light: LIT.base + LIT.by * dot(n, LIGHT),
      origin: drawn(apply(turn, f.c)),
      across: [(u[0] - SLANT * u[2]) * k, (u[1] - SLANT * u[2]) * k] as Pt,
      down: [(v[0] - SLANT * v[2]) * k, (v[1] - SLANT * v[2]) * k] as Pt,
    };
  });
  return { slots, outline: hullOf(pts), top };
}
