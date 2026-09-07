/**
 * The house, sketched before any animation code: four pieces, each one a
 * real part of the final icon, never a decorative shape swapped for it. A
 * fifth piece — the circle — is never part of the house; it arrives after
 * and settles beside it.
 *
 *                 triangle
 *                /        \
 *          +----------------------+
 *          |        yellow        |
 *          +------------+---------+
 *          |            |         |
 *          |    blue    |  green  |
 *          |            |         |
 *          +------------+---------+
 *
 * All coordinates are in design units on a coordinate system centered on the
 * house body (0, 0 at the top of the blue/green row). The animation
 * controller scales this whole space to the device at render time, so
 * nothing here is a screen-specific pixel.
 *
 * Every piece carries where it starts (scattered, at its own angle and
 * height), where it passes through mid-flight (the shared point where the
 * "collision" happens), and where it ends up (its exact final slot). The
 * controller only interpolates between these — it never decides the shape
 * of the house.
 */

const BLUE_W = 44;
const BLUE_H = 92;
const GREEN_SIZE = 92;
const YELLOW_W = BLUE_W + GREEN_SIZE;
const YELLOW_H = 26;
const TRIANGLE_W = YELLOW_W;
const TRIANGLE_H = 64;
const CIRCLE_R = 28;

export const HOUSE_WIDTH = YELLOW_W;
export const HOUSE_HEIGHT = TRIANGLE_H + YELLOW_H + BLUE_H;

export type PieceShape =
  | { kind: 'rect'; width: number; height: number }
  | { kind: 'triangle'; width: number; height: number; points: string }
  | { kind: 'circle'; radius: number };

export interface HousePieceConfig {
  readonly id: string;
  readonly shape: PieceShape;
  readonly color: string;
  /** Centre of the piece's final position, house-centered design units. */
  readonly finalCenter: { readonly x: number; readonly y: number };
  /** Offset from finalCenter where the piece starts, scattered off-screen. */
  readonly startOffset: { readonly x: number; readonly y: number };
  /** Offset from finalCenter at the mid-flight collision point. */
  readonly collisionOffset: { readonly x: number; readonly y: number };
  readonly startRotationDeg: number;
  readonly startScale: number;
}

const NEON = {
  blue: '#2E9EFF',
  yellow: '#FFD400',
  green: '#2EE6A3',
  pink: '#FF2E88',
  purple: '#A64DFF',
} as const;

function collisionOffsetFor(finalCenter: { x: number; y: number }) {
  // The four house-forming pieces converge near the body's own centre.
  return { x: -finalCenter.x, y: -finalCenter.y };
}

const BLUE_CENTER = { x: -GREEN_SIZE / 2, y: BLUE_H / 2 };
const GREEN_CENTER = { x: BLUE_W / 2, y: GREEN_SIZE / 2 };
const YELLOW_CENTER = { x: 0, y: -YELLOW_H / 2 };
const TRIANGLE_BASE_Y = -YELLOW_H;
const TRIANGLE_CENTER = { x: 0, y: TRIANGLE_BASE_Y - TRIANGLE_H / 3 };

/** The house — these four assemble together and never move again once placed. */
export const HOUSE_PIECES: readonly HousePieceConfig[] = [
  {
    id: 'triangle',
    shape: {
      kind: 'triangle',
      width: TRIANGLE_W,
      height: TRIANGLE_H,
      points: `0,${TRIANGLE_H} ${TRIANGLE_W},${TRIANGLE_H} ${TRIANGLE_W / 2},0`,
    },
    color: NEON.pink,
    finalCenter: TRIANGLE_CENTER,
    collisionOffset: collisionOffsetFor(TRIANGLE_CENTER),
    startOffset: { x: -30, y: -240 },
    startRotationDeg: -50,
    startScale: 0.55,
  },
  {
    id: 'yellow',
    shape: { kind: 'rect', width: YELLOW_W, height: YELLOW_H },
    color: NEON.yellow,
    finalCenter: YELLOW_CENTER,
    collisionOffset: collisionOffsetFor(YELLOW_CENTER),
    startOffset: { x: 110, y: -200 },
    startRotationDeg: 35,
    startScale: 0.55,
  },
  {
    id: 'blue',
    shape: { kind: 'rect', width: BLUE_W, height: BLUE_H },
    color: NEON.blue,
    finalCenter: BLUE_CENTER,
    collisionOffset: collisionOffsetFor(BLUE_CENTER),
    startOffset: { x: -190, y: -40 },
    startRotationDeg: -60,
    startScale: 0.55,
  },
  {
    id: 'green',
    shape: { kind: 'rect', width: GREEN_SIZE, height: GREEN_SIZE },
    color: NEON.green,
    finalCenter: GREEN_CENTER,
    collisionOffset: collisionOffsetFor(GREEN_CENTER),
    startOffset: { x: 150, y: 130 },
    startRotationDeg: 45,
    startScale: 0.55,
  },
];

/**
 * Not part of the house. Arrives on its own, after the house has already
 * formed, and settles beside it (never overlapping it).
 */
export const CIRCLE_PIECE: HousePieceConfig = {
  id: 'circle',
  shape: { kind: 'circle', radius: CIRCLE_R },
  color: NEON.purple,
  finalCenter: { x: HOUSE_WIDTH / 2 + CIRCLE_R + 12, y: TRIANGLE_BASE_Y - TRIANGLE_H + 6 },
  collisionOffset: { x: 0, y: 0 }, // unused — the circle bounces straight in, no collision phase
  startOffset: { x: 140, y: -260 },
  startRotationDeg: 0,
  startScale: 0.6,
};
