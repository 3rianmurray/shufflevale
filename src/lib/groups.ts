// Ordering decks on the home screen: decks can sit in named groups, shown as a single list of rows (a header
// per group, followed by its decks, then the group's end). Groups lie anywhere among the ungrouped decks.
// Dragging a row to a new spot in that list is turned back into a deck order, group membership and where each
// group lies here.

/** A named set of decks on the home screen. */
export interface DeckGroup {
  id: string;
  name: string;
  /** Collapsed groups show just their header. */
  collapsed?: boolean;
  /**
   * Where it lies among the ungrouped decks: just above this deck (or the first ungrouped deck after it in the
   * deck order, if it's since been filed in a group). None, or a deck that's gone, is below them all (where every
   * group was before groups could be moved among the decks).
   */
  before?: string;
}

/** The bits of a deck that matter for ordering. */
export interface Placed {
  id: string;
  groupId?: string;
}

/**
 * One line of the home screen's deck list. A group's `end` closes it: decks between its header and its end are
 * in it, and those after its end aren't.
 */
export type Row = { kind: 'deck'; id: string } | { kind: 'group'; id: string } | { kind: 'end'; id: string };

const inGroup = (d: Placed, groups: DeckGroup[]) => !!d.groupId && groups.some((g) => g.id === d.groupId);

/**
 * The deck list as rows: the ungrouped decks, with each group (its header, its decks unless it's collapsed, and
 * its end) where it lies among them. Decks keep their relative order throughout.
 */
export function buildRows(decks: Placed[], groups: DeckGroup[]): Row[] {
  const loose = decks.filter((d) => !inGroup(d, groups));
  const index = new Map(decks.map((d, i) => [d.id, i]));
  // How many ungrouped decks lie above each group.
  const spots = groups.map((g) => {
    const i = g.before === undefined ? undefined : index.get(g.before);
    if (i === undefined) return loose.length;
    const j = loose.findIndex((d) => index.get(d.id)! >= i);
    return j === -1 ? loose.length : j;
  });
  const rows: Row[] = [];
  for (let k = 0; k <= loose.length; k++) {
    groups.forEach((g, i) => {
      if (spots[i] !== k) return;
      rows.push({ kind: 'group', id: g.id });
      if (!g.collapsed) for (const d of decks) if (d.groupId === g.id) rows.push({ kind: 'deck', id: d.id });
      rows.push({ kind: 'end', id: g.id });
    });
    if (k < loose.length) rows.push({ kind: 'deck', id: loose[k].id });
  }
  return rows;
}

/** What a list of rows says: the order of all decks, which group each is in, and the groups in order (and where). */
export interface Arrangement {
  order: string[];
  groupOf: Record<string, string | undefined>;
  groups: DeckGroup[];
}

/**
 * Reads rows back: decks between a group's header and its end are in it, the rest in none. Decks hidden in a
 * collapsed group (not among the rows) keep their group, just after its header. Each group lies above the first
 * ungrouped deck after it.
 */
function readRows(rows: Row[], decks: Placed[], groups: DeckGroup[]): Arrangement {
  const shown = new Set(rows.flatMap((r) => (r.kind === 'deck' ? [r.id] : [])));
  const order: string[] = [];
  const groupOf: Record<string, string | undefined> = {};
  const placed: DeckGroup[] = [];
  // Groups still waiting for the ungrouped deck below them.
  let waiting: number[] = [];
  let open: string | undefined;
  for (const r of rows) {
    if (r.kind === 'group') {
      const g = groups.find((x) => x.id === r.id);
      if (!g) continue;
      open = g.id;
      waiting.push(placed.length);
      placed.push({ ...g, before: undefined });
      for (const d of decks) {
        if (d.groupId === g.id && !shown.has(d.id)) {
          order.push(d.id);
          groupOf[d.id] = g.id;
        }
      }
    } else if (r.kind === 'end') {
      open = undefined;
    } else {
      order.push(r.id);
      groupOf[r.id] = open;
      if (!open) {
        for (const i of waiting) placed[i] = { ...placed[i], before: r.id };
        waiting = [];
      }
    }
  }
  // The ones below every ungrouped deck.
  for (const i of waiting) delete placed[i].before;
  return { order, groupOf, groups: placed };
}

/** `rows` with the row at `from` taken out and put back so it lands before the row that was at `at`. */
function moveRow(rows: Row[], from: number, at: number): Row[] {
  const row = rows[from];
  const rest = rows.filter((_, i) => i !== from);
  const insert = Math.max(0, Math.min(rest.length, at > from ? at - 1 : at));
  return [...rest.slice(0, insert), row, ...rest.slice(insert)];
}

/**
 * Drops a deck at insertion point `at` (0 is before the first row, `rows.length` after the last) of the list
 * {@link buildRows} makes. It joins the group it lands in (between a header and its end), or none if it lands
 * outside every group. Decks hidden in collapsed groups keep their place and group.
 */
export function dropDeck(decks: Placed[], groups: DeckGroup[], deckId: string, at: number): Arrangement {
  const rows = buildRows(decks, groups);
  const from = rows.findIndex((r) => r.kind === 'deck' && r.id === deckId);
  return readRows(from === -1 ? rows : moveRow(rows, from, at), decks, groups);
}

/**
 * Drops a group's header at insertion point `at` of the rows, moving the whole group (its decks with it). It goes
 * anywhere among the ungrouped decks, but never into another group: landing in one, it goes just after it.
 */
export function dropGroup(decks: Placed[], groups: DeckGroup[], groupId: string, at: number): Arrangement {
  const rows = buildRows(decks, groups);
  const start = rows.findIndex((r) => r.kind === 'group' && r.id === groupId);
  const end = rows.findIndex((r) => r.kind === 'end' && r.id === groupId);
  if (start === -1 || end === -1 || (at > start && at <= end + 1)) return readRows(rows, decks, groups);
  const block = rows.slice(start, end + 1);
  const rest = [...rows.slice(0, start), ...rows.slice(end + 1)];
  let insert = at > end ? at - block.length : at;
  // Inside another group (after its header, up to its end): just after that group's end instead.
  let open: string | undefined;
  for (let i = 0; i < insert; i++) {
    const r = rest[i];
    if (r.kind === 'group') open = r.id;
    else if (r.kind === 'end') open = undefined;
  }
  if (open) insert = rest.findIndex((r) => r.kind === 'end' && r.id === open) + 1;
  return readRows([...rest.slice(0, insert), ...block, ...rest.slice(insert)], decks, groups);
}

/**
 * Groups as they should be once a deck's gone: any that lay just above it lie above the deck after it instead,
 * so they stay where they were.
 */
export function withoutDeck(groups: DeckGroup[], decks: Placed[], deckId: string): DeckGroup[] {
  if (!groups.some((g) => g.before === deckId)) return groups;
  const i = decks.findIndex((d) => d.id === deckId);
  const next = i === -1 ? undefined : decks[i + 1]?.id;
  return groups.map((g) => (g.before !== deckId ? g : next ? { ...g, before: next } : { id: g.id, name: g.name, ...(g.collapsed ? { collapsed: true } : {}) }));
}
