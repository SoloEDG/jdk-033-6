import { angleDelta, distance, normalize } from '../../../shared/math'
import { windAt } from '../../../features/wind/lib/forecast'
import { preferredSheet, advanceBoat } from './dynamicsPort'
import {
  DT, PRE_START, DEADLINE, MIN_CROSS_KNOTS, HULL_RADIUS, LUFF_FW, PLAYER_START,
  START_GATE, closeHauled, gateCrossing, lineCoordinate, makeTrainers, shadowedWind,
  trainerStep,
} from './startWorld'
import type { WindMode } from '../../../shared/race'
import type {
  ScenarioRollout, ScenarioTack, StartCommand, StartEvent, TrainingBoatState,
} from './types'

function branchActive(tag: string, spar: TrainingBoatState): boolean {
  if (tag === 'common') return true
  if (tag === 'no-tack') return spar.observedAt === null
  if (tag.startsWith('obs:')) {
    if (spar.observedAt === null) return false
    const nominal = Number(tag.split(':')[1])
    return Math.abs(spar.observedAt - nominal) < 1
  }
  return false
}

/** Roll out one materialised command stream for a single sparring-tack scenario. */
export function simulate(
  commands: StartCommand[],
  tackTime: ScenarioTack,
  windMode: WindMode,
  blockPin: { x: number; y: number } | null,
): ScenarioRollout {
  const events: StartEvent[] = []
  const track: { x: number; y: number }[] = []
  const wind0 = windAt(PRE_START, windMode)
  const luff0 = closeHauled(wind0.bearing, -1, LUFF_FW)
  const player = {
    position: { ...PLAYER_START }, heading: luff0, knots: 0, sheet: 9, rudder: 0,
  }
  const [leader, spar] = makeTrainers(tackTime, wind0, blockPin)
  const trainers = [leader, spar]

  let t = PRE_START
  let ocsCount = 0
  let returnedBehind = true
  let crossTime: number | null = null
  let crossSpeed: number | null = null
  let minGap = Infinity
  let maxDeficit = 0
  let inShadow = false
  const pending = [...commands]
  let mode: 'hold' | 'sail' | 'back' = 'hold'
  let sailTack = 1
  const holdLo = -46

  while (t < DEADLINE) {
    const windRaw = windAt(t, windMode)

    for (const c of pending.filter((c) => c.at <= t + 1e-9)) {
      pending.splice(pending.indexOf(c), 1)
      if (!branchActive(c.branch, spar)) continue
      events.push({ time: t, kind: 'command', label: c.note || c.kind,
        detail: { kind: c.kind, tack: c.tack, branch: c.branch } })
      if (c.kind === 'sail' || c.kind === 'tack') { mode = 'sail'; sailTack = c.tack }
      else if (c.kind === 'luff') mode = 'hold'
      else if (c.kind === 'back') mode = 'back'
    }

    trainerStep(leader, windRaw, DT, t, events)
    trainerStep(spar, windRaw, DT, t, events)

    const { wind: windEff, deficit } = shadowedWind(player.position, windRaw, trainers)
    maxDeficit = Math.max(maxDeficit, deficit)
    if (deficit > 0.05 && !inShadow) {
      inShadow = true
      events.push({ time: t, kind: 'shadow',
        label: `进入风影 风速 ${windRaw.knots.toFixed(1)}→${windEff.knots.toFixed(1)}kn（旧风影向下风漂移）` })
    } else if (deficit <= 0.05 && inShadow) {
      inShadow = false
      events.push({ time: t, kind: 'shadow-clear', label: '驶出风影，风速恢复' })
    }

    player.sheet = preferredSheet(Math.abs(angleDelta(player.heading, windEff.bearing)))
    const coord = lineCoordinate(player.position)
    let goal: number
    if (mode === 'back') {
      goal = closeHauled(windEff.bearing, 1, 118)
      if (coord < holdLo) {
        mode = 'hold'
        events.push({ time: t, kind: 'ocs-return', label: '已整体退回起线后方，重新进入出发程序' })
      }
    } else if (mode === 'hold') {
      goal = closeHauled(windEff.bearing, -1, LUFF_FW)
    } else {
      goal = closeHauled(windEff.bearing, sailTack)
    }
    const dh = angleDelta(player.heading, goal)
    player.rudder = Math.abs(dh) <= 1.2 ? 0 : dh > 0 ? 1 : -1
    const prev = { ...player.position }
    const next = advanceBoat(player, windEff, DT)
    Object.assign(player, next)

    for (const tr of trainers) {
      const gap = distance(player.position, tr.boat.position)
      minGap = Math.min(minGap, gap)
      if (gap < HULL_RADIUS) {
        events.push({ time: t, kind: 'collision', label: `与${tr.name}船体相撞` })
        return finish(false, 'hull collision')
      }
    }

    const hit = gateCrossing(START_GATE, prev, player.position)
    if (hit) {
      const ct = t + DT * hit.fraction
      if (ct < 0) {
        ocsCount += 1
        returnedBehind = false
        mode = 'back'
        events.push({ time: ct, kind: 'ocs', label: '提前越线 OCS：自动顺风退回，再过线' })
      } else if (ocsCount > 0 && !returnedBehind) {
        events.push({ time: ct, kind: 'start-cross', label: '退回过程中越过起线，不计成绩' })
      } else {
        crossTime = ct
        crossSpeed = player.knots
        events.push({ time: ct, kind: 'start-cross',
          label: `合法过线 t=${ct.toFixed(2)}s，${player.knots.toFixed(1)}kn` })
        if (player.knots < MIN_CROSS_KNOTS) return finish(false, '过线速度不足')
        return finish(true, '合法过线')
      }
    }
    if (ocsCount > 0 && lineCoordinate(player.position) < -2) returnedBehind = true
    if (track.length === 0 || track.length % 4 === 0) track.push({ ...player.position })
    t += DT
  }
  return finish(false, '未在时限内合法过线')

  function finish(ok: boolean, reason: string): ScenarioRollout {
    return {
      scenario: String(tackTime), ok, crossTime, crossSpeed, ocsCount,
      minGap: minGap === Infinity ? -1 : minGap, maxDeficit,
      wind: windAt(Math.max(t, 0), windMode), events, reason, track, trainers,
    }
  }
}
