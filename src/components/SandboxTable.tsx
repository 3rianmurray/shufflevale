import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ActionSheetIOS, Alert, Animated as RNAnimated, Easing, Image, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing as ReEasing, LinearTransition, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDecks } from '../lib/DecksContext';
import { askName, askNumber, askText } from '../lib/names';
import * as haptics from '../lib/haptics';
import { newId } from '../lib/id';
import {
  addCards,
  addDeck,
  cameraAngle,
  cameraSquare,
  cameraZoom,
  cardsOf,
  fingerAngle,
  flipInHand,
  flipStack,
  HAND_COUNT,
  moveCamera,
  placeStack,
  prune,
  putInHand,
  putOnTable,
  raise,
  shuffleStack,
  snapAngle,
  snapCamera,
  snapToGrid,
  stacksInShape,
  moveStacks,
  gatherStacks,
  stackAt,
  addPiece,
  DIE_SIDES,
  defaultPieceColor,
  PIECE_COLORS,
  movePieces,
  gridDice,
  gridItems,
  groupBoxes,
  groupItems,
  centerOnTable,
  inLiveGroup,
  layerFlat,
  liesFlat,
  lockGroups,
  staysPut,
  liesOver,
  ZONE_OPACITY_MIN,
  groupMembers,
  ungroupItems,
  withGroups,
  separateDice,
  newPiece,
  pieceAt,
  PIECE_SHAPES,
  rollable,
  bagAt,
  bagItems,
  bagTakes,
  allAlike,
  drawFromBag,
  emptyBag,
  endSupply,
  itemKey,
  placeItem,
  putInBag,
  removeBagItems,
  besideBagOf,
  pieceName,
  artSize,
  fitZone,
  clipCards,
  copyItems,
  pasteCopies,
  PIECE_SIZE,
  rotateItems,
  sortStack,
  turnsFreely,
  doubleTapZoom,
  zoomInOn,
  zoomOnto,
  normalizeAngle,
  artLevel,
  keepArtLevels,
  raiseArt,
  ART_MAX,
  reorderBag,
  shuffleBag,
  keepCards,
  MIN_ZOOM,
  takeFromBag,
  trackSpaceAt,
  TRACK_MAX,
  pieceSizeOf,
  resizeZone,
  spotAt,
  zoneAt,
  zoneGripAt,
  toggleTimer,
  parseTimerText,
  timerText,
  cardSizeOf,
  matchStackSizes,
  scaleItems,
  scaleOf,
  piecesInShape,
  removePiece,
  throwDice,
  setPiece,
  stackTargetAt,
  startCamera,
  tableBounds,
  fitCamera,
  TABLE_H,
  TABLE_W,
  GRID_STEP,
  CARD_W,
  gatherDecks,
  setsOfDeck,
  gridStackReach,
  gridStepOf,
  GRID_SIZES,
  tidyTable,
  trashCards,
  takeFromTrash,
  take,
  UNITS_PER_MM,
  takeAll,
  dealToHand,
  toScreen,
  toTable,
  moveLayer,
  reorderStack,
  fanStack,
  removeStacks,
  rotateStacks,
  setSolo,
  setStack,
  settleOnto,
  MAX_TABLE_CARDS,
  tableCardCount,
  onCloth,
  labelAt,
  labelAlignOf,
  zoneCellAt,
  settleStacks,
  fitSpots,
  addScore,
  setScorePlayers,
  scoreSpotAt,
  scoreNames,
  scoreText,
  setScore,
  scoreWindow,
  scoreGripAt,
  resizeScore,
  SCORE_ROW,
  SCORE_MAX_PLAYERS,
  faceCount,
  withFace,
  inDrawOrder,
} from '../lib/sandbox';
import type { BagItem, Camera, CardSize, PieceKind, PiecePart, PieceShape, SandboxCard, SandboxStack, SandboxTable, Source, TablePiece } from '../lib/sandbox';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { artPicture, faceArtColor, facePicture, loadUpright, tokenPicture } from '../lib/images';
import { TOKEN_SHAPES, tokenOutline, tokenShapeOf } from '../lib/tokenShapes';
import type { TokenShape } from '../lib/tokenShapes';
import { deckLook, isPlayground, isProPiece, usePro } from '../lib/pro';
import { updateSandbox, useSandbox } from '../lib/sandboxStore';
import { clipSize, setClip, useClip } from '../lib/tableClipboard';
import { offerTipAfterUses, offerTipSoon, tipLearned } from '../lib/tips';
import { tourEvent } from '../lib/tour';
import { cardRadius, cardRatio, cardSizeMm, copiesOf, deckSize, PRESET_SIZES_MM } from '../lib/types';
import type { Deck } from '../lib/types';
import { colors } from '../theme';
import { ActionSheet } from './ActionSheet';
import { CropModal } from './CropModal';
import { FaceSlots } from './FaceSlots';
import type { SheetAction, SheetTile } from './ActionSheet';
import { CardFocus } from './CardFocus';
import type { FocusRow } from './CardFocus';
import { AddCardsModal } from './AddCardsModal';
import { TrashModal } from './TrashModal';
import { DealPanel } from './DealPanel';
import { Riffle } from './Riffle';
import { StackSearchPanel } from './StackSearchPanel';
import { Dice3DContext, ROLL_MS, TablePieceView, faceShape } from './TablePieceView';
import { NumberSlider } from './NumberSlider';
import { ScaleControl } from './ScaleControl';
import { RotationControl } from './RotationControl';
import { CountStepper } from './CountStepper';
import { CardView, HALF_FLIP_MS, prefersReducedMotion } from './CardView';
import { CardZoom } from './CardZoom';
import type { TableControls } from './TableTopBar';
import { WoodRail } from './Tabletop';
import { TABLE_THEMES, THEME_KEYS, themeOf } from '../lib/tableThemes';
import { imageUri, importImage, isSeeThrough, loadSettings, saveSettings } from '../lib/storage';
import { canCutOut, cutOut } from '../lib/subjectLift';
import { isExampleTable, resetExampleLabel, useExamples } from '../lib/examples';
import { unionOf } from '../lib/windowSpot';
import type { Point, Rect } from '../lib/windowSpot';
import { Text } from './Text';

/** Steps of undo kept. */
const UNDO_STEPS = 30;
/** A second tap on the same card within this long is a double tap (flipping it); a single tap's menu waits this long. */
const DOUBLE_TAP_MS = 260;
/** A tap on empty table, then another held down within this long and this near: a lasso. */
const LASSO_TAP_MS = 400;
const LASSO_TAP_REACH = 40;
/** A second tap on a zone or something locked this soon after the first is a double tap (a zoom onto it). */
const ZOOM_TAP_MS = 400;
/** How far the finger moves (on screen) before the lasso takes another point. */
const LASSO_STEP = 6;
/** A lasso traced back over rubs out: how near its line the finger must come back (points), and how far back along it. */
const LASSO_RETRACE_REACH = 18;
const LASSO_RETRACE_LENGTH = 220;
/** A touch on empty table lifted within this long (and without moving) is a tap. */
const TAP_MS = 300;
/** How far round a stack's count badge (in screen points) a touch takes the whole stack. */
/** How long a press on a stack must be held, still, for the whole stack to come up (a quick drag takes its top card). */
const HOLD_STACK_MS = 350;
/** Holding a counter or die still this long opens its options. */
const HOLD_PIECE_MS = 450;
/** Holding empty table still this long opens what can be added there. */
const HOLD_ADD_MS = 500;
/** How far from a small piece's middle (screen points) a finger still catches it: half a comfortable fingertip target. */
const FINGER_REACH = 22;
/** Where tokens' pictures are kept (as a deck's are, in a folder of their own). */
const TOKEN_PICTURES = 'tokens';
/** How near a zone's bottom-right corner (screen points) a finger grabs its grip, to resize it. */
const ZONE_GRIP_REACH = 28;
/** A score pad's: closer, so its last + button (by the corner) is still a button. */
const SCORE_GRIP_REACH = 16;
/** The most dice added at once (from the Add a die menu): enough for big dice games, few enough to roll smoothly. */
const DICE_AT_ONCE = 20;
/** Stands in for the finger carrying cards taken out of the search, till the table's gesture says which it is. */
const TAKE_OUT_FINGER = -7;
/** How long a stack brought onto the table takes to fly in (and the camera to glide over to it). */
const ARRIVE_MS = 480;
/**
 * Opening a stack's or piece's options: how long the camera takes to glide in on it, how much of the room above
 * the options it then fills, and the closest it comes (a die isn't blown up to fill the screen).
 */
const SPOT_MS = 280;
/**
 * On iPad: options float beside what's held, in a small panel (no darkening, the camera left be); and a second
 * finger's tap on empty table turns over what's carried (no reaching for the flip button on a big screen).
 */
const IS_PAD = Platform.OS === 'ios' && Platform.isPad;
/** What a double tap zooms to: a spot on the table, or something on it (its middle, size and turn). */
type ZoomTarget = { at: { x: number; y: number } } | { item: { x: number; y: number; w: number; h: number; angle: number } };
/** How long after a menu window closes the menu that follows is counted its follow-up (the pause before it opens, and some). */
const FOLLOW_MS = 700;
/** The time now (read in events, never as a screen is drawn). */
const timeNow = () => Date.now();
const SPOT_FILL = 0.7;
const SPOT_MAX_ZOOM = 2.5;
/** Hand cards sliding to new places (one gone, one coming in, the gap moving). */
const HAND_SLIDE = LinearTransition.duration(200);
/** A finger moving less than this before lifting is a tap. */
const TAP_SLOP = 8;
/** An extra finger down and up within this long (and not moving) is a tap, picking up another card. */
const EXTRA_TAP_MS = 350;
/** Roughly the hand tray's height, for placing the camera at the start (the tray sizes itself to its cards). */
const HAND_H = 160;
/** How far down the screen the top bar's buttons reach, below the safe area (see TableTopBar). */
const TOP_BAR_H = 56;
/** Room left round the cards when the view is fitted to them. */
const FIT_MARGIN = 16;
/** The hand's row, as table mode's: space above the groove, round the cards in it, between them, and at its ends. */
const HAND_TOP_PAD = 6;
const HAND_ROW_PAD = 9;
const HAND_GAP = 8;
const HAND_PAD = 14;
/** Dragging a carried card this near either end of the hand scrolls it along, this far each move. */
const HAND_EDGE = 44;
const HAND_EDGE_STEP = 8;
/** How far the hand tabs stand up above the tray, and how much of the tray shows when it's folded away. */
const HAND_TAB_H = 24;
const FOLDED_SHOWS = 38;
/** The space between the hand tabs, and at either end of their row. */
const HAND_TAB_GAP = 4;
const HAND_TABS_PAD = 8;
/** How long the screen's own turn takes to settle before the hand tray rises back (see turnY). */
const TURN_SETTLE_MS = 320;
/** The narrowed tray's top corners (an iPhone turned on its side). */
const TRAY_CORNER = 14;
/** The flip button shown while carrying cards (bottom left): its size, and its space from the screen's edge and the tray. */
const FLIP_SIZE = 64;
const FLIP_MARGIN = 16;
/** As in table mode: a press must move this far, and be held this long, before it can lift a hand card out. */
const DRAG_SLOP = 8;
const LIFT_DELAY_MS = 90;
/** A finger, relative to the table's touch area. */
type Finger = { id: number; x: number; y: number };
/** The tools drawer on the left edge: the panel's width, and the tab it's pulled out by. */
const TOOLS_W = 230;
const TOOLS_TAB_W = 26;
const TOOLS_TAB_H = 72;
/** How far down the drawer its pull tab sits: near the top, where it's always been (the drawer's grown taller). */
const TOOLS_TAB_TOP = 42;
/** How long the grid shows when its size is chosen (with its lines off). */
const GRID_PEEK_MS = 1500;
/** And how long it takes to fade away after that. */
const GRID_FADE_MS = 1000;
/** Where the tools tab is: which edge, and how far down (0 just below the top bar, 1 just above the hand's tabs). */
type ToolsSpot = { side: 'left' | 'right'; at: number };
/** Where it starts: on the left, near the top. */
const DEFAULT_TOOLS_SPOT: ToolsSpot = { side: 'left', at: 0.08 };
/** A pinch inward this quick, to this share of its fingers' first distance apart or less, fits all cards in view. */
/** Two fingers tapping the table: how quickly they're lifted, and how soon a second tap must come (to fit everything in view). */
const TWO_TAP_MS = 260;
/** How soon after the first a second finger comes down to count as two fingers together (not a second, later one). */
const TWO_TOUCH_MS = 150;
const TWO_TAP_GAP_MS = 420;
/** How far sideways the tools tab must be dragged to come away from its edge, and how much it gives before then. */
const TOOLS_DETACH = 70;
const TOOLS_EDGE_GIVE = 0.15;
/** A card's size on the table when its deck is gone (as a standard card). */
const STANDARD_SIZE = { w: PRESET_SIZES_MM.standard.w * UNITS_PER_MM, h: PRESET_SIZES_MM.standard.h * UNITS_PER_MM };
/** The tools drawer's spring; how long it takes to slide shut, and how hard it bounces back off the edge then. */
const TOOLS_SPRING = { damping: 18, stiffness: 180, mass: 0.9 };
const TOOLS_CLOSE_MS = 220;
const TOOLS_REBOUND = 450;
/** How far the tray and the tools panel carry on past their outer edge, so their springy bounce shows no gap. */
const SPRING_OVERSHOOT = 60;
/** Cards moved about the table before the lasso's tip is offered. */
const LASSO_TIP_AFTER = 5;
/** The tools panel's rounded corners (squared off where the tab meets one). */
const TOOLS_PANEL_RADIUS = 14;
/** The tools panel on an iPhone turned on its side: a little wider than the drawer's. */
const TOOLS_W_SIDEWAYS = 270;
/** The tools tab, let go this near the top or bottom of its edge, goes right up against it. */
const TOOLS_END_SNAP = TOOLS_PANEL_RADIUS + 16;
/** How long the tools tab is held before it lifts to be moved. */
const TOOLS_HOLD_MS = 200;
/** Moving further than this before the hold is up is a slip: neither a tap nor a drag. */
const TOOLS_DRAG_SLOP = 8;

const FLIP_ICON = { ios: 'arrow.trianglehead.2.clockwise.rotate.90', android: 'flip', web: 'flip' } as const;
/** Copy's button, the last in every menu that has it. */
const COPY_ICON = { ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' } as const;

/** The room between a picked-out group's box and what's in it (table units). */
const GROUP_BOX_ROOM = 8;

/** The most copies Paste several puts down at once. */
const PASTE_MAX = 50;

/** The buttons in the column by what's picked out (see `column`). */
type ColumnButton = 'flip' | 'shuffle' | 'gather' | 'roll' | 'grid' | 'more';

/** What a menu is open on. */
type Menu =
  | { kind: 'stack'; id: string }
  | { kind: 'hand'; hand: number; iid: string }
  | { kind: 'table' }
  | { kind: 'addDeck' }
  | { kind: 'color' }
  | { kind: 'selection' }
  | { kind: 'piece'; id: string }
  | { kind: 'components' }
  | { kind: 'addDie' }
  /** A token's shape. */
  | { kind: 'tokenShape'; id: string }
  /** How see-through a zone or card spot is. */
  | { kind: 'zoneOpacity'; id: string }
  /** For one counter or die, or (with no id) every one picked out. */
  | { kind: 'dieKind'; id?: string }
  /** For one counter or die, or (with no id) every one picked out; marker for a track's marker. */
  | { kind: 'pieceColor'; id?: string; marker?: boolean }
  | { kind: 'pieceShape'; id?: string }
  | { kind: 'addShape' }
  /** Where a token's picture comes from: for a new token, or (with an id) to change one's. */
  /** Scaling stacks and pieces (changing as the slider moves). */
  | { kind: 'scale'; stacks: string[]; pieces: string[] }
  /** Turning stacks, custom art and dice (changing as the slider moves). */
  | { kind: 'rotate'; stacks: string[]; pieces: string[] }
  /** Setting the face a die shows (changing as the slider moves). */
  | { kind: 'dieValue'; id: string }
  /** A six-sided die's (or a coin's) own art for its faces: each chosen, or put back to standard. */
  | { kind: 'faces'; id: string }
  /** How many players a score pad has. */
  | { kind: 'scorePlayers'; id: string }
  /** All the points written down on a score pad, newest first, to change or cross off. */
  | { kind: 'scoreList'; id: string }
  /** Points written down on a score pad (where they are in its `scores`): changed, or crossed off. */
  | { kind: 'scoreEntry'; id: string; entry: number };

/** Counters and dice being dragged: the one under the finger, all of them, and how far they've gone (table units). */
interface PieceDrag {
  lead: string;
  ids: string[];
  dx: number;
  dy: number;
  /** A piece just taken out of a bag (it isn't on the table till it's put down): which bag, and it, where it set off. */
  out?: { bagId: string; piece: TablePiece };
  /** Custom art twisted with a second finger as it's dragged: its turn now (degrees clockwise). */
  turn?: number;
}

/** Where a token's (or custom art's) picture comes from. */
type PictureSource = 'photos' | 'files' | 'camera';
/**
 * What a picture's for: a token, or custom art (a new one, or with an id, that one's picture changed); or a face of
 * a die's or coin's (from 0).
 */
type PictureTarget = { kind: 'token' | 'art'; id?: string } | { kind: 'face'; id: string; face: number };

/** A card being carried by a finger. */
interface Held {
  /** Where each was taken from (the first picked up, then any tapped with another finger). */
  sources: Source[];
  cards: SandboxCard[];
}

/**
 * State kept as the table's own is (in a store read with useSyncExternalStore, as useSandbox does), rather than as
 * React state: changes to it and to the table, made together, reach the screen together, in the same frame. (React
 * state set beside a change to the table could come a frame later.)
 */
function useStoreState<T>(initial: T): [T, (next: T | ((was: T) => T)) => void] {
  const [store] = useState(() => {
    let value = initial;
    const listeners = new Set<() => void>();
    return {
      get: () => value,
      set: (next: T | ((was: T) => T)) => {
        value = typeof next === 'function' ? (next as (was: T) => T)(value) : next;
        listeners.forEach((l) => l());
      },
      subscribe: (l: () => void) => {
        listeners.add(l);
        return () => {
          listeners.delete(l);
        };
      },
    };
  });
  return [useSyncExternalStore(store.subscribe, store.get), store.set];
}

/**
 * A sandbox table: a big table seen from above, the camera slid with one finger and zoomed and turned with two;
 * decks brought onto it from the player's list; cards dragged anywhere, turned to any angle with a second
 * finger (settling onto the table's 45° steps when close), stacked, flipped, and taken into any of four hands.
 */
export function SandboxBoard({ id, onControls }: { id: string; onControls: (c: TableControls | null) => void }) {
  const stored = useSandbox(id);
  const { decks, getDeck } = useDecks();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  /** An iPhone turned on its side (the iPad keeps its own layout either way). */
  const sideways = !IS_PAD && screenW > screenH;
  /** The hand tabs' row, as wide as its tabs need (measured): a sideways iPhone's tray is sized by it. */
  const [tabsW, setTabsW] = useState(0);
  const [history, setHistory] = useState<SandboxTable[]>([]);
  /** Changes undone, latest last, to make again (gone once anything else changes). */
  const [future, setFuture] = useState<SandboxTable[]>([]);
  const [handIndex, setHandIndex] = useState(0);
  const [folded, setFolded] = useState(false);
  /** Stacks picked out with the lasso: outlined in gold, and dragged together. */
  // (As picked out: `selected`, with the rest of any group they're in.)
  const [selectedIds, setSelected] = useState<string[]>([]);
  /** The lasso being drawn, as screen points (for drawing it). */
  const [lassoPath, setLassoPath] = useState<{ x: number; y: number }[] | null>(null);
  /** The selected stacks being dragged together: moved on the animation thread, like the camera, until let go. */
  const [groupMoving, setGroupMoving] = useState(false);
  /** The dragged group is over the hand: gathered into one pile under the finger, at hand size, for going in. */
  const [groupInHand, setGroupInHand] = useState<string | null>(null);
  /** Cards flying between the spread-out group and its pile over the hand (in: gathering; out: spreading out). */
  const [pileFlights, setPileFlights] = useState<PileFlight[]>([]);
  const groupDX = useSharedValue(0);
  const groupDY = useSharedValue(0);
  /** A dragged group's twist (degrees), about where it was grabbed (a table point): it turns round the finger. */
  const groupTurn = useSharedValue(0);
  const groupPX = useSharedValue(0);
  const groupPY = useSharedValue(0);
  // Turned about the grab point p, then moved by d: a point x goes to R(x − p) + p + d. The layer turns about its
  // top-left corner (the table's origin; see its style): that's R·x then a single move of p + d − R·p. (One move
  // and one turn: the same transform written as move, turn, move back has its two moves merged into one.)
  const groupStyle = useAnimatedStyle(() => {
    const r = (groupTurn.value * Math.PI) / 180;
    const px = groupPX.value;
    const py = groupPY.value;
    return {
      transform: [
        { translateX: px + groupDX.value - (px * Math.cos(r) - py * Math.sin(r)) },
        { translateY: py + groupDY.value - (px * Math.sin(r) + py * Math.cos(r)) },
        { rotate: `${groupTurn.value}deg` },
      ],
    };
  });
  /**
   * How far counters and dice picked out with dragged cards have gone with them (they don't turn). Pieces are moved
   * by where they're drawn (never by a moving style on their views: one could be left on a view used again for
   * another piece, which was then drawn away from where it lay, and couldn't be picked up where it was seen).
   */
  const [groupShift, setGroupShift] = useState<{ dx: number; dy: number } | null>(null);
  /** Cards flying into a stack just gathered (each the top of a stack that was picked out). */
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  /** Where carried cards would go into the hand, while they're over it: a gap opens there. */
  const [handGap, setHandGap] = useState<number | null>(null);
  /** How far the hand's row is scrolled, as its scroll view reports it (to find the card under a finger). */
  const [handScroll] = useState(() => {
    const box = { x: 0 };
    return { get: () => box.x, set: (x: number) => Object.assign(box, { x }) };
  });
  /** The hand's scroll view: table mode's, to scroll it as carried cards are dragged near its ends. */
  const [handList] = useState(() => {
    const box: { view: ScrollView | null } = { view: null };
    return {
      attach: (view: ScrollView | null) => {
        Object.assign(box, { view });
      },
      get: () => box.view,
    };
  });
  // The tray's slide as it folds and opens, with a little spring, as in table mode.
  const foldY = useSharedValue(0);
  /** The tray slid down off the screen and back while the phone turns (see below). */
  const turnY = useSharedValue(0);
  const trayStyle = useAnimatedStyle(() => ({ transform: [{ translateY: foldY.value + turnY.value }] }));
  const [held, setHeld] = useState<Held | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [menu, setMenuState] = useState<Menu | null>(null);
  /**
   * Where the last finger came down on screen (on the table, its tools, or in a menu's window), kept outside React
   * state as it changes with every touch: on iPad, a menu opens above it (see menuSpot).
   */
  const [lastTouch] = useState(() => {
    const box = { x: 0, y: 0, known: false };
    return { set: (x: number, y: number) => Object.assign(box, { x, y, known: true }), get: () => box };
  });
  /**
   * The last menu window (on iPad): where it is, kept as it opens and is dragged, and whether the next menu is its
   * follow-up (opened from it: while it's open or just closed), which opens in its place.
   */
  const [lastWindow] = useState(() => {
    const box = { rect: null as Rect | null, closedAt: 0, open: false, follow: false };
    return { set: (next: Partial<typeof box>) => Object.assign(box, next), get: () => box };
  });
  /**
   * Opens a menu, or closes it (null): a menu opened as another closes (or soon after) follows it, and opens
   * where it was. One function for good, so what holds it (the top bar's button) is never out of date.
   */
  const [setMenu] = useState(() => (next: Menu | null) => {
    const was = lastWindow.get();
    if (next === null) lastWindow.set({ closedAt: timeNow(), open: false });
    else lastWindow.set({ follow: was.open || timeNow() - was.closedAt < FOLLOW_MS, open: true });
    setMenuState(next);
  });
  /** Where an iPad's menu window opens: above the finger that opened it, or (a follow-up) where the last window was. */
  const [menuSpot, setMenuSpot] = useState<{ at?: Point; from?: Rect } | null>(null);
  const [menuWas, setMenuWas] = useState<Menu | null>(null);
  // As a menu opens, or another takes its place: set during render, React's way for state that follows state.
  if (menu !== menuWas) {
    setMenuWas(menu);
    if (menu && menu.kind !== menuWas?.kind) {
      const t = lastTouch.get();
      const last = lastWindow.get();
      setMenuSpot(last.follow && last.rect ? { from: last.rect } : t.known ? { at: { x: t.x, y: t.y } } : null);
    }
  }
  /** Dealing from this stack: its menu shows how many to deal and to whom, instead of its options. */
  const [dealingFrom, setDealingFrom] = useState<string | null>(null);
  /** Looking through this stack: its menu shows its cards, to take one into the hand. */
  const [searching, setSearching] = useState<string | null>(null);
  /** The search is drawn while open, and while it slides away. */
  const [searchMounted, setSearchMounted] = useState(false);
  if (searching && !searchMounted) setSearchMounted(true);
  /** Cards have been taken out of the search and are being carried over the table: it fades, but stays till they land. */
  const [searchLeaving, setSearchLeaving] = useState(false);
  /** The cards being taken out of the search (top first), till the carrying finger is picked up by the table. */
  const [searchTake] = useState(() => {
    const box = { iids: [] as string[] };
    return { get: () => box.iids, set: (iids: string[]) => Object.assign(box, { iids }) };
  });
  /** Closes the search (it slides away). */
  const endSearch = () => {
    setSearching(null);
    setSearchLeaving(false);
  };
  /** Choosing cards from a deck to bring onto the table. */
  const [addingCards, setAddingCards] = useState(false);
  /** A picture chosen for a die's or coin's face, being cropped square (see FaceSlots). */
  const [faceCrop, setFaceCrop] = useState<{ uri: string; id: string; face: number } | null>(null);
  /** A picture chosen for a token (a new one, or the one with `id`), being cropped to its shape (see TOKEN_SHAPES). */
  const [tokenCrop, setTokenCrop] = useState<{ uri: string; id?: string } | null>(null);
  /** The shape a token's being cropped to (the last chosen, for the next new one). */
  const [cropTokenShape, setCropTokenShape] = useState<TokenShape>('circle');
  /** The grid shown for a moment (its size just chosen), even with its lines off. */
  const [gridPeek, setGridPeek] = useState(0);
  /** The peeked grid's lines fading away. */
  const gridFade = useSharedValue(1);
  const [latestPeek] = useState(() => {
    const box = { id: 0 };
    return { get: () => box.id, set: (id: number) => Object.assign(box, { id }) };
  });
  const gridFadeStyle = useAnimatedStyle(() => ({ opacity: gridFade.value }));
  /** The table's trash is open, to put cards back. */
  const [trashOpen, setTrashOpen] = useState(false);
  /** A stack just brought onto the table, flying in to where the camera's taking it on screen. */
  const [arriving, setArriving] = useState<{ stackId: string; key: string; to: { x: number; y: number }; scale: number; angle: number } | null>(null);
  /** A stack being riffle shuffled (as in a deck's play screen): which, a fresh key each time, and whether it's started. */
  const [riffling, setRiffling] = useState<{ stackIds: string[]; key: number; started: boolean } | null>(null);
  const [zoomed, setZoomed] = useState<SandboxCard | null>(null);
  const [view, setView] = useState<{ w: number; h: number } | null>(null);

  // Cards of decks since deleted (or cards since removed from them) quietly leave the table.
  const table = useMemo(() => (stored ? prune(stored, decks) : undefined), [stored, decks]);

  const decksById = useMemo(() => new Map(decks.map((d) => [d.id, d])), [decks]);
  const cardOf = (c: SandboxCard) => decksById.get(c.deckId)?.cards.find((k) => k.id === c.cardId);
  /** A card's size on the table: its deck's real size (a mini card is smaller; a landscape one, a portrait turned). */
  // Worked out once per deck, and the same object each time: a new one every redraw would make every stack on the
  // table redraw too (they're memoized, and it's one of their props), every time a finger moves.
  const sizes = useMemo(
    () =>
      new Map(
        decks.map((d) => {
          const mm = cardSizeMm(d);
          return [d.id, { w: mm.w * UNITS_PER_MM, h: mm.h * UNITS_PER_MM }];
        }),
      ),
    [decks],
  );
  const size: CardSize = (deckId) => sizes.get(deckId) ?? STANDARD_SIZE;

  // ---- The camera: on the animation thread, so moving it never redraws the table. ----
  const camA = useSharedValue(1);
  const camB = useSharedValue(0);
  const camX = useSharedValue(0);
  const camY = useSharedValue(0);
  const readCamera = (): Camera => ({ a: camA.get(), b: camB.get(), tx: camX.get(), ty: camY.get() });
  const writeCamera = (c: Camera) => {
    camA.set(c.a);
    camB.set(c.b);
    camX.set(c.tx);
    camY.set(c.ty);
  };
  const worldStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: camX.value },
      { translateY: camY.value },
      { rotate: `${Math.atan2(camB.value, camA.value)}rad` },
      { scale: Math.hypot(camA.value, camB.value) },
    ],
  }));

  // ---- The card being carried: where it's drawn on screen (its middle), its turn and its size. ----
  const heldX = useSharedValue(0);
  const heldY = useSharedValue(0);
  const heldAngle = useSharedValue(0);
  const heldScale = useSharedValue(1);
  /** What a card flying between the group and its pile follows as it flies: the camera, the group, the finger. */
  const pileLive = { camA, camB, camX, camY, groupDX, groupDY, fingerX: heldX, fingerY: heldY };
  // Drawn just where, and as big as, it will lie when let go.
  const heldStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: heldX.value },
      { translateY: heldY.value },
      { rotate: `${heldAngle.value}deg` },
      { scale: heldScale.value },
    ],
  }));

  // The camera starts where it was left, or looking at the middle of the table, once its space is known.
  const [placed] = useState(() => {
    const box = { done: false };
    return { done: () => box.done, mark: () => Object.assign(box, { done: true }) };
  });
  const layOut = (e: LayoutChangeEvent) => {
    const space = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
    // The phone turned (the screen changed shape): what was in the middle of the view stays in the middle, the
    // camera's zoom and turn kept. (The middle as it was: across, and between the top bar and the hand; it's put as
    // far down the new screen, in proportion.)
    if (placed.done() && view && view.h > 0 && (view.w !== space.w || view.h !== space.h)) {
      const was = { x: view.w / 2, y: (barBottom + handTop - HAND_TAB_H) / 2 };
      const now = { x: space.w / 2, y: (was.y * space.h) / view.h };
      const cam = readCamera();
      writeCamera({ ...cam, tx: cam.tx + now.x - was.x, ty: cam.ty + now.y - was.y });
    }
    setView(space);
    if (placed.done() || !table) return;
    writeCamera(table.camera ?? startCamera({ w: space.w, h: space.h - HAND_H }, table.focus));
    placed.mark();
    // Never looked at before (a new table, or Solitaire the first time): everything fitted in view, once laid out.
    if (!table.camera) setFitFirst(true);
  };
  const [fitFirst, setFitFirst] = useState(false);

  // ---- Changes ----
  /** A change to the table, which can be undone. */
  const commit = (changed: SandboxTable) => {
    if (!table || changed === table) return;
    // A card put onto a stack of another size takes the stack's size; a card spot, its cards'.
    const next = keepArtLevels(table, fitSpots(matchStackSizes(changed, size), size));
    setHistory((h) => [...h.slice(-(UNDO_STEPS - 1)), table]);
    setFuture([]);
    updateSandbox(next);
  };
  // ---- Scaling: the chosen things change size as the slider moves, and it's all one undo once it's put away ----
  /** The table as it was when scaling began. */
  const [scaleBase, setScaleBase] = useState<SandboxTable | null>(null);
  const openScale = (stacks: string[], pieces: string[]) => {
    if (!table) return;
    setScaleBase(table);
    // Once the menu it's chosen from has gone.
    setTimeout(() => setMenu({ kind: 'scale', stacks, pieces }), 300);
  };
  /** Stacks, custom art and dice turned as the rotation slider moves (see rotateItems): one undo, as scaling is. */
  const openRotate = (stacks: string[], pieces: string[]) => {
    if (!table) return;
    setScaleBase(table);
    setTimeout(() => setMenu({ kind: 'rotate', stacks, pieces }), 300);
  };
  const previewRotate = (deg: number) => {
    if (!scaleBase || menu?.kind !== 'rotate') return;
    updateSandbox(rotateItems(scaleBase, menu.stacks, menu.pieces, deg));
  };
  /** A die's face set as the number slider moves: one undo, as scaling is. */
  const openDieValue = (id: string) => {
    if (!table) return;
    setScaleBase(table);
    setTimeout(() => setMenu({ kind: 'dieValue', id }), 300);
  };
  const previewDieValue = (value: number) => {
    if (!scaleBase || menu?.kind !== 'dieValue') return;
    updateSandbox(setPiece(scaleBase, menu.id, { value }));
  };
  /** A zone's or card spot's opacity set as its slider moves (in percent): one undo, as scaling is. */
  const openZoneOpacity = (id: string) => {
    if (!table) return;
    setScaleBase(table);
    setTimeout(() => setMenu({ kind: 'zoneOpacity', id }), 300);
  };
  const previewZoneOpacity = (percent: number) => {
    if (!scaleBase || menu?.kind !== 'zoneOpacity') return;
    updateSandbox(setPiece(scaleBase, menu.id, { opacity: percent >= 100 ? undefined : percent / 100 }));
  };
  const previewScale = (k: number) => {
    if (!scaleBase || menu?.kind !== 'scale') return;
    updateSandbox(scaleItems(scaleBase, menu.stacks, menu.pieces, k, size));
  };
  const finishScale = () => {
    if (!scaleBase) return;
    if (table && table !== scaleBase) {
      setHistory((h) => [...h.slice(-(UNDO_STEPS - 1)), scaleBase]);
      setFuture([]);
    }
    setScaleBase(null);
  };
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev || !table) return;
    setHistory(history.slice(0, -1));
    setFuture((f) => [...f, table]);
    updateSandbox({ ...prev, camera: table.camera, name: table.name, handNames: table.handNames });
    haptics.tick();
  };
  const redo = () => {
    const next = future[future.length - 1];
    if (!next || !table) return;
    setFuture(future.slice(0, -1));
    setHistory((h) => [...h.slice(-(UNDO_STEPS - 1)), table]);
    updateSandbox({ ...next, camera: table.camera, name: table.name, handNames: table.handNames });
    haptics.tick();
  };
  const saveCamera = () => table && updateSandbox({ ...table, camera: readCamera() });

  // ---- The grid: invisible lines at a fixed spacing; cards put down with snapping on sit on their crossings. ----
  const gridOn = !!table?.snapToGrid;
  /** The grid's spacing (its size, chosen in the tools). */
  const gridStep = table ? gridStepOf(table) : GRID_STEP;
  // The tools drawer, on the left or right edge: pulled out to show the tools, tucked away again to hide them. Its
  // tab can be dragged up and down the edge, or across to the other one (the player's choice, kept for every table).
  const [toolsOpen, setToolsOpen] = useState(false);
  /** How tall the tools are, together (measured): the panel is no taller than they need. */
  const [toolsContentH, setToolsContentH] = useState(0);
  const [toolsSpot, setToolsSpot] = useState<ToolsSpot>(() => loadSettings().toolsSpot ?? DEFAULT_TOOLS_SPOT);
  // On an iPhone turned on its side the tools open from a tab in the top bar (beside the back button), with none on
  // the edge: a wider panel slides out on the left, clear of the notch, from below the back button to near the
  // bottom (over the hand, if it's there), and slides wholly off the screen again.
  const toolsClosedX = sideways ? -(TOOLS_W_SIDEWAYS + insets.left + 24) : toolsSpot.side === 'left' ? -TOOLS_W : TOOLS_W;
  const toolsX = useSharedValue(toolsClosedX);
  /** The tab's being dragged: just the tab shows, not the (tucked away) panel it pulls out. */
  const [toolsDragging, setToolsDragging] = useState(false);
  /** The tab being dragged: how far, so far (the drawer follows it until it's let go). */
  const toolsDragX = useSharedValue(0);
  const toolsDragY = useSharedValue(0);
  const toolsStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: toolsX.value + toolsDragX.value }, { translateY: toolsDragY.value }],
  }));
  const showTools = (open: boolean) => {
    setToolsOpen(open);
    haptics.tick();
    if (sideways) {
      // Out with a little spring; away with none (a bounce back would show it again).
      toolsX.set(open ? withSpring(0, TOOLS_SPRING) : withTiming(toolsClosedX, { duration: TOOLS_CLOSE_MS, easing: ReEasing.in(ReEasing.quad) }));
      return;
    }
    // Opening springs out past its place and back. Closing can't (it would push the tab past the screen's edge, cut
    // off): it slides shut, then bounces back out off the edge a little, like a drawer, and settles.
    toolsX.set(
      open
        ? withSpring(0, TOOLS_SPRING)
        : withSequence(
            withTiming(toolsClosedX, { duration: TOOLS_CLOSE_MS, easing: ReEasing.in(ReEasing.quad) }),
            withSpring(toolsClosedX, { ...TOOLS_SPRING, velocity: toolsSpot.side === 'left' ? TOOLS_REBOUND : -TOOLS_REBOUND }),
          ),
    );
    // After opening it a few times: the tab can be moved.
    if (open && !sideways) offerTipAfterUses('tables-tools-drag');
  };
  // Put down somewhere new: the drawer's laid out there now, so the drag's offset goes (and it's tucked on that side),
  // before the screen's drawn, so it doesn't jump. The same once the phone's turned.
  useLayoutEffect(() => {
    toolsDragX.set(0);
    toolsDragY.set(0);
    toolsX.set(toolsOpen ? 0 : toolsClosedX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolsSpot, toolsClosedX, toolsDragX, toolsDragY, toolsX]);

  // ---- The hand tray, as in table mode: the hand's cards side by side in a row that scrolls sideways. ----
  const area = view ?? { w: screenW, h: 0 };
  const hand = table?.hands[handIndex] ?? [];
  /** Cards being carried (out of sight where they were). */
  const heldIds = new Set(held?.cards.map((c) => c.iid));
  /** The hand's cards as table mode's: about a quarter of the screen wide; the tray as tall as they need. */
  // The tray keeps one height whatever's in it. Every portrait card stands that tall (a mini as tall as a standard
  // card; widths follow each deck's shape), and a landscape card is its portrait card turned: as wide as that
  // height, and shorter. The height is table mode's for a standard card.
  // On an iPhone turned on its side, no taller than a little under a third of the screen, so the table keeps most of it.
  const handW = Math.min(110, screenW * 0.24, (screenH * 0.28 * PRESET_SIZES_MM.standard.w) / PRESET_SIZES_MM.standard.h);
  const handCardH = (handW * PRESET_SIZES_MM.standard.h) / PRESET_SIZES_MM.standard.w;
  const handWidthOf = (c: SandboxCard) => {
    const deck = decksById.get(c.deckId);
    const ratio = deck ? cardRatio(deck) : PRESET_SIZES_MM.standard.w / PRESET_SIZES_MM.standard.h;
    return ratio > 1 ? handCardH : handCardH * ratio;
  };
  const handH = Math.round(HAND_TOP_PAD + HAND_ROW_PAD * 2 + handCardH + 4);
  // The tray reaches the bottom of the screen; folded, it slides down until just the tops of its cards show.
  const trayH = handH + insets.bottom;
  // The hands hidden (from the tools): no tray at all, and the table down to the bottom of the screen (just
  // clear of the home bar, where the hand's tabs would stand). Nothing goes into a hand, then.
  const trayGone = !!table?.hideHands;
  const trayOpenTop = trayGone ? area.h - insets.bottom + HAND_TAB_H : area.h - trayH;
  const handTop = trayGone ? trayOpenTop : folded ? area.h - FOLDED_SHOWS : trayOpenTop;
  /** The row as laid out: the hand without any cards being carried, and a gap where carried ones would go in. */
  const handRow = hand.filter((c) => !heldIds.has(c.iid));
  // Where each card sits along the row (cards differ in width), with the gap taking the carried card's width.
  /** The grabbed stack of a group gathered over the hand (its top card leads the pile). */
  const groupLeadStack = groupInHand ? table?.stacks.find((s) => s.id === groupInHand) : undefined;
  const groupLeadTop = groupLeadStack ? groupLeadStack.cards[groupLeadStack.cards.length - 1] : undefined;
  const gapWidth = held ? handWidthOf(held.cards[held.cards.length - 1]) : groupLeadTop ? handWidthOf(groupLeadTop) : handW;
  const rowWidths = handRow.map(handWidthOf);
  // On an iPhone turned on its side, the tray doesn't reach the screen's ends: it's the width of its tabs and about
  // one more tab at either end, in the middle (so clear of the notch). The tabs' own width is measured.
  const narrowTray = sideways && tabsW > 0;
  const tabLength = (tabsW - HAND_TAB_GAP * (HAND_COUNT - 1)) / HAND_COUNT;
  const trayW = narrowTray ? Math.min(area.w - insets.left - insets.right, tabsW + 2 * tabLength + HAND_TABS_PAD * 2) : area.w;
  const trayLeft = (area.w - trayW) / 2;
  /** A point on screen over the hand (the tray, or the strip along the bottom where it's folded away). */
  const inTray = (x: number, y: number) => y >= handTop && x >= trayLeft && x <= trayLeft + trayW;
  // The row's ends, clear of the notch (a full-width tray, on an iPhone turned on its side).
  const handPadL = HAND_PAD + (narrowTray ? 0 : insets.left);
  const handPadR = HAND_PAD + (narrowTray ? 0 : insets.right);
  const rowXs = rowWidths.reduce<number[]>((xs, w, k) => {
    const before = k ? xs[k - 1] + rowWidths[k - 1] + HAND_GAP : handPadL;
    return [...xs, before + (handGap === k ? gapWidth + HAND_GAP : 0)];
  }, []);
  const rowX = (k: number) => rowXs[k];
  const rowWidth =
    handPadL + handPadR + rowWidths.reduce((sum, w) => sum + w + HAND_GAP, 0) + (handGap !== null ? gapWidth + HAND_GAP : 0) - HAND_GAP;
  const maxHandScroll = Math.max(0, rowWidth - trayW);
  /** Where the row's cards sit, down from the tray's top. */
  const rowTop = HAND_TOP_PAD + HAND_ROW_PAD;
  /** The hand card under a point on screen (its place in the hand), or −1. */
  const handCardAt = (x: number, y: number) => {
    // Folded away, its cards peek out but can't be picked up.
    if (folded || y < trayOpenTop + rowTop || y > trayOpenTop + rowTop + handCardH || x < trayLeft || x > trayLeft + trayW) return -1;
    const at = x - trayLeft + handScroll.get();
    const k = handRow.findIndex((_, i) => at >= rowX(i) && at <= rowX(i) + rowWidths[i]);
    return k < 0 ? -1 : hand.indexOf(handRow[k]);
  };
  /** Folds the tray away (just the tops of its cards showing) or opens it, sliding with a little spring. */
  const foldTray = (fold: boolean) => {
    setFolded(fold);
    if (fold) tipLearned('tables-fold-hand');
    foldY.set(withSpring(fold ? trayH - FOLDED_SHOWS : 0, { damping: 16, stiffness: 170, mass: 0.9 }));
    haptics.tick();
  };
  // The tray a new height (the phone turned, so its cards changed size): a folded tray kept where it was would sit
  // too high or too low, and stick there. Put straight to where it belongs for the new height.
  useEffect(() => {
    foldY.set(folded ? trayH - FOLDED_SHOWS : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trayH]);
  // The phone turned (on its side, or back upright): the tray takes a different shape, so rather than jump to it,
  // it's gone below the screen's edge the moment the screen turns, and once the turn has settled it rises back up.
  const [turnFrom] = useState(() => {
    const box = { sideways };
    return { get: () => box.sideways, set: (s: boolean) => Object.assign(box, { sideways: s }) };
  });
  useLayoutEffect(() => {
    if (turnFrom.get() === sideways) return;
    turnFrom.set(sideways);
    turnY.set(withSequence(withTiming(trayH + HAND_TAB_H + SPRING_OVERSHOOT, { duration: 0 }), withDelay(TURN_SETTLE_MS, withSpring(0, { damping: 18, stiffness: 160, mass: 0.9 }))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideways]);
  /** Shows another hand (opening the tray, if it was folded). */
  const chooseHand = (i: number) => {
    setHandIndex(i);
    handScroll.set(0);
    handList.get()?.scrollTo({ x: 0, animated: false });
    if (folded) foldTray(false);
    else haptics.tick();
  };
  // The tools drawer's place: its tab anywhere from just below the top bar to just above the hand's tabs (as a share
  // of that, so it fits any screen; the same with the hands hidden, so switching them never moves it), and the panel
  // beside it, as tall as its tools need, up to the whole of that height (they scroll if they don't fit).
  const toolsMinY = insets.top + TOP_BAR_H + 8;
  const toolsMaxY = Math.max(toolsMinY, area.h - trayH - HAND_TAB_H - TOOLS_TAB_H - 8);
  const tabY = toolsMinY + toolsSpot.at * (toolsMaxY - toolsMinY);
  /** The panel's height with all its tools in it (measured; until then, as tall as it can be). */
  // (And its rim, top and bottom.)
  const toolsFitH = toolsContentH ? toolsContentH + StyleSheet.hairlineWidth * 2 : Number.MAX_VALUE;
  const toolsH = Math.min(toolsMaxY + TOOLS_TAB_H - toolsMinY, toolsFitH);
  const toolsTop = Math.min(Math.max(tabY - TOOLS_TAB_TOP, toolsMinY), toolsMaxY + TOOLS_TAB_H - toolsH);
  /** Where the tab sits in the drawer. */
  const tabInDrawer = tabY - toolsTop;
  /** Just below the top bar (and its back button). */
  const barBottom = insets.top + TOP_BAR_H;
  /** The sideways panel's height: from below the back button to a little above the bottom of the screen. */
  const sideToolsH = Math.min(Math.max(0, area.h - barBottom - insets.bottom - 8), toolsFitH);
  // With the tab up against the panel's top or bottom, that corner of the panel goes square, so the tab joins it
  // cleanly (like a folder's tab) instead of leaving a notch where the panel's corner curves away.
  const left = toolsSpot.side === 'left';
  const panelCorners = {
    ...(tabInDrawer < TOOLS_PANEL_RADIUS && { [left ? 'borderTopRightRadius' : 'borderTopLeftRadius']: 0 }),
    ...(tabInDrawer + TOOLS_TAB_H > toolsH - TOOLS_PANEL_RADIUS && { [left ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: 0 }),
  };
  // The tab: a tap opens or closes the drawer; a drag (while it's closed) carries it up or down, or to the other edge.
  const [toolsDrag] = useState(() => {
    const box = {
      dragging: false,
      /** Moved before the hold was up: not a tap, and not a drag. */
      slipped: false,
      timer: null as ReturnType<typeof setTimeout> | null,
      /** Pulled away from its edge (dragged far enough sideways): it follows the finger across, and may change sides. */
      loose: false,
      side: 'left' as ToolsSpot['side'],
      open: false,
      tabY: 0,
      min: 0,
      max: 0,
      width: 0,
      set: (_s: ToolsSpot) => {},
      toggle: () => {},
      showDragging: (_on: boolean) => {},
    };
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      // A tap opens or closes it. Held a moment (closed, without moving), it lifts, with a buzz and a gold outline,
      // and can then be dragged; moved before then, it's neither (a slip of the finger).
      onPanResponderGrant: () => {
        box.dragging = false;
        box.loose = false;
        box.slipped = false;
        if (box.timer) clearTimeout(box.timer);
        box.timer = setTimeout(() => {
          box.timer = null;
          if (box.open || box.slipped) return;
          box.dragging = true;
          box.showDragging(true);
          haptics.lift();
        }, TOOLS_HOLD_MS);
      },
      onPanResponderMove: (_, g) => {
        if (!box.dragging) {
          if (Math.hypot(g.dx, g.dy) > TOOLS_DRAG_SLOP) box.slipped = true;
          return;
        }
        // Held to its edge, giving a little, until the finger's gone a way sideways: then it comes away and follows.
        if (!box.loose && Math.abs(g.dx) > TOOLS_DETACH) {
          box.loose = true;
          haptics.tick();
        }
        toolsDragX.set(box.loose ? g.dx : g.dx * TOOLS_EDGE_GIVE);
        toolsDragY.set(Math.min(Math.max(box.tabY + g.dy, box.min), box.max) - box.tabY);
      },
      onPanResponderRelease: (_, g) => {
        if (box.timer) clearTimeout(box.timer);
        box.timer = null;
        if (!box.dragging) {
          if (!box.slipped) box.toggle();
          return;
        }
        box.showDragging(false);
        // Let go near the top or bottom: right up against it, never just short (where the panel's corner, squared
        // off for the tab, would be left with a point beside it).
        const dropped = Math.min(Math.max(box.tabY + g.dy, box.min), box.max);
        const y = dropped - box.min < TOOLS_END_SNAP ? box.min : box.max - dropped < TOOLS_END_SNAP ? box.max : dropped;
        const side = box.loose ? (g.moveX < box.width / 2 ? 'left' : 'right') : box.side;
        box.set({ side, at: box.max > box.min ? (y - box.min) / (box.max - box.min) : 0 });
        haptics.drop();
        tipLearned('tables-tools-drag');
      },
      onPanResponderTerminate: () => {
        if (box.timer) clearTimeout(box.timer);
        box.timer = null;
        box.dragging = false;
        box.showDragging(false);
        toolsDragX.set(withSpring(0));
        toolsDragY.set(withSpring(0));
      },
    });
    return { box, responder };
  });
  Object.assign(toolsDrag.box, {
    open: toolsOpen,
    side: toolsSpot.side,
    tabY,
    min: toolsMinY,
    max: toolsMaxY,
    width: area.w || screenW,
    set: (spot: ToolsSpot) => {
      setToolsSpot(spot);
      saveSettings({ ...loadSettings(), toolsSpot: spot });
    },
    toggle: () => showTools(!toolsOpen),
    showDragging: setToolsDragging,
  });
  /** The flip button, in the bottom-left corner above the tray, while cards are carried. */
  const flipButton = { x: FLIP_MARGIN + insets.left, y: handTop - HAND_TAB_H - FLIP_MARGIN - FLIP_SIZE, size: FLIP_SIZE };
  /** A double tap: the card (or the whole stack) turned over where it lies. */
  const flipFromTap = (src: Source) => {
    if (!table || src.kind === 'bag') return;
    if (src.kind === 'hand') commit(flipInHand(table, src.hand, src.iid));
    // Turned over to face the way the stack it lies on does, it joins it.
    else commit(settleOnto(flipStack(table, src.stackId), src.stackId));
    haptics.tick();
    tourEvent('tables-flipped');
    tipLearned('tables-double-tap');
  };

  // ---- Pieces: counters and dice ----
  /** A piece being dragged: where it's drawn for now (it's put down where it's let go). */
  const [pieceDrag, setPieceDrag] = useState<PieceDrag | null>(null);
  /**
   * Each die's latest roll here: how many so far (so it tumbles each time), where it set off from, and where it
   * lands (it tumbles only once it's there on the table: see drawPiece). Kept as the table itself is (see
   * useStoreState), so a roll reaches the screen in the very frame its dice move to where they land: as React
   * state it came a frame after them, and for that frame each die showed with the last roll's motion, out of place.
   */
  const [rolls, setRolls] = useStoreState<Record<string, { key: number; dx: number; dy: number; to: { x: number; y: number } }>>({});
  /** Dice mid-roll: drawn over the rest (they're in the air, coming from where they were) till they've settled. */
  const [airborne, setAirborne] = useStoreState<string[]>([]);
  /** Counters and dice picked out with the lasso; the dice among them roll together (tap any, or the roll button). */
  const [pickedPieceIds, setPickedPieces] = useState<string[]>([]);
  // What's picked out, cards and pieces: anything in a group brings the rest of the group with it (see withGroups).
  const grouped = table
    ? withGroups(table, selectedIds, pickedPieceIds.filter((id) => table.pieces?.some((p) => p.id === id)))
    : { stackIds: selectedIds, pieceIds: [] };
  const selected = grouped.stackIds;
  const pickedPieces = grouped.pieceIds;
  const pickedDice = pickedPieces.filter((id) => table?.pieces?.some((p) => p.id === id && p.kind === 'die'));
  /** The picked-out dice, coins and spinners: the roll button rolls, flips and spins them all (a tap on one, those of its kind). */
  const pickedRollables = pickedPieces.filter((id) => table?.pieces?.some((p) => p.id === id && rollable(p)));
  /** The kind some pieces all are, if they're all dice, all coins or all spinners (what a roll button rolls). */
  const rollableKind = (ids: string[]) => {
    const kinds = new Set(ids.map((id) => table?.pieces?.find((p) => p.id === id)?.kind));
    const [kind] = [...kinds];
    return ids.length && kinds.size === 1 && (kind === 'die' || kind === 'coin' || kind === 'spinner') ? kind : null;
  };
  /**
   * One or more of one kind picked out, and nothing else (no cards, nor pieces of another kind): the kind the corner
   * button rolls (dice), flips (coins) or spins (spinners), all together. Otherwise none shows.
   */
  const rollKind = selected.some((id) => table?.stacks.some((s) => s.id === id)) ? null : rollableKind(pickedPieces);
  /** Dice (or coins, or spinners) being dragged: the roll button shows too, tapped with another finger to roll them there. */
  const dragRollKind = pieceDrag && !pieceDrag.out ? rollableKind(pieceDrag.ids) : null;
  /**
   * Rolls dice (one undo for them all): each lands on a new face a little way off, in a random direction, and
   * tumbles across to there.
   */
  const rollDice = (ids: string[]) => {
    if (!table) return;
    const { table: next, from } = throwDice(table, ids);
    if (!Object.keys(from).length) return;
    const landing = (id: string) => {
      const p = next.pieces?.find((q) => q.id === id);
      return { x: p?.x ?? 0, y: p?.y ?? 0 };
    };
    // The rolls first, then the table with the dice where they land: the table can reach the screen a frame before
    // what's set after it, and with the dice already there but their rolls not yet known, each showed for a frame
    // where it lands. Known first, each starts its tumble back the moment it's there (see Die).
    setRolls((r) => Object.fromEntries([...Object.entries(r), ...Object.entries(from).map(([id, f]) => [id, { key: (r[id]?.key ?? 0) + 1, ...f, to: landing(id) }])]));
    // In the air till they've settled (a little after, so none drops behind another as it lands).
    const thrown = Object.keys(from);
    setAirborne((a) => [...a.filter((id) => !thrown.includes(id)), ...thrown]);
    setTimeout(() => setAirborne((a) => a.filter((id) => !thrown.includes(id))), ROLL_MS + 120);
    commit(next);
    // Felt as it's thrown, and as it bounces.
    haptics.deal();
    setTimeout(haptics.tick, 280);
    setTimeout(haptics.tick, 500);
  };
  /** Letting the selection go lets the picked-out dice go too. */
  const selectStacks = (ids: string[]) => {
    setSelected(ids);
    if (!ids.length) setPickedPieces([]);
  };
  /**
   * A tap on a piece: a die rolls, a coin flips, a spinner spins (all the picked-out ones, if it's one of them); a
   * text label's words can be changed; a counter's − or + counts down or up (its number: its options).
   */
  const tapPiece = (id: string, part: PiecePart, at?: { x: number; y: number }) => {
    const piece = table?.pieces?.find((p) => p.id === id);
    if (!table || !piece) return;
    if (rollable(piece)) {
      // One of several picked out: those of the same kind go with it (all the dice, or all the coins), not the rest.
      const kin = pickedRollables.filter((pid) => table.pieces?.find((p) => p.id === pid)?.kind === piece.kind);
      rollDice(pickedRollables.includes(id) ? kin : [id]);
      return;
    }
    if (piece.kind === 'text') {
      askText('Text', piece.label ?? '', (label) => commit(setPiece(table, id, { label })));
      return;
    }
    if (piece.kind === 'bag') {
      // As a stack: a tap picks it out; a tap on it picked out opens its own options (and lets any others go).
      if (pickedPieces.includes(id)) {
        if (pickedPieces.length + chosen.length > 1) selectStacks([]);
        setMenu({ kind: 'piece', id });
        return;
      }
      setSelected([]);
      setPickedPieces([id]);
      haptics.tick();
      return;
    }
    if (piece.kind === 'track') {
      // Its marker to the space tapped.
      const space = at ? trackSpaceAt(piece, at.x, at.y) : piece.value;
      if (space !== piece.value) {
        commit(setPiece(table, id, { value: space }));
        haptics.tick();
      }
      return;
    }
    if (piece.kind === 'score') {
      // A player's name: changed; points written down: changed or crossed off; their + (under their total): more
      // points for them (taken off, with a minus).
      const { player, area, entry } = at ? scoreSpotAt(piece, at.x, at.y) : { player: 0, area: 'rows' as const, entry: undefined };
      const who = scoreNames(piece)[player];
      if (entry !== undefined) {
        setMenu({ kind: 'scoreEntry', id, entry });
        return;
      }
      if (area !== 'name' && area !== 'add') return;
      if (area === 'name') {
        askName('Player’s name', who, (named) => commit(setPiece(table, id, { names: scoreNames(piece).map((n, i) => (i === player ? named : n)) })));
        return;
      }
      askNumber(
        `Points for ${who}`,
        '',
        (text) => {
          const n = parseInt(text.replace(/[^\d-]/g, ''), 10);
          // (0 too: a round that scored nothing.)
          if (Number.isFinite(n)) {
            commit(addScore(table, id, player, n));
            haptics.tick();
          }
        },
        'signed',
      );
      return;
    }
    if (piece.kind === 'timer') {
      // Starting and pausing it isn't undone (the time goes on regardless).
      updateSandbox(toggleTimer(table, id));
      haptics.tick();
      return;
    }
    if (piece.kind !== 'counter') {
      // Anything else (custom art, a token, a playing piece, a marker), as a stack or a bag: a tap picks it out; a
      // tap on it picked out opens its own options (and lets any others go). (Not a zone: it's the table's layout.)
      if (onCloth(piece)) return haptics.tick();
      if (pickedPieces.includes(id)) {
        if (pickedPieces.length + chosen.length > 1) selectStacks([]);
        setMenu({ kind: 'piece', id });
        return;
      }
      setSelected([]);
      setPickedPieces([id]);
      haptics.tick();
      return;
    }
    if (part === 'body') {
      setMenu({ kind: 'piece', id });
      return;
    }
    commit(setPiece(table, id, { value: piece.value + (part === 'plus' ? 1 : -1) }));
    haptics.tick();
  };
  /**
   * Dragged pieces let go: they stay there, on top of the others (the one dragged on the grid, if snapping's on, and
   * the rest as far as it went). Dice that land on others are moved off them.
   */
  const dropPieces = (drag: PieceDrag) => {
    setPieceDrag(null);
    if (!table) return;
    // A piece just taken out of a bag: put on the table (or dropped on a bag; back on its own, it's left there).
    if (drag.out) {
      const { bagId, piece } = drag.out;
      const to = { x: piece.x + drag.dx, y: piece.y + drag.dy };
      const source = table.pieces?.find((p) => p.id === bagId);
      if (!source) return;
      const taken = source.supply ? table : removeBagItems(table, bagId, [piece.id]);
      const onto = bagAt(table, to.x, to.y);
      if (onto?.id === bagId) return;
      if (onto) return dropIntoBag(onto.id, [{ piece }], taken);
      commit(placeItem(taken, { piece }, gridOn ? snapToGrid({ ...to, angle: 0 }, gridStep) : to, newId()));
      return haptics.drop();
    }
    const lead = table.pieces?.find((p) => p.id === drag.lead);
    if (!lead) return;
    const to = { x: lead.x + drag.dx, y: lead.y + drag.dy };
    // Dropped on a bag (not one of those being dragged): into it.
    const bag = bagAt(table, to.x, to.y, drag.ids);
    if (bag) {
      const pieces = (table.pieces ?? []).filter((p) => drag.ids.includes(p.id));
      return dropIntoBag(bag.id, pieces.map((piece) => ({ piece })), { ...table, pieces: (table.pieces ?? []).filter((p) => !drag.ids.includes(p.id)) });
    }
    const snapped = gridOn ? snapToGrid({ ...to, angle: 0 }, gridStep) : to;
    // Custom art moved comes over every card, as a stack moved does (turned as it was twisted).
    const moved = raiseArt(movePieces(table, drag.ids, { x: snapped.x - lead.x, y: snapped.y - lead.y }), drag.ids);
    commit(drag.turn !== undefined ? setPiece(moved, lead.id, { angle: normalizeAngle(drag.turn) }) : moved);
    haptics.drop();
  };
  /**
   * Things dropped on a bag (`without`: the table with them already taken from where they were). An empty bag
   * given one thing, or several of the very same, asks: an endless supply of it, or just these? A supply takes
   * back only what it supplies; anything else stays where it was.
   */
  const dropIntoBag = (bagId: string, items: BagItem[], without: SandboxTable) => {
    const bag = without.pieces?.find((p) => p.id === bagId);
    if (!bag || !items.length) return;
    if (!bagTakes(bag, items)) return haptics.warn();
    const put = (asSupply: boolean) => {
      commit(putInBag(without, bagId, items, asSupply));
      haptics.drop();
    };
    // Back into a supply: they just go.
    if (bag.supply) return put(false);
    if (!bagItems(bag).length && allAlike(items)) {
      const n = items.length;
      Alert.alert(n === 1 ? 'Into the bag' : `${n} into the bag`, 'Make the bag an endless supply of it, or put in just what’s here?', [
        { text: 'Cancel', style: 'cancel' },
        { text: n === 1 ? 'Just this one' : `Just these ${n}`, onPress: () => put(false) },
        { text: 'Endless supply', onPress: () => put(true) },
      ]);
      return;
    }
    put(false);
  };
  /**
   * A picture from Photos, Files or the camera, for a token (made into a token's: see tokenPicture) or custom art
   * (kept at its own shape: see artPicture), saved: on a new one, or (given an id) on that one instead. Nothing if
   * none's chosen.
   */
  const pictureFor = async (source: PictureSource, target: PictureTarget) => {
    // One picker at a time (a second tap while one's opening would otherwise open another, or neither).
    if (pickingPicture.busy) return;
    Object.assign(pickingPicture, { busy: true });
    try {
      await pictureFrom(source, target);
    } finally {
      Object.assign(pickingPicture, { busy: false });
    }
  };
  // Kept in a box (not a ref), as the gesture's state is: read only when a picture's chosen.
  const [pickingPicture] = useState(() => ({ busy: false }));
  /**
   * Where a picture comes from, asked with the system's own menu: it reports the choice only once it's fully gone,
   * so the picker that follows always opens (one of our sheets still sliding away could stop it).
   */
  const choosePicture = (target: PictureTarget) => {
    // Pictures of the player's own (custom art, a token's, a die's or coin's faces) are part of Pro. (The Playground's
    // own custom art can still be changed there, to try it.)
    if (!pro && !(playgroundHere && target.kind === 'art' && target.id)) return openPro();
    const sources: PictureSource[] = ['photos', 'files', 'camera'];
    // A face with art of its own can be put back to the standard one, too.
    const faced = target.kind === 'face' ? table?.pieces?.find((p) => p.id === target.id) : undefined;
    const standard = target.kind === 'face' && faced?.faces?.[target.face] ? () => setFaceArt(target.id, target.face, null) : null;
    const faceName = target.kind !== 'face' ? '' : faced?.kind === 'coin' ? (target.face ? 'Tails' : 'Heads') : `Face ${target.face + 1}`;
    const title = faceName || (target.id ? 'Change the picture' : target.kind === 'art' ? 'Custom art' : 'Token picture');
    if (Platform.OS === 'ios') {
      const options = ['Photos', 'Files', 'Take a photo', ...(standard ? ['Use the standard face'] : []), 'Cancel'];
      ActionSheetIOS.showActionSheetWithOptions({ title, options, cancelButtonIndex: options.length - 1 }, (i) => {
        if (i < 3) void pictureFor(sources[i], target);
        else if (standard && i === 3) standard();
      });
      return;
    }
    Alert.alert(title, undefined, [
      { text: 'Photos', onPress: () => void pictureFor('photos', target) },
      { text: 'Files', onPress: () => void pictureFor('files', target) },
      { text: 'Take a photo', onPress: () => void pictureFor('camera', target) },
      ...(standard ? [{ text: 'Use the standard face', onPress: standard }] : []),
    ]);
  };
  /**
   * A die's or coin's face (from 0) given its own art (and the art's color, which the rest of a die takes while
   * it's up), or put back to the standard face (null); then its faces again.
   */
  const setFaceArt = (id: string, face: number, picture: string | null, color: string | null = null) => {
    const now = latest.get();
    const piece = now.table?.pieces?.find((p) => p.id === id);
    if (!now.table || !piece) return;
    now.commit(setPiece(now.table, id, withFace(piece, face, picture, color)));
    haptics.tick();
    setTimeout(() => latest.get().setMenu({ kind: 'faces', id }), 250);
  };
  const pictureFrom = async (source: PictureSource, target: PictureTarget) => {
    // (A face's picture is cropped to the face's shape afterward, whichever it comes from.)
    const forToken = target.kind === 'token';
    let uri: string | undefined;
    if (source === 'files') {
      const doc = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      uri = doc.canceled ? undefined : doc.assets[0]?.uri;
    } else if (source === 'camera') {
      const allowed = await ImagePicker.requestCameraPermissionsAsync();
      if (!allowed.granted) {
        Alert.alert('Camera not allowed', 'Shufflevale can use the camera once it’s allowed in Settings → Shufflevale.');
        return;
      }
      // The whole photo (a token's is cropped to its shape afterward).
      const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
      uri = shot.canceled ? undefined : shot.assets[0]?.uri;
    } else {
      // Not edited here, so a cut-out (a subject saved from Photos) keeps its see-through background; and taken as
      // it's stored, not converted first (which can keep the picker waiting a while).
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      });
      uri = picked.canceled ? undefined : picked.assets[0]?.uri;
    }
    if (!uri) return;
    try {
      // The table as it is now (the picker took a while).
      const now = latest.get();
      if (!now.table) return;
      // A face's: cropped first to the face's own shape (see faceShape), just as wanted.
      if (target.kind === 'face') return setFaceCrop({ uri, id: target.id, face: target.face });
      // A token's: cropped to a shape, chosen as it's cropped (a token's own to start with, or the last chosen).
      if (forToken) {
        const token = target.id ? now.table.pieces?.find((p) => p.id === target.id) : undefined;
        if (token) setCropTokenShape(tokenShapeOf(token));
        return setTokenCrop({ uri, id: target.id });
      }
      const art = await artPicture(uri);
      const fresh = latest.get();
      if (!fresh.table) return;
      const image = importImage(TOKEN_PICTURES, art.uri);
      const size = artSize(art.width, art.height);
      if (target.id) fresh.commit(setPiece(fresh.table, target.id, { image, ...size }));
      else fresh.addPieceToTable('art', undefined, undefined, { image, ...size });
    } catch (e) {
      Alert.alert('Couldn’t use that picture', e instanceof Error ? e.message : String(e));
    }
  };
  /**
   * Custom art's subject cut out of its picture (a standee or token photographed on the table, say), lying just
   * where it was in the picture, at the same scale. One undo puts it back.
   */
  const cutOutArt = async (id: string) => {
    // Changing its picture is part of Pro (but on the Playground, to try it).
    if (!pro && !playgroundHere) return openPro();
    const art = latest.get().table?.pieces?.find((p) => p.id === id && p.kind === 'art');
    if (!art?.image) return;
    try {
      const source = await loadUpright(imageUri(art.image));
      const lifted = await cutOut(source.uri);
      if (!lifted) {
        haptics.warn();
        Alert.alert('Nothing to cut out', 'No shape stood out from the background. A plain, contrasting background helps.');
        return;
      }
      const picture = await artPicture(lifted.uri);
      const fresh = latest.get();
      const now = fresh.table?.pieces?.find((p) => p.id === id);
      if (!fresh.table || !now) return;
      // Its own size, and its middle, as the part of the picture it was: turned as the art lies.
      const { w, h } = { w: now.w ?? PIECE_SIZE.art.w, h: now.h ?? PIECE_SIZE.art.h };
      const k = now.scale ?? 1;
      const dx = (lifted.x + lifted.w / 2 - 0.5) * w * k;
      const dy = (lifted.y + lifted.h / 2 - 0.5) * h * k;
      const r = ((now.angle ?? 0) * Math.PI) / 180;
      fresh.commit(
        setPiece(fresh.table, id, {
          image: importImage(TOKEN_PICTURES, picture.uri),
          w: Math.max(20, Math.round(w * lifted.w)),
          h: Math.max(20, Math.round(h * lifted.h)),
          x: Math.round(now.x + dx * Math.cos(r) - dy * Math.sin(r)),
          y: Math.round(now.y + dx * Math.sin(r) + dy * Math.cos(r)),
        }),
      );
      haptics.success();
    } catch (e) {
      Alert.alert('Couldn’t cut it out', e instanceof Error ? e.message : String(e));
    }
  };
  /** A zone (or score pad) being resized by its grip: its own size for now (see resizeZone and resizeScore). */
  const [zoneSize, setZoneSize] = useState<{ id: string; w: number; h: number } | null>(null);
  /** Resized: a zone to its new size; a score pad to the rows that fit its new height. */
  const resized = (p: TablePiece, s: { w: number; h: number }) => (p.kind === 'score' ? resizeScore(p, s.h) : resizeZone(p, s.w, s.h));
  const dropZoneSize = () => {
    const zone = table?.pieces?.find((p) => p.id === zoneSize?.id);
    setZoneSize(null);
    if (!table || !zone || !zoneSize) return;
    commit(setPiece(table, zone.id, resized(zone, zoneSize)));
    haptics.drop();
  };
  /** A score pad's rows being scrolled: how far back, for now. */
  const [scoreScroll, setScoreScroll] = useState<{ id: string; scroll: number } | null>(null);
  /** Scrolled where it's let go (not something to undo: nothing on it has changed). */
  const dropScoreScroll = () => {
    setScoreScroll(null);
    if (!table || !scoreScroll) return;
    updateSandbox(setPiece(table, scoreScroll.id, { scroll: scoreScroll.scroll || undefined }));
  };
  /** How much custom art the table has, against ART_MAX (each is a picture to draw, so there's a limit). */
  const artCount = (table?.pieces ?? []).filter((p) => p.kind === 'art').length + (table?.pieces ?? []).reduce((n, p) => n + bagItems(p).filter((i) => i.piece?.kind === 'art').length, 0);
  const artFull = () =>
    Alert.alert('That’s all the custom art a table holds', `A table can have up to ${ART_MAX} pieces of custom art, so it stays quick to move about. Take some off to add more.`);
  /** Whatever's picked out laid out in an even grid, none on another (dice alone lined up tight: see gridItems). */
  const gridPicked = () => {
    if (!table || chosen.length + pickedPieces.length < 2) return;
    commit(gridItems(table, chosen, pickedPieces, size));
    haptics.drop();
  };
  // ---- Pro: making what's drawn with the player's own pictures (custom art, custom tokens, dice and coins' faces; see
  // isProPiece). Using them is free: a table someone shares, with theirs on it, plays in full; only making more, or
  // changing their pictures, needs Pro (as does pasting them onto other tables). The Playground's are there to try:
  // what's on it can be copied and pasted there, but no cards of the player's own come onto it. ----
  const pro = usePro();
  const examples = useExamples();
  const playgroundHere = !!table && isPlayground(table.id);
  const openPro = () => router.push({ pathname: '/pro', params: { reason: 'components' } });
  // The Playground's cards, without Pro: only the Playing Cards example's, and only while it's as it was made (not
  // changed into a deck of someone's own). Any others are taken off as it opens, and it says why.
  const playgroundDeck = playgroundHere ? decksById.get(loadSettings().playingCardsDeckId ?? '') : undefined;
  const playgroundCardsOk = !playgroundDeck || deckLook(playgroundDeck) === loadSettings().playingCardsLook;
  useEffect(() => {
    if (pro || !playgroundHere || !table) return;
    const ok = (c: SandboxCard) => c.deckId === playgroundDeck?.id && playgroundCardsOk;
    const all = [...table.stacks.flatMap((s) => s.cards), ...table.hands.flat(), ...(table.trash ?? [])];
    if (all.every(ok)) return;
    // Not undoable: they were never meant to be here.
    updateSandbox(keepCards(table, ok));
    Alert.alert(
      'Some cards were taken off the Playground',
      playgroundCardsOk
        ? 'The Playground plays with its own Playing Cards. Your own decks, and every component, can be used together with Pro.'
        : 'The Playing Cards deck has been changed, so its cards don’t play here. Restore examples (in the home screen’s menu) brings it back as it was.',
    );
    // As it opens, and if Pro or the deck changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pro, playgroundHere, playgroundCardsOk, playgroundDeck?.id, table?.id]);
  /** Something brought onto the Playground without Pro: it's for trying what's there. */
  const playgroundOnly = () => {
    haptics.warn();
    Alert.alert('The Playground is for trying things out', 'Everything on it can be used here. Bringing cards of your own onto it is part of Pro.', [
      { text: 'OK', style: 'cancel' },
      { text: 'See Pro', onPress: openPro },
    ]);
  };
  /** Where what's added goes: where the table was held to add it, if it was; or the middle of the view. */
  const [addAt, setAddAt] = useState<{ x: number; y: number } | null>(null);
  const middleOfView = () => (view ? toTable(readCamera(), view.w / 2, (insets.top + TOP_BAR_H + handTop - HAND_TAB_H) / 2) : { x: TABLE_W / 2, y: TABLE_H / 2 });
  const addSpot = () => addAt ?? middleOfView();
  const addPieceToTable = (kind: PieceKind, sides?: number, shape?: PieceShape, extra?: Partial<TablePiece>) => {
    if (!table || !view) return;
    // (The menus show these as Pro's: this is so nothing else can.)
    if (!pro && isProPiece({ kind, ...extra })) return openPro();
    const mid = addSpot();
    // In the middle of the view, a little apart from the last few (so they don't hide each other); where held, right there.
    const nudge = addAt ? 0 : ((table.pieces?.length ?? 0) % 5) * 24;
    const id = newId();
    // A die isn't put down on another.
    commit(raiseArt(separateDice(addPiece(table, { ...newPiece(kind, id, { x: mid.x + nudge, y: mid.y + nudge }, sides, shape), ...extra }), [id]), [id]));
    haptics.drop();
    return id;
  };
  /** How many dice the Add a die menu adds at once (kept for next time). */
  const [dieCount, setDieCount] = useState(1);
  /**
   * Dice added in the middle of what's in view: one as any piece is; several lined up in a tight grid, and picked
   * out, ready to roll together.
   */
  const addDice = (sides: number, count: number) => {
    if (count <= 1) return addPieceToTable('die', sides);
    if (!table || !view) return;
    const mid = addSpot();
    const ids = Array.from({ length: count }, () => newId());
    const added = ids.reduce((t, id, i) => addPiece(t, newPiece('die', id, { x: mid.x + i, y: mid.y }, sides)), table);
    commit(gridDice(added, ids));
    setSelected([]);
    setPickedPieces(ids);
    haptics.drop();
  };
  /** A d6 with art of its own (part of Pro): put on the table, then its faces, to give it its art. */
  const addCustomD6 = () => {
    if (!pro) return openPro();
    const id = addPieceToTable('die', 6);
    if (id) setTimeout(() => setMenu({ kind: 'faces', id }), 300);
  };
  /** Opens (or moves, or closes) the gap in the hand's row, the cards sliding over to make room. */
  const changeGap = (g: number | null) => {
    if (g === handGap) return;
    setHandGap(g);
  };
  /** While a group is dragged: a button above the flip one gathers it into one stack. */
  const stackButton = { x: flipButton.x, y: flipButton.y - FLIP_SIZE - 12, size: FLIP_SIZE };
  /** The selection, as it stands (stacks since gone, or gathered, drop out of it). */
  const chosen = selected.filter((id) => table?.stacks.some((s) => s.id === id));
  /** The group let go: each stack moved as far as the finger went (and snapped to the grid, if it's on). */
  const dropGroup = (by: { x: number; y: number }) => {
    setGroupMoving(false);
    setGroupShift(null);
    setGroupInHand(null);
    setFlyers([]);
    setPileFlights([]);
    const turn = gestureState.get().groupAngle;
    // Nothing left to move (e.g. trashed mid-drag), or not moved at all.
    if (!table || !chosen.length || (!by.x && !by.y && !turn)) return;
    // Dropped on a bag: all of it (cards and pieces picked out) into it.
    const grab = gestureState.get().groupFrom;
    const over = turn ? null : bagAt(table, grab.x + by.x, grab.y + by.y, pickedPieces);
    if (over) {
      const cardsIn = chosen.flatMap((id) => table.stacks.find((s) => s.id === id && !staysPut(table, s))?.cards ?? []);
      const piecesIn = (table.pieces ?? []).filter((p) => pickedPieces.includes(p.id) && p.id !== over.id && !staysPut(table, p));
      const lockedOut = new Set(table.stacks.filter((s) => staysPut(table, s)).map((s) => s.id));
      return dropIntoBag(over.id, [...cardsIn.map((card) => ({ card })), ...piecesIn.map((piece) => ({ piece }))], {
        ...table,
        stacks: table.stacks.filter((s) => !chosen.includes(s.id) || lockedOut.has(s.id)),
        pieces: (table.pieces ?? []).filter((p) => !piecesIn.includes(p)),
      });
    }
    const place = gridOn ? (p: { x: number; y: number; angle: number }) => snapToGrid(p, gridStep) : undefined;
    // Each settled in any card spot, or zone that lines up cards, it's let go in.
    const moved = settleStacks(turn ? rotateStacks(table, chosen, gestureState.get().groupFrom, turn, by, place) : moveStacks(table, chosen, by, place), chosen, size);
    // Counters and dice picked out with them come too (as far as the finger went).
    commit(pickedPieces.length && (by.x || by.y) ? movePieces(moved, pickedPieces, by) : moved);
    tourEvent('tables-moved');
    haptics.drop();
  };
  /**
   * The group crossing into the hand (`into`) or back out over the table: each of its cards flies between where it
   * lies in the group (on screen: at table size, at its angle) and the pile under the finger (hand size, upright).
   */
  const flyPile = (into: boolean, finger: { x: number; y: number }) => {
    if (!table) return;
    // Both ends move with the finger as they fly (see PileFlyer), so only where each lies in the group is fixed.
    void finger;
    const flights = table.stacks
      .filter((s) => chosen.includes(s.id))
      .map((s): PileFlight => {
        const top = s.cards[s.cards.length - 1];
        return { key: newId(), card: top, at: { x: s.x, y: s.y, angle: s.angle }, handScale: handScaleOf(top), into };
      });
    setPileFlights(flights);
    haptics.lift();
  };
  /** The size a group gathered over the hand is drawn at: its grabbed stack's top card at hand size. */
  const groupHandScale = (lead: string) => {
    const s = table?.stacks.find((st) => st.id === lead);
    return s ? handScaleOf(s.cards[s.cards.length - 1]) : cameraZoom(readCamera());
  };
  /**
   * The group let go over the hand: all its cards go in, where the gap is, the grabbed stack's first (each
   * stack's top card first), then the others'. They leave the table, and the selection with them.
   */
  const groupToHand = (at: number) => {
    setGroupMoving(false);
    setGroupShift(null);
    setGroupInHand(null);
    setFlyers([]);
    setPileFlights([]);
    if (!table) return;
    const lead = gestureState.get().groupLead;
    const leader = table.stacks.find((s) => s.id === lead);
    const others = table.stacks.filter((s) => chosen.includes(s.id) && s.id !== lead);
    const cards = [...(leader ? [...leader.cards].reverse() : []), ...others.flatMap((s) => [...s.cards].reverse())];
    const rest = { ...table, stacks: table.stacks.filter((s) => !chosen.includes(s.id)) };
    commit(putInHand(rest, cards, handIndex, at));
    tourEvent('tables-to-hand');
    setSelected([]);
    haptics.drop();
  };
  /** The flip button, for the selection: each of its stacks turned over where it lies (one alone joins the stack it lies on, if it now faces the same way). */
  const flipGroup = () => {
    if (!table) return;
    const flipped = chosen.reduce((t, id) => flipStack(t, id), table);
    commit(chosen.length === 1 && !groupMoving ? settleOnto(flipped, chosen[0]) : flipped);
    haptics.tick();
  };
  /** The trash button, for the selection: all of it off the table (undo brings it back). */
  const trashSelection = () => {
    if (!table || !chosen.length) return;
    commit(removeStacks(table, chosen));
    setSelected([]);
    haptics.drop();
  };
  // With anything picked out (and nothing carried), its buttons stand in a column up from the corner, from the bottom:
  // for cards, flip, shuffle (when a picked-out stack has cards to shuffle) and gather (two or more); for dice (or
  // coins, or spinners) alone, roll; with two or more things, grid (laid out evenly); and on top, ••• (everything
  // else, as a hold on them gives).
  /** The button `n` places above the corner's (the flip one's). */
  const slot = (n: number) => ({ x: flipButton.x, y: flipButton.y - n * (FLIP_SIZE + 12), size: FLIP_SIZE });
  /** A picked-out stack has two or more cards: the shuffle button shows. */
  const canShuffle = chosen.some((id) => (table?.stacks.find((s) => s.id === id)?.cards.length ?? 0) > 1);
  /** Two or more things picked out: the grid button lays them out (one alone has nothing to line up with). */
  const gridLive = chosen.length + pickedPieces.length > 1;
  const column: ColumnButton[] = [
    ...(chosen.length ? (['flip'] as const) : []),
    ...(canShuffle ? (['shuffle'] as const) : []),
    ...(chosen.length > 1 ? (['gather'] as const) : []),
    ...(rollKind ? (['roll'] as const) : []),
    ...(gridLive ? (['grid'] as const) : []),
    ...(chosen.length || pickedPieces.length ? (['more'] as const) : []),
  ];
  /** Where a button of the column stands (one not in it, as dice dragged have their roll one: just above it). */
  const slotOf = (b: ColumnButton) => slot(column.includes(b) ? column.indexOf(b) : column.length);
  const shuffleButton = slotOf('shuffle');
  /** The gather button, as it stands while the cards are just picked out (while they're dragged, see `stackButton`). */
  const gatherButton = slotOf('gather');
  const moreButton = slotOf('more');
  const buttonsLive = !held && !groupMoving && !toolsOpen;
  /** Which of the selection's buttons is at a point on screen, if any (while nothing's carried). */
  const selectionButtonAt = (x: number, y: number): 'flip' | 'shuffle' | 'gather' | 'more' | null => {
    const on = (b: { x: number; y: number; size: number }) => Math.hypot(x - (b.x + b.size / 2), y - (b.y + b.size / 2)) <= b.size / 2 + 8;
    // Not while the tools are out: they lie over the buttons, which wait, dimmed.
    if (!buttonsLive) return null;
    if (chosen.length && on(flipButton)) return 'flip';
    if (canShuffle && on(shuffleButton)) return 'shuffle';
    if (chosen.length > 1 && on(gatherButton)) return 'gather';
    if (column.includes('more') && on(moreButton)) return 'more';
    return null;
  };
  const rollButton = slotOf('roll');
  const gridButton = slotOf('grid');
  const onButton = (b: { x: number; y: number }, x: number, y: number) => Math.hypot(x - (b.x + FLIP_SIZE / 2), y - (b.y + FLIP_SIZE / 2)) <= FLIP_SIZE / 2 + 8;
  const onRollButton = (x: number, y: number) => !!rollKind && buttonsLive && onButton(rollButton, x, y);
  const onGridButton = (x: number, y: number) => gridLive && buttonsLive && onButton(gridButton, x, y);
  /** The roll button, while dice are dragged, under another finger (see dragRollKind). */
  const onDragRollButton = (x: number, y: number) => !!dragRollKind && !toolsOpen && onButton(rollButton, x, y);
  /** Stacks shuffled where they lie (one undo), the riffle played on each. */
  const shuffleStacks = (ids: string[]) => {
    if (!table) return;
    const stacks = ids.filter((id) => (table.stacks.find((s) => s.id === id)?.cards.length ?? 0) > 1);
    if (!stacks.length) return;
    commit(stacks.reduce((t, id) => shuffleStack(t, id), table));
    setRiffling((r) => ({ stackIds: stacks, key: (r?.key ?? 0) + 1, started: false }));
  };
  /** The shuffle button: every picked-out stack shuffled. */
  const shuffleSelection = () => shuffleStacks(chosen);
  /**
   * The stack button, while a group is dragged: all of it gathered into one stack where the grabbed one lies, every
   * card facing the way the grabbed one does. It stays picked out (and in hand), as the one new stack.
   */
  const gatherGroup = (lead: string) => {
    if (!table || chosen.length < 2) return undefined;
    const id = newId();
    const leader = table.stacks.find((s) => s.id === lead);
    if (!leader) return undefined;
    const face = leader.cards[leader.cards.length - 1].faceUp;
    // The others fly to it: each from where it lay (relative to it, as they all move together), turning to its
    // angle, and over to its face if need be.
    setFlyers(
      table.stacks
        .filter((s) => chosen.includes(s.id) && s.id !== lead)
        .map((s) => ({
          key: newId(),
          card: s.cards[s.cards.length - 1],
          at: { x: leader.x, y: leader.y, angle: leader.angle },
          from: { dx: s.x - leader.x, dy: s.y - leader.y, angle: s.angle },
          face,
        })),
    );
    commit(gatherStacks(table, chosen, lead, id));
    setSelected([id]);
    gestureState.get().groupLead = id;
    haptics.lift();
    return id;
  };
  /** How much a card's table size is scaled to show it at its size in the hand. */
  const handScaleOf = (c: SandboxCard) => handWidthOf(c) / cardSizeOf(c, size).w;
  /** Where in the row (of cards not carried) cards dropped with their middle at a point on screen would go. */
  const handInsertAt = (x: number) => {
    // Before the first card whose middle (as the row is without the gap) lies past the point.
    const at = x - trayLeft + handScroll.get();
    let edge = handPadL;
    for (let k = 0; k < rowWidths.length; k++) {
      if (edge + rowWidths[k] / 2 > at) return k;
      edge += rowWidths[k] + HAND_GAP;
    }
    return rowWidths.length;
  };

  // ---- Touches: one handler for the table and the hand, so cards can be carried between them. ----
  // Everything it needs that changes from render to render, read when it's needed.
  const [latest] = useState(() => {
    const box = {} as {
      table: SandboxTable | undefined;
      size: CardSize;
      handTop: number;
      inTray: (x: number, y: number) => boolean;
      trayLeft: number;
      trayW: number;
      hand: SandboxCard[];
      handIndex: number;
      handCardAt: (x: number, y: number) => number;
      maxHandScroll: number;
      gridOn: boolean;
      gridStep: number;
      setGroupInHand: (lead: string | null) => void;
      flyPile: (into: boolean, finger: { x: number; y: number }) => void;
      groupToHand: (at: number) => void;
      groupHandScale: (lead: string) => number;
      handScaleOf: (c: SandboxCard) => number;
      selected: string[];
      setSelected: (ids: string[]) => void;
      setLassoPath: (p: { x: number; y: number }[] | null) => void;
      setGroupMoving: (moving: boolean) => void;
      stackButton: { x: number; y: number; size: number };
      moreButton: { x: number; y: number; size: number };
      dropGroup: (by: { x: number; y: number }) => void;
      flipGroup: () => void;
      trashSelection: () => void;
      selectionButtonAt: (x: number, y: number) => 'flip' | 'shuffle' | 'gather' | 'more' | null;
      shuffleSelection: () => void;
      gatherGroup: (lead: string) => string | undefined;
      flipFromTap: (src: Source) => void;
      cameraLocked: boolean;
      toolsOpen: boolean;
      showTools: (open: boolean) => void;
      fitAll: () => void;
      setHandGap: (g: number | null) => void;
      handInsertAt: (x: number) => number;
      flipButton: { x: number; y: number; size: number };
      commit: (t: SandboxTable) => void;
      saveCamera: () => void;
      setHeld: (h: Held | null) => void;
      setTarget: (id: string | null) => void;
      setMenu: (m: Menu) => void;
      searchFrom: string | null;
      endSearch: () => void;
      tapPiece: (id: string, part: PiecePart, at?: { x: number; y: number }) => void;
      pickedDice: string[];
      pickedRollables: string[];
      pickedPieces: string[];
      setPickedPieces: (ids: string[]) => void;
      onRollButton: (x: number, y: number) => boolean;
      onDragRollButton: (x: number, y: number) => boolean;
      rollDice: (ids: string[]) => void;
      setPieceDrag: (d: PieceDrag | null) => void;
      setGroupShift: (d: { dx: number; dy: number } | null) => void;
      dropPieces: (d: PieceDrag) => void;
      onGridButton: (x: number, y: number) => boolean;
      gridPicked: () => void;
      addPieceToTable: (kind: PieceKind, sides?: number, shape?: PieceShape, extra?: Partial<TablePiece>) => void;
      setZoneSize: (z: { id: string; w: number; h: number } | null) => void;
      openAddAt: (at: { x: number; y: number }) => void;
      dropIntoBag: (bagId: string, items: BagItem[], without: SandboxTable) => void;
      dropZoneSize: () => void;
      setScoreScroll: (s: { id: string; scroll: number } | null) => void;
      dropScoreScroll: () => void;
      openPro: () => void;
      zoomTo: (target: ZoomTarget) => void;
    };
    return { set: (next: typeof box) => Object.assign(box, next), get: () => box };
  });
  latest.set({ table, size, handTop, inTray, trayLeft, trayW, hand, handIndex, handCardAt, handInsertAt, maxHandScroll, gridOn, gridStep, setGroupInHand, flyPile, groupToHand, groupHandScale, handScaleOf, selected: chosen, setSelected: selectStacks, setLassoPath, setGroupMoving, stackButton, moreButton, dropGroup, flipGroup, trashSelection, selectionButtonAt, shuffleSelection, gatherGroup, flipFromTap, cameraLocked: !!table?.lockCamera, toolsOpen, showTools, fitAll: () => table && fitView(table), setHandGap: changeGap, flipButton, commit, saveCamera, setHeld, setTarget, setMenu, searchFrom: searching, endSearch, setGroupShift, addPieceToTable, openAddAt: (at) => { setAddAt(at); setMenu({ kind: 'components' }); }, dropIntoBag, setZoneSize, dropZoneSize, setScoreScroll, dropScoreScroll, tapPiece, setPieceDrag, dropPieces, onGridButton, gridPicked, pickedDice, pickedRollables, pickedPieces, setPickedPieces, onRollButton, onDragRollButton, rollDice, openPro, zoomTo: (t) => zoomToTarget(t) });

  // The gesture in progress (never drawn from, so kept outside React state).
  const [gestureState] = useState(() => {
    type Pt = { x: number; y: number };
    const s = {
      mode: 'none' as 'none' | 'camera' | 'press' | 'carry' | 'handPress' | 'lasso' | 'group' | 'button' | 'piece' | 'zoneResize' | 'scoreScroll',
      /** A zone (or score pad) being resized by its grip: where the finger landed (on the table), and its own size and scale then. */
      zone: null as null | { id: string; from: Pt; size: { w: number; h: number }; scale: number },
      /**
       * A score pad's rows being scrolled: where the finger landed (on screen), how far back it was scrolled then, how
       * far back it can go, and how tall a row is on screen.
       */
      scroll: null as null | { id: string; fromY: number; base: number; most: number; rowPx: number },
      /** The counter or die pressed: which part, where it lay and where the finger landed (on the table), and whether it's been dragged. */
      piece: null as null | {
        id: string;
        part: PiecePart;
        group: string[];
        from: Pt;
        moved: boolean;
        /** A bag held a moment: a drag moves the bag itself, not the top thing out of it. */
        whole?: boolean;
        /** A piece just taken out of a bag (see PieceDrag). */
        out?: { bagId: string; piece: TablePiece };
        /** Custom art being twisted by a second finger (which, the fingers' angle then, its turn then), and its turn now. */
        twist?: { id: number; from: number; base: number } | null;
        turn?: number;
      },
      /** Waiting to see if a press on a stack is held (the whole stack comes) rather than dragged (its top card). */
      holdTimer: null as null | ReturnType<typeof setTimeout>,
      /** This touch can't be a hold on the table any more: a second finger came down, or the first moved. */
      holdSpoiled: false,
      /** The press is on a selected stack: a drag moves the whole group. */
      groupPress: false,
      /** The press picked out a group just now (it wasn't): a tap on it leaves it picked out, rather than opening its options. */
      groupFresh: false,
      /** Where the group's drag started on the table, and the stack it was grabbed by. */
      groupFrom: { x: 0, y: 0 },
      groupLead: '',
      /** The group's finger is over the hand (the group shows gathered there). */
      groupOverHand: false,
      /** The group's twist so far (degrees), and the second finger twisting it now, if one is. */
      groupTwist: null as null | { id: number; from: number; base: number },
      groupAngle: 0,
      /** The first finger landed on empty table, and when: a quick tap there clears the selection, and a second
       *  tap held down soon after starts a lasso. */
      onEmpty: false,
      firstDownAt: 0,
      /** The last quick tap on empty table (or `locked`, on a locked deck), for a lasso's double tap. */
      emptyTap: null as null | { x: number; y: number; at: number; locked?: boolean },
      /** When the lasso's finger came down: let go at once, unmoved, it was a double tap (a zoom). */
      lassoAt: 0,
      /** The last tap on a zone or something locked: a second soon after on the same zooms onto it. */
      lastPieceTap: null as null | { id: string; at: number },
      /** The lasso's shape so far, on the table and on screen, and the selection it adds to. */
      lassoBase: [] as string[],
      lassoPieceBase: [] as string[],
      /** A tap on empty table clears the selection a moment later, unless it's the first tap of a lasso. */
      clearTimer: null as null | ReturnType<typeof setTimeout>,
      lasso: [] as Pt[],
      lassoScreen: [] as Pt[],
      /** The last tap on a card (to tell a double tap), and the wait before its menu opens. */
      lastTap: null as null | { key: string; at: number },
      tapTimer: null as null | ReturnType<typeof setTimeout>,
      /** When a hand card was pressed (it can't be lifted out for a moment, as in table mode). */
      pressedAt: 0,
      /** The table's own finger handling, for hand cards' touches to feed into once a card is lifted out. */
      api: null as null | {
        down: (f: Finger[]) => void;
        move: (f: Finger[]) => void;
        up: (f: Finger[]) => void;
        cancel: () => void;
        startTakeOut: (at: { x: number; y: number }) => void;
      },
      /** Each finger's start and latest position, by id. */
      fingers: new Map<number, { start: Pt; now: Pt }>(),
      /** The finger that pressed (or carries). */
      first: -1,
      /** The camera as fingers last changed count, and where they were then. */
      camStart: { a: 1, b: 0, tx: 0, ty: 0 } as Camera,
      camFrom: [] as Pt[],
      /** Whether the camera last sat on a quarter turn (for a tick each time it snaps onto one). */
      camSquare: true,
      /** Two fingers came down on the table: when, and how far apart (a quick pinch inward fits all cards in view). */
      pinch: null as { at: number; dist: number } | null,
      /** When two fingers last tapped the table (a second soon after fits everything in view). */
      twoTapAt: 0,
      /** When the first finger of this touch came down (a second within TWO_TOUCH_MS makes it two fingers together). */
      firstAt: 0,
      /** A press on a component picked out with cards: a drag moves them all (as from one of the cards); a tap is the component's. */
      viaPiece: null as null | { id: string; part: PiecePart; at: Pt },
      /** What was pressed: a stack (or its badge), or a hand card. */
      pressed: null as Source | null,
      /** Everything carried: where each came from, and the cards (the pile's bottom first). */
      sources: [] as Source[],
      cards: [] as SandboxCard[],
      /** When each extra finger came down, to tell a tap (picking up another card) from a twist. */
      downAt: new Map<number, number>(),
      /** Fingers pressing the flip button (they don't twist or pick up), and whether what's carried is turned over. */
      buttonFingers: new Set<number>(),
      turnedOver: false,
      /** What's carried was taken out of the search: once it's put down (or the drag's lost), the search closes. */
      fromSearch: false,
      /** Cards put down on the table this visit (for a tip, after a few). */
      drops: 0,
      /** The carried card's middle relative to the carrying finger, and its turn, both on screen. */
      offset: { x: 0, y: 0 },
      screenAngle: 0,
      /** The second finger twisting it: the line between the fingers' angle when it started, and the card's. */
      twist: null as null | { id: number; from: number; angle: number; offset: Pt },
      snapped: false,
      /** The size the carried card is drawn at now (screen points per table unit), to spring to a new one. */
      scaleShown: 0,
    };
    return { get: () => s };
  });

  /** Where the carried card's middle is on screen, and its turn. */
  const carriedPose = () => {
    const touch = gestureState.get();
    const f = touch.fingers.get(touch.first);
    if (!f) return null;
    let { offset } = touch;
    let angle = touch.screenAngle;
    const tw = touch.twist && touch.fingers.get(touch.twist.id);
    if (touch.twist && tw) {
      const delta = fingerAngle(f.now, tw.now) - touch.twist.from;
      angle = touch.twist.angle + delta;
      // Turning about the carrying finger: the card's middle swings round it.
      const r = (delta * Math.PI) / 180;
      const o = touch.twist.offset;
      offset = { x: o.x * Math.cos(r) - o.y * Math.sin(r), y: o.x * Math.sin(r) + o.y * Math.cos(r) };
    }
    // On the table's terms: snapped to its 45° steps when close.
    const camTurn = cameraAngle(readCamera());
    const tableAngle = snapAngle(angle - camTurn);
    return { x: f.now.x + offset.x, y: f.now.y + offset.y, tableAngle, screenAngle: tableAngle + camTurn };
  };

  const showCarried = () => {
    const touch = gestureState.get();
    const p = carriedPose();
    if (!p) return;
    heldX.set(p.x);
    heldY.set(p.y);
    // Over the hand it's a hand card's size; over the table, its size there. It springs between the two.
    {
      const L0 = latest.get();
      const top0 = touch.cards[touch.cards.length - 1];
      const want = top0 && L0.inTray(p.x, p.y) ? L0.handScaleOf(top0) : cameraZoom(readCamera());
      if (want !== touch.scaleShown) {
        heldScale.set(touch.scaleShown ? withSpring(want, { damping: 18, stiffness: 240, mass: 0.6 }) : want);
        touch.scaleShown = want;
      }
    }
    heldAngle.set(p.screenAngle);
    // A tick as it settles onto a 45° step.
    const snapped = Math.abs(p.tableAngle - Math.round(p.tableAngle / 45) * 45) < 1e-6;
    if (snapped && !touch.snapped && touch.twist) haptics.tick();
    touch.snapped = snapped;
    const L = latest.get();
    if (!L.table) return;
    const w = toTable(readCamera(), p.x, p.y);
    const except = touch.sources.find((src) => src.kind === 'stack')?.stackId;
    // Only onto a stack facing the same way as what's carried.
    const face = touch.cards[touch.cards.length - 1]?.faceUp;
    // Cards that never stack go onto nothing.
    const solo = touch.cards.some((c) => c.solo);
    // Looked for on the table as it'll be once they're taken: a card can't go back onto where it alone lay.
    const over = !L.inTray(p.x, p.y) && !solo ? stackTargetAt(takeAll(L.table, touch.sources), w.x, w.y, L.size, except, L.gridOn ? gridStackReach(L.gridStep) : undefined, face) : null;
    L.setTarget(over?.id ?? null);
    // Over the hand: a gap opens where they'd go in, and near either end the row scrolls along.
    if (L.inTray(p.x, p.y)) {
      const along = p.x - L.trayLeft;
      const edge = along < HAND_EDGE ? -1 : along > L.trayW - HAND_EDGE ? 1 : 0;
      if (edge) {
        const x = Math.min(L.maxHandScroll, Math.max(0, handScroll.get() + edge * HAND_EDGE_STEP));
        handScroll.set(x);
        handList.get()?.scrollTo({ x, animated: false });
      }
      L.setHandGap(L.handInsertAt(p.x));
    } else {
      L.setHandGap(null);
    }
  };

  /** Starts carrying what was pressed, from where the finger is now. */
  /** Pressed on a locked stack that's a single card: picking its card up would move the stack, which it mustn't. */
  const lockedAlone = (src: Source | null) => {
    if (!src || (src.kind !== 'top' && src.kind !== 'card')) return false;
    const stack = latest.get().table?.stacks.find((s) => s.id === src.stackId);
    const t = latest.get().table;
    return !!t && staysPut(t, stack) && !!stack && stack.cards.length === 1;
  };
  const pickUp = () => {
    const touch = gestureState.get();
    const L = latest.get();
    const src = touch.pressed;
    const f = touch.fingers.get(touch.first);
    if (!L.table || !src || !f) return;
    const cards = cardsOf(L.table, src);
    if (!cards.length) return;
    // A stack's top card, as that very card (so more can be taken from the same stack after it).
    const exact: Source = src.kind === 'top' ? { kind: 'card', stackId: src.stackId, iid: cards[0].iid } : src;
    const cam = readCamera();
    if (src.kind === 'hand') {
      // From the hand: upright on screen, under the finger (at its hand size while it's still over the hand).
      touch.offset = { x: 0, y: 0 };
      touch.screenAngle = 0;
    } else if (src.kind !== 'bag') {
      const stack = L.table.stacks.find((s) => s.id === src.stackId)!;
      const mid = toScreen(cam, stack.x, stack.y);
      touch.offset = { x: mid.x - f.now.x, y: mid.y - f.now.y };
      touch.screenAngle = stack.angle + cameraAngle(cam);
    }
    touch.scaleShown = 0;
    touch.mode = 'carry';
    touch.snapped = false;
    touch.turnedOver = false;
    touch.buttonFingers.clear();
    touch.sources = [exact];
    touch.cards = cards;
    showCarried();
    L.setHeld({ sources: touch.sources, cards });
    haptics.lift();
  };

  /** Turns over what's carried, like turning a real pile over: its order reverses, and every card flips. */
  const turnOver = () => {
    const touch = gestureState.get();
    const L = latest.get();
    touch.cards = [...touch.cards].reverse().map((c) => ({ ...c, faceUp: !c.faceUp }));
    touch.turnedOver = !touch.turnedOver;
    L.setHeld({ sources: touch.sources, cards: touch.cards });
    haptics.tick();
  };

  /**
   * Another finger tapped while cards are carried: the card under it joins them, on top (the next one down, if
   * that stack's top is already carried). As in the other modes.
   */
  const pickUpMore = (x: number, y: number) => {
    const touch = gestureState.get();
    const L = latest.get();
    if (!L.table) return;
    const carried = new Set(touch.cards.map((c) => c.iid));
    let add: { src: Source; card: SandboxCard } | null = null;
    if (L.inTray(x, y)) {
      const i = L.handCardAt(x, y);
      const c = i >= 0 ? L.hand[i] : null;
      if (c && !carried.has(c.iid)) add = { src: { kind: 'hand', hand: L.handIndex, iid: c.iid }, card: c };
    } else {
      const w = toTable(readCamera(), x, y);
      const hit = stackAt(L.table, w.x, w.y, L.size);
      const c = hit && [...hit.stack.cards].reverse().find((k) => !carried.has(k.iid));
      if (hit && c) add = { src: { kind: 'card', stackId: hit.stack.id, iid: c.iid }, card: c };
      // On iPad, a tap on empty table (no card there, nor a piece): what's carried turns over.
      if (!hit && IS_PAD && !pieceAt(L.table, w.x, w.y)) return turnOver();
    }
    if (!add) return;
    // Only cards facing the same way as what's carried: a pile never mixes the two. Nor is a card that never
    // stacks ever part of a pile.
    const facing = touch.cards[touch.cards.length - 1]?.faceUp;
    if ((facing !== undefined && add.card.faceUp !== facing) || add.card.solo || touch.cards.some((c) => c.solo)) {
      haptics.warn();
      return;
    }
    touch.sources = [...touch.sources, add.src];
    touch.cards = [...touch.cards, add.card];
    L.setHeld({ sources: touch.sources, cards: touch.cards });
    haptics.lift();
  };

  /** Puts the carried cards down where the finger let go: into the hand, onto a stack, or on the table. */
  const putDown = () => {
    const touch = gestureState.get();
    const L = latest.get();
    const { sources, cards, turnedOver } = touch;
    touch.sources = [];
    touch.cards = [];
    const p = carriedPose();
    L.setHeld(null);
    L.setTarget(null);
    L.setHandGap(null);
    if (!L.table || !sources.length || !p || !cards.length) return;
    haptics.drop();
    // Carried by more than one finger, or a whole stack held up: those tips aren't needed now.
    if (sources.length > 1) tipLearned('tables-second-finger');
    if (sources.some((src) => src.kind === 'stack')) tipLearned('tables-hold-stack');
    if (L.inTray(p.x, p.y)) {
      tipLearned('tables-drag-to-hand');
      // The gap's place in the row (which leaves out the carried cards) is their place in the hand once taken.
      const without = takeAll(L.table, sources);
      const at = Math.min(L.handInsertAt(p.x), without.hands[L.handIndex].length);
      L.commit(putInHand(without, cards, L.handIndex, at));
      tourEvent('tables-to-hand');
      offerTipSoon('tables-fold-hand', 700);
      return;
    }
    // After moving a few cards about one at a time: the lasso picks out several at once (nothing on screen shows it).
    offerTipAfterUses('tables-lasso', LASSO_TIP_AFTER, 900);
    const w = toTable(readCamera(), p.x, p.y);
    // Dropped on a bag: into it.
    const bag = bagAt(L.table, w.x, w.y);
    if (bag) return L.dropIntoBag(bag.id, cards.map((card) => ({ card })), takeAll(L.table, sources));
    const whole = sources.find((src) => src.kind === 'stack');
    // Only onto a stack facing the same way.
    const face = cards[cards.length - 1].faceUp;
    let onto = cards.some((c) => c.solo)
      ? null
      : // On the table as it'll be once they're taken: where a card alone lay is nowhere to go back onto (it would
        // land, unsnapped, as if joining it). The rest of a stack it came off still counts.
        stackTargetAt(takeAll(L.table, sources), w.x, w.y, L.size, whole?.kind === 'stack' ? whole.stackId : undefined, L.gridOn ? gridStackReach(L.gridStep) : undefined, face);
    // With snapping on, its middle on the nearest grid crossing.
    const free = { x: w.x, y: w.y, angle: p.tableAngle };
    let at = L.gridOn && !onto ? snapToGrid(free, L.gridStep) : free;
    // Dropped in a card spot: onto what's in it already (facing the same way), or settled in its middle, upright.
    const spot = onto ? null : spotAt(L.table, w.x, w.y);
    if (spot) {
      const there = takeAll(L.table, sources).stacks.find(
        (s) => s.id !== (whole?.kind === 'stack' ? whole.stackId : '') && Math.hypot(s.x - spot.x, s.y - spot.y) < 1 && !s.cards.some((c) => c.solo) && s.cards[s.cards.length - 1].faceUp === face,
      );
      if (there && !cards.some((c) => c.solo)) onto = there;
      else at = { x: spot.x, y: spot.y, angle: 0 };
    } else if (!onto) {
      // Dropped in a zone that lines up cards: in its free place nearest the finger, upright (every place taken,
      // onto the stack in the nearest, if it faces the same way).
      const rest = takeAll(L.table, sources);
      const others = whole?.kind === 'stack' ? { ...rest, stacks: rest.stacks.filter((s) => s.id !== whole.stackId) } : rest;
      const cell = zoneCellAt(others, w.x, w.y, cardSizeOf(cards[cards.length - 1], L.size));
      const joins = cell?.onto && !cards.some((c) => c.solo) && !cell.onto.cards.some((c) => c.solo) && cell.onto.cards[cell.onto.cards.length - 1].faceUp === face;
      if (joins) onto = cell.onto!;
      else if (cell) at = cell.at;
    }
    // A whole stack just moved (and turned), on its own, keeps being itself.
    // Tips, the first times: holding a stack (after taking one card off one), and more fingers (after a few drags).
    const from = sources[0]?.kind === 'card' ? L.table.stacks.find((st) => st.id === (sources[0] as { stackId: string }).stackId) : undefined;
    if (sources.length === 1 && from && from.cards.length > 1) offerTipSoon('tables-hold-stack', 600);
    touch.drops += 1;
    if (touch.drops === 4) offerTipSoon('tables-second-finger', 600);
    // For the walkthrough (a whole stack first, so one drop never counts for two of its steps).
    if (whole?.kind === 'stack') tourEvent('tables-lifted');
    tourEvent('tables-moved');
    if (whole?.kind === 'stack' && sources.length === 1 && !onto && !turnedOver) {
      return L.commit(raise(placeStack(L.table, whole.stackId, at), whole.stackId));
    }
    L.commit(putOnTable(takeAll(L.table, sources), cards, at, newId(), onto));
  };

  // Where the hand tabs and the open tray are on screen: touches starting there are left to them (the tabs are
  // buttons; the tray has table mode's scroll view and card handling). Read by the gesture, on the UI thread.
  const tabBand = useSharedValue({ top: 0, bottom: 0, tray: 0, trayLeft: 0, trayRight: 0, toolsLeft: 0, toolsRight: 0, toolsTop: 0, toolsBottom: 0, panel: false });
  useEffect(() => {
    const right = toolsSpot.side === 'right';
    // From the screen's edge to the tab's inner edge.
    const reach = toolsOpen ? TOOLS_W + TOOLS_TAB_W : TOOLS_TAB_W;
    const w = area.w || screenW;
    tabBand.set({
      top: trayGone ? Number.MAX_VALUE : handTop - HAND_TAB_H,
      bottom: trayGone ? Number.MAX_VALUE : handTop,
      tray: folded || trayGone ? Number.MAX_VALUE : handTop,
      // Across: the tray's width (narrower than the screen on an iPhone turned on its side).
      trayLeft,
      trayRight: trayLeft + trayW,
      // The tools drawer, on its edge: just its tab while it's tucked away, the whole panel when it's out. Dropped
      // from the top instead (a sideways iPhone): the panel while it's down, and nowhere while it's put away.
      toolsLeft: sideways ? insets.left : right ? w - reach : 0,
      toolsRight: sideways ? insets.left + TOOLS_W_SIDEWAYS : right ? w : reach,
      toolsTop: toolsOpen ? (sideways ? barBottom : toolsTop) : sideways ? -1 : tabY,
      toolsBottom: toolsOpen ? (sideways ? barBottom + sideToolsH : toolsTop + toolsH) : sideways ? -1 : tabY + TOOLS_TAB_H,
      // The search, over everything while it's open (and not on its way out): its touches are its own.
      panel: !!searching && !searchLeaving,
    });
  }, [handTop, folded, trayGone, trayLeft, trayW, sideways, barBottom, toolsOpen, toolsTop, toolsH, sideToolsH, insets.left, tabY, toolsSpot, area.w, screenW, tabBand, searching, searchLeaving]);
  /** A touch that landed in the open tray, watched (but not yet claimed) to see if it lifts a card out. */
  const trayTouch = useSharedValue({ id: -1, x: 0, y: 0, t: 0, watching: false, panel: false });
  /** Cards taken out of the search: the next move, the finger nearest this point (on screen) carries them on the table. */
  const takeOut = useSharedValue({ active: false, x: 0, y: 0 });

  const [gesture] = useState(() => {
    const touch = gestureState.get();
    type Touch = { id: number; x: number; y: number };
    // What the table does with fingers, on the JS thread (where its state is). The gesture itself, on the UI
    // thread, just claims the touches (or leaves them to the hand tabs) and passes them on.
    /** The selected stacks start moving together, grabbed by the pressed one. */
    const startGroup = () => {
      const L = latest.get();
      const f = touch.fingers.get(touch.first);
      if (!f || !touch.pressed || touch.pressed.kind === 'hand' || touch.pressed.kind === 'bag') return;
      touch.mode = 'group';
      touch.groupFrom = toTable(readCamera(), f.start.x, f.start.y);
      touch.groupLead = touch.pressed.stackId;
      touch.groupOverHand = false;
      touch.groupTwist = null;
      touch.groupAngle = 0;
      groupDX.set(0);
      groupDY.set(0);
      groupTurn.set(0);
      groupPX.set(touch.groupFrom.x);
      groupPY.set(touch.groupFrom.y);
      L.setGroupMoving(true);
      haptics.lift();
    };
    const clearHold = () => {
      if (touch.holdTimer) clearTimeout(touch.holdTimer);
      touch.holdTimer = null;
    };
    /**
     * The options of what's picked out: the group's (Selected) only for more than one thing. One card or piece
     * gets its own menu, as a second tap on it does (and its selection lets go, as that does).
     */
    const openPickedMenu = () => {
      const L = latest.get();
      if (L.selected.length + L.pickedPieces.length === 1) {
        if (L.selected.length) {
          const id = L.selected[0];
          L.setSelected([]);
          L.setMenu({ kind: 'stack', id });
        } else {
          L.setMenu({ kind: 'piece', id: L.pickedPieces[0] });
        }
        return;
      }
      L.setMenu({ kind: 'selection' });
    };
    /** A finger down on a piece (or an unlocked zone): a tap uses it, a drag moves it (and any picked out with it), a hold gives its options. */
    const pressPiece = (pressed: string, part: PiecePart, w: { x: number; y: number }) => {
      const L = latest.get();
      // One in a group (see groupItems), not yet picked out: its group's picked out, and goes with it as one (a tap
      // just picks it out).
      // (A locked group stays where it is, picked out or not: its piece is pressed as any locked one is, on its own.)
      const found = groupMembers(L.table!, pressed);
      const lockedGroup = !!found?.locked;
      const members = found && !lockedGroup && !L.pickedPieces.includes(pressed) ? found : null;
      touch.groupFresh = !!members;
      if (members) {
        L.setSelected(members.stackIds);
        L.setPickedPieces(members.pieceIds);
      }
      const selectedNow = members ? members.stackIds : L.selected;
      const pickedNow = members ? members.pieceIds : lockedGroup ? [] : L.pickedPieces;
      // Picked out along with cards: dragged, it all goes (as if from one of the cards); held, the group's options.
      if (pickedNow.includes(pressed) && selectedNow.length) {
        touch.pressed = { kind: 'top', stackId: selectedNow[selectedNow.length - 1] };
        touch.groupPress = true;
        touch.mode = 'press';
        touch.viaPiece = { id: pressed, part, at: w };
        touch.onEmpty = false;
        touch.holdTimer = setTimeout(() => {
          touch.holdTimer = null;
          if (touch.mode !== 'press' || !touch.viaPiece) return;
          touch.mode = 'button';
          touch.viaPiece = null;
          haptics.lift();
          latest.get().setMenu({ kind: 'selection' });
        }, HOLD_PIECE_MS);
        return;
      }
      // Pressing one of the picked-out dice keeps them picked out (a tap rolls them all); anything else lets them go.
      // (A locked group picked out stays picked out.)
      if (!(lockedGroup && L.pickedPieces.includes(pressed))) {
        if (L.selected.length && !pickedNow.includes(pressed)) L.setSelected([]);
        else if (L.pickedPieces.length && !pickedNow.includes(pressed)) L.setPickedPieces([]);
      }
      // One of several picked out: a drag takes them all.
      const group = pickedNow.includes(pressed) && pickedNow.length > 1 ? pickedNow : [pressed];
      touch.piece = { id: pressed, part, group, from: w, moved: false };
      touch.mode = 'piece';
      touch.onEmpty = false;
      touch.holdTimer = setTimeout(() => {
        touch.holdTimer = null;
        if (touch.mode !== 'piece' || touch.piece?.id !== pressed || touch.piece.moved) return;
        // A bag on its own, held: as a stack held, a drag now moves the whole of it (let go still, its options).
        const held = latest.get();
        if (touch.piece.group.length === 1 && held.table?.pieces?.find((p) => p.id === pressed)?.kind === 'bag') {
          touch.piece.whole = true;
          haptics.lift();
          return;
        }
        touch.mode = 'button';
        touch.piece = null;
        haptics.lift();
        // One of several picked out: the group's options. Otherwise its own.
        const now = latest.get();
        const many = now.pickedPieces.includes(pressed) && now.pickedPieces.length + now.selected.length > 1;
        now.setMenu(many ? { kind: 'selection' } : { kind: 'piece', id: pressed });
      }, HOLD_PIECE_MS);
    };
    /**
     * The top thing out of a bag (a fresh one, from a supply), under the finger: a card carried as one off a stack
     * is; a piece dragged as a piece is (it's on the table once it's put down).
     */
    const pullFromBag = (bag: TablePiece, at: { x: number; y: number }) => {
      const L = latest.get();
      const items = bagItems(bag);
      const top = bag.supply ?? items[items.length - 1];
      if (!top) return;
      const id = newId();
      const item: BagItem = bag.supply ? (top.card ? { card: { ...top.card, iid: id } } : { piece: { ...top.piece!, id } }) : top;
      const w = toTable(readCamera(), at.x, at.y);
      haptics.lift();
      if (item.card) {
        touch.piece = null;
        touch.mode = 'carry';
        touch.sources = [{ kind: 'bag', bagId: bag.id, iid: item.card.iid }];
        touch.cards = [item.card];
        // Upright on the table, its middle under the finger.
        touch.offset = { x: 0, y: 0 };
        touch.screenAngle = cameraAngle(readCamera());
        touch.scaleShown = 0;
        touch.snapped = false;
        touch.turnedOver = false;
        touch.twist = null;
        touch.buttonFingers.clear();
        L.setHeld({ sources: touch.sources, cards: touch.cards });
        showCarried();
        return;
      }
      const piece = { ...item.piece!, x: w.x, y: w.y };
      const out = { bagId: bag.id, piece };
      touch.piece = { id: piece.id, part: 'body', group: [piece.id], from: w, moved: true, out };
      L.setPieceDrag({ lead: piece.id, ids: [piece.id], dx: 0, dy: 0, out });
    };
    /** A locked zone (or card spot) under a finger: the table works as ever, and held still, its options. */
    const holdZone = (held: string) => {
      touch.holdTimer = setTimeout(() => {
        touch.holdTimer = null;
        const f = touch.fingers.get(touch.first);
        if (touch.holdSpoiled || touch.fingers.size !== 1 || !f || Math.hypot(f.now.x - f.start.x, f.now.y - f.start.y) > TAP_SLOP) return;
        if (touch.mode !== 'none' && touch.mode !== 'camera') return;
        touch.mode = 'button';
        touch.onEmpty = false;
        haptics.lift();
        latest.get().setMenu({ kind: 'piece', id: held });
      }, HOLD_PIECE_MS);
    };
    /**
     * The second tap of a double tap on the table (or on something locked: a board, a locked deck), held down: a
     * lasso, drawn round what's to be picked out. Whether it's started one.
     */
    const lassoFromTap = (t: Touch, w: { x: number; y: number }) => {
      const L = latest.get();
      const now = Date.now();
      const e = touch.emptyTap;
      touch.emptyTap = null;
      if (!e || now - e.at >= LASSO_TAP_MS || Math.hypot(t.x - e.x, t.y - e.y) >= LASSO_TAP_REACH) return false;
      // The tap before it was the first of the double tap, not one to clear the selection (or to pick out the locked
      // deck tapped): the lasso adds to it.
      if (touch.clearTimer) clearTimeout(touch.clearTimer);
      touch.clearTimer = null;
      if (touch.tapTimer) clearTimeout(touch.tapTimer);
      touch.tapTimer = null;
      touch.lastTap = null;
      clearHold();
      touch.mode = 'lasso';
      touch.lassoAt = now;
      touch.lasso = [w];
      touch.lassoScreen = [{ x: t.x, y: t.y }];
      const locked = new Set(L.table?.stacks.filter((s) => s.locked).map((s) => s.id));
      touch.lassoBase = L.selected.filter((id) => !locked.has(id));
      touch.lassoPieceBase = L.pickedPieces;
      L.setLassoPath(touch.lassoScreen);
      haptics.lift();
      tipLearned('tables-lasso');
      return true;
    };
    const down = (changed: Touch[], fresh = false) => {
      // The first finger of a new touch: anything left of the last one is let go first. (Its end doesn't always come:
      // a menu opened over the table while a finger was still down, say. Left, it took this finger for a second one.)
      if (fresh && (touch.mode !== 'none' || touch.fingers.size)) cancel();
      const L = latest.get();
      // A touch on the table tucks the tools away, and does nothing else (a selection stays picked out).
      if (L.toolsOpen && touch.mode === 'none') {
        L.showTools(false);
        for (const t of changed) touch.fingers.set(t.id, { start: { x: t.x, y: t.y }, now: { x: t.x, y: t.y } });
        touch.mode = 'button';
        return;
      }
      for (const t of changed) touch.fingers.set(t.id, { start: { x: t.x, y: t.y }, now: { x: t.x, y: t.y } });
      // A pinch is never a hold, even once one finger's lifted.
      if (touch.fingers.size > 1) touch.holdSpoiled = true;
      const pts = [...touch.fingers.values()].map((f) => f.now);
      if (touch.mode === 'none') {
        const t = changed[0];
        // A new touch: any hold left waiting from the last (a quick pan let go) is dropped.
        clearHold();
        touch.holdSpoiled = touch.fingers.size > 1;
        touch.first = t.id;
        touch.viaPiece = null;
        touch.firstAt = Date.now();
        touch.twist = null;
        // On a hand card (its touches come from the card itself, as in table mode): a tap opens its menu, an
        // upward drag lifts it out. Or a card on the table: a tap opens its menu, a drag carries it.
        if (L.inTray(t.x, t.y)) {
          const i = L.handCardAt(t.x, t.y);
          if (i >= 0 && L.selected.length) L.setSelected([]);
          touch.pressed = i >= 0 ? { kind: 'hand', hand: L.handIndex, iid: L.hand[i].iid } : null;
          touch.mode = i >= 0 ? 'handPress' : 'none';
          touch.pressedAt = Date.now();
          return;
        }
        const w = toTable(readCamera(), t.x, t.y);
        // The roll button, while dice are picked out.
        if (L.onRollButton(t.x, t.y)) {
          touch.mode = 'button';
          L.rollDice(L.pickedRollables);
          return;
        }
        // The grid button, while two or more things are picked out: laid out evenly.
        if (L.onGridButton(t.x, t.y)) {
          touch.mode = 'button';
          L.gridPicked();
          return;
        }
        // The selection's buttons (flip, shuffle and gather for cards; ••• for anything picked out).
        if (L.selected.length || L.pickedPieces.length) {
          const b = L.selectionButtonAt(t.x, t.y);
          if (b) {
            touch.mode = 'button';
            if (b === 'flip') {
              L.flipGroup();
              // After a few times: double-tapping a card does this too.
              offerTipAfterUses('tables-double-tap');
            }
            else if (b === 'shuffle') L.shuffleSelection();
            else if (b === 'gather') L.gatherGroup(L.selected[L.selected.length - 1]);
            else openPickedMenu();
            return;
          }
        }
        // A locked deck tapped a moment ago, and again, held: a lasso (as on empty table), whatever's here.
        if (touch.emptyTap?.locked && lassoFromTap(t, w)) return;
        // A counter or die (they lie above every card): a tap counts or rolls, a drag moves it, a hold opens its options.
        // A small piece is easy to get a finger on: caught within a fingertip's reach of it, if nothing else (not a
        // piece, nor a card) is right under the finger.
        // A score pad's corner grip: dragged, it makes the pad taller or shorter (as a zone's resizes it).
        const padGrip = L.table ? scoreGripAt(L.table, w.x, w.y, SCORE_GRIP_REACH / cameraZoom(readCamera())) : null;
        if (padGrip) {
          if (L.selected.length || L.pickedPieces.length) L.setSelected([]);
          touch.zone = { id: padGrip.id, from: w, size: pieceSizeOf({ ...padGrip, scale: 1 }), scale: padGrip.scale ?? 1 };
          touch.mode = 'zoneResize';
          touch.onEmpty = false;
          haptics.lift();
          return;
        }
        const exactly = L.table ? pieceAt(L.table, w.x, w.y) : null;
        const onPiece =
          exactly ?? (L.table && !stackAt(L.table, w.x, w.y, L.size) ? pieceAt(L.table, w.x, w.y, FINGER_REACH / cameraZoom(readCamera())) : null);
        // Custom art lies among the cards: a card over it is what's touched; so is a zone or card spot over it (one
        // that isn't locked: a locked one lets the touch through to the art).
        const overArt =
          onPiece?.piece.kind === 'art' && L.table
            ? (() => {
                const hit = stackAt(L.table, w.x, w.y, L.size);
                if (hit && L.table.stacks.indexOf(hit.stack) > artLevel(L.table, onPiece.piece)) return true;
                const zone = zoneAt(L.table, w.x, w.y, true);
                return !!zone && liesOver(L.table, zone.id, onPiece.piece.id);
              })()
            : false;
        // Locked custom art (a board, say), as a locked zone: the table under it works as ever (a pan, a lasso round
        // what's on it), and a hold still gives its options.
        const lockedArt =
          onPiece && !overArt && onPiece.piece.kind === 'art' && onPiece.piece.locked && !inLiveGroup(L.table!, onPiece.piece)
            ? onPiece.piece
            : null;
        if (onPiece && !overArt && !lockedArt) return pressPiece(onPiece.piece.id, onPiece.part, w);
        if (lockedArt) holdZone(lockedArt.id);
        // A zone's or card spot's name, just outside it: it's held by its name as by itself, however full of cards
        // it is.
        const named = L.table ? labelAt(L.table, w.x, w.y, FINGER_REACH / 2 / cameraZoom(readCamera())) : null;
        if (named && !named.locked) return pressPiece(named.id, 'body', w);
        if (named && !touch.holdTimer) holdZone(named.id);
        const hit = L.table && !named ? stackAt(L.table, w.x, w.y, L.size) : null;
        touch.onEmpty = false;
        if (hit) {
          // A selected stack: dragging it moves the whole group. Any other card lets the selection go; one in a group
          // (see groupItems) picks out its group instead, which it moves with as one.
          // (A locked group stays where it is, picked out or not: its stack's pressed as any locked one is, and a tap
          // picks out its group.)
          const members = groupMembers(L.table!, hit.stack.id);
          const pickedOut = L.selected.includes(hit.stack.id);
          touch.groupPress = pickedOut && !members?.locked;
          touch.groupFresh = false;
          if (members && !members.locked && !pickedOut) {
            L.setSelected(members.stackIds);
            L.setPickedPieces(members.pieceIds);
            touch.groupPress = true;
            touch.groupFresh = true;
          } else if (!touch.groupPress && L.selected.length && !(members?.locked && pickedOut)) L.setSelected([]);
          // A quick drag takes its top card; held a moment first, the whole stack comes (unless it's locked).
          touch.pressed = { kind: 'top', stackId: hit.stack.id };
          touch.mode = 'press';
          if (touch.groupPress) {
            // Held still, one of the picked-out stacks: the group's options.
            touch.holdTimer = setTimeout(() => {
              touch.holdTimer = null;
              if (touch.mode !== 'press' || !touch.groupPress) return;
              touch.mode = 'button';
              touch.lastTap = null;
              haptics.lift();
              openPickedMenu();
            }, HOLD_PIECE_MS);
          } else {
            const pressedStack = hit.stack.id;
            touch.holdTimer = setTimeout(() => {
              touch.holdTimer = null;
              if (touch.mode !== 'press' || touch.pressed?.kind !== 'top' || touch.pressed.stackId !== pressedStack) return;
              const now = latest.get();
              // (Not one locked, or in a locked group: it stays where it is.)
              if (now.table && staysPut(now.table, now.table.stacks.find((s) => s.id === pressedStack))) {
                haptics.warn();
                return;
              }
              touch.pressed = { kind: 'stack', stackId: pressedStack };
              touch.lastTap = null;
              pickUp();
            }, HOLD_STACK_MS);
          }
          return;
        }
        // A zone, painted on the cloth under the cards: its corner grip resizes it; unlocked, it's moved as a piece
        // is; locked, the table under it works as ever (and a hold still gives its options).
        if (L.table) {
          const grip = zoneGripAt(L.table, w.x, w.y, ZONE_GRIP_REACH / cameraZoom(readCamera()));
          if (grip) {
            if (L.selected.length || L.pickedPieces.length) L.setSelected([]);
            touch.zone = { id: grip.id, from: w, size: pieceSizeOf({ ...grip, scale: 1 }), scale: grip.scale ?? 1 };
            touch.mode = 'zoneResize';
            haptics.lift();
            return;
          }
          const zone = zoneAt(L.table, w.x, w.y);
          if (zone && !zone.locked) return pressPiece(zone.id, 'body', w);
          if (zone && !touch.holdTimer) holdZone(zone.id);
        }
        // Empty table. The second tap of a double tap, held down: a lasso, drawn round the cards to pick out.
        const now = Date.now();
        if (lassoFromTap(t, w)) return;
        touch.onEmpty = true;
        touch.firstDownAt = now;
        // Held still on empty table: what can be added, to go right there.
        if (!touch.holdTimer) {
          touch.holdTimer = setTimeout(() => {
            touch.holdTimer = null;
            const f = touch.fingers.get(touch.first);
            if (touch.holdSpoiled || touch.fingers.size !== 1 || !f || Math.hypot(f.now.x - f.start.x, f.now.y - f.start.y) > TAP_SLOP) return;
            if (touch.mode !== 'none' && touch.mode !== 'camera') return;
            touch.mode = 'button';
            touch.onEmpty = false;
            haptics.lift();
            latest.get().openAddAt(w);
          }, HOLD_ADD_MS);
        }
      }
      // Two fingers down together (the second hard on the first), anywhere, even on a card or a component: the
      // table's, for the camera, and a two-finger double tap fits everything in view. (A second finger coming later,
      // on something held, twists it, as ever.)
      if ((touch.mode === 'press' || touch.mode === 'piece') && touch.fingers.size === 2 && Date.now() - touch.firstAt < TWO_TOUCH_MS) {
        clearHold();
        touch.piece = null;
        touch.pressed = null;
        touch.viaPiece = null;
        touch.groupPress = false;
        L.setPieceDrag(null);
        if (L.cameraLocked) {
          touch.mode = 'button';
          return;
        }
        touch.mode = 'camera';
        touch.camStart = readCamera();
        touch.camFrom = pts.slice(0, 2);
        touch.pinch = { at: Date.now(), dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) };
        return;
      }
      // A second finger on custom art or a die being pressed or dragged (alone): it twists it, as a card's is.
      if (touch.mode === 'piece' && touch.piece) {
        const art = L.table?.pieces?.find((p) => p.id === touch.piece!.id && turnsFreely(p) && !staysPut(L.table!, p));
        const first = touch.fingers.get(touch.first);
        const c = changed.find((t) => t.id !== touch.first);
        // On the roll button, as dice are dragged: they're put down where they've got to, and rolled from there.
        if (first && c && touch.piece.moved && L.onDragRollButton(c.x, c.y)) {
          clearHold();
          const pressed = touch.piece;
          const w = toTable(readCamera(), first.now.x, first.now.y);
          L.dropPieces({
            lead: pressed.id,
            ids: pressed.group,
            dx: w.x - pressed.from.x,
            dy: w.y - pressed.from.y,
            ...(pressed.turn !== undefined ? { turn: pressed.turn } : {}),
          });
          touch.piece = null;
          touch.mode = 'button';
          // (Once they're down, from where they lie.)
          setTimeout(() => latest.get().rollDice(pressed.group), 30);
          return;
        }
        if (art && first && c && touch.piece.group.length === 1 && !touch.piece.twist) {
          clearHold();
          touch.piece.twist = { id: c.id, from: fingerAngle(first.now, { x: c.x, y: c.y }), base: touch.piece.turn ?? art.angle ?? 0 };
          touch.piece.moved = true;
        }
        return;
      }
      // Other fingers while a lasso is drawn: ignored.
      if (touch.mode === 'lasso') return;
      // Other fingers while the group is pressed or dragged: the group's buttons (flip, and gather into a stack).
      if (touch.mode === 'group' || (touch.mode === 'press' && touch.groupPress)) {
        if (touch.mode === 'press') {
          clearHold();
          startGroup();
        }
        const on = (c: Touch, b: { x: number; y: number; size: number }) =>
          Math.hypot(c.x - (b.x + b.size / 2), c.y - (b.y + b.size / 2)) <= b.size / 2 + 12;
        for (const c of changed) {
          if (c.id === touch.first) continue;
          if (on(c, L.flipButton)) L.flipGroup();
          else if (on(c, L.stackButton)) L.gatherGroup(touch.groupLead);
          else if (!touch.groupTwist) {
            // Anywhere else, a second finger twists the group round the first.
            const first = touch.fingers.get(touch.first);
            if (first) touch.groupTwist = { id: c.id, from: fingerAngle(first.now, { x: c.x, y: c.y }), base: touch.groupAngle };
          }
        }
        return;
      }
      // Other fingers while the hand is pressed or scrolled: ignored.
      if (touch.mode === 'handPress') return;
      if (touch.mode === 'press' || touch.mode === 'carry') {
        // A second finger while a card is held: it twists the card (not a locked card on its own, which stays put).
        if (touch.mode === 'press') {
          clearHold();
          if (lockedAlone(touch.pressed)) {
            touch.pressed = null;
            touch.mode = 'button';
            return;
          }
          pickUp();
        }
        for (const c of changed) if (c.id !== touch.first) touch.downAt.set(c.id, Date.now());
        // A finger on the flip button turns over what's carried (and does nothing else).
        const b = L.flipButton;
        for (const c of changed) {
          if (c.id === touch.first || Math.hypot(c.x - (b.x + b.size / 2), c.y - (b.y + b.size / 2)) > b.size / 2 + 12) continue;
          touch.buttonFingers.add(c.id);
          turnOver();
        }
        const second = changed.find((c) => c.id !== touch.first && !touch.buttonFingers.has(c.id));
        const firstNow = touch.fingers.get(touch.first)?.now;
        if (second && firstNow && !touch.twist) {
          const p = carriedPose();
          touch.twist = {
            id: second.id,
            from: fingerAngle(firstNow, { x: second.x, y: second.y }),
            angle: p ? p.screenAngle : touch.screenAngle,
            offset: p ? { x: p.x - firstNow.x, y: p.y - firstNow.y } : touch.offset,
          };
        }
        return;
      }
      // With the camera locked, empty table does nothing.
      if (L.cameraLocked) return;
      // Empty table: the camera, slid by one finger, zoomed and turned by two. Restarted from here whenever
      // a finger comes or goes, so nothing jumps.
      touch.mode = 'camera';
      touch.camStart = readCamera();
      touch.camFrom = pts.slice(0, 2);
      // A second finger: perhaps a quick pinch.
      touch.pinch = pts.length === 2 ? { at: Date.now(), dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) } : null;
    };
    const move = (all: Touch[]) => {
      for (const t of all) {
        const f = touch.fingers.get(t.id);
        if (f) f.now = { x: t.x, y: t.y };
      }
      // Moved off where it came down (a pan, even one back again): not a hold.
      const first = touch.fingers.get(touch.first);
      if (first && Math.hypot(first.now.x - first.start.x, first.now.y - first.start.y) > TAP_SLOP) touch.holdSpoiled = true;
      if (touch.mode === 'press') {
        const f = touch.fingers.get(touch.first);
        if (f && Math.hypot(f.now.x - f.start.x, f.now.y - f.start.y) > TAP_SLOP) {
          clearHold();
          if (touch.groupPress) startGroup();
          else if (lockedAlone(touch.pressed)) {
            // A locked card on its own stays put (its card is the whole stack): the drag moves the table instead, as
            // a locked piece's does. (A locked stack of several still gives its top card.)
            touch.pressed = null;
            if (latest.get().cameraLocked) {
              touch.mode = 'button';
              return;
            }
            touch.mode = 'camera';
            touch.camStart = readCamera();
            touch.camFrom = [f.start];
            return move(all);
          } else pickUp();
        }
        return;
      }
      if (touch.mode === 'zoneResize' && touch.zone) {
        const f = touch.fingers.get(touch.first);
        if (!f) return;
        const w = toTable(readCamera(), f.now.x, f.now.y);
        const z = touch.zone;
        latest.get().setZoneSize({ id: z.id, w: z.size.w + (w.x - z.from.x) / z.scale, h: z.size.h + (w.y - z.from.y) / z.scale });
        return;
      }
      if (touch.mode === 'scoreScroll' && touch.scroll) {
        // Dragged down, further back (older points come down into view); up, toward the latest.
        const f = touch.fingers.get(touch.first);
        if (!f) return;
        const s = touch.scroll;
        const scroll = Math.min(s.most, Math.max(0, s.base + Math.round((f.now.y - s.fromY) / s.rowPx)));
        latest.get().setScoreScroll({ id: s.id, scroll });
        return;
      }
      if (touch.mode === 'piece' && touch.piece) {
        // Past a little slop, it follows the finger.
        const f = touch.fingers.get(touch.first);
        if (!f) return;
        if (!touch.piece.moved && Math.hypot(f.now.x - f.start.x, f.now.y - f.start.y) <= TAP_SLOP) return;
        if (!touch.piece.moved) {
          clearHold();
          // Up or down on a score pad's points, when it has more than it shows: they scroll, rather than it moving.
          const pad = latest.get().table?.pieces?.find((p) => p.id === touch.piece!.id && p.kind === 'score');
          if (pad && touch.piece.group.length === 1 && Math.abs(f.now.y - f.start.y) > Math.abs(f.now.x - f.start.x)) {
            const view = scoreWindow(pad);
            if (view.most > 0 && scoreSpotAt(pad, touch.piece.from.x, touch.piece.from.y).area === 'rows') {
              touch.piece = null;
              touch.mode = 'scoreScroll';
              touch.scroll = { id: pad.id, fromY: f.start.y, base: view.scroll, most: view.most, rowPx: SCORE_ROW * (pad.scale ?? 1) * cameraZoom(readCamera()) };
              return move(all);
            }
          }
          // A quick drag from a bag (alone) takes its top thing out, as from a stack; held first, the bag moves.
          const pulled = latest.get().table?.pieces?.find((p) => p.id === touch.piece!.id && p.kind === 'bag');
          if (pulled && !touch.piece.whole && touch.piece.group.length === 1 && (pulled.supply || bagItems(pulled).length)) return pullFromBag(pulled, f.now);
          // A locked piece (on its own, or in a locked group) stays put: the drag moves the table instead.
          const now = latest.get().table;
          const locked = now?.pieces?.find((p) => p.id === touch.piece!.id && staysPut(now, p));
          if (locked && touch.piece.group.length === 1 && touch.piece.group[0] === locked.id) {
            touch.piece = null;
            if (latest.get().cameraLocked) {
              touch.mode = 'button';
              return;
            }
            touch.mode = 'camera';
            touch.camStart = readCamera();
            touch.camFrom = [f.start];
            return move(all);
          }

          touch.piece.moved = true;
          haptics.lift();
        }
        const w = toTable(readCamera(), f.now.x, f.now.y);
        // Twisted by a second finger: turned round with it, settling onto the table's 45° steps when close.
        const tw = touch.piece.twist && touch.fingers.get(touch.piece.twist.id);
        if (touch.piece.twist && tw) {
          const turn = snapAngle(touch.piece.twist.base + fingerAngle(f.now, tw.now) - touch.piece.twist.from);
          if (Math.abs(turn - Math.round(turn / 45) * 45) < 1e-6 && turn !== touch.piece.turn) haptics.tick();
          touch.piece.turn = turn;
        } else if (touch.piece.twist) {
          // Its finger's lifted: the turn stays, and another finger can twist it on from there.
          touch.piece.twist = null;
        }
        const { id, group, from, out, turn } = touch.piece;
        latest.get().setPieceDrag({ lead: id, ids: group, dx: w.x - from.x, dy: w.y - from.y, ...(out ? { out } : {}), ...(turn !== undefined ? { turn } : {}) });
        return;
      }
      if (touch.mode === 'lasso') {
        // The lasso follows the finger; the stacks it goes round light up as it does.
        const f = touch.fingers.get(touch.first);
        const L = latest.get();
        if (!f || !L.table) return;
        const last = touch.lassoScreen[touch.lassoScreen.length - 1];
        if (last && Math.hypot(f.now.x - last.x, f.now.y - last.y) < LASSO_STEP) return;
        // Gone too far and come back the way it came: the line rubs out back to there, letting go of what it caught
        // on the way out (as a pencil line traced back over would be erased).
        const back = lassoRetrace(touch.lassoScreen, f.now);
        const keep = back < 0 ? touch.lasso.length : back + 1;
        touch.lasso = [...touch.lasso.slice(0, keep), toTable(readCamera(), f.now.x, f.now.y)];
        touch.lassoScreen = [...touch.lassoScreen.slice(0, keep), f.now];
        L.setLassoPath(touch.lassoScreen);
        const caught = stacksInShape(L.table, touch.lasso, L.size);
        const picked = [...touch.lassoBase, ...caught.filter((id) => !touch.lassoBase.includes(id))];
        const pieces = [...touch.lassoPieceBase, ...piecesInShape(L.table, touch.lasso).filter((id) => !touch.lassoPieceBase.includes(id))];
        const grew = picked.length > L.selected.length || pieces.length > L.pickedPieces.length;
        if (picked.join() !== L.selected.join()) L.setSelected(picked);
        // Counters and dice too (set after the cards, which let them go when there are none).
        if (picked.join() !== L.selected.join() || pieces.join() !== L.pickedPieces.join()) L.setPickedPieces(pieces);
        if (grew) haptics.tick();
        return;
      }
      if (touch.mode === 'group') {
        // The whole group follows the finger, across the table.
        const f = touch.fingers.get(touch.first);
        if (!f) return;
        const w = toTable(readCamera(), f.now.x, f.now.y);
        groupDX.set(w.x - touch.groupFrom.x);
        groupDY.set(w.y - touch.groupFrom.y);
        // Counters and dice picked out with them go along (drawn where they've got to).
        if (latest.get().pickedPieces.length) latest.get().setGroupShift({ dx: w.x - touch.groupFrom.x, dy: w.y - touch.groupFrom.y });
        // Twisted by a second finger: turned round the first, settling onto the table's 45° steps when close.
        const tw = touch.groupTwist && touch.fingers.get(touch.groupTwist.id);
        if (touch.groupTwist && tw) {
          const turn = snapAngle(touch.groupTwist.base + fingerAngle(f.now, tw.now) - touch.groupTwist.from);
          const square = Math.abs(turn - Math.round(turn / 45) * 45) < 1e-6;
          if (square && turn !== touch.groupAngle) haptics.tick();
          touch.groupAngle = turn;
          groupTurn.set(turn);
        }
        // Over the hand, it gathers into one pile under the finger, at hand size, and the hand makes room; back
        // over the table, it spreads out again as it was.
        const L = latest.get();
        const over = L.inTray(f.now.x, f.now.y);
        // Where the pile is (or cards flying out of it set off from), all the way, so flying cards keep up.
        heldX.set(f.now.x);
        heldY.set(f.now.y);
        if (over !== touch.groupOverHand) {
          touch.groupOverHand = over;
          L.setGroupInHand(over ? touch.groupLead : null);
          L.flyPile(over, f.now);
        }
        if (over) {
          heldAngle.set(0);
          heldScale.set(L.groupHandScale(touch.groupLead));
          L.setHandGap(L.handInsertAt(f.now.x));
        } else {
          L.setHandGap(null);
        }
        return;
      }
      if (touch.mode === 'carry') return showCarried();
      if (touch.mode === 'handPress') {
        // As in table mode: past a little slop and a moment's hold, a mostly upward drag lifts the card out;
        // anything else is the hand's scroll view's.
        const f = touch.fingers.get(touch.first);
        if (!f) return;
        const dx = f.now.x - f.start.x;
        const dy = f.now.y - f.start.y;
        if (Math.hypot(dx, dy) < DRAG_SLOP || Date.now() - touch.pressedAt < LIFT_DELAY_MS) return;
        if (touch.pressed && Math.abs(dy) > Math.abs(dx)) return pickUp();
        touch.mode = 'none';
        return;
      }
      if (touch.mode === 'camera') {
        const now = [...touch.fingers.values()].slice(0, 2).map((f) => f.now);
        if (now.length !== touch.camFrom.length) {
          touch.camStart = readCamera();
          touch.camFrom = now;
          return;
        }
        // (Not turned, with the rotation locked.)
        const turns = !latest.get().table?.lockRotation;
        let cam = moveCamera(touch.camStart, touch.camFrom, now, turns);
        // Turned with two fingers, it settles onto quarter turns when close (with a tick as it does).
        if (now.length === 2 && turns) {
          cam = snapCamera(cam, { x: (now[0].x + now[1].x) / 2, y: (now[0].y + now[1].y) / 2 });
          const square = cameraSquare(cam);
          if (square && !touch.camSquare) haptics.tick();
          touch.camSquare = square;
        }
        writeCamera(cam);
      }
    };
    const up = (changed: Touch[]) => {
      const L = latest.get();
      const lifted = changed.map((t) => t.id);
      if (touch.mode === 'lasso' && lifted.includes(touch.first)) {
        L.setLassoPath(null);
        const f = touch.fingers.get(touch.first);
        const doubleTap = !!f && Math.hypot(f.now.x - f.start.x, f.now.y - f.start.y) < TAP_SLOP && Date.now() - touch.lassoAt < TAP_MS;
        if (doubleTap && f && L.table) {
          // Let go at once, unmoved: a double tap, not a lasso. The camera zooms in there, or onto the locked deck,
          // art or zone there (they work as the table under them, so they're found here).
          const w = toTable(readCamera(), f.start.x, f.start.y);
          const deck = stackAt(L.table, w.x, w.y, L.size)?.stack;
          const art = pieceAt(L.table, w.x, w.y)?.piece;
          const zone = zoneAt(L.table, w.x, w.y);
          L.zoomTo(
            deck?.locked
              ? { item: { x: deck.x, y: deck.y, ...cardSizeOf(deck.cards[deck.cards.length - 1], L.size), angle: deck.angle } }
              : art?.kind === 'art' && art.locked
                ? { item: { x: art.x, y: art.y, ...pieceSizeOf(art), angle: turnsFreely(art) ? (art.angle ?? 0) : 0 } }
                : zone
                  ? { item: { x: zone.x, y: zone.y, ...pieceSizeOf(zone), angle: 0 } }
                  : { at: w },
          );
        } else if (L.selected.length) {
          // What it went round stays picked out.
          haptics.drop();
        }
        touch.mode = 'none';
      } else if (touch.mode === 'group') {
        if (touch.groupTwist && lifted.includes(touch.groupTwist.id)) touch.groupTwist = null;
        if (lifted.includes(touch.first)) {
          const f = touch.fingers.get(touch.first);
          L.setHandGap(null);
          if (touch.groupOverHand && f) L.groupToHand(L.handInsertAt(f.now.x));
          else L.dropGroup({ x: groupDX.get(), y: groupDY.get() });
          touch.groupOverHand = false;
          touch.mode = 'none';
        }
      } else if (touch.mode === 'press' && touch.viaPiece && lifted.includes(touch.first)) {
        // A tap on a component picked out with cards: it's the component's (a die rolls the dice, and so on).
        clearHold();
        const { id, part, at } = touch.viaPiece;
        touch.viaPiece = null;
        // (One whose group this press just picked out: that's all the tap does.)
        if (touch.groupFresh) haptics.tick();
        else L.tapPiece(id, part, at);
        touch.groupFresh = false;
        touch.mode = 'none';
      } else if ((touch.mode === 'press' || touch.mode === 'handPress') && lifted.includes(touch.first)) {
        // A tap on a card on the table picks it out (its buttons show); a tap on one already picked out opens its
        // options (and lets the selection go). A hand card's tap opens its options. Each a moment later, in case
        // it's the first of two: a second tap on the same card in that moment flips it instead.
        clearHold();
        const src = touch.pressed;
        // (A group just picked out by this press stays picked out.)
        const wasSelected = touch.groupPress && !touch.groupFresh && touch.mode === 'press';
        if (touch.groupFresh) {
          touch.groupFresh = false;
          haptics.tick();
        } else if (src && src.kind !== 'bag') {
          const key = src.kind === 'hand' ? `h:${src.iid}` : `s:${src.stackId}`;
          const now = Date.now();
          if (touch.lastTap && touch.lastTap.key === key && now - touch.lastTap.at < DOUBLE_TAP_MS) {
            if (touch.tapTimer) clearTimeout(touch.tapTimer);
            touch.tapTimer = null;
            touch.lastTap = null;
            // A locked card or stack: the camera zooms onto it, rather than it turning over.
            const locked = src.kind !== 'hand' ? L.table?.stacks.find((s) => s.id === src.stackId && s.locked) : undefined;
            if (locked) L.zoomTo({ item: { x: locked.x, y: locked.y, ...cardSizeOf(locked.cards[locked.cards.length - 1], L.size), angle: locked.angle } });
            else L.flipFromTap(src);
          } else {
            if (touch.tapTimer) clearTimeout(touch.tapTimer);
            touch.lastTap = { key, at: now };
            // A locked deck (a board, say): it may be the first tap of a lasso's double tap, as on empty table.
            const f = touch.fingers.get(touch.first);
            if (src.kind !== 'hand' && f && L.table?.stacks.some((s) => s.id === src.stackId && s.locked)) {
              touch.emptyTap = { x: f.start.x, y: f.start.y, at: now, locked: true };
            }
            touch.tapTimer = setTimeout(() => {
              touch.tapTimer = null;
              touch.lastTap = null;
              const now = latest.get();
              if (src.kind === 'hand') now.setMenu({ kind: 'hand', hand: src.hand, iid: src.iid });
              else if (wasSelected) {
                now.setSelected([]);
                now.setMenu({ kind: 'stack', id: src.stackId });
                tourEvent('tables-options');
              } else {
                now.setSelected([src.stackId]);
                haptics.tick();
                // A tip, the first time: tapping again opens its options.
                offerTipSoon('tables-tap-twice', 400);
              }
            }, DOUBLE_TAP_MS);
          }
        }
        touch.mode = 'none';
      } else if (touch.mode === 'zoneResize' && lifted.includes(touch.first)) {
        touch.zone = null;
        L.dropZoneSize();
        touch.mode = 'none';
      } else if (touch.mode === 'scoreScroll' && lifted.includes(touch.first)) {
        touch.scroll = null;
        L.dropScoreScroll();
        touch.mode = 'none';
      } else if (touch.mode === 'piece' && lifted.includes(touch.first)) {
        clearHold();
        const pressed = touch.piece;
        const f = touch.fingers.get(touch.first);
        touch.piece = null;
        if (pressed?.moved && f) {
          const w = toTable(readCamera(), f.now.x, f.now.y);
          L.dropPieces({
            lead: pressed.id,
            ids: pressed.group,
            dx: w.x - pressed.from.x,
            dy: w.y - pressed.from.y,
            ...(pressed.out ? { out: pressed.out } : {}),
            ...(pressed.turn !== undefined ? { turn: pressed.turn } : {}),
          });
        } else if (pressed?.whole) {
          // A bag held a moment and let go without moving: its options, as any other piece's held.
          L.setMenu({ kind: 'piece', id: pressed.id });
        } else if (pressed) {
          // A zone, or something locked: tapped twice, the camera zooms onto it (the first tap did as a
          // tap does).
          const now = Date.now();
          const p = L.table?.pieces?.find((q) => q.id === pressed.id);
          const zoomable = !!p && (onCloth(p) || !!p.locked);
          if (p && zoomable && touch.lastPieceTap?.id === p.id && now - touch.lastPieceTap.at < ZOOM_TAP_MS) {
            touch.lastPieceTap = null;
            L.zoomTo({ item: { x: p.x, y: p.y, ...pieceSizeOf(p), angle: turnsFreely(p) ? (p.angle ?? 0) : 0 } });
          } else {
            touch.lastPieceTap = p && zoomable ? { id: p.id, at: now } : null;
            // (One whose group this press just picked out: that's all the tap does.)
            if (touch.groupFresh) haptics.tick();
            else L.tapPiece(pressed.id, pressed.part, pressed.from);
            touch.groupFresh = false;
          }
        }
        touch.mode = 'none';
      } else if (touch.mode === 'carry') {
        if (lifted.includes(touch.first)) {
          putDown();
          touch.mode = 'none';
          if (touch.fromSearch) {
            touch.fromSearch = false;
            L.endSearch();
          }
        } else {
          for (const id of lifted) {
            const f = touch.fingers.get(id);
            const tapped = !!f && Math.hypot(f.now.x - f.start.x, f.now.y - f.start.y) < TAP_SLOP && Date.now() - (touch.downAt.get(id) ?? 0) < EXTRA_TAP_MS;
            if (touch.twist?.id === id) {
              // A tap isn't a turn: the card stays as it was. A twist keeps its new turn, carried on by the first.
              const p = carriedPose();
              const first = touch.fingers.get(touch.first);
              if (tapped) {
                touch.screenAngle = touch.twist.angle;
                touch.offset = touch.twist.offset;
              } else if (p && first) {
                touch.screenAngle = p.screenAngle;
                touch.offset = { x: p.x - first.now.x, y: p.y - first.now.y };
              }
              touch.twist = null;
            }
            if (tapped && f && !touch.buttonFingers.has(id)) pickUpMore(f.start.x, f.start.y);
            touch.buttonFingers.delete(id);
            touch.downAt.delete(id);
          }
          showCarried();
        }
      }
      // A quick tap on empty table: the selection's let go, and it may be the first tap of a lasso's double tap.
      if (touch.onEmpty && lifted.includes(touch.first)) {
        const f = touch.fingers.get(touch.first);
        if (f && Math.hypot(f.now.x - f.start.x, f.now.y - f.start.y) < TAP_SLOP && Date.now() - touch.firstDownAt < TAP_MS) {
          if (L.selected.length || L.pickedPieces.length) {
            if (touch.clearTimer) clearTimeout(touch.clearTimer);
            touch.clearTimer = setTimeout(() => {
              touch.clearTimer = null;
              latest.get().setSelected([]);
            }, LASSO_TAP_MS);
          }
          touch.emptyTap = { x: f.start.x, y: f.start.y, at: Date.now() };
        }
        touch.onEmpty = false;
      }
      // Two fingers tapped on the table (down and up quickly, hardly moving), twice: everything fitted in view, as
      // the tools' Fit All. (Hard to do by accident, as a quick pinch was.)
      if (touch.mode === 'camera' && touch.pinch && touch.fingers.size === 2) {
        const fingers = [...touch.fingers.values()];
        const [a, b] = fingers.map((f) => f.now);
        const tapped =
          Date.now() - touch.pinch.at < TWO_TAP_MS &&
          fingers.every((f) => Math.hypot(f.now.x - f.start.x, f.now.y - f.start.y) < TAP_SLOP * 1.5) &&
          Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - touch.pinch.dist) < TAP_SLOP * 1.5;
        touch.pinch = null;
        if (tapped) {
          const now = Date.now();
          if (now - touch.twoTapAt < TWO_TAP_GAP_MS) {
            touch.twoTapAt = 0;
            L.fitAll();
            tipLearned('tables-quick-pinch');
            for (const id of lifted) touch.fingers.delete(id);
            // The other finger, still down, does nothing more till it's lifted.
            touch.mode = touch.fingers.size ? 'button' : 'none';
            return;
          }
          touch.twoTapAt = now;
        }
      }
      for (const id of lifted) touch.fingers.delete(id);
      if (touch.mode === 'camera') {
        touch.camStart = readCamera();
        touch.camFrom = [...touch.fingers.values()].slice(0, 2).map((f) => f.now);
        if (!touch.fingers.size) {
          L.saveCamera();
          touch.mode = 'none';
        }
      }
      if (!touch.fingers.size) touch.mode = 'none';
    };
    const cancel = () => {
      const L = latest.get();
      clearHold();
      if (touch.fromSearch) {
        touch.fromSearch = false;
        L.endSearch();
      }
      if (touch.mode === 'carry') {
        L.setHeld(null);
        L.setTarget(null);
      }
      if (touch.mode === 'lasso') L.setLassoPath(null);
      if (touch.mode === 'piece') {
        L.setPieceDrag(null);
        touch.piece = null;
      }
      if (touch.mode === 'zoneResize') {
        L.setZoneSize(null);
        touch.zone = null;
      }
      if (touch.mode === 'scoreScroll') {
        L.setScoreScroll(null);
        touch.scroll = null;
      }
      if (touch.mode === 'group') {
        // Back where it was, untwisted.
        touch.groupAngle = 0;
        L.dropGroup({ x: 0, y: 0 });
      }
      touch.sources = [];
      touch.cards = [];
      touch.downAt.clear();
      touch.buttonFingers.clear();
      touch.fingers.clear();
      touch.onEmpty = false;
      L.setHandGap(null);
      touch.mode = 'none';
    };
    touch.api = { down, move, up, cancel, startTakeOut: (at) => startTakeOut(at) };
    /** A hand card lifted out (the gesture has seen a mostly upward drag from where the finger landed). */
    const liftFromHand = (start: Touch, all: Touch[]) => {
      down([start]);
      // Its moment's hold has been had already.
      touch.pressedAt = 0;
      move(all);
    };
    /**
     * Cards taken out of the search (see StackSearchPanel), the finger still on them: from here they're carried
     * over the table, face up, as a pile (the one first held on top), just like cards picked up off it.
     */
    const beginTakeOut = (finger: Touch, all: Touch[]) => {
      const L = latest.get();
      const stack = L.table?.stacks.find((s) => s.id === L.searchFrom);
      const iids = searchTake.get();
      const held = iids.flatMap((iid) => stack?.cards.filter((c) => c.iid === iid) ?? []);
      if (!stack || !held.length) return L.endSearch();
      touch.fingers.clear();
      for (const a of all) touch.fingers.set(a.id, { start: { x: a.x, y: a.y }, now: { x: a.x, y: a.y } });
      touch.first = finger.id;
      touch.twist = null;
      touch.offset = { x: 0, y: 0 };
      touch.screenAngle = 0;
      touch.scaleShown = 0;
      touch.snapped = false;
      touch.turnedOver = false;
      touch.buttonFingers.clear();
      touch.fromSearch = true;
      const carried = [...held].reverse().map((c) => ({ ...c, faceUp: true }));
      touch.sources = carried.map((c) => ({ kind: 'card', stackId: stack.id, iid: c.iid }));
      touch.cards = carried;
      touch.mode = 'carry';
      L.setHeld({ sources: touch.sources, cards: touch.cards });
      haptics.lift();
      move(all);
    };
    /** Cards taken out of the search, shown under the finger at once (till the table knows which finger it is). */
    const startTakeOut = (at: { x: number; y: number }) => {
      const pending = { id: TAKE_OUT_FINGER, x: at.x, y: at.y };
      beginTakeOut(pending, [pending]);
    };
    /** The finger carrying cards taken out of the search, now known to the table: it carries them on. */
    const adoptTakeOut = (finger: Touch, all: Touch[]) => {
      if (touch.mode !== 'carry' || touch.first !== TAKE_OUT_FINGER) return;
      const was = touch.fingers.get(TAKE_OUT_FINGER);
      touch.fingers.clear();
      for (const a of all) touch.fingers.set(a.id, { start: { x: a.x, y: a.y }, now: { x: a.x, y: a.y } });
      touch.fingers.set(finger.id, { start: was?.start ?? { x: finger.x, y: finger.y }, now: { x: finger.x, y: finger.y } });
      touch.first = finger.id;
      move(all);
    };
    /** That finger lifted before it ever moved: the cards are put down where it is. */
    const dropTakeOut = (finger: Touch) => {
      adoptTakeOut(finger, [finger]);
      up([finger]);
    };
    /** A tap in the tray: on a card, its menu (or, a second tap, a flip). */
    const tapInHand = (at: Touch) => {
      down([at]);
      up([at]);
    };
    const points = (ts: Touch[]) => {
      'worklet';
      return ts.map((t) => ({ id: t.id, x: t.x, y: t.y }));
    };
    return Gesture.Manual()
      .onTouchesDown((e, manager) => {
        // A first finger on the hand tabs: theirs (they're buttons), not the table's.
        const t0 = e.changedTouches[0];
        const band = tabBand.value;
        const firstFinger = e.allTouches.length === e.changedTouches.length;
        // The search open: its touches are its own, but watched (not claimed), in case cards are taken out of it.
        if (band.panel && firstFinger && t0) {
          trayTouch.set({ id: t0.id, x: t0.x, y: t0.y, t: Date.now(), watching: true, panel: true });
          return;
        }
        const onTools = !!t0 && t0.x >= band.toolsLeft && t0.x < band.toolsRight && t0.y >= band.toolsTop && t0.y < band.toolsBottom;
        const acrossTray = !!t0 && t0.x >= band.trayLeft && t0.x <= band.trayRight;
        if (firstFinger && t0 && ((acrossTray && t0.y >= band.top && t0.y < band.bottom) || onTools)) {
          manager.fail();
          return;
        }
        // A first finger in the open tray is watched but not claimed, so the hand's scroll view (table mode's) can
        // still scroll. As in table mode, past a little slop and a moment's hold, a mostly upward drag from a card
        // lifts it out: then the touch is claimed, and every finger is tracked here, as for the table. A sideways
        // one is left to the scroll view; a tap opens the card's menu.
        if (firstFinger) {
          if (t0 && acrossTray && t0.y >= band.tray) {
            trayTouch.set({ id: t0.id, x: t0.x, y: t0.y, t: Date.now(), watching: true, panel: false });
            return;
          }
          trayTouch.set({ id: -1, x: 0, y: 0, t: 0, watching: false, panel: false });
        }
        // Other fingers while a tray touch is only watched: ignored.
        if (trayTouch.get().watching) return;
        manager.activate();
        scheduleOnRN(down, points(e.changedTouches), firstFinger);
      })
      .onTouchesMove((e, manager) => {
        const tt = trayTouch.get();
        if (tt.watching && tt.panel) {
          // Cards taken out of the search: the finger holding them (the one nearest where it was) carries them on.
          const to = takeOut.get();
          if (!to.active || !e.allTouches.length) return;
          let near = e.allTouches[0];
          for (const a of e.allTouches) if (Math.hypot(a.x - to.x, a.y - to.y) < Math.hypot(near.x - to.x, near.y - to.y)) near = a;
          takeOut.set({ active: false, x: 0, y: 0 });
          trayTouch.set({ ...tt, watching: false, panel: false });
          manager.activate();
          scheduleOnRN(adoptTakeOut, { id: near.id, x: near.x, y: near.y }, points(e.allTouches));
          return;
        }
        if (tt.watching) {
          const f = e.allTouches.find((a) => a.id === tt.id);
          if (!f) return;
          const dx = f.x - tt.x;
          const dy = f.y - tt.y;
          if (Math.hypot(dx, dy) < DRAG_SLOP || Date.now() - tt.t < LIFT_DELAY_MS) return;
          trayTouch.set({ ...tt, watching: false });
          if (Math.abs(dy) > Math.abs(dx)) {
            manager.activate();
            scheduleOnRN(liftFromHand, { id: tt.id, x: tt.x, y: tt.y }, points(e.allTouches));
          } else {
            manager.fail();
          }
          return;
        }
        scheduleOnRN(move, points(e.allTouches));
      })
      .onTouchesUp((e, manager) => {
        const tt = trayTouch.get();
        const allUp = e.allTouches.length <= e.changedTouches.length;
        if (tt.watching && tt.panel) {
          // Cards taken out, and the finger lifted before it moved: they're put down right there.
          const to = takeOut.get();
          if (to.active && e.changedTouches.length) {
            let near = e.changedTouches[0];
            for (const a of e.changedTouches) if (Math.hypot(a.x - to.x, a.y - to.y) < Math.hypot(near.x - to.x, near.y - to.y)) near = a;
            takeOut.set({ active: false, x: 0, y: 0 });
            scheduleOnRN(dropTakeOut, { id: near.id, x: near.x, y: near.y });
          }
          if (allUp) {
            trayTouch.set({ id: -1, x: 0, y: 0, t: 0, watching: false, panel: false });
            manager.end();
          }
          return;
        }
        if (tt.watching) {
          const f = e.changedTouches.find((a) => a.id === tt.id);
          if (f) {
            if (Math.hypot(f.x - tt.x, f.y - tt.y) < DRAG_SLOP) scheduleOnRN(tapInHand, { id: tt.id, x: tt.x, y: tt.y });
            trayTouch.set({ id: -1, x: 0, y: 0, t: 0, watching: false, panel: false });
            manager.end();
          }
          return;
        }
        scheduleOnRN(up, points(e.changedTouches));
        if (allUp) manager.end();
      })
      .onTouchesCancelled((_, manager) => {
        if (!trayTouch.get().watching) scheduleOnRN(cancel);
        trayTouch.set({ id: -1, x: 0, y: 0, t: 0, watching: false, panel: false });
        manager.end();
      });
  });
  // ---- Menus ----
  const viewMiddle = () => {
    const c = readCamera();
    return toTable(c, area.w / 2, handTop / 2);
  };
  /**
   * A new stack (the last in `next`) comes onto the table where it can't get lost: above everything already on it,
   * centered across it (below it, if there's no room above). It flies in from the top of the screen as the camera
   * glides over to center on it (unlocked, if it was locked), and it arrives picked out.
   */
  const arrive = (next: SandboxTable) => {
    if (!table || next === table) return;
    const added = next.stacks[next.stacks.length - 1];
    if (!added) return;
    const { h } = size(added.cards[added.cards.length - 1].deckId);
    const all = tableBounds(table, size);
    let at = all ? { x: all.x + all.w / 2, y: all.y - gridStep - h / 2 } : viewMiddle();
    if (all && at.y < h / 2) at = { x: at.x, y: all.y + all.h + gridStep + h / 2 };
    if (gridOn) at = snapToGrid({ ...at, angle: 0 }, gridStep);
    at = { x: Math.min(TABLE_W, Math.max(0, at.x)), y: Math.min(TABLE_H, Math.max(0, at.y)) };
    const placed = { ...next, stacks: next.stacks.map((s) => (s.id === added.id ? { ...s, x: at.x, y: at.y } : s)) };
    commit(next.lockCamera ? { ...placed, lockCamera: false } : placed);
    setSelected([added.id]);
    // The camera glides to put it in the middle of what's in view (between the top bar and the hand), as it is
    // (zoom and turn kept); so on screen, it lands there.
    const cam = readCamera();
    const to = { x: area.w / 2, y: (insets.top + TOP_BAR_H + handTop) / 2 };
    const glide = { duration: ARRIVE_MS, easing: ReEasing.inOut(ReEasing.cubic) };
    camX.set(withTiming(to.x - (cam.a * at.x - cam.b * at.y), glide));
    camY.set(withTiming(to.y - (cam.b * at.x + cam.a * at.y), glide));
    setTimeout(() => latest.get().saveCamera(), ARRIVE_MS + 50);
    setArriving({ stackId: added.id, key: newId(), to, scale: cameraZoom(cam), angle: cameraAngle(cam) });
    haptics.lift();
  };
  /** Whether this many more cards fit on the table (see `MAX_TABLE_CARDS`); if not, says so. */
  // ---- Copy and paste (anything on the table, onto this table or another) ----
  const clip = useClip();
  /** Stacks and pieces copied, to paste (and copied again: what was copied before goes). */
  const copyThese = (stackIds: string[], pieceIds: string[]) => {
    if (!table) return;
    setClip(copyItems(table, stackIds, pieceIds));
    haptics.success();
  };
  /**
   * What's been copied put in the middle of the view, laid out as it was, and picked out, ready to drag where it's
   * wanted. Not past the table's card limit, nor its custom art's.
   */
  /** What's copied put on the table (`copies` times, laid out in a grid, none on another), and picked out. */
  const pasteClip = (inMiddle = false, copies = 1) => {
    if (!table || !view || !clip) return;
    if (!pro && playgroundHere) {
      // On the Playground, without Pro: anything copied from it (every component, and its own cards), but no
      // cards of anyone's own decks (it plays with its own).
      const cardsIn = (p: TablePiece): SandboxCard[] => bagItems(p).flatMap((i) => (i.card ? [i.card] : i.piece ? cardsIn(i.piece) : []));
      const cards = [...clip.stacks.flatMap((s) => s.cards), ...clip.pieces.flatMap(cardsIn)];
      if (!cards.every((c) => c.deckId === playgroundDeck?.id && playgroundCardsOk)) return playgroundOnly();
    } else if (!pro && clip.pieces.some(isProPiece)) {
      // Anywhere else, Pro's components need Pro (copied from the Playground, too).
      return openPro();
    }
    if (!roomFor(table, clipCards(clip) * copies)) return;
    if (artCount + clip.pieces.filter((p) => p.kind === 'art').length * copies > ART_MAX) return artFull();
    const { table: next, stackIds, pieceIds } = pasteCopies(table, clip, copies, inMiddle ? middleOfView() : addSpot(), newId, size);
    commit(next);
    setSelected(stackIds);
    setPickedPieces(pieceIds);
    haptics.drop();
  };
  const roomFor = (t: SandboxTable, more: number) => {
    if (tableCardCount(t) + more <= MAX_TABLE_CARDS) return true;
    haptics.warn();
    Alert.alert(
      'This table is full',
      `A table holds up to ${MAX_TABLE_CARDS.toLocaleString('en-US')} cards, counting its hands and trash. Empty the trash, or start another table.`,
    );
    return false;
  };
  const addDeckToTable = (deck: Deck) => {
    if (!pro && playgroundHere) return playgroundOnly();
    if (!table || !roomFor(table, deckSize(deck))) return;
    arrive(addDeck(table, deck, viewMiddle(), newId));
  };
  /** Some of a deck's cards, chosen one by one: in one face-down stack. */
  const addCardsToTable = (deck: Deck, cardIds: string[]) => {
    if (!pro && playgroundHere) return playgroundOnly();
    const more = deck.cards.filter((c) => cardIds.includes(c.id)).reduce((n, c) => n + copiesOf(c), 0);
    if (!table || !roomFor(table, more)) return;
    arrive(addCards(table, deck, cardIds, viewMiddle(), newId));
  };

  const rename = askName;

  /** The room things are fitted into: between the top bar's buttons and the top of the hand's tabs (as it is now: open, or folded away). */
  const fitSpace = (w: number) => {
    const top = insets.top + TOP_BAR_H;
    const bottom = handTop - HAND_TAB_H;
    return { x: FIT_MARGIN, y: top + FIT_MARGIN, w: w - FIT_MARGIN * 2, h: bottom - top - FIT_MARGIN * 2 };
  };
  /** The camera with everything in sight (cards and all), upright: for this table, as it'll be. */
  const fitAllCamera = (t: SandboxTable, w: number) => {
    const bounds = tableBounds(t, size);
    return bounds ? fitCamera(bounds, fitSpace(w)) : startCamera({ w, h: handTop - HAND_TAB_H }, t.focus);
  };
  /** Everything in sight (cards and all): below the top bar's buttons, above the hand, upright (for this table, as it'll be). */
  const fitView = (t: SandboxTable, quiet = false) => {
    if (!view) return;
    writeCamera(fitAllCamera(t, view.w));
    // Saved with the table as it is by then (this render's may be a change behind).
    setTimeout(() => latest.get().saveCamera(), 50);
    if (!quiet) haptics.tick();
  };
  useEffect(() => {
    if (!fitFirst || !view || !table) return;
    setFitFirst(false);
    fitView(table, true);
    // Just once, when the table's first laid out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitFirst, view]);
  /** The tools' Clean Up: every card straight and on the grid, none sharing a spot. */
  const cleanUp = () => {
    if (!table) return;
    commit(tidyTable(table, gridStep));
    haptics.drop();
  };
  /** The tools' Gather by Deck: a new game, every deck used whole again, in a row in the middle of the view. */
  const gatherUp = () => {
    if (!table) return;
    haptics.warn();
    Alert.alert('Gather everything by deck?', 'Every card on the table, in the hands and in the trash goes back into its deck, shuffled and face down. Undo puts it all back.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Gather',
        onPress: () => {
          const m = viewMiddle();
          // As many decks as were brought on (two copies of a deck come back as two), in a row across the middle.
          const all = [...table.stacks.flatMap((s) => s.cards), ...table.hands.flat(), ...(table.trash ?? [])];
          const whole = all.filter((c) => !c.single);
          const count = Math.max(1, decks.filter((d) => d.cards.length && whole.some((c) => c.deckId === d.id)).reduce((n, d) => n + setsOfDeck(d, whole), 0));
          const start = { x: m.x - ((count - 1) * CARD_W * 1.5) / 2, y: m.y };
          const place = gridOn ? (p: { x: number; y: number; angle: number }) => snapToGrid(p, gridStep) : undefined;
          const next = gatherDecks(table, decks, start, newId, Math.random, place, gridStep);
          commit(next);
          fitView(next);
          haptics.drop();
        },
      },
    ]);
  };

  /** A card brought up close, for its menu: about half the screen across (less, for a tall screen's sake). */
  const bigCard = (c: SandboxCard, withList = false) => {
    const deck = decksById.get(c.deckId);
    if (!deck) return null;
    // A little smaller with a list of options under it too, so it all fits (on its side, the options are beside it).
    const w = sideways
      ? Math.min(screenW * 0.3, area.h * 0.6 * cardRatio(deck))
      : Math.min(screenW * (withList ? 0.42 : 0.55), area.h * (withList ? 0.26 : 0.36) * cardRatio(deck));
    return <CardView deck={deck} card={cardOf(c)} faceUp={c.faceUp} width={w} sharp />;
  };
  // ---- The search: a stack looked through, over the table. ----
  const searchStack = searching ? table?.stacks.find((s) => s.id === searching) : undefined;
  /** A bag being searched through (as a stack is), and what can be done with what's in it. */
  const searchBag = searching ? table?.pieces?.find((p) => p.id === searching && p.kind === 'bag') : undefined;
  const bagSearchActions = (key: string): SheetAction[] => {
    if (!table || !searchBag) return [];
    const topFirst = [...bagItems(searchBag)].reverse();
    const i = topFirst.findIndex((x) => itemKey(x) === key);
    const item = topFirst[i];
    if (!item) return [];
    return [
      { label: 'Take it out', onPress: () => commit(placeItem(removeBagItems(table, searchBag.id, [key]), item, besideBagOf(searchBag), newId())) },
      ...(i > 0 ? [{ label: 'Move to the top', onPress: () => commit(reorderBag(table, searchBag.id, [i], 0)) }] : []),
      ...(i < topFirst.length - 1 ? [{ label: 'Move to the bottom', onPress: () => commit(reorderBag(table, searchBag.id, [i], topFirst.length - 1)) }] : []),
    ];
  };
  const bagPickActions = (keys: string[]): SheetAction[] => {
    if (!table || !searchBag || !keys.length) return [];
    const topFirst = [...bagItems(searchBag)].reverse();
    const places = keys.map((k) => topFirst.findIndex((x) => itemKey(x) === k)).filter((i) => i >= 0);
    const n = places.length;
    const takeOut = () => {
      const beside = besideBagOf(searchBag);
      // Cards onto one pile beside it, pieces in a row after them.
      const next = places.reduce(
        (t, place, j) => placeItem(t, topFirst[place], topFirst[place].card ? beside : { x: beside.x + CARD_W + j * gridStep, y: beside.y }, newId()),
        removeBagItems(table, searchBag.id, keys),
      );
      commit(next);
    };
    return [
      { label: n === 1 ? 'Take it out' : `Take all ${n} out`, onPress: takeOut },
      { label: 'Top of the bag', onPress: () => commit(reorderBag(table, searchBag.id, places, 0)) },
      { label: 'Bottom of the bag', onPress: () => commit(reorderBag(table, searchBag.id, places, topFirst.length - n)) },
    ];
  };
  /** A card's options in the search: elsewhere in the stack, into the hand, onto the table (face up), or off it. */
  const searchActions = (iid: string): SheetAction[] => {
    if (!table || !searchStack) return [];
    const topFirst = [...searchStack.cards].reverse();
    const i = topFirst.findIndex((c) => c.iid === iid);
    const card = topFirst[i];
    if (!card) return [];
    const src: Source = { kind: 'card', stackId: searchStack.id, iid };
    const { w } = size(card.deckId);
    const beside = { x: searchStack.x + w + gridStep, y: searchStack.y, angle: searchStack.angle };
    return [
      ...(i > 0 ? [{ label: 'Move to the top', onPress: () => commit(reorderStack(table, searchStack.id, [i], 0)) }] : []),
      ...(i < topFirst.length - 1
        ? [{ label: 'Move to the bottom', onPress: () => commit(reorderStack(table, searchStack.id, [i], topFirst.length - 1)) }]
        : []),
      {
        label: `Into ${table.handNames[handIndex]}`,
        onPress: () => commit(putInHand(take(table, src), [{ ...card, faceUp: true }], handIndex)),
      },
      {
        label: 'Onto the table, face up',
        // Then the search goes, to show it there, picked out to be moved where it belongs.
        onPress: () => {
          const id = newId();
          commit(putOnTable(take(table, src), [{ ...card, faceUp: true }], gridOn ? snapToGrid(beside, gridStep) : beside, id));
          setSelected([id]);
          endSearch();
        },
      },
      { label: 'Take off the table', destructive: true, onPress: () => commit(trashCards(take(table, src), [card])) },
    ];
  };
  /**
   * What can be done with several cards picked in the search (listed top first): onto the table face up (fanned out
   * beside the stack), into the open hand, to the stack's top or bottom, or off the table.
   */
  const searchPickActions = (iids: string[]): SheetAction[] => {
    if (!table || !searchStack || !iids.length) return [];
    const topFirst = [...searchStack.cards].reverse();
    const cards = iids.flatMap((iid) => topFirst.filter((c) => c.iid === iid));
    const places = iids.map((iid) => topFirst.findIndex((c) => c.iid === iid));
    const rest = takeAll(table, iids.map((iid) => ({ kind: 'card' as const, stackId: searchStack.id, iid })));
    const n = cards.length;
    const { w } = size(cards[0].deckId);
    const beside = { x: searchStack.x + w + gridStep, y: searchStack.y };
    return [
      {
        label: 'Onto the table, face up',
        // Then the search goes, to show them there, picked out to be moved where they belong.
        onPress: () => {
          const ids = cards.map(() => newId());
          commit(
            cards.reduce((t, card, i) => {
              const at = { x: beside.x + i * gridStep, y: beside.y, angle: searchStack.angle };
              return putOnTable(t, [{ ...card, faceUp: true }], gridOn ? snapToGrid(at, gridStep) : at, ids[i]);
            }, rest),
          );
          setSelected(ids);
          endSearch();
        },
      },
      { label: `Into ${table.handNames[handIndex]}`, onPress: () => commit(putInHand(rest, cards.map((c) => ({ ...c, faceUp: true })), handIndex)) },
      { label: 'Top of this stack', onPress: () => commit(reorderStack(table, searchStack.id, places, 0)) },
      { label: 'Bottom of this stack', onPress: () => commit(reorderStack(table, searchStack.id, places, topFirst.length - n)) },
      { label: n === 1 ? 'Take it off the table' : `Take all ${n} off the table`, destructive: true, onPress: () => commit(trashCards(rest, cards)) },
    ];
  };
  const menuStack = menu?.kind === 'stack' ? table?.stacks.find((s) => s.id === menu.id) : undefined;
  const menuHandCard = menu?.kind === 'hand' ? table?.hands[menu.hand].find((c) => c.iid === menu.iid) : undefined;

  // ---- A stack's or piece's options: the camera glides in on it where it lies, and the rest goes dark. ----
  /** Where its options start on screen, once laid out: it's centered in the room above them (sideways, left of them). */
  const [optionsAt, setOptionsAt] = useState<{ x: number; y: number } | null>(null);
  /** The camera before it glided in (to glide back to as the options close), and where it glided to. */
  const [glide] = useState(() => {
    const box: { before: Camera | null; to: Camera | null } = { before: null, to: null };
    return { get: () => box, set: (next: Partial<typeof box>) => Object.assign(box, next) };
  });
  const spotPiece = menu?.kind === 'piece' ? table?.pieces?.find((p) => p.id === menu.id) : undefined;
  /** What's lit up: where it lies, how big, and its turn on the table. */
  const spot = (() => {
    if (menuStack) {
      const { w, h } = cardSizeOf(menuStack.cards[menuStack.cards.length - 1], size);
      return { key: `s:${menuStack.id}`, x: menuStack.x, y: menuStack.y, w, h, angle: menuStack.angle };
    }
    if (spotPiece) {
      const { w, h } = pieceSizeOf(spotPiece);
      return { key: `p:${spotPiece.id}`, x: spotPiece.x, y: spotPiece.y, w, h, angle: turnsFreely(spotPiece) ? (spotPiece.angle ?? 0) : 0 };
    }
    return null;
  })();
  const spotKey = spot?.key ?? null;
  const glideCamera = (to: Camera) => {
    const t = { duration: SPOT_MS, easing: ReEasing.out(ReEasing.cubic) };
    camA.set(withTiming(to.a, t));
    camB.set(withTiming(to.b, t));
    camX.set(withTiming(to.tx, t));
    camY.set(withTiming(to.ty, t));
  };
  /** Where the last double tap zoomed in to, till it zooms out (see doubleTapZoom). */
  const [zoomedTo] = useState(() => {
    const box = { camera: null as Camera | null };
    return { set: (camera: Camera | null) => Object.assign(box, { camera }), get: () => box.camera };
  });
  /**
   * A double tap's zoom: in once, on the spot tapped or onto the thing tapped; the next goes out to everything in
   * view (never in further). Glided there, and kept with the table.
   */
  const zoomToTarget = (target: ZoomTarget) => {
    if (!view || !table || table.lockCamera) return;
    const cam = readCamera();
    const space = fitSpace(view.w);
    const fit = fitAllCamera(table, view.w);
    const onto = 'item' in target ? zoomOnto(cam, target.item, space) : zoomInOn(cam, target.at, space);
    const out = doubleTapZoom(cam, fit, onto, zoomedTo.get()) === 'out';
    zoomedTo.set(out ? null : onto);
    glideCamera(out ? fit : onto);
    haptics.tick();
    setTimeout(() => latest.get().saveCamera(), SPOT_MS + 50);
  };
  useEffect(() => {
    // (On iPad the camera's left be: the options float beside it instead.)
    if (IS_PAD) return;
    if (!spot) {
      // Closed: back to where the camera was, unless something chosen has moved it since.
      const { before, to } = glide.get();
      glide.set({ before: null, to: null });
      const now = readCamera();
      if (before && to && Math.abs(now.tx - to.tx) < 2 && Math.abs(now.ty - to.ty) < 2 && Math.abs(now.a - to.a) < 0.01) glideCamera(before);
      return;
    }
    if (optionsAt === null) return;
    const cam = glide.get().before ?? readCamera();
    const turn = Math.atan2(cam.b, cam.a);
    // Its outline as seen on screen (turned with the table), fitted to the room above the options.
    const seen = turn + (spot.angle * Math.PI) / 180;
    const bw = Math.abs(spot.w * Math.cos(seen)) + Math.abs(spot.h * Math.sin(seen));
    const bh = Math.abs(spot.w * Math.sin(seen)) + Math.abs(spot.h * Math.cos(seen));
    const roomTop = insets.top + 16;
    const roomLeft = insets.left + 32;
    const room = sideways
      ? { w: Math.max(80, optionsAt.x - roomLeft - 16), h: screenH - roomTop - insets.bottom - 16 }
      : { w: screenW - 64, h: Math.max(80, optionsAt.y - roomTop - 16) };
    const z = Math.min(SPOT_MAX_ZOOM, Math.max(MIN_ZOOM, SPOT_FILL * Math.min(room.w / Math.max(1, bw), room.h / Math.max(1, bh))));
    const at = sideways ? { x: roomLeft + room.w / 2, y: roomTop + room.h / 2 } : { x: screenW / 2, y: roomTop + room.h / 2 };
    const a = z * Math.cos(turn);
    const b = z * Math.sin(turn);
    const to = { a, b, tx: at.x - (a * spot.x - b * spot.y), ty: at.y - (b * spot.x + a * spot.y) };
    glide.set({ before: cam, to });
    glideCamera(to);
    // As it opens (and if its options change size, or it changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotKey, optionsAt?.x, optionsAt?.y]);
  /** It, lit up over the darkened table: drawn as it lies, through the same camera, so it's just where it is. */
  const spotStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: camX.value },
      { translateY: camY.value },
      { rotate: `${Math.atan2(camB.value, camA.value)}rad` },
      { scale: Math.hypot(camA.value, camB.value) },
    ],
  }));
  /** The box round something on the table, turned as it's seen on screen, for the iPad's options to float beside (or keep off). */
  const screenBox = (it: { x: number; y: number; w: number; h: number; angle: number }): Rect => {
    const cam = readCamera();
    const r = (it.angle * Math.PI) / 180;
    const pts = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([sx, sy]) => {
      const wx = it.x + (sx * it.w * Math.cos(r)) / 2 - (sy * it.h * Math.sin(r)) / 2;
      const wy = it.y + (sx * it.w * Math.sin(r)) / 2 + (sy * it.h * Math.cos(r)) / 2;
      return { x: cam.a * wx - cam.b * wy + cam.tx, y: cam.b * wx + cam.a * wy + cam.ty };
    });
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };
  /** Where it is on screen (the box round it, turned as it's seen), for the iPad's options to float beside. */
  const spotNear = IS_PAD && spot ? screenBox(spot) : undefined;
  /**
   * What the menu open is for, on screen (iPad): the thing a follow-up window keeps clear of, if it can (a die's
   * color, a stack's scale): all the things it will change.
   */
  const menuTarget = (() => {
    if (!IS_PAD || !table || !menu) return undefined;
    let stackIds: string[] = [];
    let pieceIds: string[] = [];
    if (menu.kind === 'dieKind' || menu.kind === 'pieceColor' || menu.kind === 'pieceShape') {
      if (menu.id) pieceIds = [menu.id];
      else {
        stackIds = chosen;
        pieceIds = pickedPieces;
      }
    } else if (menu.kind === 'dieValue') pieceIds = [menu.id];
    else if (menu.kind === 'scale' || menu.kind === 'rotate') {
      stackIds = menu.stacks;
      pieceIds = menu.pieces;
    } else if (menu.kind === 'selection') {
      stackIds = chosen;
      pieceIds = pickedPieces;
    }
    const boxes = [
      ...table.stacks
        .filter((s) => stackIds.includes(s.id))
        .map((s) => {
          const { w, h } = cardSizeOf(s.cards[s.cards.length - 1], size);
          return screenBox({ x: s.x, y: s.y, w, h, angle: s.angle });
        }),
      ...(table.pieces ?? [])
        .filter((p) => pieceIds.includes(p.id))
        .map((p) => {
          const { w, h } = pieceSizeOf(p);
          return screenBox({ x: p.x, y: p.y, w, h, angle: turnsFreely(p) ? (p.angle ?? 0) : 0 });
        }),
    ];
    return unionOf(boxes);
  })();
  const spotlight = spot && !IS_PAD ? (
    <Animated.View style={[styles.world, spotStyle]} pointerEvents="none">
      {menuStack ? (
        <StackView
          stack={menuStack}
          deck={decksById.get(menuStack.cards[menuStack.cards.length - 1].deckId)}
          decks={decksById}
          size={cardSizeOf(menuStack.cards[menuStack.cards.length - 1], size)}
          hidden=""
          target={false}
          selected={false}
          showCount={!table?.hideCounts}
        />
      ) : spotPiece ? (
        <TablePieceView piece={spotPiece} />
      ) : null}
    </Animated.View>
  ) : undefined;
  const sheet = (() => {
    if (!table || !menu) return null;
    if (menu.kind === 'stack' && menuStack) {
      const top = menuStack.cards[menuStack.cards.length - 1];
      const n = menuStack.cards.length;
      // The four used most, as buttons; everything else in a quiet list under them.
      const tiles: SheetTile[] = [
        {
          label: 'Flip over',
          icon: FLIP_ICON,
          onPress: () => {
            commit(settleOnto(flipStack(table, menuStack.id), menuStack.id));
            offerTipAfterUses('tables-double-tap');
          },
        },
        // Into the open hand: the top card.
        {
          label: 'Draw',
          icon: { ios: 'arrow.down.to.line', android: 'download', web: 'download' },
          onPress: () => {
            commit(dealToHand(table, menuStack.id, 1, handIndex));
            haptics.drop();
            // After a few times: dragging a card into the hand does this too.
            offerTipAfterUses('tables-drag-to-hand');
          },
        },
        ...(n > 1
          ? [
              {
                label: 'Shuffle',
                icon: { ios: 'shuffle', android: 'shuffle', web: 'shuffle' } as const,
                // One of several picked out: all of them.
                onPress: () => shuffleStacks(chosen.includes(menuStack.id) ? chosen : [menuStack.id]),
              },
              {
                label: 'Search',
                icon: { ios: 'magnifyingglass', android: 'search', web: 'search' } as const,
                onPress: () => {
                  setSearchLeaving(false);
                  setSearching(menuStack.id);
                },
              },
            ]
          : []),
        // Side by side, as custom art's are.
        { label: 'Rotate', icon: { ios: 'rotate.right', android: 'rotate_right', web: 'rotate_right' }, onPress: () => openRotate([menuStack.id], []) },
        { label: 'Scale', icon: { ios: 'arrow.up.left.and.arrow.down.right', android: 'open_in_full', web: 'open_in_full' }, onPress: () => openScale([menuStack.id], []) },
        // Last, as in every menu.
        { label: 'Copy', icon: COPY_ICON, onPress: () => copyThese([menuStack.id], []) },
      ];
      const rows: FocusRow[] = [
        // Dealing: how many off the top, and to whom (see DealPanel).
        { kind: 'action', label: 'Deal…', more: true, keepsOpen: true, onPress: () => setDealingFrom(menuStack.id) },
        // A deck put back in the order it was made in (its first card on top). Decks mixed in one stack go one
        // after another, in the order they first show from the top.
        ...(n > 1
          ? [
              {
                kind: 'action' as const,
                label: 'Put in order',
                onPress: () => {
                  const decksFromTop: string[] = [];
                  for (const c of [...menuStack.cards].reverse()) if (!decksFromTop.includes(c.deckId)) decksFromTop.push(c.deckId);
                  const rank = (c: SandboxCard) => {
                    const at = decksById.get(c.deckId)?.cards.findIndex((x) => x.id === c.cardId);
                    return at === undefined || at < 0 ? undefined : decksFromTop.indexOf(c.deckId) * 100000 + at;
                  };
                  commit(sortStack(table, menuStack.id, rank));
                  haptics.deal();
                },
              },
            ]
          : []),
        // Spread out, every card showing, as close as the grid allows.
        ...(n > 1
          ? [
              {
                kind: 'pair' as const,
                label: 'Fan out',
                options: [
                  { label: 'Down', onPress: () => commit(fanStack(table, menuStack.id, 'down', newId, gridStep)) },
                  { label: 'Across', onPress: () => commit(fanStack(table, menuStack.id, 'across', newId, gridStep)) },
                ],
              },
            ]
          : []),
        // Among the cards it overlaps: under or over them.
        {
          kind: 'pair',
          label: 'Layer',
          options: (['back', 'down', 'up', 'front'] as const).map((to) => ({
            label: to === 'back' ? 'Back' : to === 'down' ? 'Down' : to === 'up' ? 'Up' : 'Front',
            onPress: () => commit(moveLayer(table, menuStack.id, to, size)),
          })),
        },
        { kind: 'toggle', label: 'Lock', value: !!menuStack.locked, onChange: (on) => commit(setStack(table, menuStack.id, { locked: on })) },
        // A single card can be kept from stacking: nothing goes onto it, and it goes onto nothing.
        ...(n === 1 ? [{ kind: 'toggle' as const, label: 'Never stack', value: !!top.solo, onChange: (on: boolean) => commit(setSolo(table, menuStack.id, on)) }] : []),
        ...(top.faceUp ? [{ kind: 'action' as const, label: 'Full size', keepsOpen: true, onPress: () => setZoomed(top) }] : []),
        { kind: 'action', label: 'Take off the table', destructive: true, onPress: () => commit(removeStacks(table, [menuStack.id])) },
      ];
      return {
        title: n > 1 ? `Stack of ${n}` : top.faceUp ? (cardOf(top)?.name ?? 'Card') : 'Face-down card',
        header: bigCard(top, true),
        tiles,
        rows,        actions: [],
      };
    }
    if (menu.kind === 'hand' && menuHandCard) {
      const src: Source = { kind: 'hand', hand: menu.hand, iid: menu.iid };
      const tiles: SheetTile[] = [
        { label: 'Flip over', icon: FLIP_ICON, onPress: () => commit(flipInHand(table, menu.hand, menu.iid)) },
        ...(menuHandCard.faceUp
          ? [{ label: 'Full size', icon: { ios: 'arrow.up.left.and.arrow.down.right', android: 'open_in_full', web: 'open_in_full' } as const, keepsOpen: true, onPress: () => setZoomed(menuHandCard) }]
          : []),
        { label: 'Off table', icon: { ios: 'trash', android: 'delete', web: 'delete' }, destructive: true, onPress: () => commit(trashCards(take(table, src), [menuHandCard])) },
      ];
      return {
        title: menuHandCard.faceUp ? (cardOf(menuHandCard)?.name ?? 'Card') : 'Face-down card',
        header: bigCard(menuHandCard),
        tiles,
        actions: [],
      };
    }
    if (menu.kind === 'table') {
      return {
        title: table.name,
        tiles: [],
        actions: [
          ...(clip ? [{ label: clipSize(clip) === 1 ? 'Paste' : `Paste ${clipSize(clip)} things`, onPress: () => pasteClip(true) }] : []),
          { label: 'Table theme…', onPress: () => setTimeout(() => setMenu({ kind: 'color' }), 250) },
          {
            label: 'Reset the view',
            onPress: () => {
              fitView(table);
              offerTipAfterUses('tables-quick-pinch', undefined, 900);
            },

          },
          ...(Platform.OS === 'ios'
            ? [{ label: 'Rename table', opensModal: true, onPress: () => rename('Rename table', table.name, (name) => updateSandbox({ ...table, name })) }]
            : []),
          // Solitaire and the Playground: back as they first were (one undo puts it back as it was).
          ...(isExampleTable(table.id) ? [{ label: resetExampleLabel(table.id), opensModal: true, onPress: () => examples.confirmResetTable(table, commit) }] : []),
          {
            label: 'Clear the table',
            destructive: true,
            // Everything into the trash, so it can be put back (or gathered up again).
            onPress: () => commit(trashCards({ ...table, stacks: [], hands: table.hands.map(() => []) }, [...table.stacks.flatMap((s) => s.cards), ...table.hands.flat()])),
          },
        ],
      };
    }
    if (menu.kind === 'color') {
      const pick = (background: string) => {
        updateSandbox({ ...table, background });
        haptics.tick();
      };
      const current = TABLE_THEMES[table.background ?? 'classic'] ? (table.background ?? 'classic') : 'classic';
      return {
        title: 'Table theme',
        tiles: [],
        // Each cloth with a tray to match.
        actions: THEME_KEYS.map((key) => ({ label: `${TABLE_THEMES[key].name}${current === key ? '  ✓' : ''}`, onPress: () => pick(key) })),
      };
    }
    if (menu.kind === 'selection') {
      // Everything picked out: cards, and counters and dice.
      const n = chosen.length;
      const pieces = (table.pieces ?? []).filter((p) => pickedPieces.includes(p.id));
      const dice = pieces.filter((p) => p.kind === 'die');
      const turning = pieces.filter((p) => turnsFreely(p) && !p.locked);
      const total = n + pieces.length;
      const allLocked = chosen.every((id) => table.stacks.find((s) => s.id === id)?.locked) && pieces.every((p) => p.locked);
      const shufflable = chosen.filter((id) => (table.stacks.find((s) => s.id === id)?.cards.length ?? 0) > 1);
      const takeAllOff = () => {
        commit(pieces.reduce((t, p) => removePiece(t, p.id), n ? removeStacks(table, chosen) : table));
        selectStacks([]);
        haptics.drop();
      };
      const icon = (ios: string, android: string) => ({ ios, android, web: android }) as SheetTile['icon'];
      const rollables = pieces.filter(rollable);
      const pieceIds = pieces.map((p) => p.id);
      // The groups among it (each wholly picked out: see withGroups), and what they hold.
      const boxes = groupBoxes(table, chosen, pieceIds, size);
      const boxed = new Set(boxes.flatMap((g) => [...g.stackIds, ...g.pieceIds]));
      /** All of it is groups (nothing picked out on its own). */
      const groupsOnly = boxes.length > 0 && boxed.size === total;
      // Laid out as every other menu is (see CardFocus): what's done most as round buttons, the rest in a list.
      const tiles: SheetTile[] = [
        // Dice, coins and spinners: rolled, flipped and spun together.
        ...(rollables.length ? [{ label: 'Roll', icon: icon('dice', 'casino'), onPress: () => rollDice(rollables.map((p) => p.id)) }] : []),
        ...(shufflable.length ? [{ label: 'Shuffle', icon: icon('shuffle', 'shuffle'), onPress: () => shuffleStacks(shufflable) }] : []),
        // Cards, custom art and dice all turn to one angle (not what's locked in place); side by side with Scale.
        ...(n || turning.length ? [{ label: 'Rotate', icon: icon('rotate.right', 'rotate_right'), onPress: () => openRotate(chosen, turning.map((p) => p.id)) }] : []),
        // (Not what's locked in place.)
        // (One in a group goes as its group does, locked or not.)
        { label: 'Scale', icon: icon('arrow.up.left.and.arrow.down.right', 'open_in_full'), onPress: () => openScale(chosen, pieces.filter((p) => !p.locked || inLiveGroup(table, p)).map((p) => p.id)) },
        ...(pieces.length ? [{ label: 'Color', icon: icon('paintpalette', 'palette'), onPress: () => setTimeout(() => setMenu({ kind: 'pieceColor' }), 250) }] : []),
        { label: 'Copy', icon: COPY_ICON, onPress: () => copyThese(chosen, pieces.map((p) => p.id)) },
      ];
      const rows: FocusRow[] = [
        ...(dice.length
          ? [{ kind: 'action' as const, label: dice.length === 1 ? 'Change the die' : 'Change the dice', more: true, onPress: () => setTimeout(() => setMenu({ kind: 'dieKind' }), 250) }]
          : []),
        ...(pieces.some((p) => p.kind === 'meeple')
          ? [{ kind: 'action' as const, label: 'Change the shape', more: true, onPress: () => setTimeout(() => setMenu({ kind: 'pieceShape' }), 250) }]
          : []),
        // All of them one way: on if every one rolls in place.
        ...(dice.length
          ? [
              {
                kind: 'toggle' as const,
                label: 'Roll in place',
                value: dice.every((d) => d.rollInPlace),
                onChange: (on: boolean) => commit(dice.reduce((t, d) => setPiece(t, d.id, { rollInPlace: on || undefined }), table)),
              },
            ]
          : []),
        // Made one group (picked out and moved as one, in one box), unless it's one already; or let go of its groups.
        // (Everything stays picked out either way.)
        ...(total > 1 && !(boxes.length === 1 && boxed.size === total)
          ? [
              {
                kind: 'action' as const,
                label: 'Group',
                onPress: () => {
                  commit(groupItems(table, chosen, pieceIds, newId()));
                  haptics.tick();
                },
              },
            ]
          : []),
        ...(boxes.length
          ? [
              {
                kind: 'action' as const,
                label: boxes.length === 1 ? 'Ungroup' : 'Ungroup all',
                onPress: () => {
                  commit(ungroupItems(table, chosen, pieceIds));
                  setSelected(chosen);
                  setPickedPieces(pieceIds);
                  haptics.tick();
                },
              },
            ]
          : []),
        // Groups (all of it is groups): the groups themselves locked in place, not each thing in them (each still
        // works as itself; only moving any of them is stopped). Otherwise each, cards and pieces alike: on if every
        // one's locked.
        groupsOnly
          ? {
              kind: 'toggle' as const,
              label: 'Lock',
              value: boxes.every((b) => table.lockedGroups?.includes(b.group)),
              onChange: (on: boolean) => commit(lockGroups(table, boxes.map((b) => b.group), on)),
            }
          : {
              kind: 'toggle' as const,
              label: 'Lock',
              value: allLocked,
              onChange: (on: boolean) =>
                commit(pieceIds.reduce((t, id) => setPiece(t, id, { locked: on || undefined }), chosen.reduce((t, id) => setStack(t, id, { locked: on }), table))),
            },
        { kind: 'action', label: total === 1 ? 'Take off the table' : `Take all ${total} off the table`, destructive: true, onPress: takeAllOff },
      ];
      return {
        title: total === 1 ? 'Selected' : `${total} selected`,
        tiles,
        rows,
        actions: [],
      };
    }
    if (menu.kind === 'piece') {
      // Every piece's options laid out as a card's (see CardFocus): it, big, in the middle; what it does most as
      // tiles; then rows (switches, a layer, taking it off the table).
      const piece = table.pieces?.find((p) => p.id === menu.id);
      if (!piece) return null;
      const id = piece.id;
      const icon = (ios: string, android: string) => ({ ios, android, web: android }) as SheetTile['icon'];
      const tile = (label: string, ios: string, android: string, onPress: () => void, disabled = false): SheetTile => ({ label, icon: icon(ios, android), onPress, disabled });
      // What opens over the table once this has gone: another menu, the name prompt, the system's picture menu.
      const next = (m: Menu) => () => setTimeout(() => setMenu(m), 250);
      // (The words on the table are kept as typed, not title-cased like names: see askText.)
      const ask = (title: string, current: string, done: (text: string) => void) => () => setTimeout(() => askText(title, current, done), 350);
      // A number (or a time), with the number keyboard.
      const askNum = (title: string, current: string, done: (text: string) => void, kind: 'number' | 'signed' | 'time' = 'number') => () =>
        setTimeout(() => askNumber(title, current, done, kind), 350);
      const colorTile = tile('Color', 'paintpalette', 'palette', next({ kind: 'pieceColor', id }));
      // Not for what's locked in place (it's meant to stay as it is).
      const scaleTile = tile('Scale', 'arrow.up.left.and.arrow.down.right', 'open_in_full', () => openScale([], [id]), !!piece.locked);
      // For what turns to any angle (see turnsFreely): beside Scale.
      const rotateTile = tile('Rotate', 'rotate.right', 'rotate_right', () => openRotate([], [id]), !!piece.locked);
      // A six-sided die's (or a coin's) own art for its faces, with custom art's icon: part of Pro.
      const faceTile = tile(piece.kind === 'coin' ? 'Art' : 'Faces', 'photo.on.rectangle', 'add_photo_alternate', pro ? next({ kind: 'faces', id }) : () => setTimeout(openPro, 250));
      // For what usually sits in one place through a game: locked, it stays put (dragging it moves the table).
      const lockRow: FocusRow = { kind: 'toggle', label: 'Lock', value: !!piece.locked, onChange: (on) => commit(setPiece(table, id, { locked: on || undefined })) };
      const takeOffRow: FocusRow = { kind: 'action', label: 'Take off the table', destructive: true, onPress: () => commit(removePiece(table, id)) };
      // Custom art, a zone or a card spot among the cards (and each other), as a stack's Layer: under or over those
      // it overlaps.
      const layerRow: FocusRow = {
        kind: 'pair',
        label: 'Layer',
        options: (['back', 'down', 'up', 'front'] as const).map((to) => ({
          label: to === 'back' ? 'Back' : to === 'down' ? 'Down' : to === 'up' ? 'Up' : 'Front',
          onPress: () => commit(layerFlat(table, id, to, size)),
        })),
      };
      // It, big: as it lies on the table, fitted to the middle of the screen.
      const own = pieceSizeOf({ ...piece, scale: 1 });
      const fit = Math.min(3, 220 / own.w, 220 / own.h);
      const header = (
        <View style={{ width: own.w * fit, height: own.h * fit }}>
          <View style={{ width: own.w, height: own.h, transform: [{ translateX: (own.w * fit - own.w) / 2 }, { translateY: (own.h * fit - own.h) / 2 }, { scale: fit }] }}>
            <TablePieceView piece={{ ...piece, x: own.w / 2, y: own.h / 2, scale: 1 }} />
          </View>
        </View>
      );
      // Copy, the last of its buttons, as in every menu.
      const copyTile: SheetTile = { label: 'Copy', icon: COPY_ICON, onPress: () => copyThese([], [id]) };
      const focus = (title: string, tiles: SheetTile[], rows: FocusRow[]) => ({
        title,
        header,
        tiles: [...tiles, copyTile],
        rows,
        actions: [] as SheetAction[],
      });
      const named = (title: string, current: string) =>
        ask(title, current, (label) => commit(setPiece(table, id, { label })));
      switch (piece.kind) {
        case 'counter':
          return focus(
            piece.label || 'Counter',
            [
              tile(
                'Number',
                'number',
                'pin',
                askNum(
                  'Set the number',
                  String(piece.value),
                  (text) => {
                    const n = parseInt(text.replace(/[^\d-]/g, ''), 10);
                    if (Number.isFinite(n)) commit(setPiece(table, id, { value: n }));
                  },
                  'signed',
                ),
              ),
              tile('Reset', 'arrow.counterclockwise', 'restart_alt', () => commit(setPiece(table, id, { value: 0 }))),
              tile('Name', 'character.cursor.ibeam', 'edit', named('Name the counter', piece.label ?? '')),
              colorTile,
              scaleTile,
            ],
            [lockRow, takeOffRow],
          );
        case 'die':
          return focus(
            `d${piece.sides ?? 6}`,
            [
              tile('Roll', 'dice', 'casino', () => rollDice([id])),
              // Set to a face, as if put down that way up: a slider.
              tile('Number', 'number', 'pin', () => openDieValue(id)),
              tile('Kind', 'die.face.6', 'casino', next({ kind: 'dieKind', id })),
              colorTile,
              rotateTile,
              scaleTile,
              // Its own art for its faces (Pro), with custom art's icon: a d6's only (see faceCount).
              ...(faceCount(piece) ? [faceTile] : []),
            ],
            [{ kind: 'toggle', label: 'Roll in place', value: !!piece.rollInPlace, onChange: (on) => commit(setPiece(table, id, { rollInPlace: on || undefined })) }, takeOffRow],
          );
        case 'coin':
          // (Gold, as its art is: no color to choose.)
          return focus('Coin', [tile('Flip', 'arrow.triangle.2.circlepath', 'sync', () => rollDice([id])), scaleTile, ...(faceCount(piece) ? [faceTile] : [])], [takeOffRow]);
        case 'spinner':
          return focus('Spinner', [tile('Spin', 'arrow.clockwise.circle', 'autorenew', () => rollDice([id])), colorTile, scaleTile], [lockRow, takeOffRow]);
        case 'text':
          return focus(piece.label || 'Text', [tile('Words', 'character.cursor.ibeam', 'edit', named('Text', piece.label ?? '')), colorTile, scaleTile], [lockRow, takeOffRow]);
        case 'marker':
          return focus(piece.label || 'Marker', [tile('Words', 'character.cursor.ibeam', 'edit', named('Marker', piece.label ?? '')), colorTile, scaleTile], [takeOffRow]);
        case 'meeple':
          return focus(pieceName(piece), [tile('Shape', 'square.on.circle', 'category', next({ kind: 'pieceShape', id })), colorTile, scaleTile], [takeOffRow]);
        case 'token':
          return focus(
            piece.value > 1 ? `Token × ${piece.value}` : 'Token',
            [
              tile(
                'How many',
                'number',
                'pin',
                askNum('How many', String(piece.value), (text) => {
                  const n = parseInt(text.replace(/\D/g, ''), 10);
                  if (n > 0) commit(setPiece(table, id, { value: Math.min(999, n) }));
                }),
              ),
              // The system's menu, once this has gone (see choosePicture).
              tile('Picture', 'photo', 'image', () => setTimeout(() => choosePicture({ kind: 'token', id }), 450)),
              tile('Shape', 'square.on.circle', 'category', next({ kind: 'tokenShape', id })),
              colorTile,
              scaleTile,
            ],
            [
              ...(piece.image ? [{ kind: 'action' as const, label: 'Take the picture off', onPress: () => commit(setPiece(table, id, { image: undefined })) }] : []),
              takeOffRow,
            ],
          );
        case 'timer':
          return focus(
            `Timer · ${timerText(piece.value)}`,
            [
              tile(
                'Time',
                'timer',
                'timer',
                askNum(
                  'Minutes, or minutes:seconds',
                  timerText(piece.value),
                  (text) => {
                    const secs = parseTimerText(text);
                    if (secs) commit(setPiece(table, id, { value: secs, endsAt: undefined, left: undefined }));
                    else Alert.alert('That isn’t a time', 'Type minutes (like 5) or minutes and seconds (like 1:30).');
                  },
                  'time',
                ),
              ),
              tile('Reset', 'arrow.counterclockwise', 'restart_alt', () => commit(setPiece(table, id, { endsAt: undefined, left: undefined }))),
              colorTile,
              scaleTile,
            ],
            [lockRow, takeOffRow],
          );
        case 'track':
          return focus(
            'Track',
            [
              tile(
                'Spaces',
                'number',
                'pin',
                askNum(`Spaces (2 to ${TRACK_MAX})`, String(piece.spaces ?? 10), (text) => {
                  const n = Math.min(TRACK_MAX, Math.max(2, parseInt(text.replace(/\D/g, ''), 10) || 0));
                  commit(setPiece(table, id, { spaces: n, value: Math.min(piece.value, n - 1) }));
                }),
              ),
              tile('To start', 'arrow.uturn.backward', 'undo', () => commit(setPiece(table, id, { value: 0 }))),
              colorTile,
              tile('Marker', 'square.fill', 'square', next({ kind: 'pieceColor', id, marker: true })),
              scaleTile,
            ],
            [
              { kind: 'toggle', label: 'Vertical', value: !!piece.vertical, onChange: (on) => commit(setPiece(table, id, { vertical: on || undefined })) },
              { kind: 'toggle', label: 'Flip number direction', value: !!piece.reversed, onChange: (on) => commit(setPiece(table, id, { reversed: on || undefined })) },
              { kind: 'toggle', label: 'Number from 0', value: piece.first === 0, onChange: (on) => commit(setPiece(table, id, { first: on ? 0 : 1 })) },
              { kind: 'toggle', label: 'Numbers', value: !piece.hideNumbers, onChange: (on) => commit(setPiece(table, id, { hideNumbers: on ? undefined : true })) },
              lockRow,
              takeOffRow,
            ],
          );
        case 'spot':
        case 'zone': {
          const look = piece.look ?? 'outline';
          const spot = piece.kind === 'spot';
          const align = labelAlignOf(piece);
          // How it's drawn (and how see-through), its layer, and its name: shown or not; where it sits along its
          // edge, and over or under it.
          const clothRows: FocusRow[] = [
            {
              kind: 'pair',
              label: 'Look',
              options: (['outline', 'filled', 'dashed'] as const).map((l) => ({
                label: `${l === 'outline' ? 'Line' : l === 'filled' ? 'Filled' : 'Dashed'}${look === l ? ' ✓' : ''}`,
                onPress: () => commit(setPiece(table, id, { look: l === 'outline' ? undefined : l })),
              })),
            },
            { kind: 'action', label: `Opacity · ${Math.round((piece.opacity ?? 1) * 100)}%`, more: true, onPress: () => openZoneOpacity(id) },
            layerRow,
            { kind: 'toggle', label: 'Show name', value: !piece.hideLabel, onChange: (on) => commit(setPiece(table, id, { hideLabel: on ? undefined : true })) },
            ...(piece.hideLabel
              ? []
              : [
                  {
                    kind: 'pair' as const,
                    label: 'Name',
                    options: (['left', 'center', 'right'] as const).map((a) => ({
                      label: `${a === 'left' ? 'Left' : a === 'center' ? 'Center' : 'Right'}${align === a ? ' ✓' : ''}`,
                      onPress: () => commit(setPiece(table, id, { labelAlign: a })),
                    })),
                  },
                  {
                    kind: 'pair' as const,
                    label: 'Name at',
                    options: [false, true].map((below) => ({
                      label: `${below ? 'Bottom' : 'Top'}${!!piece.labelBelow === below ? ' ✓' : ''}`,
                      onPress: () => commit(setPiece(table, id, { labelBelow: below || undefined })),
                    })),
                  },
                ]),
          ];
          if (spot) {
            return focus(
              piece.label || 'Card spot',
              [tile('Name', 'character.cursor.ibeam', 'edit', named('Name the card spot', piece.label ?? '')), colorTile, scaleTile],
              [...clothRows, lockRow, takeOffRow],
            );
          }
          return focus(
            piece.label || 'Zone',
            [tile('Name', 'character.cursor.ibeam', 'edit', named('Name the zone', piece.label ?? '')), colorTile, scaleTile],
            [
              ...clothRows,
              {
                kind: 'action',
                // Snug round the cards and pieces lying in it (not text, nor other zones).
                label: 'Auto fit',
                onPress: () => {
                  const fitted = fitZone(table, id, size);
                  // Nothing in it to fit round.
                  if (fitted === table) return haptics.warn();
                  commit(fitted);
                  haptics.drop();
                },
              },
              // Cards put in it settle in rows, each in the free place nearest where it's let go.
              { kind: 'toggle', label: 'Line up cards', value: !!piece.grid, onChange: (on) => commit(setPiece(table, id, { grid: on || undefined })) },
              lockRow,
              takeOffRow,
            ],
          );
        }
        case 'score': {
          const written = piece.scores ?? [];
          return focus(
            'Score pad',
            [
              tile('Players', 'person.2', 'group', next({ kind: 'scorePlayers', id })),
              // Every one written down (even those gone off the top), to change or cross off.
              tile('Edit', 'pencil', 'edit', next({ kind: 'scoreList', id }), !written.length),
              // The last points written down, crossed off.
              tile('Undo', 'arrow.uturn.backward', 'undo', () => commit(setPiece(table, id, { scores: written.slice(0, -1) })), !written.length),
              tile('Clear', 'eraser', 'ink_eraser', () => commit(setPiece(table, id, { scores: [] })), !written.length),
              colorTile,
              scaleTile,
            ],
            [lockRow, takeOffRow],
          );
        }
        case 'bag': {
          // As a stack's: draw, shuffle and search, and more under them.
          const items = bagItems(piece);
          const top = piece.supply ?? items[items.length - 1];
          const itemName = (i: BagItem) => (i.card ? (cardOf(i.card)?.name ?? 'Card') : pieceName(i.piece!));
          // The top thing: a card into the open hand, a piece beside the bag.
          const drawTop = () => {
            const out = takeFromBag(table, id, newId());
            if (!out) return haptics.warn();
            commit(out.item.card ? putInHand(out.table, [out.item.card], handIndex) : placeItem(out.table, out.item, besideBagOf(piece), newId()));
            haptics.deal();
          };
          return focus(
            piece.supply ? `Endless supply · ${itemName(piece.supply)}` : items.length ? `Bag · ${items.length}` : 'Bag · empty',
            [
              tile('Draw', 'arrow.down.to.line', 'download', drawTop, !top),
              tile(
                'Shuffle',
                'shuffle',
                'shuffle',
                () => {
                  commit(shuffleBag(table, id));
                  haptics.deal();
                },
                !!piece.supply || items.length < 2,
              ),
              tile(
                'Search',
                'magnifyingglass',
                'search',
                () => {
                  setSearchLeaving(false);
                  setSearching(id);
                },
                !!piece.supply || !items.length,
              ),
              colorTile,
              scaleTile,
            ],
            [
              ...(top ? [{ kind: 'action' as const, label: 'Take out the top', onPress: () => commit(drawFromBag(table, id, newId(), true)) }] : []),
              ...(items.length ? [{ kind: 'action' as const, label: 'Empty it onto the table', onPress: () => commit(emptyBag(table, id, newId)) }] : []),
              ...(piece.supply ? [{ kind: 'action' as const, label: 'Stop being a supply', onPress: () => commit(endSupply(table, id)) }] : []),
              lockRow,
              // Its cards go to the trash, to be put back from there.
              { ...takeOffRow, onPress: () => commit(trashCards(removePiece(table, id), items.flatMap((i) => (i.card ? [i.card] : [])))) },
            ],
          );
        }
        case 'art':
          return focus(
            'Custom art',
            [
              rotateTile,
              scaleTile,
              // The system's menu, once this has gone (see choosePicture).
              tile('Picture', 'photo', 'image', () => setTimeout(() => choosePicture({ kind: 'art', id }), 450)),
              // Its subject out of its background (where this iPhone can; not once it's see-through already).
              ...(canCutOut() && piece.image && !isSeeThrough(piece.image) ? [tile('Cut out', 'scissors', 'content_cut', () => void cutOutArt(id))] : []),
            ],
            [
              layerRow,
              // A board or a map lies still; a figure is moved about.
              lockRow,
              takeOffRow,
            ],
          );
      }
      return null;
    }
    if (menu.kind === 'tokenShape') {
      const token = table.pieces?.find((p) => p.id === menu.id && p.kind === 'token');
      if (!token) return null;
      const now = tokenShapeOf(token);
      return {
        title: 'Shape',
        tiles: [],
        actions: TOKEN_SHAPES.map(({ shape, name }) => ({
          label: `${name}${shape === now ? '  ✓' : ''}`,
          onPress: () => commit(setPiece(table, token.id, { tokenShape: shape, square: undefined })),
        })),
      };
    }
    if (menu.kind === 'pieceShape') {
      // One playing piece, or every one picked out.
      const targets = (table.pieces ?? []).filter((p) => p.kind === 'meeple' && (menu.id ? p.id === menu.id : pickedPieces.includes(p.id)));
      if (!targets.length) return null;
      const shapes = new Set(targets.map((p) => p.shape ?? 'meeple'));
      return {
        title: 'Shape',
        tiles: [],
        actions: PIECE_SHAPES.map(({ shape, name }) => ({
          label: `${name}${shapes.size === 1 && shapes.has(shape) ? '  ✓' : ''}`,
          onPress: () => commit(targets.reduce((t, p) => setPiece(t, p.id, { shape }), table)),
        })),
      };
    }
    if (menu.kind === 'dieKind') {
      // One die, or every one picked out.
      const dice = (table.pieces ?? []).filter((p) => p.kind === 'die' && (menu.id ? p.id === menu.id : pickedPieces.includes(p.id)));
      if (!dice.length) return null;
      const kinds = new Set(dice.map((d) => d.sides ?? 6));
      return {
        title: dice.length === 1 ? 'Change the die' : `Change ${dice.length} dice`,
        tiles: [],
        // Another kind of die: each keeps its number, if it has that face.
        actions: DIE_SIDES.map((n) => ({
          label: `d${n}${kinds.size === 1 && kinds.has(n) ? '  ✓' : ''}`,
          // (Its own face art was for the faces it had: another kind starts with the standard ones.)
          onPress: () =>
            commit(dice.reduce((t, d) => setPiece(t, d.id, { sides: n, value: Math.min(d.value, n), ...((d.sides ?? 6) !== n && { faces: undefined, faceColors: undefined }) }), table)),
        })),
      };
    }
    if (menu.kind === 'pieceColor') {
      // One counter or die, or every one picked out.
      const targets = (table.pieces ?? []).filter((p) => (menu.id ? p.id === menu.id : pickedPieces.includes(p.id)));
      if (!targets.length) return null;
      // A track's marker has a color of its own (the app's gold, unless one's chosen).
      const colorOf = (p: TablePiece) => (menu.marker ? (p.markerColor ?? colors.accent) : (p.color ?? defaultPieceColor(p)));
      const colorsNow = new Set(targets.map(colorOf));
      const current = colorsNow.size === 1 ? [...colorsNow][0] : undefined;
      const pick = (color: string | undefined) => {
        commit(targets.reduce((t, p) => setPiece(t, p.id, menu.marker ? { markerColor: color } : { color }), table));
        haptics.tick();
        setMenu(null);
      };
      return {
        title: menu.marker ? 'Marker color' : 'Color',
        tiles: [],
        // Swatches to tap; and back to its own color (a die's color for its kind, a counter's dark glass).
        banner: (
          <View style={styles.swatches}>
            {Object.entries(PIECE_COLORS).map(([name, hex]) => (
              <Pressable
                key={name}
                onPress={() => pick(hex)}
                accessibilityRole="button"
                accessibilityLabel={name}
                accessibilityState={{ selected: current === hex }}
                style={[styles.swatch, { backgroundColor: hex }, current === hex && styles.swatchOn]}
              />
            ))}
          </View>
        ),
        actions: targets.some((p) => (menu.marker ? p.markerColor : p.color))
          ? [{ label: menu.marker ? 'Back to gold' : targets.length === 1 ? 'Its own color' : 'Their own colors', onPress: () => pick(undefined) }]
          : [],
      };
    }
    if (menu.kind === 'scale') {
      const n = menu.stacks.length + menu.pieces.length;
      return {
        title: n === 1 ? 'Scale' : `Scale ${n} things`,
        tiles: [],
        banner: <ScaleControl value={scaleOf(table, menu.stacks, menu.pieces)} onChange={previewScale} />,
        actions: [],
      };
    }
    if (menu.kind === 'faces') {
      const piece = table.pieces?.find((p) => p.id === menu.id);
      if (!piece || !faceCount(piece)) return null;
      const coin = piece.kind === 'coin';
      return {
        title: coin ? 'Coin art' : 'Die faces',
        tiles: [],
        // Each face as it shows: tapped, its art's chosen (once this has gone, so the system's picture menu opens).
        banner: (
          <FaceSlots
            piece={piece}
            onPick={(face) => {
              setMenu(null);
              setTimeout(() => choosePicture({ kind: 'face', id: piece.id, face }), 300);
            }}
          />
        ),
        actions: piece.faces
          ? [{ label: coin ? 'Use the gold coin' : 'Use the standard faces', onPress: () => commit(setPiece(table, piece.id, { faces: undefined })) }]
          : [],
      };
    }
    if (menu.kind === 'zoneOpacity') {
      const zone = table.pieces?.find((p) => p.id === menu.id);
      if (!zone) return null;
      return {
        title: 'Opacity',
        tiles: [],
        banner: <NumberSlider min={ZONE_OPACITY_MIN * 100} max={100} value={Math.round((zone.opacity ?? 1) * 100)} onChange={previewZoneOpacity} />,
        actions: [],
      };
    }
    if (menu.kind === 'dieValue') {
      const die = table.pieces?.find((p) => p.id === menu.id && p.kind === 'die');
      if (!die) return null;
      return {
        title: `d${die.sides ?? 6}`,
        tiles: [],
        banner: <NumberSlider min={1} max={die.sides ?? 6} value={die.value} onChange={previewDieValue} />,
        actions: [],
      };
    }
    if (menu.kind === 'rotate') {
      const n = menu.stacks.length + menu.pieces.length;
      // Where the first of them is turned now.
      const angle = table.stacks.find((s) => menu.stacks.includes(s.id))?.angle ?? table.pieces?.find((p) => menu.pieces.includes(p.id))?.angle ?? 0;
      return {
        title: n === 1 ? 'Rotation' : `Rotate ${n} things`,
        tiles: [],
        banner: <RotationControl value={angle} onChange={previewRotate} />,
        actions: [],
      };
    }
    if (menu.kind === 'components') {
      // A tile each, three to a row, with its name under it: what rolls, then what counts, then pieces, then the
      // table's layout. Those with more to choose (which die, which deck, which picture) open another menu.
      const next = (m: Menu) => () => setTimeout(() => setMenu(m), 250);
      const icon = (ios: string, android: string) => ({ ios, android, web: android }) as SheetTile['icon'];
      // Free, every one: cards (whole decks, or chosen one by one), dice, and the rest of the table's components, for
      // playing alongside a game. (Cards, on the Playground, need Pro: it plays with its own.)
      const cardsHere = (go: () => void) => () => (!pro && playgroundHere ? setTimeout(playgroundOnly, 250) : go());
      // What's made with the player's own pictures, part of Pro. Without it: all three under one PRO heading (rather
      // than a tag on each), opening Pro. With it: custom art among the rest, as a token or a d6 of your own is made
      // from the Pieces and Dice menus.
      const customArt: SheetTile = {
        label: 'Custom art',
        icon: icon('photo.on.rectangle', 'add_photo_alternate'),
        opensModal: pro,
        onPress: pro ? () => (artCount < ART_MAX ? choosePicture({ kind: 'art' }) : artFull()) : () => setTimeout(openPro, 250),
      };
      const toPro = (label: string, ios: string, android: string, drawn?: 'shapes'): SheetTile => ({ label, icon: icon(ios, android), drawn, onPress: () => setTimeout(openPro, 250) });
      return {
        title: 'Add to the table',
        tiles: [
          { label: 'Full decks', icon: icon('rectangle.stack', 'layers'), onPress: cardsHere(next({ kind: 'addDeck' })) },
          // Its own screen, which iOS can only show once this menu has gone.
          { label: 'Cards', icon: icon('rectangle.portrait', 'crop_portrait'), opensModal: pro || !playgroundHere, onPress: cardsHere(() => setAddingCards(true)) },
          { label: 'Dice', icon: icon('dice', 'casino'), onPress: next({ kind: 'addDie' }) },
          { label: 'Card spot', icon: icon('square.dashed', 'check_box_outline_blank'), onPress: () => addPieceToTable('spot') },
          { label: 'Coin', icon: icon('centsign.circle', 'toll'), onPress: () => addPieceToTable('coin') },
          { label: 'Spinner', icon: icon('arrow.clockwise.circle', 'autorenew'), onPress: () => addPieceToTable('spinner') },
          { label: 'Counter', icon: icon('plus.forwardslash.minus', 'exposure'), onPress: () => addPieceToTable('counter') },
          { label: 'Score pad', icon: icon('list.number', 'scoreboard'), onPress: () => addPieceToTable('score') },
          { label: 'Timer', icon: icon('timer', 'timer'), onPress: () => addPieceToTable('timer') },
          { label: 'Track', icon: icon('number.square', 'pin'), onPress: () => addPieceToTable('track') },
          { label: 'Pieces', icon: icon('figure.stand', 'person'), onPress: next({ kind: 'addShape' }) },
          { label: '1st player', icon: icon('star.circle', 'stars'), onPress: () => addPieceToTable('marker') },
          { label: 'Bag', icon: icon('bag', 'shopping_bag'), onPress: () => addPieceToTable('bag') },
          { label: 'Text', icon: icon('textformat', 'title'), onPress: () => addPieceToTable('text') },
          { label: 'Zone', icon: icon('rectangle.dashed', 'crop_free'), onPress: () => addPieceToTable('zone') },
          ...(pro ? [customArt] : []),
        ] as SheetTile[],
        ...(pro
          ? {}
          : {
              moreTiles: [customArt, toPro('Custom token', 'square.on.circle', 'category', 'shapes'), toPro('Custom d6', 'die.face.6', 'casino')],
              moreLocked: true,
            }),
        // Under them, always there: what's been copied, put down where the table was held (or in the middle of the
        // view), once or as many times as asked (laid out in a grid); grayed out while nothing has been. (Pro's rules
        // are pasteClip's.)
        wideTile: [
          {
            label: clip && clipSize(clip) > 1 ? `Paste ${clipSize(clip)} things` : 'Paste',
            icon: icon('doc.on.clipboard', 'content_paste'),
            disabled: !clip,
            onPress: () => pasteClip(),
          },
          {
            label: 'Paste several',
            icon: icon('square.on.square', 'library_add'),
            disabled: !clip,
            onPress: () =>
              setTimeout(
                () =>
                  askNumber('How many copies', '2', (text) => {
                    const n = parseInt(text.replace(/\D/g, ''), 10);
                    if (n > 0) pasteClip(false, Math.min(PASTE_MAX, n));
                  }),
                350,
              ),
          },
        ],
        actions: [],
      };
    }
    if (menu.kind === 'scorePlayers') {
      const pad = table.pieces?.find((p) => p.id === menu.id);
      if (!pad) return null;
      const players = scoreNames(pad).length;
      return {
        title: 'Players',
        tiles: [],
        actions: Array.from({ length: SCORE_MAX_PLAYERS }, (_, i) => i + 1).map((n) => ({
          label: `${n} player${n === 1 ? '' : 's'}${n === players ? ' ✓' : ''}`,
          onPress: () => commit(setScorePlayers(table, menu.id, n)),
        })),
      };
    }
    if (menu.kind === 'scoreList' || menu.kind === 'scoreEntry') {
      const pad = table.pieces?.find((p) => p.id === menu.id);
      if (!pad) return null;
      const names = scoreNames(pad);
      const scores = pad.scores ?? [];
      const line = (i: number) => `${names[scores[i].player] ?? 'Player'} · ${scoreText(scores[i].points)}`;
      if (menu.kind === 'scoreList') {
        return {
          title: 'Scores',
          tiles: [],
          actions: scores
            .map((_, i) => i)
            .reverse()
            .map((i) => ({ label: line(i), onPress: () => setTimeout(() => setMenu({ kind: 'scoreEntry', id: menu.id, entry: i }), 250) })),
        };
      }
      const { entry } = menu;
      if (!scores[entry]) return null;
      return {
        title: line(entry),
        tiles: [],
        actions: [
          {
            label: 'Change',
            onPress: () =>
              setTimeout(
                () =>
                  askNumber(
                    `Points for ${names[scores[entry].player] ?? 'Player'}`,
                    String(scores[entry].points),
                    (text) => {
                      const n = parseInt(text.replace(/[^\d-]/g, ''), 10);
                      if (Number.isFinite(n)) commit(setScore(table, menu.id, entry, n));
                    },
                    'signed',
                  ),
                350,
              ),
          },
          { label: 'Delete', destructive: true, onPress: () => commit(setScore(table, menu.id, entry, null)) },
        ],
      };
    }
    if (menu.kind === 'addShape') {
      return {
        title: 'Add a piece',
        tiles: [],
        // Each piece as it looks on the table, as the dice are.
        banner: (
          <View style={styles.dicePicks}>
            {PIECE_SHAPES.map(({ shape, name }) => {
              const piece = newPiece('meeple', `pick-${shape}`, { x: 0, y: 0 }, 6, shape);
              const own = pieceSizeOf(piece);
              const fit = Math.min(1.1, 60 / own.w, 60 / own.h);
              return (
                <Pressable
                  key={shape}
                  onPress={() => {
                    setMenu(null);
                    addPieceToTable('meeple', undefined, shape);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`A ${name.toLowerCase()}`}
                  style={({ pressed }) => [styles.dicePick, pressed && { opacity: 0.6 }]}>
                  <View style={styles.dicePickArt}>
                    <TablePieceView piece={{ ...piece, x: 30, y: 30, scale: fit }} />
                  </View>
                  <Text style={styles.dicePickText}>{name}</Text>
                </Pressable>
              );
            })}
          </View>
        ),
        // A token of the player's own: a picture, cropped to a shape (chosen as it's cropped).
        // (Part of Pro: tagged, and opening Pro, until it's unlocked.)
        wideTile: {
          label: 'Custom token',
          icon: { ios: 'square.on.circle', android: 'category', web: 'category' } as SheetTile['icon'],
          drawn: 'shapes' as const,
          opensModal: pro,
          pro: !pro,
          onPress: () => (pro ? choosePicture({ kind: 'token' }) : setTimeout(openPro, 250)),
        },
        actions: [],
      };
    }
    if (menu.kind === 'addDie') {
      const icon6 = { ios: 'die.face.6', android: 'casino', web: 'casino' } as SheetTile['icon'];
      return {
        title: dieCount === 1 ? 'Add a die' : `Add ${dieCount} dice`,
        tiles: [],
        // How many first (it's kept for next time), then which kind: each die as it looks on the table.
        banner: (
          <View>
          <CountStepper value={dieCount} onChange={setDieCount} max={DICE_AT_ONCE} label="How many dice" />
          <View style={styles.dicePicks}>
            {DIE_SIDES.map((n) => (
              <Pressable
                key={n}
                onPress={() => {
                  setMenu(null);
                  addDice(n, dieCount);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${dieCount === 1 ? 'A' : dieCount} d${n}`}
                style={({ pressed }) => [styles.dicePick, pressed && { opacity: 0.6 }]}>
                <View style={styles.dicePickArt}>
                  <TablePieceView piece={{ ...newPiece('die', `pick${n}`, { x: PIECE_SIZE.die.w / 2, y: PIECE_SIZE.die.h / 2 }, n) }} />
                </View>
                <Text style={styles.dicePickText}>d{n}</Text>
              </Pressable>
            ))}
          </View>
          </View>
        ),
        // A d6 of the player's own: one put down, then its faces to give it its art. (Part of Pro: tagged, and
        // opening Pro, until it's unlocked.)
        wideTile: {
          label: 'Custom d6',
          icon: icon6,
          pro: !pro,
          onPress: () => (pro ? addCustomD6() : setTimeout(openPro, 250)),
        },
        actions: [],
      };
    }
    if (menu.kind === 'addDeck') {
      const playable = decks.filter((d) => d.cards.length);
      return {
        title: playable.length ? 'Add a deck to the table' : 'No decks with cards yet',
        tiles: [],
        actions: playable.map((d) => ({ label: d.name, onPress: () => addDeckToTable(d) })),
      };
    }
    return null;
  })();

  // ---- The top bar ----
  // Its undo always runs this render's undo.
  const [latestUndo] = useState(() => {
    const box = { fn: () => {} };
    return { set: (fn: () => void) => Object.assign(box, { fn }), get: () => box.fn };
  });
  latestUndo.set(undo);
  const [latestRedo] = useState(() => {
    const box = { fn: () => {} };
    return { set: (fn: () => void) => Object.assign(box, { fn }), get: () => box.fn };
  });
  latestRedo.set(redo);
  const [latestToggleTools] = useState(() => {
    const box = { fn: () => {} };
    return { set: (fn: () => void) => Object.assign(box, { fn }), get: () => box.fn };
  });
  latestToggleTools.set(() => showTools(!toolsOpen));
  const carrying = !!held;
  useEffect(() => {
    if (!table) return onControls(null);
    onControls({
      title: table.name,
      canUndo: history.length > 0,
      busy: carrying,
      undo: () => latestUndo.get()(),
      redo: () => latestRedo.get()(),
      canRedo: future.length > 0,
      openMenu: () => setMenu({ kind: 'table' }),
      hidden: !!searching,
      // On an iPhone turned on its side, the tools open from beside the table's name.
      // Its button over the middle of where the panel comes to rest.
      tools: sideways ? { open: toolsOpen, toggle: () => latestToggleTools.get()(), centerX: insets.left + TOOLS_W_SIDEWAYS / 2 } : undefined,
    });
  }, [history.length, future.length, carrying, onControls, table, latestUndo, latestRedo, searching, setMenu, sideways, toolsOpen, latestToggleTools, insets.left]);

  if (!table) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>This table no longer exists.</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.link}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const chosenIds = new Set(chosen);
  /**
   * Each group picked out: one box round all of it (see groupBoxes), drawn instead of each thing's own outline. Not
   * while it's being dragged (each thing's drawn where it's got to, then).
   */
  const pickedGroups = groupMoving || pieceDrag ? [] : groupBoxes(table, chosen, pickedPieces, size);
  const boxed = new Set(pickedGroups.flatMap((g) => [...g.stackIds, ...g.pieceIds]));
  /** A piece's menu is laid out as a card's (see CardFocus), not as a sheet. */
  const menuIsPiece = menu?.kind === 'piece';
  /** How a piece is moved for now: dragged (with the finger), with picked-out cards being dragged, or not at all. */
  /** Where a piece is drawn for now: as far as it's been dragged, or gone with dragged cards; or where it lies. */
  const movedTo = (p: TablePiece) =>
    pieceDrag?.ids.includes(p.id)
      ? { x: p.x + pieceDrag.dx, y: p.y + pieceDrag.dy }
      : groupMoving && groupShift && pickedPieces.includes(p.id) && !staysPut(table, p)
        ? { x: p.x + groupShift.dx, y: p.y + groupShift.dy }
        : undefined;
  /** A piece as it's drawn on the table (always the same view, never drawn afresh as it moves). */
  const drawPiece = (p: TablePiece, layer?: number) => {
    const dragged = !!pieceDrag?.ids.includes(p.id);
    const turn = dragged && pieceDrag?.lead === p.id ? pieceDrag.turn : undefined;
    // A score pad being made taller or shorter, or scrolled: as it is for now.
    const shown = zoneSize?.id === p.id ? { ...p, ...resized(p, zoneSize) } : scoreScroll?.id === p.id ? { ...p, scroll: scoreScroll.scroll } : p;
    return (
      <TablePieceView
        key={p.id}
        piece={shown}
        at={movedTo(p)}
        turn={turn}
        rollKey={rolls[p.id]?.key}
        rollFrom={rolls[p.id]}
        selected={pickedPieces.includes(p.id) && !boxed.has(p.id)}
        layer={layer}
      />
    );
  };
  /**
   * How the pieces lie over one another (see inDrawOrder; any mid-roll over them all), as each one's layer: their
   * views stay in one order and only their layers change. (Views put in a new order were moved on screen, and a
   * moved one could show for a frame with an old roll's offset, out of place.)
   */
  const pieceLayers = (() => {
    const all = table?.pieces ?? [];
    const order = [...inDrawOrder(all).filter((p) => !airborne.includes(p.id)), ...all.filter((p) => airborne.includes(p.id))];
    return new Map(order.map((p, i) => [p.id, i + 1]));
  })();
  /** What lies flat (custom art, zones, card spots) just over a stack (or, for null, under every card), where it lies. */
  const stackIds = new Set(table?.stacks.map((s) => s.id));
  const artOver = (stackId: string | null) =>
    (table?.pieces ?? [])
      .filter((p) => liesFlat(p) && (stackId ? p.over === stackId : !p.over || !stackIds.has(p.over)))
      // (No layer: it lies where it's drawn, among the cards.)
      .map((p) => drawPiece(p));
  const theme = themeOf(table.background);
  const ink = (alpha: number) => `rgba(${theme.ink},${alpha})`;
  const arrivingStack = arriving ? table.stacks.find((s) => s.id === arriving.stackId) : undefined;
  const arrivingTop = arrivingStack?.cards[arrivingStack.cards.length - 1];
  const riffleStacks = riffling ? table.stacks.filter((s) => riffling.stackIds.includes(s.id)) : [];
  const heldTop = held ? held.cards[held.cards.length - 1] : null;
  const heldDeck = heldTop ? getDeck(heldTop.deckId) : undefined;
  const heldSize = heldTop ? cardSizeOf(heldTop, size) : null;
  const zoomDeck = zoomed ? getDeck(zoomed.deckId) : undefined;
  const zoomCard = zoomed ? cardOf(zoomed) : undefined;
  /** The shape a face's art is being cropped to (the die's face's, or the coin's round side). */
  const cropPiece = faceCrop ? table.pieces?.find((p) => p.id === faceCrop.id) : undefined;
  const cropShape = cropPiece ? faceShape(cropPiece) : { ratio: 1, outline: null };

  return (
    // Dice on a table in 3D (see Dice3DContext).
    <Dice3DContext.Provider value>
    <View
      style={[styles.root, { backgroundColor: theme.outside }]}
      // Every finger, wherever on the screen (menus' windows too: they're inside this): where menus open, on iPad.
      onTouchStart={
        IS_PAD
          ? (e) => {
              lastTouch.set(e.nativeEvent.pageX, e.nativeEvent.pageY);
            }
          : undefined
      }>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} onLayout={layOut}>
          {/* The table, seen through the camera. */}
          <Animated.View style={[styles.world, worldStyle]} pointerEvents="none">
            <View style={[styles.tableEdge, { backgroundColor: theme.rim }]} />
            {/* The theme's cloth, under a lighter weave (or, classic, the felt itself). */}
            {theme.cloth ? <View style={[styles.cloth, { backgroundColor: theme.cloth }]} /> : null}
            <Image source={require('../../assets/textures/felt.png')} resizeMode="repeat" style={[styles.felt, theme.cloth && styles.feltOverCloth]} />
            {table.showGrid ? <GridLines step={gridStep} /> : null}
            {!table.showGrid && gridPeek ? (
              <Animated.View style={[StyleSheet.absoluteFill, gridFadeStyle]}>
                <GridLines step={gridStep} />
              </Animated.View>
            ) : null}
            {/*
              What lies flat (custom art, zones, card spots) under every card, then the stacks, each with what lies
              just over it (see flatOrder).
            */}
            {artOver(null)}
            {table.stacks.map((s) => (
              <Fragment key={s.id}>
              {groupMoving && chosenIds.has(s.id) && !staysPut(table, s) ? null : (
                <StackView
                  key={s.id}
                  stack={s}
                  deck={decksById.get(s.cards[s.cards.length - 1].deckId)}
                  decks={decksById}
                  size={cardSizeOf(s.cards[s.cards.length - 1], size)}
                  // While carried, its carried cards are out of sight (the rest still show); while riffled, all of it.
                  hidden={
                    (riffling?.started && riffling.stackIds.includes(s.id)) || arriving?.stackId === s.id
                      ? s.cards.map((c) => c.iid).join(',')
                      : held
                        ? s.cards.filter((c) => heldIds.has(c.iid)).map((c) => c.iid).join(',')
                        : ''
                  }
                  target={target === s.id}
                  selected={chosenIds.has(s.id) && !boxed.has(s.id)}
                  showCount={!table.hideCounts}
                />
              )}
              {artOver(s.id)}
              </Fragment>
            ))}
            {/* Counters and dice, above every card (and custom art, while it's being moved). */}
            {/*
              In their own layer (so their layers order them only among themselves), in one fixed order, each at its
              layer (see pieceLayers).
            */}
            <View style={styles.pieceLayer} pointerEvents="none">
              {(table.pieces ?? []).map((p) => (onCloth(p) || p.kind === 'art' ? null : drawPiece(p, pieceLayers.get(p.id))))}
            </View>
            {/* Each group picked out: one box round all of it, over everything in it. */}
            {pickedGroups.map(({ group, box }) => (
              <View
                key={group}
                pointerEvents="none"
                style={[styles.groupBox, { left: box.x - GROUP_BOX_ROOM, top: box.y - GROUP_BOX_ROOM, width: box.w + GROUP_BOX_ROOM * 2, height: box.h + GROUP_BOX_ROOM * 2 }]}
              />
            ))}
            {/* A piece just taken out of a bag, under the finger (it's on the table once it's put down). */}
            {pieceDrag?.out ? (
              <TablePieceView
                key={`out:${pieceDrag.out.piece.id}`}
                piece={pieceDrag.out.piece}
                at={{ x: pieceDrag.out.piece.x + pieceDrag.dx, y: pieceDrag.out.piece.y + pieceDrag.dy }}
              />
            ) : null}
            {/* Stacks being shuffled: the riffle, played on each where it lies, turned as it is (the first one says when). */}
            {riffling
              ? riffleStacks.map((rs, i) => {
                  const top = rs.cards[rs.cards.length - 1];
                  const deck = decksById.get(top.deckId);
                  if (!deck) return null;
                  const rsSize = cardSizeOf(top, size);
                  return (
                    <View
                      key={`riffle:${rs.id}`}
                      style={[
                        styles.stack,
                        { left: rs.x - rsSize.w / 2, top: rs.y - rsSize.h / 2, width: rsSize.w, height: rsSize.h, transform: [{ rotate: `${rs.angle}deg` }] },
                      ]}>
                      <Riffle
                        key={riffling.key}
                        deck={deck}
                        width={rsSize.w}
                        onStart={() => i === 0 && setRiffling((r) => (r ? { ...r, started: true } : r))}
                        onDone={() => i === 0 && setRiffling(null)}
                      />
                    </View>
                  );
                })
              : null}
            {/* The picked-out group, while it's dragged: drawn together, sliding with the finger. */}
            {groupMoving ? (
              <Animated.View
                style={[styles.groupLayer, groupStyle, (groupInHand !== null || pileFlights.some((f) => !f.into)) && styles.hidden]}>
                {table.stacks
                  .filter((s) => chosenIds.has(s.id) && !staysPut(table, s))
                  .map((s) => (
                    <StackView
                      key={s.id}
                      stack={s}
                      deck={decksById.get(s.cards[s.cards.length - 1].deckId)}
                      decks={decksById}
                      size={cardSizeOf(s.cards[s.cards.length - 1], size)}
                      hidden=""
                      target={false}
                      selected
                      showCount={!table.hideCounts}
                    />
                  ))}
                {flyers.map((f) => {
                  const deck = decksById.get(f.card.deckId);
                  return deck ? (
                    <GatherFlyer
                      key={f.key}
                      flyer={f}
                      deck={deck}
                      size={cardSizeOf(f.card, size)}
                      onLanded={() => setFlyers((all) => all.filter((x) => x.key !== f.key))}
                    />
                  ) : null;
                })}
              </Animated.View>
            ) : null}
            {/* Cards flying into a stack gathered without dragging (with the buttons). */}
            {!groupMoving && flyers.length ? (
              <View style={styles.groupLayer}>
                {flyers.map((f) => {
                  const deck = decksById.get(f.card.deckId);
                  return deck ? (
                    <GatherFlyer
                      key={f.key}
                      flyer={f}
                      deck={deck}
                      size={cardSizeOf(f.card, size)}
                      onLanded={() => setFlyers((all) => all.filter((x) => x.key !== f.key))}
                    />
                  ) : null;
                })}
              </View>
            ) : null}
          </Animated.View>

          {/*
            The hand tray along the bottom, as in table mode: wood, edge to edge and down to the bottom of the
            screen, with its tabs standing on its top edge. One tab per hand; only the chosen hand shows, so the
            phone can be passed round. Tapping the chosen tab folds the tray away (and back); holding a tab
            renames it.
          */}
          <Animated.View
            style={[
              styles.trayWrap,
              { top: trayOpenTop - HAND_TAB_H, height: trayH + HAND_TAB_H },
              narrowTray && { left: trayLeft, right: undefined, width: trayW },
              trayStyle,
              trayGone && { display: 'none' },
            ]}>
            <View style={styles.tabs}>
              <View style={styles.tabsRow} onLayout={(e) => setTabsW(Math.ceil(e.nativeEvent.layout.width))}>
              {Array.from({ length: HAND_COUNT }, (_, i) => {
                const on = i === handIndex;
                return (
                  <Pressable
                    key={i}
                    onPress={() => (on ? foldTray(!folded) : chooseHand(i))}
                    onLongPress={() =>
                      rename('Rename hand', table.handNames[i], (name) =>
                        updateSandbox({ ...table, handNames: table.handNames.map((n, j) => (j === i ? name : n)) }),
                      )
                    }
                    disabled={carrying}
                    hitSlop={{ top: 8, bottom: 4 }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${table.handNames[i]}, ${table.hands[i].length} cards`}
                    accessibilityHint={on ? (folded ? 'Opens the hand' : 'Folds the hand away') : 'Shows this hand. Hold to rename it.'}
                    style={({ pressed }) => [
                      styles.tab,
                      { backgroundColor: pressed ? theme.tabPressed : on ? theme.tabOn : theme.tab, borderColor: theme.shine },
                    ]}>
                    <Text style={[styles.tabText, { color: ink(on ? 0.95 : 0.6) }]} numberOfLines={1}>
                      {table.handNames[i]} · {table.hands[i].length}
                    </Text>
                    {on ? (
                      <SymbolView
                        name={folded ? { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' } : { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
                        size={10}
                        weight="bold"
                        tintColor={colors.accent}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
              </View>
            </View>
            <View style={{ height: trayH }} pointerEvents="box-none">
              {/* Narrowed (an iPhone turned on its side), it has ends: rounded at the top, its bevel carried down them. */}
              <WoodRail colors={theme.rail} shine={theme.shine} rounded={narrowTray ? TRAY_CORNER : undefined} />
              {/* More of the tray below its bottom (off screen), so its spring's bounce never shows a gap under it. */}
              <View style={[styles.overshoot, { top: trayH, height: SPRING_OVERSHOOT, backgroundColor: theme.rail[2] }]} />
              {/* (In a narrowed tray: inside the bevel down its ends, so it isn't covered, and rounded like the tray.) */}
              <View
                style={[
                  styles.groove,
                  { top: HAND_TOP_PAD, height: handCardH + HAND_ROW_PAD * 2 },
                  narrowTray && { left: 1.5 + HAND_TOP_PAD, right: 1.5 + HAND_TOP_PAD, borderRadius: TRAY_CORNER - HAND_TOP_PAD / 2, borderWidth: 1, borderColor: 'rgba(0,0,0,0.45)', borderBottomColor: 'rgba(255,220,180,0.12)' },
                ]}
              />
              {hand.length === 0 && handGap === null ? (
                <Text style={[styles.trayEmpty, { top: rowTop + handCardH / 2 - 10, color: ink(0.45) }]}>Drag cards here to put them in {table.handNames[handIndex]}</Text>
              ) : null}
              {/*
                The row: table mode's scroll view, card for card, so it scrolls, stretches and bounces just the same.
                Folded away, its cards peek out but can't be touched.
              */}
              <ScrollView
                ref={(view) => handList.attach(view)}
                horizontal
                alwaysBounceHorizontal
                showsHorizontalScrollIndicator={false}
                scrollEnabled={!held && !folded}
                scrollEventThrottle={16}
                onScroll={(e) => handScroll.set(e.nativeEvent.contentOffset.x)}
                style={[styles.handList, { top: HAND_TOP_PAD, height: handCardH + HAND_ROW_PAD * 2, pointerEvents: folded ? 'none' : 'auto' }]}
                contentContainerStyle={[styles.handCards, { paddingLeft: handPadL, paddingRight: handPadR }]}>
                {/*
                  Every card of the hand in its own place, always, all of it mounted: those being carried stay there,
                  unseen and taking no room. The finger carrying one is attached to the very view it landed on (the
                  card's picture); if that went, iOS would let the drag go the moment any other finger lifted. The
                  gap goes in among the rest, where carried cards would go in. Cards slide to their new places.
                */}
                {hand.flatMap((c) => {
                  const carried = heldIds.has(c.iid);
                  const gapHere = !carried && handGap === handRow.indexOf(c);
                  const deck = decksById.get(c.deckId);
                  if (!deck) return [];
                  const view = (
                    <Animated.View
                      key={c.iid}
                      layout={HAND_SLIDE}
                      style={carried ? styles.carried : { width: handWidthOf(c), pointerEvents: 'box-only' }}>
                      {/* Folded away, the hand's cards show their backs: nobody sees them as the phone goes round. */}
                      <CardView deck={deck} card={cardOf(c)} faceUp={c.faceUp && !folded} width={handWidthOf(c)} />
                    </Animated.View>
                  );
                  return gapHere ? [<Animated.View key="gap" layout={HAND_SLIDE} style={{ width: gapWidth, height: handCardH }} />, view] : [view];
                })}
                {handGap !== null && handGap >= handRow.length ? (
                  <Animated.View key="gap" layout={HAND_SLIDE} style={{ width: gapWidth, height: handCardH }} />
                ) : null}
              </ScrollView>
            </View>
          </Animated.View>

          {/* The tools drawer, on its edge: its tab pulls it out, and tucks it away again (and can be dragged). */}
          {/* Not while searching: the search is all there is. */}
          <Animated.View
            style={[
              styles.tools,
              // On an iPhone turned on its side: on the left, clear of the notch, from below the back button down.
              sideways
                ? { left: insets.left, top: barBottom, height: sideToolsH, width: TOOLS_W_SIDEWAYS, zIndex: 10 }
                : [toolsSpot.side === 'left' ? { left: 0 } : { right: 0 }, { top: toolsTop, height: toolsH, zIndex: 10 }],
              toolsStyle,
              !!searching && styles.hidden,
            ]}
            pointerEvents={searching ? 'none' : 'box-none'}>
            {/* More of the panel past the screen's edge, so its spring's bounce never shows a gap beside it. */}
            {toolsDragging || sideways ? null : (
              <View
                style={[styles.overshoot, styles.toolsOvershoot, { top: 0, height: toolsH, width: SPRING_OVERSHOOT, left: toolsSpot.side === 'left' ? -SPRING_OVERSHOOT : TOOLS_TAB_W + TOOLS_W }]}
              />
            )}
            <ScrollView
              style={[
                styles.toolsPanel,
                // Sideways, a panel of its own, rounded all round; on the edge, the drawer's.
                sideways
                  ? [styles.toolsPanelSideways, { width: TOOLS_W_SIDEWAYS, height: sideToolsH }]
                  : [{ height: toolsH }, toolsSpot.side === 'left' ? styles.toolsPanelLeft : styles.toolsPanelRight, panelCorners],
                toolsDragging && styles.hidden,
              ]}
              // (Its padding inside its content, so the content's measured height is all the panel needs.)
              contentContainerStyle={{ gap: 10, padding: 14 }}
              onContentSizeChange={(_, h) => setToolsContentH(Math.ceil(h))}
              // With all its tools in view, it doesn't scroll (or bounce) at all; only when they don't fit.
              alwaysBounceVertical={false}
              showsVerticalScrollIndicator={false}>
              <Text style={styles.toolsTitle}>Tools</Text>
              {(
                [
                  ['square.grid.3x3', 'grid_on', 'Snap to grid', gridOn, (on: boolean) => ({ snapToGrid: on }), 'Cards put down line up on the grid. Cards already on the table stay put.'],
                  ['grid', 'grid_4x4', 'Show grid', !!table.showGrid, (on: boolean) => ({ showGrid: on }), 'Draws the grid’s lines on the table.'],
                  ['number', 'tag', 'Stack counts', !table.hideCounts, (on: boolean) => ({ hideCounts: !on }), 'Shows how many cards each stack holds.'],
                  ['hand.raised', 'back_hand', 'Hands', !table.hideHands, (on: boolean) => ({ hideHands: on ? undefined : true }), 'Shows the hands’ tray. Hidden, the hands keep their cards.'],
                  ['lock', 'lock', 'Lock camera', !!table.lockCamera, (on: boolean) => ({ lockCamera: on }), 'The view stays put: sliding, zooming and turning the table do nothing. Cards still move.'],
                  ['lock.rotation', 'screen_lock_rotation', 'Lock rotation', !!table.lockRotation, (on: boolean) => ({ lockRotation: on || undefined }), 'Two fingers still slide and zoom the table, but don’t turn it.'],
                ] as const
              ).map(([ios, android, label, value, change, hint]) => (
                <View key={label} style={styles.toolRow}>
                  <SymbolView name={{ ios, android, web: android }} size={18} tintColor={colors.text} />
                  <Text style={styles.toolText}>{label}</Text>
                  <Switch
                    value={value}
                    onValueChange={(on) => {
                      updateSandbox({ ...table, ...change(on) });
                      haptics.tick();
                    }}
                    trackColor={{ true: colors.accent, false: undefined }}
                    accessibilityLabel={label}
                    accessibilityHint={hint}
                  />
                </View>
              ))}
              {/* The grid's size: its spacing, for snapping and its lines (shown for a moment as it's chosen). */}
              <Text style={styles.toolLabel}>Grid size</Text>
              <View style={styles.toolSegment}>
                {(Object.entries(GRID_SIZES) as [keyof typeof GRID_SIZES, number][]).map(([name, step]) => (
                  <Pressable
                    key={name}
                    onPress={() => {
                      updateSandbox({ ...table, gridStep: step });
                      haptics.tick();
                      // The lines for a moment, to see the spacing chosen.
                      const peek = Date.now();
                      latestPeek.set(peek);
                      setGridPeek(peek);
                      gridFade.set(1);
                      // Then they fade away (unless another size has been chosen meanwhile), and go.
                      setTimeout(() => {
                        if (latestPeek.get() === peek) gridFade.set(withTiming(0, { duration: GRID_FADE_MS }));
                      }, GRID_PEEK_MS);
                      setTimeout(() => {
                        if (latestPeek.get() === peek) setGridPeek(0);
                      }, GRID_PEEK_MS + GRID_FADE_MS);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${name} grid`}
                    accessibilityState={{ selected: gridStep === step }}
                    style={[styles.toolSegmentItem, gridStep === step && styles.toolSegmentOn]}>
                    <Text style={[styles.toolSegmentText, gridStep === step && { color: colors.accentText }]}>
                      {name === 'small' ? 'Small' : name === 'medium' ? 'Medium' : 'Large'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.toolDivider} />
              {(
                [
                  [
                    'arrow.up.left.and.arrow.down.right',
                    'fit_screen',
                    'Fit All',
                    () => {
                      fitView(table);
                      // After a few times: the quick pinch does this too.
                      offerTipAfterUses('tables-quick-pinch', undefined, 900);
                    },
                  ],
                  // Everything moved together into the middle of the table, as it's laid out; then all of it in view.
                  [
                    'scope',
                    'center_focus_strong',
                    'Center on Table',
                    () => {
                      const centered = centerOnTable(table, size);
                      if (centered !== table) commit(centered);
                      fitView(centered);
                    },
                  ],
                  // Cards and components alike: one menu.
                  [
                    'plus.circle',
                    'add_circle',
                    'Add to Table',
                    () => {
                      // In the middle of the view (holding the table adds right where it's held).
                      setAddAt(null);
                      setMenu({ kind: 'components' });
                    },
                  ],
                  // Once something's been copied.
                  ...(clip ? ([['doc.on.clipboard', 'content_paste', 'Paste', () => pasteClip(true)]] as const) : []),
                  ['wand.and.stars', 'auto_fix_high', 'Clean Up', cleanUp],
                  ['rectangle.stack', 'layers', 'Gather by Deck', gatherUp],
                  ['trash', 'delete', `Trash${table.trash?.length ? ` (${table.trash.length})` : ''}`, () => setTrashOpen(true)],
                ] as const
              ).map(([ios, android, label, run]) => (
                <Pressable
                  key={ios}
                  onPress={() => {
                    showTools(false);
                    run();
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.toolButton, pressed && { opacity: 0.6 }]}>
                  <SymbolView name={{ ios, android, web: android }} size={17} tintColor={colors.accent} />
                  <Text style={styles.toolButtonText}>{label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {/* The tab: tap to open or close; drag (closed) up or down the edge, or across to the other edge. */}
            <View
              {...toolsDrag.responder.panHandlers}
              hitSlop={toolsSpot.side === 'left' ? { right: 10, top: 6, bottom: 6 } : { left: 10, top: 6, bottom: 6 }}
              accessible
              accessibilityRole="button"
              accessibilityLabel={toolsOpen ? 'Hide tools' : 'Show tools'}
              accessibilityHint="Drag to move it up or down, or to the other side."
              onAccessibilityTap={() => showTools(!toolsOpen)}
              style={[
                styles.toolsTab,
                { top: tabInDrawer },
                toolsSpot.side === 'left' ? styles.toolsTabLeft : styles.toolsTabRight,
                toolsDragging && styles.toolsTabLifted,
                // Opened from the top bar instead, on an iPhone turned on its side.
                sideways && { display: 'none' },
              ]}>
              <SymbolView
                name={
                  toolsOpen
                    ? toolsSpot.side === 'left'
                      ? { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }
                      : { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }
                    : { ios: 'wrench.and.screwdriver', android: 'build', web: 'build' }
                }
                size={14}
                weight="semibold"
                tintColor={colors.accent}
              />
            </View>
          </Animated.View>

          {/*
            The flip button: while cards (or a group) are carried, tapped with another finger to turn them over; and
            whenever cards are picked out, to turn them over where they lie.
          */}
          {held || groupMoving || chosen.length ? (
            <View
              pointerEvents="none"
              style={[styles.flipButton, { left: flipButton.x, top: flipButton.y, width: FLIP_SIZE, height: FLIP_SIZE, borderRadius: FLIP_SIZE / 2 }, toolsOpen && !held && !groupMoving && styles.waiting]}>
              <SymbolView name={FLIP_ICON} size={28} weight="semibold" tintColor={colors.accentText} />
            </View>
          ) : null}

          {/* With a stack of two or more picked out (not dragged): above the flip button, one to shuffle it. */}
          {!held && !groupMoving && canShuffle ? (
            <View
              pointerEvents="none"
              style={[styles.flipButton, { left: shuffleButton.x, top: shuffleButton.y, width: FLIP_SIZE, height: FLIP_SIZE, borderRadius: FLIP_SIZE / 2 }, toolsOpen && styles.waiting]}>
              <SymbolView name={{ ios: 'shuffle', android: 'shuffle', web: 'shuffle' }} size={26} weight="semibold" tintColor={colors.accentText} />
            </View>
          ) : null}

          {/* With two or more picked out: one to gather them all into a stack (just above the flip button while they're dragged). */}
          {!held && chosen.length > 1 ? (
            <View
              pointerEvents="none"
              style={[styles.flipButton, { left: flipButton.x, top: groupMoving ? stackButton.y : gatherButton.y, width: FLIP_SIZE, height: FLIP_SIZE, borderRadius: FLIP_SIZE / 2 }, toolsOpen && !held && !groupMoving && styles.waiting]}>
              <SymbolView name={{ ios: 'square.stack.3d.down.right', android: 'layers', web: 'layers' }} size={26} weight="semibold" tintColor={colors.accentText} />
            </View>
          ) : null}

          {/* With anything picked out (not dragged): its other options (as a hold on it gives), on top of the column. */}
          {!held && !groupMoving && column.includes('more') ? (
            <View
              pointerEvents="none"
              style={[styles.flipButton, styles.moreButtonLook, { left: moreButton.x, top: moreButton.y, width: FLIP_SIZE, height: FLIP_SIZE, borderRadius: FLIP_SIZE / 2 }, toolsOpen && styles.waiting]}>
              <SymbolView name={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }} size={24} weight="bold" tintColor={colors.text} />
            </View>
          ) : null}

          {/*
            With dice (or coins, or spinners) picked out, and nothing else, or being dragged: one to roll (flip, spin)
            them all.
          */}
          {(!held && !groupMoving && rollKind) || dragRollKind ? (
            <View
              pointerEvents="none"
              style={[styles.flipButton, { left: rollButton.x, top: rollButton.y, width: FLIP_SIZE, height: FLIP_SIZE, borderRadius: FLIP_SIZE / 2 }, toolsOpen && styles.waiting]}>
              <SymbolView
                name={
                  (dragRollKind ?? rollKind) === 'coin'
                    ? { ios: 'centsign.circle', android: 'toll', web: 'toll' }
                    : (dragRollKind ?? rollKind) === 'spinner'
                      ? { ios: 'arrow.clockwise.circle', android: 'autorenew', web: 'autorenew' }
                      : { ios: 'dice', android: 'casino', web: 'casino' }
                }
                size={26}
                weight="semibold"
                tintColor={colors.accentText}
              />
            </View>
          ) : null}
          {/* With two or more things picked out: one to lay them out in an even grid. */}
          {!held && !groupMoving && gridLive ? (
            <View
              pointerEvents="none"
              style={[styles.flipButton, { left: gridButton.x, top: gridButton.y, width: FLIP_SIZE, height: FLIP_SIZE, borderRadius: FLIP_SIZE / 2 }, toolsOpen && styles.waiting]}>
              <SymbolView name={{ ios: 'square.grid.2x2', android: 'grid_view', web: 'grid_view' }} size={24} weight="semibold" tintColor={colors.accentText} />
            </View>
          ) : null}

          {/* A stack just brought onto the table, flying in from the top of the screen. */}
          {arriving && arrivingTop && decksById.get(arrivingTop.deckId) ? (
            <ArrivalFlyer
              key={arriving.key}
              deck={decksById.get(arrivingTop.deckId)!}
              card={arrivingTop}
              size={cardSizeOf(arrivingTop, size)}
              from={{ x: area.w / 2, y: insets.top + TOP_BAR_H / 2 }}
              to={arriving.to}
              scale={arriving.scale}
              angle={arriving.angle}
              onLanded={() => {
                setArriving(null);
                haptics.drop();
              }}
            />
          ) : null}

          {/* The lasso, as it's drawn. */}
          {lassoPath && lassoPath.length > 1 ? <LassoLine points={lassoPath} /> : null}

          {/* A dragged group over the hand: gathered into one pile under the finger, at hand size, ready to go in. */}
          {groupMoving && groupLeadTop && decksById.get(groupLeadTop.deckId) && !pileFlights.some((f) => f.into) ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.held,
                {
                  width: cardSizeOf(groupLeadTop, size).w,
                  height: cardSizeOf(groupLeadTop, size).h,
                  left: -cardSizeOf(groupLeadTop, size).w / 2,
                  top: -cardSizeOf(groupLeadTop, size).h / 2,
                },
                heldStyle,
              ]}>
              <CardView
                deck={decksById.get(groupLeadTop.deckId)!}
                card={cardOf(groupLeadTop)}
                faceUp={groupLeadTop.faceUp}
                width={cardSizeOf(groupLeadTop, size).w}
                sharp
              />
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{chosen.reduce((n, id) => n + (table.stacks.find((s) => s.id === id)?.cards.length ?? 0), 0)}</Text>
              </View>
            </Animated.View>
          ) : null}

          {/* Cards flying between the spread-out group and its pile over the hand. */}
          {pileFlights.map((f) => {
            const deck = decksById.get(f.card.deckId);
            return deck ? (
              <PileFlyer
                key={f.key}
                flight={f}
                deck={deck}
                size={cardSizeOf(f.card, size)}
                live={pileLive}
                onLanded={() => {
                  setPileFlights((all) => {
                    const left = all.filter((x) => x.key !== f.key);
                    // The last one in: a tick as the pile forms; the last one out: a thud as the group lands.
                    if (!left.length && all.length) (f.into ? haptics.tick : haptics.drop)();
                    return left;
                  });
                }}
              />
            ) : null;
          })}

          {/* The card being carried, drawn over everything, following the finger, just as it will lie. */}
          {held && heldTop && heldDeck && heldSize ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.held, { width: heldSize.w, height: heldSize.h, left: -heldSize.w / 2, top: -heldSize.h / 2 }, heldStyle]}>
              <CardView deck={heldDeck} card={cardOf(heldTop)} faceUp={heldTop.faceUp} width={heldSize.w} sharp />
              {held.cards.length > 1 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{held.cards.length}</Text>
                </View>
              ) : null}
            </Animated.View>
          ) : null}

          {/* The search: over everything, a layer of the table (not a window), so cards can be taken out of it. */}
          {searchMounted ? (
            <StackSearchPanel
              title={
                searchStack
                  ? `Searching ${searchStack.cards.length} ${searchStack.cards.length === 1 ? 'card' : 'cards'}`
                  : searchBag
                    ? `Searching the bag · ${bagItems(searchBag).length}`
                    : 'Search'
              }
              entries={
                searchStack
                  ? [...searchStack.cards].reverse().map((card) => ({ key: card.iid, card }))
                  : searchBag
                    ? [...bagItems(searchBag)].reverse().map((i) => ({ key: itemKey(i), card: i.card, piece: i.piece }))
                    : []
              }
              noun={searchBag ? ['thing', 'things'] : undefined}
              canTakeOut={!searchBag}
              decks={decksById}
              visible={!!searching && (!!searchStack || !!searchBag)}
              leaving={searchLeaving}
              onReorder={(picked, to) => {
                if (searchStack) commit(reorderStack(table, searchStack.id, picked, to));
                else if (searchBag) commit(reorderBag(table, searchBag.id, picked, to));
              }}
              onTakeOut={(iids, finger) => {
                searchTake.set(iids);
                setSearchLeaving(true);
                takeOut.set({ active: true, x: finger.x, y: finger.y });
                // Under the finger straight away, not just once it moves.
                gestureState.get().api?.startTakeOut(finger);
              }}
              cardActions={searchBag ? bagSearchActions : searchActions}
              pickActions={searchBag ? bagPickActions : searchPickActions}
              onClose={endSearch}
              onClosed={() => setSearchMounted(false)}
            />
          ) : null}
        </View>
      </GestureDetector>

      {/* A card or stack's menu: the card brought up close, its options under it. */}
      <CardFocus
        visible={!!sheet && (menu?.kind === 'stack' || menu?.kind === 'hand' || menu?.kind === 'selection' || menuIsPiece)}
        card={sheet && 'header' in sheet ? sheet.header : null}
        spotlight={spotlight}
        onOptionsAt={setOptionsAt}
        // On iPad, a window beside it; a card in the hand's beside where it was tapped.
        near={spotNear ?? (IS_PAD && menu?.kind === 'hand' && menuSpot?.at ? { x: menuSpot.at.x, y: menuSpot.at.y, w: 0, h: 0 } : undefined)}
        // Several picked out (on iPad): a window above the finger, or (a follow-up) where the last one was.
        place={IS_PAD && menu?.kind === 'selection' ? { at: menuSpot?.at, from: menuSpot?.from, avoid: menuSpot?.from ? menuTarget : undefined } : undefined}
        onPlace={(rect) => lastWindow.set({ rect })}
        title={sheet?.title}
        tiles={sheet?.tiles ?? []}
        rows={sheet && 'rows' in sheet ? sheet.rows : undefined}
        panel={
          menu?.kind === 'stack' && menuStack && dealingFrom === menuStack.id ? (
            <DealPanel
              max={menuStack.cards.length}
              players={table.handNames.map((name, i) => ({ name, holding: table.hands[i].length }))}
              onDeal={(count, player) => {
                commit(dealToHand(table, menuStack.id, count, player));
                haptics.drop();
                setMenu(null);
              }}
              onBack={() => setDealingFrom(null)}
            />
          ) : undefined
        }
        onClose={() => {
          setMenu(null);
          setDealingFrom(null);
        }}
        overlay={
          zoomed && zoomDeck && zoomCard ? (
            <CardZoom
              deck={zoomDeck}
              current={{ key: zoomed.iid, card: zoomCard }}
              area={{ w: screenW, h: area.h }}
              onClose={() => setZoomed(null)}
            />
          ) : undefined
        }
      />
      <TrashModal
        visible={trashOpen}
        cards={table.trash ?? []}
        decks={decksById}
        onPutBack={(iids) => {
          const back = (table.trash ?? []).filter((c) => iids.includes(c.iid)).map((c) => ({ ...c, faceUp: true }));
          arrive(putOnTable(takeFromTrash(table, iids), back, { ...viewMiddle(), angle: 0 }, newId()));
        }}
        onEmpty={() => commit({ ...table, trash: [] })}
        onClose={() => setTrashOpen(false)}
      />
      <AddCardsModal visible={addingCards} decks={decks} onAdd={addCardsToTable} onClose={() => setAddingCards(false)} />
      {/*
        A face's art, cropped to the face's shape (its outline over the picture); kept with its color; then the faces
        again (put away, they're shown again as they were).
      */}
      <CropModal
        uris={faceCrop ? [faceCrop.uri] : []}
        ratio={cropShape.ratio}
        outline={cropShape.outline}
        title={cropPiece?.kind === 'coin' ? 'Crop the coin’s art' : 'Crop the face’s art'}
        onDone={([cropped]) => {
          const crop = faceCrop;
          setFaceCrop(null);
          if (!crop || !cropped) return;
          (async () => {
            const picture = await facePicture(cropped, cropShape.ratio);
            // The die's color while it's up: the commonest round the face's edge, where the die's sides meet it.
            const color = await faceArtColor(picture, cropShape.outline);
            setFaceArt(crop.id, crop.face, importImage(TOKEN_PICTURES, picture), color);
          })().catch((e: unknown) => Alert.alert('Couldn’t use that picture', e instanceof Error ? e.message : String(e)));
        }}
        onCancel={() => {
          const crop = faceCrop;
          setFaceCrop(null);
          if (crop) setTimeout(() => setMenu({ kind: 'faces', id: crop.id }), 300);
        }}
      />
      {/* A token's picture, cropped to the shape chosen under it (the token takes that shape). */}
      <CropModal
        uris={tokenCrop ? [tokenCrop.uri] : []}
        ratio={1}
        outline={tokenOutline(cropTokenShape)}
        title="Crop the token’s art"
        shapes={TOKEN_SHAPES.map(({ shape, name }) => ({ key: shape, name, outline: tokenOutline(shape) }))}
        shape={cropTokenShape}
        onShape={(key) => setCropTokenShape(key as TokenShape)}
        onDone={([cropped]) => {
          const crop = tokenCrop;
          const tokenShape = cropTokenShape;
          setTokenCrop(null);
          if (!crop || !cropped) return;
          (async () => {
            const picture = await tokenPicture(cropped);
            // Its color, as a die's with art on it: the commonest round the edge of the shape, so its sides match.
            const color = await faceArtColor(picture, tokenOutline(tokenShape));
            const image = importImage(TOKEN_PICTURES, picture);
            const now = latest.get();
            if (!now.table) return;
            const look = { image, tokenShape, square: undefined, color };
            if (crop.id) now.commit(setPiece(now.table, crop.id, look));
            else now.addPieceToTable('token', undefined, undefined, look);
          })().catch((e: unknown) => Alert.alert('Couldn’t use that picture', e instanceof Error ? e.message : String(e)));
        }}
        onCancel={() => setTokenCrop(null)}
      />
      {/* The table's menu, and choosing a deck to add. */}
      <ActionSheet
        visible={!!sheet && (menu?.kind === 'table' || menu?.kind === 'addDeck' || menu?.kind === 'color' || menu?.kind === 'dieKind' || menu?.kind === 'pieceColor' || menu?.kind === 'components' || menu?.kind === 'addDie' || menu?.kind === 'scale' || menu?.kind === 'rotate' || menu?.kind === 'dieValue' || menu?.kind === 'faces' || menu?.kind === 'pieceShape' || menu?.kind === 'addShape' || menu?.kind === 'tokenShape' || menu?.kind === 'zoneOpacity' ||menu?.kind === 'scorePlayers' || menu?.kind === 'scoreList' || menu?.kind === 'scoreEntry')}
        title={sheet?.title}
        banner={sheet && 'banner' in sheet ? sheet.banner : undefined}
        wideTile={sheet && 'wideTile' in sheet ? sheet.wideTile : undefined}
        tiles={sheet?.tiles}
        moreTiles={sheet && 'moreTiles' in sheet ? sheet.moreTiles : undefined}
        moreLocked={sheet && 'moreLocked' in sheet ? sheet.moreLocked : undefined}
        actions={sheet?.actions ?? []}
        // Scaling is kept as it's made: put away, it's done (and one undo).
        closeLabel={menu?.kind === 'scale' || menu?.kind === 'rotate' || menu?.kind === 'dieValue' || menu?.kind === 'faces' ? 'Done' : undefined}
        // The table's settings (and its theme, chosen from them) dropped from the top, by its name, on iPad and iPhone.
        // Every other menu: on iPad a window where the finger was, on iPhone a sheet from the bottom.
        place={
          menu?.kind === 'table' || menu?.kind === 'color'
            ? { kind: 'drop' }
            : IS_PAD
              ? { kind: 'window', at: menuSpot?.at, from: menuSpot?.from, avoid: menuSpot?.from ? menuTarget : undefined }
              : undefined
        }
        onPlace={(rect) => lastWindow.set({ rect })}
        onClose={() => {
          finishScale();
          setMenu(null);
        }}
      />
    </View>
    </Dice3DContext.Provider>
  );
}

/**
 * The grid's lines across the whole table, shown while snapping is on (for now, for trying it out: the grid is
 * meant to be invisible). Cards snap to their crossings and the middles of their squares.
 */
const GridLines = memo(function GridLines({ step }: { step: number }) {
  return [
    ...Array.from({ length: Math.floor(TABLE_W / step) + 1 }, (_, i) => (
      <View key={`v${i}`} style={[styles.gridLine, { left: i * step - 0.75, top: 0, width: 1.5, height: TABLE_H }]} />
    )),
    ...Array.from({ length: Math.floor(TABLE_H / step) + 1 }, (_, i) => (
      <View key={`h${i}`} style={[styles.gridLine, { top: i * step - 0.75, left: 0, height: 1.5, width: TABLE_W }]} />
    )),
  ];
});

/** A card flying into a stack just gathered: from where its stack lay (relative to the gathering one), to it. */
interface Flyer {
  key: string;
  card: SandboxCard;
  /** Where the stack it flies to lies, and its turn. */
  at: { x: number; y: number; angle: number };
  /** Where it starts, relative to that, and its own turn. */
  from: { dx: number; dy: number; angle: number };
  /** Which way up it lands (the gathering stack's way). */
  face: boolean;
}

/** How long a gathered card takes to fly into its stack. */
const GATHER_MS = 340;

/** One card's flight into a gathered stack: gliding there, turning to its angle, and flipping over if it must. */
function GatherFlyer({ flyer, deck, size, onLanded }: { flyer: Flyer; deck: Deck; size: { w: number; h: number }; onLanded: () => void }) {
  const [t] = useState(() => new RNAnimated.Value(0));
  const [faceUp, setFaceUp] = useState(flyer.card.faceUp);
  useEffect(() => {
    // Turned to the stack's way as it goes (the card turning over as it flies).
    setTimeout(() => setFaceUp(flyer.face), GATHER_MS * 0.15);
    RNAnimated.timing(t, { toValue: 1, duration: GATHER_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      haptics.tick();
      onLanded();
    });
    // Once, as it sets off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Turning the short way round.
  const turn = ((((flyer.at.angle - flyer.from.angle + 180) % 360) + 360) % 360) - 180;
  return (
    <RNAnimated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: flyer.at.x - size.w / 2,
        top: flyer.at.y - size.h / 2,
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [flyer.from.dx, 0] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [flyer.from.dy, 0] }) },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: [`${flyer.from.angle}deg`, `${flyer.from.angle + turn}deg`] }) },
        ],
      }}>
      <CardView deck={deck} card={deck.cards.find((c) => c.id === flyer.card.cardId)} faceUp={faceUp} width={size.w} sharp />
    </RNAnimated.View>
  );
}

/**
 * A stack just brought onto the table: its top card flying in from the top of the screen to where it lands (on
 * screen; the camera brings the table under it as it flies), growing to its size there as it comes.
 */
function ArrivalFlyer({
  deck,
  card,
  size,
  from,
  to,
  scale,
  angle,
  onLanded,
}: {
  deck: Deck;
  card: SandboxCard;
  size: { w: number; h: number };
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Screen points per table unit (the camera's zoom), and its turn: the card's size and turn on landing. */
  scale: number;
  angle: number;
  onLanded: () => void;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(
      withTiming(1, { duration: ARRIVE_MS, easing: ReEasing.inOut(ReEasing.cubic) }, (finished) => {
        if (finished) scheduleOnRN(onLanded);
      }),
    );
    // Once, as it sets off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => {
    const p = t.value;
    return {
      opacity: Math.min(1, p * 4),
      transform: [
        { translateX: from.x + (to.x - from.x) * p },
        { translateY: from.y + (to.y - from.y) * p },
        { rotate: `${angle * p}deg` },
        { scale: scale * (0.5 + 0.5 * p) },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -size.w / 2, top: -size.h / 2, width: size.w, height: size.h }, style]}>
      <CardView deck={deck} card={deck.cards.find((c) => c.id === card.cardId)} faceUp={card.faceUp} width={size.w} sharp />
    </Animated.View>
  );
}

/** One card's flight between the spread-out group and its pile over the hand. */
interface PileFlight {
  key: string;
  card: SandboxCard;
  /** Where its stack lies in the group (before the group's drag), and its turn. */
  at: { x: number; y: number; angle: number };
  /** Its size in the pile: screen points per table unit, for a hand card's size. */
  handScale: number;
  /** Flying into the pile (gathering) rather than out of it (spreading out). */
  into: boolean;
}

/** What a flying card follows: the camera, how far the group has been dragged, and the finger (the pile). */
interface PileLive {
  camA: SharedValue<number>;
  camB: SharedValue<number>;
  camX: SharedValue<number>;
  camY: SharedValue<number>;
  groupDX: SharedValue<number>;
  groupDY: SharedValue<number>;
  fingerX: SharedValue<number>;
  fingerY: SharedValue<number>;
}

/** How long a card takes to fly between the group and its pile. */
const PILE_MS = 240;

/**
 * A card flying between the spread-out group and its pile over the hand: gliding, turning and resizing as it goes,
 * every frame between where it is in the group now and where the finger is now, so it keeps up as the finger moves.
 */
function PileFlyer({
  flight,
  deck,
  size,
  live,
  onLanded,
}: {
  flight: PileFlight;
  deck: Deck;
  size: { w: number; h: number };
  live: PileLive;
  onLanded: () => void;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(
      withTiming(1, { duration: PILE_MS, easing: ReEasing.out(ReEasing.cubic) }, (finished) => {
        if (finished) scheduleOnRN(onLanded);
      }),
    );
    // Once, as it sets off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { at, handScale, into } = flight;
  const style = useAnimatedStyle(() => {
    // In the group: its place there now (moved with the group), seen through the camera.
    const wx = at.x + live.groupDX.value;
    const wy = at.y + live.groupDY.value;
    const a = live.camA.value;
    const b = live.camB.value;
    const spread = {
      x: a * wx - b * wy + live.camX.value,
      y: b * wx + a * wy + live.camY.value,
      angle: at.angle + (Math.atan2(b, a) * 180) / Math.PI,
      scale: Math.hypot(a, b),
    };
    // In the pile: under the finger, upright, at hand size.
    const pile = { x: live.fingerX.value, y: live.fingerY.value, angle: 0, scale: handScale };
    const from = into ? spread : pile;
    const to = into ? pile : spread;
    const p = t.value;
    // Turning the short way round.
    const turn = ((((to.angle - from.angle + 180) % 360) + 360) % 360) - 180;
    return {
      transform: [
        { translateX: from.x + (to.x - from.x) * p },
        { translateY: from.y + (to.y - from.y) * p },
        { rotate: `${from.angle + turn * p}deg` },
        { scale: from.scale + (to.scale - from.scale) * p },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -size.w / 2, top: -size.h / 2, width: size.w, height: size.h }, style]}>
      <CardView deck={deck} card={deck.cards.find((c) => c.id === flight.card.cardId)} faceUp={flight.card.faceUp} width={size.w} sharp />
    </Animated.View>
  );
}
/** The lasso's line as it's drawn, closed back to its start, with a faint gold fill inside. */
function LassoLine({ points }: { points: { x: number; y: number }[] }) {
  const builder = Skia.PathBuilder.Make();
  builder.moveTo(points[0].x, points[0].y);
  for (const p of points.slice(1)) builder.lineTo(p.x, p.y);
  builder.close();
  const path = builder.build();
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path path={path} color="rgba(224,179,84,0.12)" />
      <Path path={path} color={colors.accent} style="stroke" strokeWidth={2} strokeJoin="round" />
    </Canvas>
  );
}

/**
 * Where a lasso's finger has come back along its own line, if it has: the earliest of the line's recent points
 * (its last LASSO_RETRACE_LENGTH or so) it's back beside, heading back the way the line went there. Coming round to
 * close the loop doesn't count: that's far back along the line, and heading on, not back. -1 if not.
 */
function lassoRetrace(line: { x: number; y: number }[], to: { x: number; y: number }): number {
  const last = line[line.length - 1];
  if (!last || line.length < 3) return -1;
  const move = { x: to.x - last.x, y: to.y - last.y };
  const moved = Math.hypot(move.x, move.y);
  if (!moved) return -1;
  let found = -1;
  let along = 0;
  // From the newest back, skipping the last point (always right beside the finger).
  for (let i = line.length - 2; i >= 0; i--) {
    along += Math.hypot(line[i + 1].x - line[i].x, line[i + 1].y - line[i].y);
    if (along > LASSO_RETRACE_LENGTH) break;
    if (Math.hypot(to.x - line[i].x, to.y - line[i].y) > LASSO_RETRACE_REACH) continue;
    // Heading back: against the way the line went from this point.
    const d = { x: line[i + 1].x - line[i].x, y: line[i + 1].y - line[i].y };
    const dLen = Math.hypot(d.x, d.y);
    if (dLen && (move.x * d.x + move.y * d.y) / (moved * dLen) < -0.5) found = i;
  }
  return found;
}

/** A stack on the table: its top card (and edges below it, for more than one), turned as it lies. */
const StackView = memo(function StackView({
  stack,
  deck,
  decks,
  size,
  hidden,
  target,
  selected,
  showCount = true,
}: {
  stack: SandboxStack;
  deck: Deck | undefined;
  decks: Map<string, Deck>;
  size: { w: number; h: number };
  /** Its cards being carried (out of sight here), as their ids joined by commas. */
  hidden: string;
  target: boolean;
  /** Picked out with the lasso: outlined in gold. */
  selected: boolean;
  /** Whether a stack shows how many cards it holds (the table's choice). */
  showCount?: boolean;
}) {
  const gone = new Set(hidden ? hidden.split(',') : []);
  const shown = gone.size ? stack.cards.filter((c) => !gone.has(c.iid)) : stack.cards;
  // Turned over, the whole stack turns: the paper edges under the top card turn edge-on and back with it (the card
  // does its own turn), so it doesn't look as if only the top card flipped.
  const faceUp = shown[shown.length - 1]?.faceUp;
  const [edgeTurn] = useState(() => new RNAnimated.Value(0));
  const [lastFaceUp, setLastFaceUp] = useState(faceUp);
  const [flips, setFlips] = useState(0);
  if (faceUp !== lastFaceUp) {
    setLastFaceUp(faceUp);
    if (faceUp !== undefined && lastFaceUp !== undefined) setFlips((n) => n + 1);
  }
  useEffect(() => {
    if (!flips || prefersReducedMotion()) return;
    const half = (toValue: number, easing: (t: number) => number) =>
      RNAnimated.timing(edgeTurn, { toValue, duration: HALF_FLIP_MS, easing, useNativeDriver: true });
    RNAnimated.sequence([half(1, Easing.in(Easing.quad)), half(0, Easing.out(Easing.quad))]).start();
  }, [flips, edgeTurn]);
  const [edgeTransform] = useState(() => [
    { perspective: 800 },
    { rotateY: edgeTurn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) },
    { scale: edgeTurn.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
  ]);
  if (!shown.length || !deck) return null;
  const top = shown[shown.length - 1];
  const topDeck = decks.get(top.deckId) ?? deck;
  const card = topDeck.cards.find((c) => c.id === top.cardId);
  // No paper edges under a see-through card (a die-cut shape): they'd show round it.
  const showing = top.faceUp ? card?.image : (card?.back ?? topDeck.backImage);
  const edges = isSeeThrough(showing) ? 0 : Math.min(2, shown.length - 1);
  // The deck's corners (as rounded as in the deck editor), for the edges under it and its outline.
  const radius = cardRadius(topDeck, size.w);
  return (
    <View
      style={[
        styles.stack,
        { left: stack.x - size.w / 2, top: stack.y - size.h / 2, width: size.w, height: size.h, transform: [{ rotate: `${stack.angle}deg` }] },
      ]}>
      <RNAnimated.View style={[StyleSheet.absoluteFill, { transform: edgeTransform }]} pointerEvents="none">
        {Array.from({ length: edges }, (_, i) => (
          <View key={i} style={[styles.edge, { left: (edges - i) * 2, top: (edges - i) * 2, width: size.w, height: size.h, borderRadius: radius }]} />
        ))}
      </RNAnimated.View>
      {/*
        Its shadow. A rounded card's is drawn as a box shadow (worked out once, not traced from the card's picture
        every frame as the table moves: with hundreds of cards, that made sliding and zooming slow). A die-cut card
        keeps the traced one, which follows its shape.
      */}
      <View style={isSeeThrough(showing) ? styles.shadow : [styles.boxShadow, { width: size.w, height: size.h, borderRadius: radius }]}>
        <CardView deck={topDeck} card={card} faceUp={top.faceUp} width={size.w} sharp />
      </View>
      {shown.length > 1 && showCount ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{shown.length}</Text>
        </View>
      ) : null}
      {target || selected ? <View style={[styles.target, { borderRadius: radius + 5 }]} /> : null}
      {/* Locked in place: a small padlock on its corner, but only while it's picked out (not on every locked card). */}
      {stack.locked && selected ? (
        <View style={styles.lockBadge}>
          <SymbolView name={{ ios: 'lock.fill', android: 'lock', web: 'lock' }} size={11} tintColor={colors.text} />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.feltDeep },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.bg },
  missingText: { color: colors.textMuted },
  link: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  world: { position: 'absolute', left: 0, top: 0, width: TABLE_W, height: TABLE_H, transformOrigin: [0, 0, 0] },
  felt: { position: 'absolute', left: 0, top: 0, width: TABLE_W, height: TABLE_H, opacity: 0.9 },
  cloth: { position: 'absolute', left: 0, top: 0, width: TABLE_W, height: TABLE_H },
  feltOverCloth: { opacity: 0.3 },
  // A wooden rim round the table, so its edge is clear when zoomed out.
  tableEdge: {
    position: 'absolute',
    left: -40,
    top: -40,
    width: TABLE_W + 80,
    height: TABLE_H + 80,
    borderRadius: 60,
    backgroundColor: '#3b2414',
  },
  stack: { position: 'absolute' },
  edge: { position: 'absolute', backgroundColor: '#d9d2c4', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.3)' },
  shadow: { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 4, shadowOffset: { width: 1, height: 3 } },
  // The same shadow, as a box shadow (see StackView).
  boxShadow: { boxShadow: '1px 3px 8px rgba(0, 0, 0, 0.45)' },
  target: { position: 'absolute', left: -5, top: -5, right: -5, bottom: -5, borderWidth: 3, borderColor: colors.accent },
  // A group picked out: one box round all of it, as a single thing's outline is drawn (but dashed: it's several).
  groupBox: { position: 'absolute', borderWidth: 3, borderColor: colors.accent, borderStyle: 'dashed', borderRadius: 12 },
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 6,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.accentText, fontWeight: '800', fontSize: 13 },
  // A counter's or die's colors to pick from (see the pieceColor menu).
  swatches: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14, paddingVertical: 8, paddingHorizontal: 12 },
  // The dice to choose from, drawn as they'll look on the table.
  dicePicks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 18, paddingVertical: 12, paddingHorizontal: 12 },
  dicePick: { width: 72, alignItems: 'center', gap: 6 },
  dicePickArt: { width: 60, height: 60 },
  dicePickText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  swatchOn: { borderWidth: 3, borderColor: colors.accent },
  // The grid's lines, shown for now (for trying the grid out).
  gridLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.13)' },
  // The tools drawer: a panel off the left (or right) edge, with a tab on its inner edge to pull it out by.
  tools: { position: 'absolute', width: TOOLS_W + TOOLS_TAB_W },
  toolsPanel: {
    position: 'absolute',
    top: 0,
    width: TOOLS_W,
    backgroundColor: 'rgba(8,18,26,0.9)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  toolsPanelLeft: { left: 0, borderTopRightRadius: TOOLS_PANEL_RADIUS, borderBottomRightRadius: TOOLS_PANEL_RADIUS, borderLeftWidth: 0 },
  toolsPanelRight: { left: TOOLS_TAB_W, borderTopLeftRadius: TOOLS_PANEL_RADIUS, borderBottomLeftRadius: TOOLS_PANEL_RADIUS, borderRightWidth: 0 },
  // On an iPhone turned on its side: a panel of its own, rounded all round.
  toolsPanelSideways: { left: 0, borderRadius: TOOLS_PANEL_RADIUS },
  toolsTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toolText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  toolLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: -4 },
  toolSegment: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 9, padding: 2 },
  toolSegmentItem: { flex: 1, paddingVertical: 6, borderRadius: 7, alignItems: 'center' },
  toolSegmentOn: { backgroundColor: colors.accent },
  toolSegmentText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  toolDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: 2 },
  toolButton: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  toolButtonText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  toolsTab: {
    position: 'absolute',
    width: TOOLS_TAB_W,
    height: TOOLS_TAB_H,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,18,26,0.9)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  toolsTabLeft: { left: TOOLS_W, borderTopRightRadius: 12, borderBottomRightRadius: 12, borderLeftWidth: 0 },
  toolsTabRight: { left: 0, borderTopLeftRadius: 12, borderBottomLeftRadius: 12, borderRightWidth: 0 },
  // Lifted to be moved: outlined in gold all round, rounded all round (it's off its edge). Each side and corner is
  // set, since the edge styles above set them one by one, which would win over the all-round ones.
  toolsTabLifted: {
    borderColor: colors.accent,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  // The whole table's size (a sizeless layer at the table's corner can be skipped as off screen, cards and all),
  // turning about that corner, as its transform expects.
  groupLayer: { position: 'absolute', left: 0, top: 0, width: TABLE_W, height: TABLE_H, transformOrigin: [0, 0, 0] },
  // The pieces over the cards, the whole table's size (a sizeless one can be skipped as off screen).
  pieceLayer: { position: 'absolute', left: 0, top: 0, width: TABLE_W, height: TABLE_H },
  flipButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  held: { position: 'absolute' },
  hidden: { opacity: 0 },
  /** The selection's buttons while the tools lie over them: dimmed, and doing nothing till they're put away. */
  waiting: { opacity: 0.5 },
  moreButtonLook: { backgroundColor: 'rgba(8,18,26,0.85)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.3)' },
  lockBadge: {
    position: 'absolute',
    left: -6,
    bottom: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,18,26,0.85)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  // The tray and its tabs, which slide together when it folds.
  trayWrap: { position: 'absolute', left: 0, right: 0 },
  // Past the tray's (or tools panel's) outer edge, off screen, for the spring's bounce.
  overshoot: { position: 'absolute', left: 0, right: 0, pointerEvents: 'none' },
  toolsOvershoot: { right: undefined, backgroundColor: 'rgba(8,18,26,0.9)' },
  // The groove the hand's cards sit in, as along table mode's rail.
  groove: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.45)',
    borderBottomColor: 'rgba(255,220,180,0.12)',
  },
  trayEmpty: { position: 'absolute', left: 0, right: 0, color: 'rgba(255,240,220,0.45)', fontSize: 14, textAlign: 'center' },
  handCard: { position: 'absolute' },
  // A carried card's place in the hand: still there (see above), but unseen, untouchable, and taking no room.
  carried: { position: 'absolute', opacity: 0, pointerEvents: 'none' },
  // Table mode's hand row: its scroll view, and the space round and between its cards.
  handList: { position: 'absolute', left: 0, right: 0 },
  // Cards stand in the middle of the row's height (landscape ones are shorter than the rest).
  handCards: { paddingHorizontal: HAND_PAD, paddingVertical: HAND_ROW_PAD, gap: HAND_GAP, alignItems: 'center' },
  // Pull tabs standing on the tray's top edge, in the same wood, as table mode's: one per hand.
  tabs: { height: HAND_TAB_H, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: HAND_TABS_PAD },
  tabsRow: { flexShrink: 1, flexDirection: 'row', alignItems: 'flex-end', gap: HAND_TAB_GAP },
  tab: {
    flexShrink: 1,
    height: HAND_TAB_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    borderTopLeftRadius: 11,
    borderTopRightRadius: 11,
    backgroundColor: '#4a2d18',
    // The light catching its top edge, as along the rail's.
    borderTopWidth: 1.5,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,220,180,0.25)',
  },
  tabPressed: { backgroundColor: '#3a2212' },
  tabText: { color: 'rgba(255,240,220,0.6)', fontSize: 12, fontWeight: '700' },
});
