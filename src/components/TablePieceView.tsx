import { Canvas, Circle, Group, Image as SkImage, matchFont, Path, Shadow, Skia, Text as SkText, useImage, vec } from '@shopify/react-native-skia';
import type { SkFont, SkImage as SkiaImage, SkPath } from '@shopify/react-native-skia';
import { Easing as ReEasing, makeMutable, useDerivedValue, withTiming } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { drawCubeSlots, restingTurn, SIDE_VALUES, tumbleFor, tumblingTurn } from '../lib/cube3d';
import { ROLL_DEBUG, rollLog, rollView } from '../lib/rollDebug';
import type { Mat, SideSlot, Tumble } from '../lib/cube3d';
import { drawPoly, polyModel, restingPolyTurn } from '../lib/polyhedra';
import type { FaceLabel, PolyModel, PolySlot } from '../lib/polyhedra';
import { createContext, memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';

import { Image } from 'expo-image';

import * as haptics from '../lib/haptics';
import {
  bagItems,
  defaultPieceColor,
  faceCount,
  LABEL_SIZE,
  labelAlignOf,
  pieceSizeOf,
  rollDie,
  SCORE_COLUMN,
  SCORE_HEAD,
  SCORE_ADD,
  SCORE_PAD,
  SCORE_ROW,
  SCORE_TOTAL,
  scoreWindow,
  scoreColumns,
  scoreNames,
  scoreText,
  TEXT_SIZE,
  timerText,
} from '../lib/sandbox';
import { imageUri, isSeeThrough } from '../lib/storage';
import type { TablePiece } from '../lib/sandbox';
import { colors } from '../theme';
import { prefersReducedMotion } from './CardView';

/** How long a die tumbles when rolled; and how often its face changes as it starts, slowing as it settles. */
export const ROLL_MS = 820;
const ROLL_FACE_MS = 45;
const ROLL_FACE_SLOWING = 1.22;
/** How many whole turns a rolled die spins as it goes. */
const ROLL_TURNS = 2;
/** How much bigger a piece looks while it's dragged. */
const LIFT = 1.08;
/**
 * A piece's drawing is made up to this many times bigger than it lies and shrunk back down, so it stays sharp when
 * the table's zoomed in on it (the camera scales the table's drawing up); but never bigger than MAX_CANVAS across
 * (a big scaled-up piece drawn that much bigger was more than the phone could draw, and went missing or awry).
 */
const OVERSAMPLE = 3;
const MAX_CANVAS = 1100;
/** How much bigger the piece being drawn is drawn (see OVERSAMPLE), for its parts' drawings. */
const OversampleContext = createContext(OVERSAMPLE);
/** Room round a die's drawing, as a share of its size, for its shadow. */
const PAD = 0.2;

/** Where a d6's pips go, on a 3 × 3 grid (0 top-left to 8 bottom-right), for each face. */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

type Pt = [number, number];

// A d6's cube (in a 0–1 box): its top face, and how far back its sides go (down and to the right).
const CUBE_FACE = { x: 0.02, y: 0.02, size: 0.8 };
const CUBE_DEPTH = 0.14;
const CUBE_ROUND = 0.1;
const [FL, FT, FR, FB] = [CUBE_FACE.x, CUBE_FACE.y, CUBE_FACE.x + CUBE_FACE.size, CUBE_FACE.y + CUBE_FACE.size];
const CUBE_TOP: Pt[] = [
  [FL, FT],
  [FR, FT],
  [FR, FB],
  [FL, FB],
];
/** The whole cube's outline: the top face's top and left edges, then round the far side. */
const CUBE_OUTLINE: Pt[] = [
  [FL, FT],
  [FR, FT],
  [FR + CUBE_DEPTH, FT + CUBE_DEPTH],
  [FR + CUBE_DEPTH, FB + CUBE_DEPTH],
  [FL + CUBE_DEPTH, FB + CUBE_DEPTH],
  [FL, FB],
];
/** Its bottom side (the right side is the rest of the outline round the top face). */
const CUBE_BOTTOM: Pt[] = [
  [FL, FB],
  [FR, FB],
  [FR + CUBE_DEPTH, FB + CUBE_DEPTH],
  [FL + CUBE_DEPTH, FB + CUBE_DEPTH],
];

/** Points turned `deg` degrees clockwise round a middle (all in the 0–1 box). */
function turned(pts: Pt[], deg: number, mid: Pt = [0.5, 0.5]): Pt[] {
  if (!deg) return pts;
  const r = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(r), Math.sin(r)];
  return pts.map(([x, y]) => [mid[0] + (x - mid[0]) * c - (y - mid[1]) * s, mid[1] + (x - mid[0]) * s + (y - mid[1]) * c]);
}

/** The smallest shape round some points that bulges nowhere inward, clockwise on screen. */
function hullOf(pts: Pt[]): Pt[] {
  const sorted = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Pt[]) => {
    const out: Pt[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half([...sorted].reverse())].reverse();
}

/**
 * Whether d6s are drawn as cubes in 3D, tumbling over their real faces when rolled (see lib/cube3d), or flat, as
 * they were. The table says (it's switched in its tools); anywhere else (menus' previews), flat.
 */
export const Dice3DContext = createContext(false);

/** A d6's face as its own square (0–1 across and down), its corners rounded as the cube's are (made once). */
let faceSquare: SkPath | null = null;
function FACE_SQUARE_PATH() {
  if (!faceSquare) {
    const r = CUBE_ROUND / CUBE_FACE.size;
    faceSquare = Skia.Path.Make();
    faceSquare.addRRect(Skia.RRectXY(Skia.XYWHRect(0, 0, 1, 1), r, r));
  }
  return faceSquare;
}

/** The middle of a d6's top face, which it turns about. */
const CUBE_MID: Pt = [FL + CUBE_FACE.size / 2, FT + CUBE_FACE.size / 2];

/**
 * A d6 lying turned `deg` degrees, still seen from a little above and to the left: its top face turned, and the
 * sides that face down and right (where it's seen from) slanting back from it, each shaded by which way it faces;
 * and its whole outline round both. Unturned, it's the cube as it always was (see CUBE_OUTLINE).
 */
function cubeAt(deg: number) {
  const top = turned(CUBE_TOP, deg, CUBE_MID);
  const back = top.map(([x, y]) => [x + CUBE_DEPTH, y + CUBE_DEPTH] as Pt);
  const sides = top.flatMap((a, i) => {
    const b = top[(i + 1) % top.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const [nx, ny] = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len];
    // Only those turned toward where it's seen from (down and to the right) show.
    if (nx + ny <= 0) return [];
    // A right side's as dark as it was, a bottom one darker, and those between, between.
    return [{ pts: [a, b, back[(i + 1) % top.length], back[i]] as Pt[], light: -0.39 + 0.09 * nx - 0.09 * ny }];
  });
  return { top, outline: hullOf([...top, ...back]), sides };
}

/** A color made lighter (toward 1) or darker (toward −1), for a face catching more or less of the light. */
function shade(hex: string, k: number): string {
  // (A worklet too: a 3D die's sides are shaded on the animation thread as it tumbles.)
  'worklet';
  const n = parseInt(hex.slice(1), 16);
  const to = k > 0 ? 255 : 0;
  const t = Math.min(1, Math.abs(k));
  const mix = (c: number) => Math.round(c + (to - c) * t);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Whether a color is light (dark marks go on it) or dark (light ones do). */
function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 160;
}

/** Points round a middle, starting straight up (−90°), at a given reach (all in a 0–1 box). */
const ring = (count: number, reach: number, mid: Pt = [0.5, 0.5], start = -90): Pt[] =>
  Array.from({ length: count }, (_, i) => {
    const a = ((start + (360 / count) * i) * Math.PI) / 180;
    return [mid[0] + reach * Math.cos(a), mid[1] + reach * Math.sin(a)];
  });

/**
 * How lit a face is, from where it lies: the light comes from the top left, so faces turned that way are lighter
 * and those turned away darker. The face looking straight up (in the middle) is lit evenly.
 */
function lightOf(face: Pt[]): number {
  const cx = face.reduce((s, p) => s + p[0], 0) / face.length - 0.5;
  const cy = face.reduce((s, p) => s + p[1], 0) / face.length - 0.5;
  const d = Math.hypot(cx, cy);
  if (d < 0.06) return 0.12;
  return (-(cx * 0.6 + cy * 0.8) / d) * 0.32 - 0.12;
}

/**
 * A die's outline, its faces (each with how lit it is), where its number goes and how big (in a 0–1 box), and the
 * face that shows the player's own art (the one facing up, or for those with a point up, the nearest).
 */
interface DieShape {
  outline: Pt[];
  faces: { pts: Pt[]; light: number }[];
  number: { at: Pt; size: number };
  front: Pt[];
}

const faces = (list: Pt[][], front?: Pt[]) => [
  ...list.map((pts) => ({ pts, light: lightOf(pts) })),
  ...(front ? [{ pts: front, light: 0.12 }] : []),
];

/** Each die's shape, seen from a little above: its faces drawn flat, shaded as if solid. */
function dieShape(sides: number): DieShape {
  if (sides === 4) {
    // A tetrahedron, point up: three faces meet in the middle.
    const [a, b, c]: Pt[] = [
      [0.5, 0.03],
      [0.98, 0.9],
      [0.02, 0.9],
    ];
    const o: Pt = [0.5, 0.6];
    return { outline: [a, b, c], faces: faces([[o, a, b], [o, b, c], [o, c, a]]), number: { at: [0.5, 0.6], size: 0.26 }, front: [o, b, c] };
  }
  if (sides === 8) {
    // An octahedron, point up: four faces round the near point, a little up and left of the middle.
    const [t, r, b, l]: Pt[] = [
      [0.5, 0.0],
      [0.94, 0.5],
      [0.5, 1.0],
      [0.06, 0.5],
    ];
    const o: Pt = [0.46, 0.46];
    return { outline: [t, r, b, l], faces: faces([[t, r, o], [r, b, o], [b, l, o], [l, t, o]]), number: { at: o, size: 0.3 }, front: [r, b, o] };
  }
  if (sides === 10) {
    // A pentagonal trapezohedron: a kite with its front face (the kite-shaped one) facing up.
    const [t, r, b, l]: Pt[] = [
      [0.5, 0.02],
      [0.96, 0.56],
      [0.5, 0.98],
      [0.04, 0.56],
    ];
    const [fr, fb, fl]: Pt[] = [
      [0.76, 0.5],
      [0.5, 0.7],
      [0.24, 0.5],
    ];
    return {
      outline: [t, r, b, l],
      faces: faces(
        [
          [t, r, fr],
          [t, fl, l],
          [l, fl, fb, b],
          [fr, r, b, fb],
        ],
        [t, fr, fb, fl],
      ),
      number: { at: [0.5, 0.44], size: 0.28 },
      front: [t, fr, fb, fl],
    };
  }
  if (sides === 12) {
    // A dodecahedron: a pentagon facing up, five more round it, its outline ten-sided.
    const inner = ring(5, 0.25, [0.5, 0.52]);
    const outer = ring(10, 0.5);
    const round = inner.map((p, i) => [p, outer[2 * i], outer[2 * i + 1], outer[(2 * i + 2) % 10], inner[(i + 1) % 5]]);
    return { outline: outer, faces: faces(round, inner), number: { at: [0.5, 0.52], size: 0.28 }, front: inner };
  }
  if (sides === 100) {
    // A ball of many faces (as a hundred-sided die is): a ring of them round the one facing up, its outline round.
    const outer = ring(20, 0.5);
    const inner = ring(10, 0.27, [0.5, 0.52]);
    const round = inner.map((p, i) => [p, outer[2 * i], outer[2 * i + 1], outer[(2 * i + 2) % 20], inner[(i + 1) % 10]]);
    return { outline: outer, faces: faces(round, inner), number: { at: [0.5, 0.53], size: 0.2 }, front: inner };
  }
  if (sides === 20) {
    // An icosahedron: a triangle facing up in a six-sided outline, the faces round it filling the rest.
    const hex = ring(6, 0.5);
    const tri = ring(3, 0.3);
    const [t0, t1, t2] = tri;
    const round: Pt[][] = [
      [t0, hex[1], t1],
      [t1, hex[3], t2],
      [t2, hex[5], t0],
      [hex[0], hex[1], t0],
      [hex[1], hex[2], t1],
      [hex[2], hex[3], t1],
      [hex[3], hex[4], t2],
      [hex[4], hex[5], t2],
      [hex[5], hex[0], t0],
    ];
    return { outline: hex, faces: faces(round, tri), number: { at: [0.5, 0.53], size: 0.22 }, front: tri };
  }
  return { outline: [], faces: [], number: { at: [0.5, 0.5], size: 0.3 }, front: [] };
}

/** A shape's bounding box (in the 0–1 box). */
function boundsOf(pts: Pt[]) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * The shape a die's face (or a coin's side) shows the player's art in, for cropping it: its width over its height,
 * and its outline fitted to that box (0–1 across and down), or none for a square with rounded corners (a d6's).
 */
export function faceShape(p: Pick<TablePiece, 'kind' | 'sides'>): { ratio: number; outline: Pt[] | null } {
  if (p.kind === 'coin') return { ratio: 1, outline: ring(48, 0.5) };
  const sides = p.sides ?? 6;
  if (sides === 6) return { ratio: 1, outline: null };
  const { front } = dieShape(sides);
  const box = boundsOf(front);
  return { ratio: box.w / box.h, outline: front.map(([x, y]) => [(x - box.x) / box.w, (y - box.y) / box.h] as Pt) };
}

/**
 * A counter or a die lying on the table, drawn in table units (the camera zooms and turns it with the cards).
 * `at` puts it somewhere else for now (while it's dragged); a new `rollKey` tumbles a die onto its value.
 */
export const TablePieceView = memo(function TablePieceView({
  piece,
  at,
  rollKey = 0,
  rollFrom,
  lifted = false,
  selected = false,
  turn,
  layer,
}: {
  piece: TablePiece;
  /** Where it lies among the pieces drawn with it (higher over lower), its view kept in its place among theirs. */
  layer?: number;
  at?: { x: number; y: number };
  /** A turn to draw it at for now (while it's being twisted), instead of its own. */
  turn?: number;
  rollKey?: number;
  /** Where a rolled die set off from, relative to where it now lies (it tumbles across from there). */
  rollFrom?: { dx: number; dy: number; to?: { x: number; y: number } };
  lifted?: boolean;
  /** Picked out with the lasso: outlined in gold. */
  selected?: boolean;
}) {
  // Laid out at its scaled size, and drawn at that size (its parts and lettering sized to match): drawn at its own
  // size and scaled afterward instead, it went soft, scaled up or down.
  const laidOut = piece.scale ?? 1;
  const own = pieceSizeOf({ ...piece, scale: 1 });
  const w = own.w * laidOut;
  const h = own.h * laidOut;
  const x = at?.x ?? piece.x;
  const y = at?.y ?? piece.y;
  const color = piece.color ?? defaultPieceColor(piece);
  // Drawn bigger to stay sharp zoomed in, within what the phone can draw (see OVERSAMPLE).
  const os = Math.max(1, Math.min(OVERSAMPLE, MAX_CANVAS / (Math.max(w, h) * (1 + PAD * 2))));
  return (
    <OversampleContext.Provider value={os}>
    <View
      pointerEvents="none"
      style={[
        styles.piece,
        // (A die turns its shape itself, still lit and seen from the top left: see Die.)
        { left: x - w / 2, top: y - h / 2, width: w, height: h, transform: [{ rotate: `${piece.kind === 'die' ? 0 : (turn ?? piece.angle ?? 0)}deg` }, { scale: ((piece.scale ?? 1) / laidOut) * (lifted ? LIFT : 1) }] },
        layer !== undefined && { zIndex: layer },
      ]}>
      {piece.kind === 'counter' ? (
        <Counter piece={piece} color={color} selected={selected} k={laidOut} />
      ) : piece.kind === 'die' ? (
        <Die piece={piece} color={color} rollKey={rollKey} rollFrom={rollFrom} size={w} selected={selected} angle={turn ?? piece.angle ?? 0} />
      ) : piece.kind === 'coin' ? (
        <Coin piece={piece} rollKey={rollKey} size={w} selected={selected} />
      ) : piece.kind === 'text' ? (
        <TextLabel piece={piece} color={color} selected={selected} k={laidOut} />
      ) : piece.kind === 'marker' ? (
        <Marker piece={piece} color={color} size={w} selected={selected} />
      ) : piece.kind === 'spinner' ? (
        <Spinner piece={piece} color={color} rollKey={rollKey} size={w} selected={selected} />
      ) : piece.kind === 'token' ? (
        <Token piece={piece} color={color} size={w} selected={selected} k={laidOut} />
      ) : piece.kind === 'timer' ? (
        <Timer piece={piece} color={color} size={w} selected={selected} k={laidOut} />
      ) : piece.kind === 'zone' || piece.kind === 'spot' ? (
        <Zone piece={piece} color={color} k={laidOut} />
      ) : piece.kind === 'score' ? (
        <ScorePad piece={piece} color={color} selected={selected} k={laidOut} />
      ) : piece.kind === 'bag' ? (
        <Bag piece={piece} color={color} w={w} h={h} selected={selected} k={laidOut} />
      ) : piece.kind === 'track' ? (
        <Track piece={piece} color={color} selected={selected} k={laidOut} />
      ) : piece.kind === 'art' ? (
        <Art piece={piece} w={w} h={h} selected={selected} k={laidOut} />
      ) : (
        <PlayingPiece piece={piece} color={color} w={w} h={h} selected={selected} />
      )}
    </View>
    </OversampleContext.Provider>
  );
});

/** Sizes a piece's parts (its buttons, lettering, edges) at its scale `k`, so it's drawn at the size it's shown. */
const scaled = (k: number) => (n: number) => n * k;

function Counter({ piece, color, selected, k }: { piece: TablePiece; color: string; selected: boolean; k: number }) {
  const ink = isLight(color) ? '#2c2c2a' : '#ffffff';
  const z = scaled(k);
  const button = { width: z(40), height: z(40), borderRadius: z(20) };
  return (
    <View
      style={[
        styles.counter,
        { backgroundColor: color, borderColor: shade(color, isLight(color) ? -0.25 : 0.3), paddingHorizontal: z(8), borderRadius: z(30), borderWidth: z(1) },
        // Picked out with the lasso: outlined in gold.
        selected && { borderColor: colors.accent, borderWidth: z(3) },
      ]}>
      <View style={[styles.counterButton, button, { backgroundColor: shade(color, isLight(color) ? -0.12 : 0.16) }]}>
        <Text allowFontScaling={false} style={[styles.counterSign, { color: ink, fontSize: z(26), marginTop: z(-2) }]}>
          −
        </Text>
      </View>
      <Text allowFontScaling={false} style={[styles.counterValue, { color: ink, fontSize: z(30) }]} numberOfLines={1} adjustsFontSizeToFit>
        {piece.value}
      </Text>
      <View style={[styles.counterButton, button, { backgroundColor: shade(color, isLight(color) ? -0.12 : 0.16) }]}>
        <Text allowFontScaling={false} style={[styles.counterSign, { color: ink, fontSize: z(26), marginTop: z(-2) }]}>
          +
        </Text>
      </View>
      {piece.label ? (
        <Text allowFontScaling={false} style={[styles.counterLabel, { top: z(64), left: z(-20), right: z(-20), fontSize: z(16), textShadowRadius: z(3) }]} numberOfLines={1}>
          {piece.label}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A die in its own shape and color, shaded face by face. Rolled, it tumbles across from where it was: sliding to
 * a stop as it spins, bouncing lower each time, its faces flickering past slower and slower till it lands.
 */
function Die({
  piece,
  color: ownColor,
  rollKey,
  rollFrom,
  size,
  selected,
  angle,
}: {
  piece: TablePiece;
  color: string;
  rollKey: number;
  rollFrom?: { dx: number; dy: number; to?: { x: number; y: number } };
  size: number;
  selected: boolean;
  /**
   * Its turn on the table (degrees clockwise). The drawing isn't turned whole (its sides, shading and shadow would
   * turn too, as if seen from somewhere else): the die's shape is turned in it, still lit and seen from the top left.
   */
  angle: number;
}) {
  const OS = useContext(OversampleContext);
  const sides = piece.sides ?? 6;
  /**
   * In 3D, tumbling over its real faces as it's rolled: a d6 as a cube (see lib/cube3d), the rest but the d100 (a
   * ball as it is) as their own solids (see lib/polyhedra).
   */
  const in3D = useContext(Dice3DContext);
  const solid = in3D && sides === 6;
  const poly = in3D && SOLID_SIDES.includes(sides);
  /** Mid-roll: its gold rim (picked out) waits till it's settled, rather than wobbling round it as it goes. */
  const [rolling, setRolling] = useState(false);
  const [face, setFace] = useState<number | null>(null);
  /**
   * A roll's motion: how far through it, eased (sliding and spinning to a stop) and steady (for the bounces); and
   * for a die in 3D, how far through its tumble (0 just thrown, 1 at rest, eased), run on the animation thread,
   * which works out and draws each frame without React (see SolidD6). Made afresh for each roll, already at its
   * start, in the very render that has it where it lands: so the first frame drawn shows it where it set off from.
   * (Set to the start afterward instead, the change reached the screen a frame late: it showed where it lands first.)
   */
  // Where it set off from (how far back) is the roll's own, kept with its motion: a new roll's distance put with the
  // last roll's finished motion (whose value on this side can still read as just started: it ran natively) drew it
  // that far back from where it still was, for a frame, before the new roll began.
  const [motion, setMotion] = useState(() => ({ key: 0, dx: 0, dy: 0, travel: new Animated.Value(1), time: new Animated.Value(1), spun: makeMutable(1) }));
  // Only once it's where it lands: a roll can come a moment before the table that has it there does, and started
  // early it would tumble back from where it still was.
  const landed = !rollFrom?.to || (rollFrom.to.x === piece.x && rollFrom.to.y === piece.y);
  if (rollKey && landed && motion.key !== rollKey && !prefersReducedMotion()) {
    setMotion({
      key: rollKey,
      dx: rollFrom?.dx ?? 0,
      dy: rollFrom?.dy ?? 0,
      travel: new Animated.Value(0),
      time: new Animated.Value(0),
      spun: makeMutable(0),
    });
  }
  const { travel, time, spun } = motion;
  /** The roll it last tumbled for (each is played once, even if it's nudged off where it landed afterward). */
  const played = useRef(0);
  useLayoutEffect(() => {
    if (!motion.key || played.current === motion.key) return;
    played.current = motion.key;
    Animated.parallel([
      Animated.timing(travel, { toValue: 1, duration: ROLL_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(time, { toValue: 1, duration: ROLL_MS, easing: Easing.linear, useNativeDriver: true }),
      // Ended (run natively), put at the end on this side too: left reading as just started, the next time it was
      // drawn for any reason (the next roll beginning) it showed for a frame where this roll set off from.
    ]).start(() => {
      travel.setValue(1);
      time.setValue(1);
    });
    // Its rim hidden till it's settled (before it's drawn: this is a layout effect).
    setRolling(true);
    const settled = setTimeout(() => setRolling(false), ROLL_MS);
    // A die in 3D tumbles over its real faces, settling as it lands.
    if (solid || poly) {
      spun.set(withTiming(1, { duration: ROLL_MS, easing: ReEasing.out(ReEasing.cubic) }));
      return () => {
        clearTimeout(settled);
        setRolling(false);
      };
    }
    // Faces flicker past, slower and slower, then it shows where it landed.
    let timer: ReturnType<typeof setTimeout>;
    let gap = ROLL_FACE_MS;
    let elapsed = 0;
    const next = () => {
      elapsed += gap;
      if (elapsed >= ROLL_MS - 60) {
        setFace(null);
        return;
      }
      setFace(rollDie(sides));
      gap *= ROLL_FACE_SLOWING;
      timer = setTimeout(next, gap);
    };
    timer = setTimeout(next, gap);
    // (Cut short, say if it's moved mid-roll: it shows where it landed, not a face it was flickering past.)
    return () => {
      clearTimeout(timer);
      clearTimeout(settled);
      setFace(null);
      setRolling(false);
    };
  }, [motion, sides, solid, poly, travel, time, spun]);
  const shown = face ?? piece.value;
  /** The player's own art for the face it shows, if it has some; then the rest of it is in the art's own color. */
  // (None on a die that takes none: a d4 or d8, even one given some before.)
  const faceArt = faceCount(piece) ? (piece.faces?.[shown - 1] ?? null) : null;
  const color = (faceArt && piece.faceColors?.[shown - 1]) || ownColor;
  // (Drawn on the canvas, clipped to its face, for every die but a d6, whose square face takes it as a picture.)
  const artImage = useImage(faceArt && sides !== 6 ? imageUri(faceArt) : null);
  const { dx, dy } = motion;
  // (Tester builds: each time it's drawn, logged, while its roll is watched: see lib/rollDebug.)
  rollLog(
    piece.id,
    `drawn: lies ${Math.round(piece.x)},${Math.round(piece.y)} roll ${rollKey} motion ${motion.key} ${landed ? 'landed' : 'not landed'} back ${Math.round(dx)},${Math.round(dy)}`,
  );
  // It spins the way it's thrown.
  const turn = (dx >= 0 ? 1 : -1) * 360 * ROLL_TURNS;
  const transform = useMemo(
    () => [
      { translateX: travel.interpolate({ inputRange: [0, 1], outputRange: [-dx, 0] }) },
      { translateY: travel.interpolate({ inputRange: [0, 1], outputRange: [-dy, 0] }) },
      // (A die in 3D turns over in its own drawing instead, still lit from the same side.)
      { rotate: solid || poly ? '0deg' : travel.interpolate({ inputRange: [0, 1], outputRange: [`${-turn}deg`, '0deg'] }) },
      // Off the table and back, lower each bounce.
      { scale: time.interpolate({ inputRange: [0, 0.16, 0.34, 0.5, 0.64, 0.78, 1], outputRange: [1, 1.32, 1, 1.14, 1, 1.04, 1] }) },
    ],
    [travel, time, dx, dy, turn, solid, poly],
  );
  const ink = isLight(color) ? '#2c2c2a' : '#ffffff';
  // Its shape turned as it lies, each face lit as it now faces (the one looking up, as evenly as ever).
  const flat = useMemo(() => dieShape(sides), [sides]);
  const shape = useMemo(
    () => ({
      outline: turned(flat.outline, angle),
      faces: flat.faces.map((f) => ({ pts: turned(f.pts, angle), light: f.pts === flat.front ? f.light : lightOf(turned(f.pts, angle)) })),
      front: turned(flat.front, angle),
      number: { ...flat.number, at: turned([flat.number.at], angle)[0] },
    }),
    [flat, angle],
  );
  const cube = useMemo(() => cubeAt(angle), [angle]);
  // A d6 in 3D: how it lies, and how this roll tumbles it (each frame of it worked out on the animation thread).
  const model = poly ? solidOf(sides) : null;
  const rest = useMemo(
    () => (model ? restingPolyTurn(model, piece.value, angle) : restingTurn(piece.value, angle)),
    [model, piece.value, angle],
  );
  const spin = useMemo(() => tumbleFor(rollKey || 1), [rollKey]);
  // Each face's own art (a d6's, in 3D, where any face can be seen as it tumbles).
  const artOf = (value: number) => (solid && faceCount(piece) ? (piece.faces?.[value - 1] ?? null) : null);
  const faceArts = [
    useImage(artOf(1) ? imageUri(artOf(1)!) : null),
    useImage(artOf(2) ? imageUri(artOf(2)!) : null),
    useImage(artOf(3) ? imageUri(artOf(3)!) : null),
    useImage(artOf(4) ? imageUri(artOf(4)!) : null),
    useImage(artOf(5) ? imageUri(artOf(5)!) : null),
    useImage(artOf(6) ? imageUri(artOf(6)!) : null),
  ];
  // The drawing, oversampled (see OVERSAMPLE), with room round it for the shadow.
  const px = size * OS;
  const canvas = px * (1 + PAD * 2);
  const at = (p: Pt) => [(p[0] + PAD) * px, (p[1] + PAD) * px] as const;
  const path = (pts: Pt[]) => {
    const p = Skia.Path.Make();
    pts.forEach((pt, i) => (i ? p.lineTo(...at(pt)) : p.moveTo(...at(pt))));
    p.close();
    return p;
  };
  /** A shape with its corners rounded (each by up to `r`, in the 0–1 box), as a solid's edges are. */
  const rounded = (pts: Pt[], r: number) => {
    const p = Skia.Path.Make();
    const last = pts[pts.length - 1];
    p.moveTo(...at([(last[0] + pts[0][0]) / 2, (last[1] + pts[0][1]) / 2]));
    pts.forEach((pt, i) => {
      const next = pts[(i + 1) % pts.length];
      p.arcToTangent(...at(pt), ...at(next), r * px);
    });
    p.close();
    return p;
  };
  const shadow = <Shadow dx={2 * OS} dy={4 * OS} blur={4 * OS} color="rgba(0,0,0,0.45)" shadowOnly />;
  const edge = shade(color, -0.45);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { transform }]} ref={ROLL_DEBUG ? (v: View | null) => rollView(piece.id, v) : undefined}>
      <Canvas
        style={{
          position: 'absolute',
          width: canvas,
          height: canvas,
          left: -size * PAD - (canvas - size * (1 + PAD * 2)) / 2,
          top: -size * PAD - (canvas - size * (1 + PAD * 2)) / 2,
          transform: [{ scale: 1 / OS }],
        }}>
        {solid ? (
          <SolidD6 rest={rest} spin={spin} spun={spun} color={color} ink={ink} arts={faceArts} px={px} size={size} OS={OS} rimmed={selected && !rolling} shadow={shadow} />
        ) : model ? (
          <SolidPoly model={model} rest={rest} spin={spin} spun={spun} color={color} ink={ink} px={px} OS={OS} rimmed={selected && !rolling} shadow={shadow} />
        ) : sides === 6 ? (
          <>
            {/*
              A cube seen from a little above and to the left: its top face, and its right and bottom sides slanting
              back to the far corner. One rounded outline round the whole cube, so its corners all meet; the sides
              are cut to it, and the top face's own rounded corners sit inside it.
            */}
            <Path path={rounded(cube.outline, CUBE_ROUND)} color={shade(color, -0.3)}>
              {shadow}
            </Path>
            <Path path={rounded(cube.outline, CUBE_ROUND)} color={shade(color, -0.3)} />
            <Group clip={rounded(cube.outline, CUBE_ROUND)}>
              {cube.sides.map((s, i) => (
                <Path key={i} path={path(s.pts)} color={shade(color, s.light)} />
              ))}
            </Group>
            <Path path={rounded(cube.top, CUBE_ROUND)} color={shade(color, 0.04)} />
            {/* The light catching the top face's edge. */}
            <Path path={rounded(cube.top, CUBE_ROUND)} color={shade(color, 0.35)} style="stroke" strokeWidth={0.8 * OS} opacity={0.5} />
            {selected && !rolling ? <Path path={rounded(cube.outline, CUBE_ROUND)} color={colors.accent} style="stroke" strokeWidth={3 * OS} /> : null}
            {/* (The player's own art for this face, if it has some, is drawn over the face instead: below.) */}
            {(faceArt ? [] : (PIPS[shown] ?? [])).map((cell) => {
              const pip = turned([[CUBE_FACE.x + CUBE_FACE.size * ((cell % 3) * 0.3 + 0.2), CUBE_FACE.y + CUBE_FACE.size * (Math.floor(cell / 3) * 0.3 + 0.2)]], angle, CUBE_MID)[0];
              const [cx, cy] = at(pip);
              return <Circle key={cell} cx={cx} cy={cy} r={0.085 * px} color={ink} />;
            })}
          </>
        ) : (
          <>
            <Path path={path(shape.outline)} color={color}>
              {shadow}
            </Path>
            {shape.faces.map((f, i) => (
              <Path key={i} path={path(f.pts)} color={shade(color, f.light)} />
            ))}
            {/* The player's own art on its front face, cut to the face's shape (it covers the face's box). */}
            {/* (Laid out on the unturned face, then turned with it, round the die's middle.) */}
            {artImage && flat.front.length ? (
              <Group transform={[{ rotate: (angle * Math.PI) / 180 }]} origin={vec(...at([0.5, 0.5]))}>
                <Group clip={path(flat.front)}>
                  <SkImage
                    image={artImage}
                    x={at([boundsOf(flat.front).x, 0])[0]}
                    y={at([0, boundsOf(flat.front).y])[1]}
                    width={boundsOf(flat.front).w * px}
                    height={boundsOf(flat.front).h * px}
                    fit="cover"
                  />
                </Group>
              </Group>
            ) : null}
            {shape.faces.map((f, i) => (
              <Path key={`e${i}`} path={path(f.pts)} color={edge} style="stroke" strokeWidth={0.6 * OS} opacity={0.35} />
            ))}
            {selected && !rolling ? <Path path={path(shape.outline)} color={colors.accent} style="stroke" strokeWidth={3 * OS} /> : null}
          </>
        )}
      </Canvas>
      {faceArt && sides === 6 && !solid ? (
        // The player's own art for the face it shows, filling its top face, its corners rounded as the face's are.
        <Image
          source={{ uri: imageUri(faceArt) }}
          style={{
            position: 'absolute',
            left: CUBE_FACE.x * size,
            top: CUBE_FACE.y * size,
            width: CUBE_FACE.size * size,
            height: CUBE_FACE.size * size,
            borderRadius: CUBE_ROUND * size,
            // Turned with the face, round its middle.
            transform: [{ rotate: `${angle}deg` }],
          }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : null}
      {sides === 6 || faceArt || poly ? null : (
        <Text
          allowFontScaling={false}
          style={[
            styles.dieValue,
            {
              color: ink,
              fontSize: shape.number.size * size,
              left: shape.number.at[0] * size - size / 2,
              top: shape.number.at[1] * size - shape.number.size * size * 0.62,
              width: size,
              // Turned as the die lies, round its own middle (where the number is).
              transform: [{ rotate: `${angle}deg` }],
            },
          ]}>
          {shown}
        </Text>
      )}
    </Animated.View>
  );
}

/**
 * A d6 as a cube in 3D (see lib/cube3d), drawn on the animation thread: its outline, rounded, under its shadow; the
 * sides that face the viewer, each lit as it faces; on each, its pips or the player's art (shaded as its side is),
 * its own square mapped onto it; and on the one facing the viewer most, its rounded face and the light along its
 * edge, as the flat d6 has. Every side has its own place, shown only while it faces the viewer, so a tumble is
 * worked out and drawn frame by frame there, with no React at all (`spun` runs it: 0 thrown, 1 at rest).
 */
function SolidD6({
  rest,
  spin,
  spun,
  color,
  ink,
  arts,
  px,
  size,
  OS,
  rimmed,
  shadow,
}: {
  rest: Mat;
  spin: Tumble;
  spun: SharedValue<number>;
  color: string;
  ink: string;
  /** Each face's own art (1 to 6), if it has some. */
  arts: (SkiaImage | null)[];
  px: number;
  size: number;
  OS: number;
  /** Its gold rim (picked out, and settled). */
  rimmed: boolean;
  shadow: ReactElement;
}) {
  const view = useDerivedValue(() => drawCubeSlots(tumblingTurn(rest, spin, spun.value)));
  const outline = useDerivedValue(() => {
    const pts = view.value.outline;
    const p = Skia.Path.Make();
    const last = pts[pts.length - 1];
    p.moveTo(((last[0] + pts[0][0]) / 2 + PAD) * px, ((last[1] + pts[0][1]) / 2 + PAD) * px);
    pts.forEach((pt, i) => {
      const next = pts[(i + 1) % pts.length];
      p.arcToTangent((pt[0] + PAD) * px, (pt[1] + PAD) * px, (next[0] + PAD) * px, (next[1] + PAD) * px, CUBE_ROUND * px);
    });
    p.close();
    return p;
  });
  // The side facing the viewer most (drawn biggest): it has the rounded face and the light along its edge.
  const front = useDerivedValue(() => {
    let best = -1;
    let most = 0;
    view.value.slots.forEach((s, i) => {
      const area = Math.abs(s.across[0] * s.down[1] - s.across[1] * s.down[0]);
      if (s.seen && area > most) {
        most = area;
        best = i;
      }
    });
    return best;
  });
  return (
    <>
      <Path path={outline} color={shade(color, -0.3)}>
        {shadow}
      </Path>
      <Group clip={outline}>
        {SIDE_VALUES.map((value, i) => (
          <SolidSideFill key={value} view={view} i={i} color={color} px={px} />
        ))}
      </Group>
      {SIDE_VALUES.map((value, i) => (
        <SolidSide key={value} view={view} front={front} i={i} value={value} color={color} ink={ink} art={arts[value - 1]} px={px} size={size} />
      ))}
      {rimmed ? <Path path={outline} color={colors.accent} style="stroke" strokeWidth={3 * OS} /> : null}
    </>
  );
}

/** The dice drawn as their own solids in 3D (the d6 is a cube: see SolidD6; the d100 stays a ball). */
const SOLID_SIDES = [4, 8, 10, 12, 20];
/** Each die's solid, made once. */
const solids = new Map<number, PolyModel>();
function solidOf(sides: number): PolyModel {
  if (!solids.has(sides)) solids.set(sides, polyModel(sides));
  return solids.get(sides)!;
}
/** The numbers on a solid die's faces: bold, drawn 100 tall and scaled to each face (made once). */
let numberFont: SkFont | null = null;
function NUMBER_FONT(): SkFont {
  if (!numberFont) numberFont = matchFont({ fontFamily: Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' }), fontSize: 100, fontWeight: 'bold' });
  return numberFont;
}

/**
 * A d4, d8, d10, d12 or d20 as its own solid in 3D (see lib/polyhedra), drawn on the animation thread as SolidD6
 * is: its outline under its shadow, the faces that face the viewer, each lit as it faces and edged, and on each its
 * number (a d4's at its corners), its own frame mapped onto it so it tilts and turns with it.
 */
function SolidPoly({
  model,
  rest,
  spin,
  spun,
  color,
  ink,
  px,
  OS,
  rimmed,
  shadow,
}: {
  model: PolyModel;
  rest: Mat;
  spin: Tumble;
  spun: SharedValue<number>;
  color: string;
  ink: string;
  px: number;
  OS: number;
  rimmed: boolean;
  shadow: ReactElement;
}) {
  const view = useDerivedValue(() => drawPoly(model, tumblingTurn(rest, spin, spun.value)));
  const outline = useDerivedValue(() => {
    const p = Skia.Path.Make();
    view.value.outline.forEach((c, k) => (k ? p.lineTo((c[0] + PAD) * px, (c[1] + PAD) * px) : p.moveTo((c[0] + PAD) * px, (c[1] + PAD) * px)));
    p.close();
    return p;
  });
  return (
    <>
      <Path path={outline} color={shade(color, -0.3)}>
        {shadow}
      </Path>
      {model.faces.map((f, i) => (
        <SolidPolyFace key={i} view={view} i={i} labels={f.labels} sides={model.sides} color={color} ink={ink} px={px} OS={OS} />
      ))}
      {rimmed ? <Path path={outline} color={colors.accent} style="stroke" strokeWidth={3 * OS} /> : null}
    </>
  );
}

/** A face of a solid die: filled in its shade and edged, its numbers on it (nothing while it faces away). */
function SolidPolyFace({
  view,
  i,
  labels,
  sides,
  color,
  ink,
  px,
  OS,
}: {
  view: SharedValue<{ slots: PolySlot[]; outline: Pt[]; top: number }>;
  i: number;
  labels: FaceLabel[];
  sides: number;
  color: string;
  ink: string;
  px: number;
  OS: number;
}) {
  const path = useDerivedValue(() => {
    const s = view.value.slots[i];
    const p = Skia.Path.Make();
    if (!s.seen) return p;
    s.corners.forEach((c, k) => (k ? p.lineTo((c[0] + PAD) * px, (c[1] + PAD) * px) : p.moveTo((c[0] + PAD) * px, (c[1] + PAD) * px)));
    p.close();
    return p;
  });
  const fill = useDerivedValue(() => shade(color, view.value.slots[i].light));
  const matrix = useDerivedValue(() => {
    const s = view.value.slots[i];
    return Skia.Matrix([s.across[0] * px, s.down[0] * px, (s.origin[0] + PAD) * px, s.across[1] * px, s.down[1] * px, (s.origin[1] + PAD) * px, 0, 0, 1]);
  });
  const seen = useDerivedValue(() => (view.value.slots[i].seen ? 1 : 0));
  return (
    <>
      <Path path={path} color={fill} />
      <Path path={path} color={shade(color, -0.45)} style="stroke" strokeWidth={0.6 * OS} opacity={0.35} />
      <Group matrix={matrix} opacity={seen}>
        {labels.map((l, k) => (
          <SolidPolyLabel key={k} view={view} i={i} label={l} sides={sides} ink={ink} />
        ))}
      </Group>
    </>
  );
}

/**
 * A number on a solid die's face, printed on it: shaded as its face is lit; the number it shows at full strength
 * and the rest faded, so it reads at a glance (a d4's, at its top corner, bigger too, the others fainter still).
 */
function SolidPolyLabel({
  view,
  i,
  label,
  sides,
  ink,
}: {
  view: SharedValue<{ slots: PolySlot[]; outline: Pt[]; top: number }>;
  i: number;
  label: FaceLabel;
  sides: number;
  ink: string;
}) {
  const font = NUMBER_FONT();
  // A 6 and a 9 marked, on dice that have both, so they're told apart whichever way up.
  const text = sides >= 9 && (label.value === 6 || label.value === 9) ? `${label.value}.` : String(label.value);
  const width = font.measureText(text).width;
  const shown = useDerivedValue(() => (view.value.top === label.value ? 1 : sides === 4 ? 0.35 : 0.6));
  const tint = useDerivedValue(() => shade(ink, view.value.slots[i].light));
  const transform = useDerivedValue(() => {
    const big = sides === 4 && view.value.top === label.value ? 1.35 : 1;
    return [{ translateX: label.x }, { translateY: label.y }, { rotate: (label.rot * Math.PI) / 180 }, { scale: (big * label.size) / 100 }];
  });
  return (
    <Group transform={transform} opacity={shown}>
      <SkText x={-width / 2} y={36} text={text} font={font} color={tint} />
    </Group>
  );
}

type CubeView = SharedValue<{ slots: SideSlot[]; outline: Pt[] }>;

/** A side of a 3D d6, filled in its shade (nothing while it faces away). */
function SolidSideFill({ view, i, color, px }: { view: CubeView; i: number; color: string; px: number }) {
  const path = useDerivedValue(() => {
    const s = view.value.slots[i];
    const p = Skia.Path.Make();
    if (!s.seen) return p;
    s.corners.forEach((c, k) => (k ? p.lineTo((c[0] + PAD) * px, (c[1] + PAD) * px) : p.moveTo((c[0] + PAD) * px, (c[1] + PAD) * px)));
    p.close();
    return p;
  });
  const fill = useDerivedValue(() => shade(color, view.value.slots[i].light));
  return <Path path={path} color={fill} />;
}

/**
 * What's on a side of a 3D d6, in its own square mapped onto it: its pips, or the player's art darkened or lightened
 * as the side's lit; and, the side facing the viewer most, its rounded face and the light along its edge.
 */
function SolidSide({
  view,
  front,
  i,
  value,
  color,
  ink,
  art,
  px,
  size,
}: {
  view: CubeView;
  front: SharedValue<number>;
  i: number;
  value: number;
  color: string;
  ink: string;
  art: SkiaImage | null;
  px: number;
  size: number;
}) {
  const matrix = useDerivedValue(() => {
    const s = view.value.slots[i];
    return Skia.Matrix([s.across[0] * px, s.down[0] * px, (s.origin[0] + PAD) * px, s.across[1] * px, s.down[1] * px, (s.origin[1] + PAD) * px, 0, 0, 1]);
  });
  const seen = useDerivedValue(() => (view.value.slots[i].seen ? 1 : 0));
  const isFront = useDerivedValue(() => (front.value === i ? 1 : 0));
  const fill = useDerivedValue(() => shade(color, view.value.slots[i].light));
  // Its pips printed on it: shaded as it's lit.
  const pipTint = useDerivedValue(() => shade(ink, view.value.slots[i].light));
  // Art shaded as its side is: darker turned from the light, a touch lighter turned to it.
  const tint = useDerivedValue(() => {
    const light = view.value.slots[i].light;
    return light < 0 ? `rgba(0, 0, 0, ${Math.min(0.65, -light * 1.1)})` : `rgba(255, 255, 255, ${Math.min(0.3, light * 0.8)})`;
  });
  const square = FACE_SQUARE_PATH();
  return (
    <Group matrix={matrix} opacity={seen}>
      <Group opacity={isFront}>
        <Path path={square} color={fill} />
        <Path path={square} color={shade(color, 0.35)} style="stroke" strokeWidth={0.8 / (CUBE_FACE.size * size)} opacity={0.5} />
      </Group>
      {art ? (
        <Group clip={square}>
          <SkImage image={art} x={0} y={0} width={1} height={1} fit="cover" />
          <Path path={square} color={tint} />
        </Group>
      ) : (
        (PIPS[value] ?? []).map((cell) => (
          <Circle key={cell} cx={(cell % 3) * 0.3 + 0.2} cy={Math.floor(cell / 3) * 0.3 + 0.2} r={0.085 / CUBE_FACE.size} color={pipTint} />
        ))
      )}
    </Group>
  );
}

/**
 * A drawing for a piece `w` × `h` on the table, oversampled to stay sharp zoomed in (see OVERSAMPLE), with room
 * round it for a shadow. `at` takes a point in a 0–1 box over the piece to the drawing's own.
 */
function artFrame(w: number, h: number, OS: number) {
  const pad = Math.max(w, h) * PAD;
  const cw = (w + pad * 2) * OS;
  const ch = (h + pad * 2) * OS;
  const at = (p: Pt) => [(p[0] * w + pad) * OS, (p[1] * h + pad) * OS] as const;
  return {
    style: {
      position: 'absolute' as const,
      width: cw,
      height: ch,
      left: -pad - (cw - (w + pad * 2)) / 2,
      top: -pad - (ch - (h + pad * 2)) / 2,
      transform: [{ scale: 1 / OS }],
    },
    at,
    /** A length across the piece (as a share of its width) in the drawing's own units. */
    len: (u: number) => u * w * OS,
    poly: (pts: Pt[]) => {
      const p = Skia.Path.Make();
      pts.forEach((pt, i) => (i ? p.lineTo(...at(pt)) : p.moveTo(...at(pt))));
      p.close();
      return p;
    },
  };
}

const pieceShadow = (OS: number) => <Shadow dx={2 * OS} dy={4 * OS} blur={4 * OS} color="rgba(0,0,0,0.45)" shadowOnly />;

/** A shape with its corners rounded (by up to `r`, as a share of the piece's width), as a solid's edges are. */
function roundedPath(art: ReturnType<typeof artFrame>, pts: Pt[], r: number) {
  const p = Skia.Path.Make();
  const last = pts[pts.length - 1];
  p.moveTo(...art.at([(last[0] + pts[0][0]) / 2, (last[1] + pts[0][1]) / 2]));
  pts.forEach((pt, i) => p.arcToTangent(...art.at(pt), ...art.at(pts[(i + 1) % pts.length]), art.len(r)));
  p.close();
  return p;
}

/**
 * A round piece's whole body seen from a little above: its top circle at `c`, and its side running down and right
 * to the bottom circle (the two circles joined along their sides), so it reads as a solid disc, not two circles.
 */
function cylinderPath(c: readonly [number, number], r: number, d: readonly [number, number]) {
  const p = Skia.Path.Make();
  const len = Math.hypot(d[0], d[1]) || 1;
  const n = [(-d[1] / len) * r, (d[0] / len) * r];
  p.addCircle(c[0], c[1], r);
  p.addCircle(c[0] + d[0], c[1] + d[1], r);
  p.moveTo(c[0] + n[0], c[1] + n[1]);
  p.lineTo(c[0] + n[0] + d[0], c[1] + n[1] + d[1]);
  p.lineTo(c[0] - n[0] + d[0], c[1] - n[1] + d[1]);
  p.lineTo(c[0] - n[0], c[1] - n[1]);
  p.close();
  return p;
}

/** A shape made of overlapping parts as one outline, round its outside only (so a rim drawn on it skips the joins). */
function outsideOf(path: SkPath) {
  const one = path.copy();
  one.simplify();
  return one;
}

/** Starts a tumble (or flip, or spin) each time `rollKey` changes, over ROLL_MS: 0 to 1, eased out. */
function useRollMotion(rollKey: number) {
  const [motion] = useState(() => new Animated.Value(1));
  // (Before it's drawn, so it never shows a frame as it'll end up first.)
  useLayoutEffect(() => {
    if (!rollKey || prefersReducedMotion()) return;
    motion.setValue(0);
    // (Ended, put at the end on this side too, or it's drawn as just started the next time it's drawn: see Die.)
    Animated.timing(motion, { toValue: 1, duration: ROLL_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => motion.setValue(1));
  }, [rollKey, motion]);
  return motion;
}

/** How many times a tossed coin turns over in the air. */
const COIN_FLIPS = 5;

/** A coin's faces: a head in profile, and a laurel wreath. */
const COIN_HEADS = require('../../assets/pieces/coin-heads.png');
const COIN_TAILS = require('../../assets/pieces/coin-tails.png');

/** A gold coin: heads or tails. Tossed, it hops and turns over and over, edge-on between faces. */
function Coin({ piece, rollKey, size, selected }: { piece: TablePiece; rollKey: number; size: number; selected: boolean }) {
  const OS = useContext(OversampleContext);
  const motion = useRollMotion(rollKey);
  const [face, setFace] = useState<number | null>(null);
  useEffect(() => {
    if (!rollKey || prefersReducedMotion()) return;
    // The faces swap each time it's edge-on, then it shows where it landed.
    let side = 1;
    const timers = Array.from({ length: COIN_FLIPS * 2 - 1 }, (_, i) =>
      setTimeout(() => setFace((side = 3 - side)), ((i + 1) * ROLL_MS) / (COIN_FLIPS * 2)),
    );
    const done = setTimeout(() => setFace(null), ROLL_MS);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [rollKey]);
  const shown = face ?? piece.value;
  const transform = useMemo(() => {
    const steps = COIN_FLIPS * 2;
    const input = Array.from({ length: steps + 1 }, (_, i) => i / steps);
    return [
      { scaleY: motion.interpolate({ inputRange: input, outputRange: input.map((_, i) => (i % 2 ? 0.08 : 1)) }) },
      { scale: motion.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, 1.35, 1] }) },
    ];
  }, [motion]);
  const art = artFrame(size, size, OS);
  const c = art.at([0.5, 0.5]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { transform }]}>
      {/* Its shadow on the cloth, then the face it shows. */}
      <Canvas style={art.style}>
        <Circle cx={c[0]} cy={c[1]} r={art.len(0.49)} color="#000">
          {pieceShadow(OS)}
        </Circle>
      </Canvas>
      {/* The player's own art for the side it shows, if it has some: round, with a gold rim; or the gold coin's. */}
      {/* (Only if it takes face art: see faceCount. One given some before shows the gold coin's.) */}
      {faceCount(piece) && piece.faces?.[shown - 1] ? (
        <Image
          source={{ uri: imageUri(piece.faces[shown - 1]!) }}
          style={[StyleSheet.absoluteFill, styles.coinOwn, { borderRadius: size / 2, borderWidth: size * 0.05 }]}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <Image source={shown === 1 ? COIN_HEADS : COIN_TAILS} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" />
      )}
      {selected ? <View style={[StyleSheet.absoluteFill, styles.coinSelected, { borderRadius: size / 2 }]} /> : null}
    </Animated.View>
  );
}

/** Words on the table: in its color, with a soft shadow so they read on any cloth. */
function TextLabel({ piece, color, selected, k }: { piece: TablePiece; color: string; selected: boolean; k: number }) {
  return (
    <View style={[styles.textBox, { borderRadius: 8 * k }, selected && [styles.textBoxOn, { borderWidth: 2 * k }]]}>
      <Text allowFontScaling={false} numberOfLines={1} style={[styles.text, { color, fontSize: TEXT_SIZE * k, textShadowRadius: 4 * k, textShadowOffset: { width: k, height: 2 * k } }]}>
        {piece.label || ' '}
      </Text>
    </View>
  );
}

/** A first-player (or any) marker: a raised gold disc with a star, and its word on it. */
function Marker({ piece, color, size, selected }: { piece: TablePiece; color: string; size: number; selected: boolean }) {
  const OS = useContext(OversampleContext);
  const art = artFrame(size, size, OS);
  const c = art.at([0.5, 0.5]);
  const star = ring(10, 0.42, [0.5, 0.5]).map((p, i) => (i % 2 ? ([0.5 + (p[0] - 0.5) * 0.45, 0.5 + (p[1] - 0.5) * 0.45] as Pt) : p));
  const ink = shade(color, -0.6);
  return (
    <View style={StyleSheet.absoluteFill}>
      <Canvas style={art.style}>
        <Path path={cylinderPath(c, art.len(0.5), [art.len(0.04), art.len(0.05)])} color={shade(color, -0.45)}>
          {pieceShadow(OS)}
        </Path>
        <Path path={cylinderPath(c, art.len(0.5), [art.len(0.04), art.len(0.05)])} color={shade(color, -0.45)} />
        <Circle cx={c[0]} cy={c[1]} r={art.len(0.5)} color={color} />
        <Path path={art.poly(star)} color={shade(color, 0.3)} />
        <Path path={art.poly(star)} color={shade(color, -0.3)} style="stroke" strokeWidth={art.len(0.015)} opacity={0.6} />
        {selected ? <Circle cx={c[0]} cy={c[1]} r={art.len(0.52)} color={colors.accent} style="stroke" strokeWidth={3 * OS} /> : null}
      </Canvas>
      {piece.label ? (
        <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={[styles.markerText, { color: ink, fontSize: size * 0.26, lineHeight: size, width: size }]}>
          {piece.label}
        </Text>
      ) : null}
    </View>
  );
}

/** How many whole turns a spinner's arrow makes before it settles. */
const SPIN_TURNS = 3;

/** A spinner: a dial with an arrow. Spun, the arrow whirls round a few times and slows to where it points. */
function Spinner({ piece, color, rollKey, size, selected }: { piece: TablePiece; color: string; rollKey: number; size: number; selected: boolean }) {
  const OS = useContext(OversampleContext);
  const [turn] = useState(() => new Animated.Value(piece.value));
  // Where the arrow's turned to so far, in whole degrees round and round (it only ever goes clockwise).
  const total = useRef(piece.value);
  useEffect(() => {
    const now = total.current;
    const to = now + ((((piece.value - now) % 360) + 360) % 360) + (rollKey ? 360 * SPIN_TURNS : 0);
    total.current = to;
    if (!rollKey || prefersReducedMotion()) {
      turn.setValue(to);
      return;
    }
    Animated.timing(turn, { toValue: to, duration: ROLL_MS * 2, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [piece.value, rollKey, turn]);
  const rotate = useMemo(() => turn.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'], extrapolate: 'extend' }), [turn]);
  const art = artFrame(size, size, OS);
  const c = art.at([0.5, 0.5]);
  const ticks = ring(8, 0.4, [0.5, 0.5]);
  const arrow: Pt[] = [
    [0.5, 0.1],
    [0.58, 0.3],
    [0.535, 0.3],
    [0.535, 0.62],
    [0.465, 0.62],
    [0.465, 0.3],
    [0.42, 0.3],
  ];
  return (
    <View style={StyleSheet.absoluteFill}>
      <Canvas style={art.style}>
        <Path path={cylinderPath(c, art.len(0.5), [art.len(0.02), art.len(0.03)])} color={shade(color, -0.4)}>
          {pieceShadow(OS)}
        </Path>
        <Path path={cylinderPath(c, art.len(0.5), [art.len(0.02), art.len(0.03)])} color={shade(color, -0.4)} />
        <Circle cx={c[0]} cy={c[1]} r={art.len(0.5)} color={color} />
        <Circle cx={c[0]} cy={c[1]} r={art.len(0.45)} color={shade(color, -0.15)} style="stroke" strokeWidth={art.len(0.012)} />
        {ticks.map((p, i) => {
          const q = art.at(p);
          return <Circle key={i} cx={q[0]} cy={q[1]} r={art.len(0.025)} color={shade(color, -0.45)} />;
        })}
        {selected ? <Circle cx={c[0]} cy={c[1]} r={art.len(0.52)} color={colors.accent} style="stroke" strokeWidth={3 * OS} /> : null}
      </Canvas>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
        <Canvas style={art.style}>
          <Path path={art.poly(arrow)} color="#2c2c2a">
            <Shadow dx={OS} dy={2 * OS} blur={2 * OS} color="rgba(0,0,0,0.35)" />
          </Path>
          <Circle cx={c[0]} cy={c[1]} r={art.len(0.07)} color="#2c2c2a" />
          <Circle cx={c[0] - art.len(0.015)} cy={c[1] - art.len(0.015)} r={art.len(0.03)} color="#8a8a86" />
        </Canvas>
      </Animated.View>
    </View>
  );
}

/** How far down and to the right a playing piece's sides show (as a share of its size): its thickness. */
const PIECE_DEPTH: Pt = [0.06, 0.07];

/** A meeple, pawn, cube or disc: its shape raised a little off the cloth, its side showing below and to the right. */
function PlayingPiece({ piece, color, w, h, selected }: { piece: TablePiece; color: string; w: number; h: number; selected: boolean }) {
  const OS = useContext(OversampleContext);
  const art = artFrame(w, h, OS);
  const shift = (pts: Pt[]): Pt[] => pts.map((p) => [p[0] + PIECE_DEPTH[0], p[1] + PIECE_DEPTH[1]]);
  const shape = piece.shape ?? 'meeple';
  // Each shape as outlines (several, drawn as one) and circles.
  const outlines: Pt[][] = [];
  const circles: { at: Pt; r: number }[] = [];
  if (shape === 'meeple') {
    circles.push({ at: [0.5, 0.2], r: 0.18 });
    outlines.push([
      [0.36, 0.33],
      [0.64, 0.33],
      [0.97, 0.47],
      [0.95, 0.6],
      [0.7, 0.57],
      [0.9, 0.96],
      [0.6, 0.96],
      [0.5, 0.77],
      [0.4, 0.96],
      [0.1, 0.96],
      [0.3, 0.57],
      [0.05, 0.6],
      [0.03, 0.47],
    ]);
  } else if (shape === 'pawn') {
    circles.push({ at: [0.5, 0.22], r: 0.17 });
    outlines.push(
      [
        [0.38, 0.36],
        [0.62, 0.36],
        [0.72, 0.8],
        [0.28, 0.8],
      ],
      [
        [0.12, 0.78],
        [0.88, 0.78],
        [0.88, 0.94],
        [0.12, 0.94],
      ],
    );
  }
  const sideColor = shade(color, -0.42);
  /** Its whole outline, its parts and its side as one (for its gold rim, picked out: only round the outside). */
  const silhouette = () => {
    const all = Skia.Path.Make();
    for (const moved of [false, true]) {
      for (const o of outlines) all.addPath(art.poly(moved ? shift(o) : o));
      for (const ci of circles) {
        const q = art.at(moved ? [ci.at[0] + PIECE_DEPTH[0], ci.at[1] + PIECE_DEPTH[1]] : ci.at);
        all.addCircle(q[0], q[1], art.len(ci.r));
      }
    }
    return outsideOf(all);
  };
  const draw = (fill: string, moved: boolean, extra?: object) => (
    <>
      {outlines.map((o, i) => (
        <Path key={`o${i}`} path={art.poly(moved ? shift(o) : o)} color={fill} {...extra} />
      ))}
      {circles.map((ci, i) => {
        const q = art.at(moved ? [ci.at[0] + PIECE_DEPTH[0], ci.at[1] + PIECE_DEPTH[1]] : ci.at);
        return <Circle key={`c${i}`} cx={q[0]} cy={q[1]} r={art.len(ci.r)} color={fill} {...extra} />;
      })}
    </>
  );
  if (shape === 'cube' || shape === 'disc') {
    // Solids drawn whole: a cube as the d6 is (top face, two sides slanting back, one rounded outline); a disc as
    // its top circle with its side joined on below and to the right.
    const c = art.at([0.47, 0.46]);
    const body = shape === 'cube' ? roundedPath(art, CUBE_OUTLINE, CUBE_ROUND) : cylinderPath(c, art.len(0.42), [art.len(0.06), art.len(0.08)]);
    const top = shape === 'cube' ? roundedPath(art, CUBE_TOP, CUBE_ROUND) : null;
    return (
      <View style={StyleSheet.absoluteFill}>
        <Canvas style={art.style}>
          <Path path={body} color={sideColor}>
            {pieceShadow(OS)}
          </Path>
          <Path path={body} color={sideColor} />
          {shape === 'cube' ? (
            <Group clip={body}>
              <Path path={art.poly(CUBE_BOTTOM)} color={shade(color, -0.55)} />
            </Group>
          ) : null}
          {top ? <Path path={top} color={color} /> : <Circle cx={c[0]} cy={c[1]} r={art.len(0.42)} color={color} />}
          {top ? (
            <Path path={top} color={shade(color, 0.3)} style="stroke" strokeWidth={art.len(0.02)} opacity={0.55} />
          ) : (
            <Circle cx={c[0]} cy={c[1]} r={art.len(0.42)} color={shade(color, 0.3)} style="stroke" strokeWidth={art.len(0.02)} opacity={0.55} />
          )}
          {/* (Round the outside only: a disc's body is its two circles and their join, overlapping.) */}
          {selected ? <Path path={outsideOf(body)} color={colors.accent} style="stroke" strokeWidth={3 * OS} /> : null}
        </Canvas>
      </View>
    );
  }
  return (
    <View style={StyleSheet.absoluteFill}>
      <Canvas style={art.style}>
        {/* Its shadow, then its side (the shape again, a little down and right, darker), then its top. */}
        <Group>
          {outlines.map((o, i) => (
            <Path key={`s${i}`} path={art.poly(shift(o))} color={sideColor}>
              {pieceShadow(OS)}
            </Path>
          ))}
          {circles.map((ci, i) => {
            const q = art.at([ci.at[0] + PIECE_DEPTH[0], ci.at[1] + PIECE_DEPTH[1]]);
            return (
              <Circle key={`sc${i}`} cx={q[0]} cy={q[1]} r={art.len(ci.r)} color={sideColor}>
                {pieceShadow(OS)}
              </Circle>
            );
          })}
        </Group>
        {draw(sideColor, true)}
        {draw(color, false)}
        {selected ? <Path path={silhouette()} color={colors.accent} style="stroke" strokeWidth={3 * OS} /> : null}
      </Canvas>
    </View>
  );
}

/**
 * A token: a raised disc (or rounded square) with the player's own picture on top, or plain in its color. One
 * standing for several shows how many.
 */
function Token({ piece, color, size, selected, k }: { piece: TablePiece; color: string; size: number; selected: boolean; k: number }) {
  const OS = useContext(OversampleContext);
  const art = artFrame(size, size, OS);
  const c = art.at([0.5, 0.5]);
  const depth = [art.len(0.04), art.len(0.06)] as const;
  const outline: Pt[] = [
    [0.02, 0.02],
    [0.98, 0.02],
    [0.98, 0.98],
    [0.02, 0.98],
  ];
  const squareSide: Pt[] = outline.map((p) => [p[0] + 0.04, p[1] + 0.06]);
  const body = piece.square ? null : cylinderPath(c, art.len(0.48), depth);
  const inset = size * 0.1;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Canvas style={art.style}>
        {piece.square ? (
          <>
            <Path path={roundedPath(art, squareSide, 0.14)} color={shade(color, -0.45)}>
              {pieceShadow(OS)}
            </Path>
            <Path path={roundedPath(art, squareSide, 0.14)} color={shade(color, -0.45)} />
            <Path path={roundedPath(art, outline, 0.14)} color={color} />
            {selected ? <Path path={roundedPath(art, outline, 0.14)} color={colors.accent} style="stroke" strokeWidth={3 * OS} /> : null}
          </>
        ) : (
          <>
            <Path path={body!} color={shade(color, -0.45)}>
              {pieceShadow(OS)}
            </Path>
            <Path path={body!} color={shade(color, -0.45)} />
            <Circle cx={c[0]} cy={c[1]} r={art.len(0.48)} color={color} />
            {selected ? <Circle cx={c[0]} cy={c[1]} r={art.len(0.5)} color={colors.accent} style="stroke" strokeWidth={3 * OS} /> : null}
          </>
        )}
      </Canvas>
      {piece.image ? (
        <Image
          source={{ uri: imageUri(piece.image) }}
          // A cut-out sits whole on the token, as a sticker would; any other picture fills its face.
          style={{
            position: 'absolute',
            left: inset,
            top: inset,
            width: size - inset * 2,
            height: size - inset * 2,
            borderRadius: isSeeThrough(piece.image) ? 0 : piece.square ? size * 0.1 : size,
          }}
          contentFit={isSeeThrough(piece.image) ? 'contain' : 'cover'}
          cachePolicy="memory-disk"
        />
      ) : null}
      {piece.value > 1 ? (
        <View style={[styles.tokenCount, { right: -6 * k, top: -6 * k, minWidth: 24 * k, height: 24 * k, borderRadius: 12 * k, paddingHorizontal: 5 * k }]}>
          <Text allowFontScaling={false} style={[styles.tokenCountText, { fontSize: 14 * k }]}>
            {piece.value}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * A timer: a dial with the time left, and a ring round it running down. Tapped, it starts or pauses (see
 * toggleTimer); run out, it shows 0:00 in red and buzzes.
 */
function Timer({ piece, color, size, selected, k }: { piece: TablePiece; color: string; size: number; selected: boolean; k: number }) {
  const OS = useContext(OversampleContext);
  const running = piece.endsAt !== undefined;
  // The time now, only while it's running (it's read on a clock, never while drawing).
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const clock = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(clock);
    };
  }, [running]);
  const left = running && now ? Math.max(0, (piece.endsAt! - now) / 1000) : (piece.left ?? piece.value);
  const done = running && now > 0 && left <= 0;
  // A buzz (twice) as it runs out.
  const buzzed = useRef(false);
  useEffect(() => {
    if (done && !buzzed.current) {
      buzzed.current = true;
      haptics.warn();
      const again = setTimeout(haptics.warn, 450);
      return () => clearTimeout(again);
    }
    if (!done) buzzed.current = false;
  }, [done]);
  const art = artFrame(size, size, OS);
  const c = art.at([0.5, 0.5]);
  const r = art.len(0.4);
  const share = piece.value ? Math.min(1, left / piece.value) : 0;
  const runDown = Skia.Path.Make();
  runDown.addArc({ x: c[0] - r, y: c[1] - r, width: r * 2, height: r * 2 }, -90, 360 * share);
  const ink = isLight(color) ? '#2c2c2a' : '#ffffff';
  return (
    <View style={StyleSheet.absoluteFill}>
      <Canvas style={art.style}>
        <Path path={cylinderPath(c, art.len(0.5), [art.len(0.03), art.len(0.04)])} color={shade(color, isLight(color) ? -0.4 : 0.15)}>
          {pieceShadow(OS)}
        </Path>
        <Path path={cylinderPath(c, art.len(0.5), [art.len(0.03), art.len(0.04)])} color={shade(color, isLight(color) ? -0.4 : 0.15)} />
        <Circle cx={c[0]} cy={c[1]} r={art.len(0.5)} color={color} />
        <Circle cx={c[0]} cy={c[1]} r={r} color={shade(color, isLight(color) ? -0.15 : 0.18)} style="stroke" strokeWidth={art.len(0.07)} />
        <Path path={runDown} color={done ? '#e24b4a' : colors.accent} style="stroke" strokeWidth={art.len(0.07)} strokeCap="round" />
        {selected ? <Circle cx={c[0]} cy={c[1]} r={art.len(0.52)} color={colors.accent} style="stroke" strokeWidth={3 * OS} /> : null}
      </Canvas>
      <Text allowFontScaling={false} style={[styles.timerText, { color: done ? '#e24b4a' : ink, fontSize: size * 0.22, lineHeight: size, width: size }]}>
        {timerText(left)}
      </Text>
      {!running && !done && piece.left !== undefined ? (
        <Text allowFontScaling={false} style={[styles.timerHint, { color: ink, top: size * 0.66, width: size, fontSize: 9 * k }]}>
          paused
        </Text>
      ) : null}
    </View>
  );
}
/**
 * A zone, or a card spot: an area marked out on the cloth, under the cards (outlined, filled in, or dashed), its
 * name just over or under it (outside, so cards in it, or its fill, never hide it), at its left, middle or right.
 * An unlocked zone has a grip in its bottom-right corner that resizes it (a card spot takes its cards' size).
 */
function Zone({ piece, color, k }: { piece: TablePiece; color: string; k: number }) {
  const look = piece.look ?? 'outline';
  const spot = piece.kind === 'spot';
  return (
    <View
      style={[
        styles.zone,
        { borderWidth: 3 * k, borderRadius: (spot ? 8 : 12) * k },
        // Its edge a little see-through, and filled in faintly (the cloth showing through); its name solid.
        { borderColor: `${color}b3`, borderStyle: look === 'dashed' ? 'dashed' : 'solid' },
        look === 'filled' && { backgroundColor: `${color}38` },
      ]}>
      {piece.label ? (
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={[
            styles.zoneLabel,
            { color, fontSize: LABEL_SIZE * k, left: 6 * k, right: 6 * k, textAlign: labelAlignOf(piece) },
            piece.labelBelow ? { top: '100%', marginTop: 4 * k } : { bottom: '100%', marginBottom: 4 * k },
          ]}>
          {piece.label}
        </Text>
      ) : null}
      {piece.locked || spot ? null : (
        <View
          style={[styles.zoneGrip, { borderColor: color, right: 4 * k, bottom: 4 * k, width: 18 * k, height: 18 * k, borderRightWidth: 3 * k, borderBottomWidth: 3 * k, borderBottomRightRadius: 6 * k }]}
        />
      )}
    </View>
  );
}

/**
 * A score pad: a sheet of paper with a column for each player, their name at its top, their points under it (a row
 * a round: the latest ones, unless it's scrolled back, with a thin bar at its side when there are more than show),
 * each one's total, and a + under it to add points. Unlocked, a grip in its bottom-right corner makes it taller or
 * shorter.
 */
function ScorePad({ piece, color, selected, k }: { piece: TablePiece; color: string; selected: boolean; k: number }) {
  const ink = isLight(color) ? '#2c2c2a' : '#ffffff';
  const rule = isLight(color) ? 'rgba(44,44,42,0.28)' : 'rgba(255,255,255,0.3)';
  const names = scoreNames(piece);
  const columns = scoreColumns(piece);
  const { start, rows, most } = scoreWindow(piece);
  const rowsH = rows * SCORE_ROW * k;
  // The scroll bar: how much of all the rows shows, and where.
  const all = rows + most;
  const bar = most ? { height: Math.max(8 * k, (rowsH * rows) / all), top: (SCORE_PAD + SCORE_HEAD) * k + (rowsH * start) / all } : null;
  return (
    <View
      style={[
        styles.scorePad,
        { backgroundColor: color, borderRadius: 8 * k, borderWidth: k, borderColor: shade(color, isLight(color) ? -0.2 : 0.3), padding: (SCORE_PAD - 1) * k },
        // (Its edge is inside its room: the columns fill the rest exactly.)
        selected && { borderColor: colors.accent, borderWidth: 3 * k, padding: (SCORE_PAD - 3) * k },
      ]}>
      <View style={styles.scoreColumns}>
        {names.map((name, i) => (
          <View
            key={i}
            style={[{ width: SCORE_COLUMN * k }, i > 0 && { borderLeftWidth: k, borderLeftColor: rule }]}>
            <View style={[styles.scoreCell, { height: SCORE_HEAD * k, borderBottomWidth: 2 * k, borderBottomColor: rule, paddingHorizontal: 4 * k }]}>
              <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={[styles.scoreName, { color: ink, fontSize: 14 * k }]}>
                {name}
              </Text>
            </View>
            <View style={{ height: rowsH }}>
              {columns[i].points.slice(start, start + rows).map((n, j) => (
                <View key={j} style={[styles.scoreCell, { height: SCORE_ROW * k }]}>
                  <Text allowFontScaling={false} style={[styles.scorePoints, { color: ink, fontSize: 15 * k }]}>
                    {scoreText(n)}
                  </Text>
                </View>
              ))}
            </View>
            {/* Its total, ruled off above and below. */}
            <View style={[styles.scoreCell, { height: SCORE_TOTAL * k, borderTopWidth: 2 * k, borderTopColor: rule, borderBottomWidth: 2 * k, borderBottomColor: rule }]}>
              <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={[styles.scoreTotal, { color: ink, fontSize: 19 * k }]}>
                {scoreText(columns[i].total)}
              </Text>
            </View>
          </View>
        ))}
      </View>
      {/* Under the totals, apart from them (no column lines): a shaded bar each, with a + to add points. */}
      <View style={[styles.scoreAddRow, { height: SCORE_ADD * k }]}>
        {names.map((_, i) => (
          <View key={i} style={[styles.scoreCell, { width: SCORE_COLUMN * k, paddingHorizontal: 3 * k, paddingTop: 5 * k }]}>
            <View style={[styles.scoreAdd, { alignSelf: 'stretch', height: 26 * k, borderRadius: 6 * k, backgroundColor: shade(color, isLight(color) ? -0.1 : 0.12) }]}>
              {/* The +: two lines crossing, so it's exactly in the middle (a typed + sits on its font's line). */}
              <View style={{ width: 12 * k, height: 12 * k }}>
                <View style={[styles.scorePlusLine, { left: 0, top: 5 * k, width: 12 * k, height: 2 * k, borderRadius: k, backgroundColor: ink }]} />
                <View style={[styles.scorePlusLine, { left: 5 * k, top: 0, width: 2 * k, height: 12 * k, borderRadius: k, backgroundColor: ink }]} />
              </View>
            </View>
          </View>
        ))}
      </View>
      {bar ? <View style={[styles.scoreBar, { right: 2 * k, width: 3 * k, borderRadius: 1.5 * k, backgroundColor: rule, ...bar }]} /> : null}
      {piece.locked ? null : (
        <View
          style={[styles.zoneGrip, { borderColor: rule, right: 3 * k, bottom: 3 * k, width: 12 * k, height: 12 * k, borderRightWidth: 2 * k, borderBottomWidth: 2 * k, borderBottomRightRadius: 4 * k }]}
        />
      )}
    </View>
  );
}

/** A drawstring bag: a pouch, tied at its neck, raised a little off the cloth; how many cards are in it on a badge. */
function Bag({ piece, color, w, h, selected, k }: { piece: TablePiece; color: string; w: number; h: number; selected: boolean; k: number }) {
  const OS = useContext(OversampleContext);
  const art = artFrame(w, h, OS);
  const shift = (pts: Pt[]): Pt[] => pts.map((p) => [p[0] + PIECE_DEPTH[0], p[1] + PIECE_DEPTH[1]]);
  const body: Pt[] = [
    [0.14, 0.42],
    [0.32, 0.3],
    [0.68, 0.3],
    [0.86, 0.42],
    [0.96, 0.76],
    [0.84, 0.97],
    [0.16, 0.97],
    [0.04, 0.76],
  ];
  const top: Pt[] = [
    [0.28, 0.03],
    [0.72, 0.03],
    [0.63, 0.3],
    [0.37, 0.3],
  ];
  const tie: Pt[] = [
    [0.32, 0.24],
    [0.68, 0.24],
    [0.68, 0.33],
    [0.32, 0.33],
  ];
  // How many things are in it (a supply never runs out).
  const n = piece.supply ? '∞' : bagItems(piece).length;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Canvas style={art.style}>
        <Path path={roundedPath(art, shift(body), 0.14)} color={shade(color, -0.45)}>
          {pieceShadow(OS)}
        </Path>
        <Path path={roundedPath(art, shift(body), 0.14)} color={shade(color, -0.45)} />
        <Path path={roundedPath(art, top, 0.06)} color={shade(color, -0.12)} />
        <Path path={roundedPath(art, body, 0.14)} color={color} />
        {/* The light catching its upper left. */}
        <Circle cx={art.at([0.36, 0.55])[0]} cy={art.at([0.36, 0.55])[1]} r={art.len(0.2)} color={shade(color, 0.18)} opacity={0.5} />
        <Path path={roundedPath(art, tie, 0.04)} color={shade(color, -0.5)} />
        {selected ? <Path path={roundedPath(art, body, 0.14)} color={colors.accent} style="stroke" strokeWidth={3 * OS} /> : null}
      </Canvas>
      {n ? (
        <View style={[styles.tokenCount, { right: -6 * k, top: -6 * k, minWidth: 24 * k, height: 24 * k, borderRadius: 12 * k, paddingHorizontal: 5 * k }]}>
          <Text allowFontScaling={false} style={[styles.tokenCountText, { fontSize: 14 * k }]}>
            {n}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** A track: a row of numbered spaces, its marker on one of them (tapped, it moves to the space tapped). */
function Track({ piece, color, selected, k }: { piece: TablePiece; color: string; selected: boolean; k: number }) {
  const spaces = piece.spaces ?? 10;
  const first = piece.first ?? 1;
  const ink = isLight(color) ? '#2c2c2a' : '#ffffff';
  const marker = piece.markerColor ?? colors.accent;
  const markerInk = piece.markerColor ? (isLight(piece.markerColor) ? '#2c2c2a' : '#ffffff') : colors.accentText;
  return (
    <View
      style={[
        styles.track,
        { backgroundColor: color, borderColor: selected ? colors.accent : shade(color, isLight(color) ? -0.25 : 0.3), borderRadius: 12 * k, borderWidth: k },
        // Across, or standing up; its spaces in the order its numbers run (the other way, if flipped).
        piece.vertical ? { flexDirection: piece.reversed ? 'column-reverse' : 'column', paddingVertical: 8 * k } : { flexDirection: piece.reversed ? 'row-reverse' : 'row', paddingHorizontal: 8 * k },
        selected && { borderWidth: 3 * k },
      ]}>
      {Array.from({ length: spaces }, (_, i) => (
        <View
          key={i}
          style={[
            styles.trackSpace,
            { width: 40 * k, height: 40 * k, borderRadius: 8 * k, backgroundColor: shade(color, isLight(color) ? -0.08 : 0.12) },
            piece.vertical ? { marginVertical: 2 * k } : { marginHorizontal: 2 * k },
          ]}>
          {/* The marker: filling its space, but for a hairline round it. */}
          {i === piece.value ? <View style={[styles.trackMarker, { width: 36 * k, height: 36 * k, borderRadius: 6 * k, backgroundColor: marker }]} /> : null}
          {piece.hideNumbers ? null : (
            <Text allowFontScaling={false} style={[styles.trackNumber, { fontSize: 16 * k, color: i === piece.value ? markerInk : ink }]}>
              {first + i}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}
/**
 * Custom art: the player's own picture at its own shape. A cut-out (see-through) shows just its subject, with a
 * shadow of the same outline under it; any other, as a print with slightly rounded corners and a shadow. Drawn from its
 * full picture, not one shrunk to its size on the table: zoomed in, it stays sharp (as cards' art does).
 */
function Art({ piece, w, h, selected, k }: { piece: TablePiece; w: number; h: number; selected: boolean; k: number }) {
  if (!piece.image) return <View style={[styles.artMissing, selected && styles.artSelected]} />;
  const uri = imageUri(piece.image);
  if (isSeeThrough(piece.image)) {
    return (
      <View style={StyleSheet.absoluteFill}>
        {/* Its shadow: the same picture, darkened to a silhouette, a little down and right. */}
        <Image source={{ uri }} style={[StyleSheet.absoluteFill, styles.artShadow, { transform: [{ translateX: 2 * k }, { translateY: 4 * k }] }]} contentFit="contain" tintColor="#000" cachePolicy="memory-disk" allowDownscaling={false} />
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory-disk" allowDownscaling={false} />
        {selected ? <View style={[StyleSheet.absoluteFill, styles.artSelected]} /> : null}
      </View>
    );
  }
  return (
    <View style={[styles.artPrint, { width: w, height: h, borderRadius: 6 * k }, selected && styles.artSelected]}>
      <Image source={{ uri }} style={[StyleSheet.absoluteFill, styles.artPrintImage, { borderRadius: 6 * k }]} contentFit="cover" cachePolicy="memory-disk" allowDownscaling={false} />
    </View>
  );
}
const styles = StyleSheet.create({
  piece: { position: 'absolute' },

  counter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderRadius: 30,
    borderWidth: 1,
    boxShadow: '1px 3px 8px rgba(0, 0, 0, 0.45)',
  },
  counterButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterSign: { fontSize: 26, fontWeight: '600', marginTop: -2 },
  counterValue: { flex: 1, textAlign: 'center', fontSize: 30, fontWeight: '700' },
  counterLabel: {
    position: 'absolute',
    top: 64,
    left: -20,
    right: -20,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
  dieValue: { position: 'absolute', textAlign: 'center', fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 2 },
  tokenCount: {
    position: 'absolute',
    right: -6,
    top: -6,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  tokenCountText: { color: colors.accentText, fontSize: 14, fontWeight: '800' },
  timerText: { position: 'absolute', left: 0, top: 0, textAlign: 'center', fontWeight: '800', fontVariant: ['tabular-nums'] },
  timerHint: { position: 'absolute', left: 0, textAlign: 'center', fontSize: 9, fontWeight: '700', opacity: 0.7 },
  zone: { flex: 1, borderWidth: 3, borderRadius: 12 },
  coinSelected: { borderWidth: 3, borderColor: colors.accent },
  // A coin with the player's own art: its rim in the gold coin's gold.
  coinOwn: { borderColor: '#c9a133' },
  scorePad: { flex: 1, boxShadow: '1px 3px 8px rgba(0, 0, 0, 0.45)' },
  scoreColumns: { flex: 1, flexDirection: 'row' },
  scoreCell: { alignItems: 'center', justifyContent: 'center' },
  scoreName: { fontWeight: '700' },
  scorePoints: { fontWeight: '500', fontVariant: ['tabular-nums'] },
  scoreTotal: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  scoreAddRow: { flexDirection: 'row' },
  scoreAdd: { alignItems: 'center', justifyContent: 'center' },
  scorePlusLine: { position: 'absolute' },
  scoreBar: { position: 'absolute' },
  artShadow: { opacity: 0.4, transform: [{ translateX: 2 }, { translateY: 4 }] },
  artPrint: { borderRadius: 6, boxShadow: '1px 3px 8px rgba(0, 0, 0, 0.45)' },
  artPrintImage: { borderRadius: 6 },
  artSelected: { borderWidth: 3, borderColor: colors.accent, borderRadius: 8, borderStyle: 'dashed' },
  artMissing: { flex: 1, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.12)' },
  track: { flex: 1, alignItems: 'center', justifyContent: 'center', boxShadow: '1px 3px 8px rgba(0, 0, 0, 0.45)' },
  trackSpace: { width: 40, height: 40, marginHorizontal: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  trackMarker: { position: 'absolute', boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.45)' },
  trackNumber: { fontSize: 16, fontWeight: '800' },
  zoneLabel: { position: 'absolute', left: 6, right: 6, fontWeight: '700' },
  // Two short lines across the bottom-right corner, as a window's resize grip.
  zoneGrip: { position: 'absolute', right: 4, bottom: 4, width: 18, height: 18, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 6 },
  markerText: { position: 'absolute', left: 0, top: 0, textAlign: 'center', fontWeight: '800', paddingHorizontal: 8 },
  textBox: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  textBoxOn: { borderWidth: 2, borderColor: colors.accent, borderStyle: 'dashed' },
  text: { fontSize: TEXT_SIZE, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 4, textShadowOffset: { width: 1, height: 2 } },
});
