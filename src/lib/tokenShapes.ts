// The shapes a token can be cut to (a picture of the player's own cropped to it), as outlines in a 0–1 box.

export type TokenShape = 'circle' | 'square' | 'hexagon' | 'triangle' | 'diamond' | 'star';
type Pt = [number, number];

export const TOKEN_SHAPES: { shape: TokenShape; name: string }[] = [
  { shape: 'circle', name: 'Circle' },
  { shape: 'square', name: 'Square' },
  { shape: 'hexagon', name: 'Hexagon' },
  { shape: 'triangle', name: 'Triangle' },
  { shape: 'diamond', name: 'Diamond' },
  { shape: 'star', name: 'Star' },
];

/** A token's shape (one from before there were shapes: round, or square if it was made square). */
export const tokenShapeOf = (p: { tokenShape?: TokenShape; square?: boolean }): TokenShape => p.tokenShape ?? (p.square ? 'square' : 'circle');

/** Points round a middle, the first straight up (or `start` degrees from it), each `reach` out. */
const around = (count: number, reach: (i: number) => number, mid: Pt = [0.5, 0.5], start = -90): Pt[] =>
  Array.from({ length: count }, (_, i) => {
    const a = ((start + (360 / count) * i) * Math.PI) / 180;
    return [mid[0] + reach(i) * Math.cos(a), mid[1] + reach(i) * Math.sin(a)];
  });

/**
 * A token's shape as an outline in its 0–1 box, centered and as big as fits, clockwise from the top: a circle's as
 * many points round as make it smooth.
 */
export function tokenOutline(shape: TokenShape): Pt[] {
  switch (shape) {
    case 'circle':
      return around(48, () => 0.5);
    case 'square':
      return [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ];
    case 'hexagon':
      // Flat at the top and bottom, as a board's hexes often are.
      return around(6, () => 0.5, [0.5, 0.5], 0);
    case 'triangle': {
      // Equilateral, as wide as the box, in its middle top to bottom.
      const h = Math.sqrt(3) / 2;
      const top = (1 - h) / 2;
      return [
        [0.5, top],
        [1, top + h],
        [0, top + h],
      ];
    }
    case 'diamond':
      return [
        [0.5, 0],
        [0.9, 0.5],
        [0.5, 1],
        [0.1, 0.5],
      ];
    case 'star': {
      // Five points, a little low so it sits in the middle (its points reach further up than down).
      const reach = 0.52;
      const drop = (reach * (1 - Math.cos(Math.PI / 5))) / 2;
      return around(10, (i) => (i % 2 ? reach * 0.45 : reach), [0.5, 0.5 + drop]);
    }
  }
}
