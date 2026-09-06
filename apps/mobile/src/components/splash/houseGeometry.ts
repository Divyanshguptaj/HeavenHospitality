/**
 * The house, sketched before any animation code: seven pieces, each one a
 * real part of the final icon, never a decorative shape swapped for it.
 *
 *            leftRoof   rightRoof
 *                 \       /
 *                  \     /
 *          +--------+---+--------+
 *          | window |   |        |
 *          | leftWall   | rightWall
 *          |        | door |    |
 *          +--------+------+----+
 *          |         base        |
 *          +----------------------+
 *
 * All coordinates are in design units on a coordinate system centered on the
 * house itself (0, 0) — the roof apex sits above the origin, the base sits
 * below it. The animation controller scales this whole space to the device
 * at render time, so nothing here is a screen-specific pixel.
 *
 * Every piece carries where it starts (scattered, at its own angle), where it
 * passes through mid-flight (near the shared centre, where the "collision"
 * happens), and where it ends up (its exact, final slot in the house). The
 * controller only interpolates between these three points — it never decides
 * the shape of the house.
 */

const WALL_W = 75;
const WALL_H = 85;
const ROOF_H = 62;
const BASE_H = 14;
const BASE_OVERHANG = 8;
const DOOR_W = 30;
const DOOR_H = 46;
const WINDOW_SIZE = 22;

/** Roof apex to base, the full height of the assembled house. */
export const HOUSE_HEIGHT = ROOF_H + WALL_H + BASE_H;
export const HOUSE_WIDTH = WALL_W * 2 + BASE_OVERHANG * 2;

/** Vertical centre of the assembled house — the shared "collision" point. */
const HOUSE_CENTER_Y = (-ROOF_H + (WALL_H + BASE_H)) / 2;
const HOUSE_CENTER = { x: 0, y: HOUSE_CENTER_Y };

export type PieceShape =
  | { kind: 'rect'; width: number; height: number }
  | { kind: 'triangle'; width: number; height: number; points: string };

export type PieceColor = 'primary' | 'accent' | 'cutout';

export interface HousePieceConfig {
  readonly id: string;
  readonly shape: PieceShape;
  readonly color: PieceColor;
  /** Centre of the piece's final position, house-centered design units. */
  readonly finalCenter: { readonly x: number; readonly y: number };
  /** Offset from finalCenter where the piece starts, scattered off-screen. */
  readonly startOffset: { readonly x: number; readonly y: number };
  /** Offset from finalCenter at the mid-flight collision point. */
  readonly collisionOffset: { readonly x: number; readonly y: number };
  readonly startRotationDeg: number;
  readonly startScale: number;
}

function piece(
  config: Omit<HousePieceConfig, 'collisionOffset'>,
): HousePieceConfig {
  return {
    ...config,
    collisionOffset: {
      x: HOUSE_CENTER.x - config.finalCenter.x,
      y: HOUSE_CENTER.y - config.finalCenter.y,
    },
  };
}

const LEFT_WALL_CENTER = { x: -WALL_W / 2, y: WALL_H / 2 };
const RIGHT_WALL_CENTER = { x: WALL_W / 2, y: WALL_H / 2 };
const BASE_CENTER = { x: 0, y: WALL_H + BASE_H / 2 };
const DOOR_CENTER = { x: 0, y: WALL_H - DOOR_H / 2 };
const WINDOW_CENTER = { x: -WALL_W / 2, y: WALL_H / 2 - 15 };
const LEFT_ROOF_CENTER = { x: -WALL_W / 3, y: -ROOF_H / 3 };
const RIGHT_ROOF_CENTER = { x: WALL_W / 3, y: -ROOF_H / 3 };

export const HOUSE_PIECES: readonly HousePieceConfig[] = [
  piece({
    id: 'leftRoof',
    // (0, base) -> (width, base) -> (width, apex): vertical seam on the right
    shape: { kind: 'triangle', width: WALL_W, height: ROOF_H, points: `0,${ROOF_H} ${WALL_W},${ROOF_H} ${WALL_W},0` },
    color: 'primary',
    finalCenter: LEFT_ROOF_CENTER,
    startOffset: { x: -160, y: -150 },
    startRotationDeg: -70,
    startScale: 0.55,
  }),
  piece({
    id: 'rightRoof',
    // (0, base) -> (width, base) -> (0, apex): vertical seam on the left
    shape: { kind: 'triangle', width: WALL_W, height: ROOF_H, points: `0,${ROOF_H} ${WALL_W},${ROOF_H} 0,0` },
    color: 'primary',
    finalCenter: RIGHT_ROOF_CENTER,
    startOffset: { x: 160, y: -150 },
    startRotationDeg: 65,
    startScale: 0.55,
  }),
  piece({
    id: 'leftWall',
    shape: { kind: 'rect', width: WALL_W, height: WALL_H },
    color: 'primary',
    finalCenter: LEFT_WALL_CENTER,
    startOffset: { x: -195, y: 15 },
    startRotationDeg: -40,
    startScale: 0.55,
  }),
  piece({
    id: 'rightWall',
    shape: { kind: 'rect', width: WALL_W, height: WALL_H },
    color: 'primary',
    finalCenter: RIGHT_WALL_CENTER,
    startOffset: { x: 195, y: 15 },
    startRotationDeg: 42,
    startScale: 0.55,
  }),
  piece({
    id: 'base',
    shape: { kind: 'rect', width: HOUSE_WIDTH, height: BASE_H },
    color: 'primary',
    finalCenter: BASE_CENTER,
    startOffset: { x: -25, y: 185 },
    startRotationDeg: 16,
    startScale: 0.55,
  }),
  piece({
    id: 'window',
    shape: { kind: 'rect', width: WINDOW_SIZE, height: WINDOW_SIZE },
    color: 'cutout',
    finalCenter: WINDOW_CENTER,
    startOffset: { x: 95, y: -175 },
    startRotationDeg: 80,
    startScale: 0.55,
  }),
  piece({
    id: 'door',
    shape: { kind: 'rect', width: DOOR_W, height: DOOR_H },
    color: 'accent',
    finalCenter: DOOR_CENTER,
    startOffset: { x: 45, y: 205 },
    startRotationDeg: -55,
    startScale: 0.55,
  }),
];
