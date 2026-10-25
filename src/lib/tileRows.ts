// How a menu's round buttons are laid out in rows, the same in every menu: up to four to a row, never one on a row
// of its own, the rows as even as they can be and the fuller ones on top (3: one row; 5: 3 and 2; 6: 3 and 3;
// 7: 4 and 3; 8: 4 and 4; 9: three rows of 3). Each row is centered.

/** The most buttons a row holds. */
export const TILES_PER_ROW = 4;

/** How many buttons go in each row, top first. */
export function tileRows(count: number): number[] {
  if (count <= 0) return [];
  const rows = Math.ceil(count / TILES_PER_ROW);
  const base = Math.floor(count / rows);
  const extra = count % rows;
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0));
}

/** The things, in rows as `tileRows` lays them out. */
export function inTileRows<T>(items: T[]): T[][] {
  let at = 0;
  return tileRows(items.length).map((n) => {
    const row = items.slice(at, at + n);
    at += n;
    return row;
  });
}
