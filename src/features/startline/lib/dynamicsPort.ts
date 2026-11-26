import { angleDelta, clamp, normalize, axis } from '../../../shared/math'
import type { Boat, Wind } from '../../../shared/race'

/** Mirrors features/sail/lib/dynamics.ts exactly (kept local so the start-line planner
 *  can run headless without the Vue sail store). */
export function preferredSheet(fromWind: number): number {
  return clamp((fromWind - 37) * 0.55, 9, 78)
}

export function advanceBoat(boat: Boat, wind: Wind, dt: number): Boat {
  const turn = boat.rudder * (26 + Math.min(boat.knots, 18))
  const heading = normalize(boat.heading + turn * dt)
  const fromWind = Math.abs(angleDelta(heading, wind.bearing))
  const trim = Math.max(0.08, 1 - Math.abs(boat.sheet - preferredSheet(fromWind)) / 69)
  const lift = clamp((fromWind - 32) / 45, 0, 1) * (1 - Math.max(0, fromWind - 110) / 180)
  const target = 0.65 + wind.knots * 1.03 * lift * trim
  const knots = boat.knots + (target - boat.knots) * (1 - Math.exp(-dt * 1.45))
  const v = axis(heading)
  const travel = knots * 3.65 * dt
  return {
    ...boat,
    heading,
    knots,
    position: {
      x: boat.position.x + v.x * travel,
      y: boat.position.y + v.y * travel,
    },
  }
}
