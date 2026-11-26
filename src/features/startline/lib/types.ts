import type { Point, Wind } from '../../../shared/race'

/** A discrete wind-shadow blob emitted by a training boat. Old blobs keep drifting
 *  leeward as the boat moves, and fade out after their TTL — they never travel upwind,
 *  so the effective wind can never reverse. */
export interface ShadowBlob {
  pos: Point
  age: number
  strength: number
}

export type ScenarioTack = number | null

export type CommandKind = 'luff' | 'sail' | 'tack' | 'back'

export interface StartCommand {
  at: number                 // scenario time, gun = 0
  kind: CommandKind
  tack: number               // +1 starboard, -1 port, 0 n/a
  fw: number                 // target angle off the wind
  branch: string             // 'common' | 'obs:-28' | 'no-tack'
  note: string
}

export interface StartEvent {
  time: number
  kind: 'command' | 'belief' | 'tack-observed' | 'shadow' | 'shadow-clear'
    | 'ocs' | 'ocs-return' | 'start-cross' | 'collision'
  label: string
  detail?: Record<string, number | string>
}

export interface TrainingBoatState {
  name: string
  boat: { position: Point; heading: number; knots: number; sheet: number; rudder: number }
  blobs: ShadowBlob[]
  tackedAt: number | null
  observedAt: number | null
  loiterAxis: number
  forceAnchor: Point | null
}

export interface ScenarioRollout {
  scenario: string
  ok: boolean
  crossTime: number | null
  crossSpeed: number | null
  ocsCount: number
  minGap: number
  maxDeficit: number
  wind: Wind
  events: StartEvent[]
  reason: string
  track: Point[]
  trainers: TrainingBoatState[]
}

export type VerdictKind = 'full' | 'partial' | 'unknown'

export interface ConsistencyViolation {
  time: number
  scenarios: string[]
  a: string
  b: string
}

export interface PlanVerdict {
  kind: VerdictKind
  covered: ScenarioTack[]
  failed: ScenarioTack[]
  consistency: ConsistencyViolation[]
  rollouts: ScenarioRollout[]
  explanation: string[]
}
