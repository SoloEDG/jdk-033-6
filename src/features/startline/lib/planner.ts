import {
  ALLOWED_TACKS, BLOCK_PIN, DODGE_LAUNCH, REACTION_DELAY, SCENARIOS,
} from './startWorld'
import { simulate } from './simulate'
import type { WindMode, Wind } from '../../../shared/race'
import type {
  ConsistencyViolation, PlanVerdict, ScenarioRollout, ScenarioTack, StartCommand,
} from './types'
export interface Branch { tag: string; commands: StartCommand[] }

export class Policy {
  constructor(public branches: Branch[]) {}

  /** Materialise the command stream a real player would issue in one scenario.
   *  Observation branches only unlock after the visible tack plus the reaction delay. */
  commandsFor(tackTime: ScenarioTack): StartCommand[] {
    const out: StartCommand[] = []
    for (const br of this.branches) {
      if (br.tag === 'common') {
        out.push(...br.commands.map((c) => ({ ...c, branch: br.tag })))
      } else if (br.tag === 'no-tack') {
        if (tackTime === null) out.push(...br.commands.map((c) => ({ ...c, branch: br.tag })))
      } else {
        const obs = Number(br.tag.split(':')[1])
        if (tackTime !== null && Math.abs(tackTime - obs) < 1e-6) {
          for (const c of br.commands) {
            if (c.at >= obs + REACTION_DELAY - 1e-9) out.push({ ...c, branch: br.tag })
          }
        }
      }
    }
    return out.sort((a, b) => a.at - b.at)
  }
}

function observedBy(tackTime: ScenarioTack, t: number): number | null {
  if (tackTime === null) return null
  return t >= tackTime + REACTION_DELAY ? tackTime : null
}

function signature(cmds: StartCommand[]) {
  return cmds.map((c) => [round(c.at), c.kind, c.tack, c.branch] as const)
}

const round = (n: number) => Math.round(n * 1000) / 1000

/** Two scenarios that look identical up to time t must receive identical commands.
 *  Also flags any branch command issued before its observation + reaction delay. */
export function causalConsistency(policy: Policy): ConsistencyViolation[] {
  const violations: ConsistencyViolation[] = []
  for (const br of policy.branches) {
    if (br.tag.startsWith('obs:')) {
      const obs = Number(br.tag.split(':')[1])
      for (const c of br.commands) {
        if (c.at < obs + REACTION_DELAY - 1e-9) {
          violations.push({
            time: round(c.at), scenarios: [br.tag, 'no-tack'],
            a: `branch command at ${c.at}s`,
            b: `observation only unlocks at ${obs + REACTION_DELAY}s`,
          })
        }
      }
    }
  }
  const materialised = new Map<ScenarioTack, StartCommand[]>()
  for (const tt of SCENARIOS) materialised.set(tt, policy.commandsFor(tt))
  const checkTimes = [...new Set(
    [...materialised.values()].flat().map((c) => c.at),
  )].sort((a, b) => a - b)
  for (const t of checkTimes) {
    for (let i = 0; i < SCENARIOS.length; i++) {
      for (let j = i + 1; j < SCENARIOS.length; j++) {
        const a = SCENARIOS[i]
        const b = SCENARIOS[j]
        if (observedBy(a, t) === observedBy(b, t)) {
          const ca = materialised.get(a)!.filter((c) => c.at <= t + 1e-9)
          const cb = materialised.get(b)!.filter((c) => c.at <= t + 1e-9)
          if (JSON.stringify(signature(ca)) !== JSON.stringify(signature(cb))) {
            violations.push({
              time: round(t), scenarios: [String(a), String(b)],
              a: JSON.stringify(signature(ca)), b: JSON.stringify(signature(cb)),
            })
          }
        }
      }
    }
  }
  return violations
}

/** The validated full-coverage plan: common luff, observation-gated normal launches,
 *  and a late no-tack dodge once every credible tack has been ruled out. */
export function makeFullPolicy(windMode: WindMode): Policy {
  const dodge = DODGE_LAUNCH[windMode]
  const luff: StartCommand = {
    at: -60, kind: 'luff', tack: 0, fw: 31, branch: 'common',
    note: 'T-60 起：近风漂航控位，全程不转向',
  }
  const observed: Branch[] = ALLOWED_TACKS.map((obs) => ({
    tag: `obs:${obs}`,
    commands: [{
      at: -4, kind: 'sail', tack: 1, fw: 60, branch: `obs:${obs}`,
      note: `已见 ${obs}s 换舷，航道清空，T-4 正常发射`,
    } satisfies StartCommand],
  }))
  const noTack: Branch = {
    tag: 'no-tack',
    commands: [{
      at: dodge, kind: 'sail', tack: 1, fw: 60, branch: 'no-tack',
      note: '未见换舷，判定挡路，延迟发射绕行',
    }],
  }
  return new Policy([{ tag: 'common', commands: [luff] }, ...observed, noTack])
}

/** A deliberately aggressive common launch, used to demonstrate the partial class. */
export function makeAggressivePolicy(): Policy {
  const luff: StartCommand = {
    at: -60, kind: 'luff', tack: 0, fw: 31, branch: 'common', note: '近风漂航控位',
  }
  const launch: StartCommand = {
    at: -4, kind: 'sail', tack: 1, fw: 60, branch: 'common', note: '统一 T-4 发射，不看陪练',
  }
  return new Policy([{ tag: 'common', commands: [luff, launch] }])
}

export function evaluate(policy: Policy, windMode: WindMode): PlanVerdict {
  const consistency = causalConsistency(policy)
  const pin = BLOCK_PIN[windMode]
  const rollouts: ScenarioRollout[] = SCENARIOS.map((tt) =>
    simulate(policy.commandsFor(tt), tt, windMode, pin))
  const covered: ScenarioTack[] = []
  const failed: ScenarioTack[] = []
  const explanation: string[] = []
  rollouts.forEach((ro, idx) => {
    const tt = SCENARIOS[idx]
    const tag = tt === null ? '不换舷' : `陪练 ${tt}s 换舷`
    if (ro.ok) {
      covered.push(tt)
      explanation.push(
        `${tag}：${ro.reason}，过线 t=${ro.crossTime!.toFixed(2)}s，${ro.crossSpeed!.toFixed(1)} 节，` +
        `OCS ${ro.ocsCount} 次，最小船距 ${ro.minGap.toFixed(1)} m，最深风影 ${Math.round(ro.maxDeficit * 100)}%`)
    } else {
      failed.push(tt)
      explanation.push(`${tag}：失败（${ro.reason}），OCS ${ro.ocsCount} 次，最小船距 ${ro.minGap.toFixed(1)} m`)
    }
  })
  for (const v of consistency) {
    explanation.push(`因果冲突 @ ${v.time}s：情形 ${v.scenarios[0]} 与 ${v.scenarios[1]} 在相同观测下收到不同指令`)
  }
  let kind: PlanVerdict['kind']
  if (consistency.length === 0 && failed.length === 0) kind = 'full'
  else if (covered.length > 0) kind = 'partial'
  else kind = 'unknown'
  return { kind, covered, failed, consistency, rollouts, explanation }
}
