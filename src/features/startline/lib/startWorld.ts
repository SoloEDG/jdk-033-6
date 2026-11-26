import { angleDelta, axis, clamp, dot, normalize, subtract, add, scale, distance } from '../../../shared/math'
import { preferredSheet, advanceBoat } from './dynamicsPort'
import type { Point, Wind } from '../../../shared/race'
import type { ShadowBlob, TrainingBoatState } from './types'

export const DT = 0.025
export const PRE_START = -60
export const DEADLINE = 8
export const MIN_CROSS_KNOTS = 6
export const HULL_RADIUS = 12
export const SHADOW_TTL = 1.3
export const SHADOW_LENGTH = 78
export const SHADOW_D0 = 0.52
export const SHADOW_DRIFT = 0.62
export const SHADOW_CAP = 0.55
export const REACTION_DELAY = 0.5
export const LUFF_FW = 31
export const ALLOWED_TACKS = [-28, -16, -6] as const
export const SCENARIOS: (number | null)[] = [null, ...ALLOWED_TACKS]

/** Practice area in the empty south-eastern water, clear of every course mark. */
export const PLAYER_START: Point = { x: 640, y: 415 }
export const START_GATE = { id: 'S', center: { x: 661, y: 401.4 }, bearing: -33, width: 300 }

/** Blocking lane point per wind regime: the sparring holds it until its tack. */
export const BLOCK_PIN: Record<'steady' | 'shifting', Point> = {
  steady: { x: 580, y: 300 },
  shifting: { x: 584, y: 286 },
}
export const DODGE_LAUNCH: Record<'steady' | 'shifting', number> = {
  steady: -2.5,
  shifting: -2.5,
}

export const lineForward = () => axis(START_GATE.bearing)

export function lineCoordinate(p: Point): number {
  return dot(subtract(p, START_GATE.center), lineForward())
}

export function closeHauled(windBearing: number, tack: number, fw = 60): number {
  return normalize(windBearing + fw * tack)
}

export function blobDeficit(blob: ShadowBlob, p: Point, windBearing: number): number {
  const leeward = axis(windBearing + 180)
  const rel = subtract(p, blob.pos)
  const d = dot(rel, leeward)
  if (d < 0 || d > SHADOW_LENGTH * blob.strength) return 0
  const lateral = Math.abs(dot(rel, axis(windBearing + 90)))
  const width = 7 + 0.34 * d
  if (lateral > width) return 0
  const fade = Math.max(0, 1 - blob.age / SHADOW_TTL)
  return SHADOW_D0 * (1 - d / SHADOW_LENGTH) * (1 - lateral / width) * fade
}

/** One effective shadow per boat (its strongest blob); total loss is capped so the
 *  wind speed never reverses, even where old and new shadows overlap. */
export function shadowedWind(position: Point, wind: Wind, trainers: TrainingBoatState[]) {
  let total = 0
  for (const tr of trainers) {
    let best = 0
    for (const b of tr.blobs) best = Math.max(best, blobDeficit(b, position, wind.bearing))
    total += best
  }
  total = Math.min(total, SHADOW_CAP)
  const knots = Math.max(0, wind.knots * (1 - total))
  return { wind: { bearing: wind.bearing, knots } as Wind, deficit: total }
}

export function emitBlob(tr: TrainingBoatState) {
  tr.blobs.push({ pos: { ...tr.boat.position }, age: 0, strength: 1 })
}

export function driftBlobs(tr: TrainingBoatState, wind: Wind, dt: number) {
  const step = scale(axis(wind.bearing + 180), wind.knots * 3.65 * SHADOW_DRIFT * dt)
  tr.blobs = tr.blobs.filter((b) => {
    b.age += dt
    if (b.age >= SHADOW_TTL) return false
    b.pos = add(b.pos, step)
    return true
  })
}

export function makeTrainers(
  tackTime: number | null,
  wind0: Wind,
  blockPin: Point | null,
): TrainingBoatState[] {
  const base = (name: string, pos: Point, tackedAt: number | null): TrainingBoatState => ({
    name,
    boat: { position: { ...pos }, heading: wind0.bearing, knots: 1, sheet: 9, rudder: 0 },
    blobs: [],
    tackedAt,
    observedAt: null,
    loiterAxis: wind0.bearing,
    forceAnchor: blockPin && name === '陪练艇' ? { ...blockPin } : null,
  })
  return [
    base('领航艇', { x: 608, y: 370 }, null),
    base('陪练艇', blockPin ?? { x: 650, y: 362 }, tackTime),
  ]
}

function steerToward(heading: number, goal: number): number {
  const dh = angleDelta(heading, goal)
  return Math.abs(dh) <= 1.2 ? 0 : dh > 0 ? 1 : -1
}

export function trainerStep(
  tr: TrainingBoatState,
  wind: Wind,
  dt: number,
  t: number,
  events: { time: number; kind: string; label: string; detail?: Record<string, number | string> }[],
) {
  const b = tr.boat
  const held = tr.forceAnchor !== null && (tr.tackedAt === null || t < tr.tackedAt)
  b.sheet = preferredSheet(Math.abs(angleDelta(b.heading, wind.bearing)))
  if (tr.tackedAt !== null && t >= tr.tackedAt) {
    const goal = closeHauled(wind.bearing, -1)
    b.rudder = steerToward(b.heading, goal)
    if (tr.observedAt === null && Math.abs(angleDelta(b.heading, wind.bearing)) < 28) {
      tr.observedAt = t
      events.push({
        time: t, kind: 'tack-observed',
        label: `${tr.name}换舷可见（船首转过迎风）`,
        detail: { observedAt: round2(t) },
      })
    }
  } else {
    b.rudder = steerToward(b.heading, tr.loiterAxis)
  }
  tr.boat = advanceBoat(b, wind, dt)
  if (held && tr.forceAnchor) {
    tr.boat.position = { ...tr.forceAnchor }
    tr.boat.knots = 0.5
  }
  emitBlob(tr)
  driftBlobs(tr, wind, dt)
}

export function gateCrossing(
  gate: { center: Point; bearing: number; width: number },
  from: Point,
  to: Point,
) {
  const forward = axis(gate.bearing)
  const start = dot(subtract(from, gate.center), forward)
  const end = dot(subtract(to, gate.center), forward)
  if (start >= 0 || end < 0 || start === end) return null
  const fraction = -start / (end - start)
  const point = {
    x: from.x + (to.x - from.x) * fraction,
    y: from.y + (to.y - from.y) * fraction,
  }
  const across = dot(subtract(point, gate.center), axis(gate.bearing + 90))
  return Math.abs(across) <= gate.width / 2 ? { fraction, point } : null
}

export { clamp, distance }
function round2(n: number) { return Math.round(n * 100) / 100 }
