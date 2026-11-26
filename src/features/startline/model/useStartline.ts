import { computed, ref } from 'vue'
import type { WindMode } from '../../../shared/race'
import { evaluate, makeAggressivePolicy, makeFullPolicy, type Policy } from '../lib/planner'
import { SCENARIOS } from '../lib/startWorld'
import type { PlanVerdict, ScenarioRollout, StartCommand } from '../lib/types'

export type PlanChoice = 'full' | 'aggressive'

export function useStartline() {
  const windMode = ref<WindMode>('steady')
  const choice = ref<PlanChoice>('full')
  const selectedScenario = ref<number | null>(null)

  const policy = computed<Policy>(() =>
    choice.value === 'full' ? makeFullPolicy(windMode.value) : makeAggressivePolicy())
  const verdict = computed<PlanVerdict>(() => evaluate(policy.value, windMode.value))

  const rolloutByScenario = computed(() => {
    const map = new Map<string, ScenarioRollout>()
    verdict.value.rollouts.forEach((r) => map.set(r.scenario, r))
    return map
  })

  const selectedRollout = computed<ScenarioRollout | null>(() => {
    const key = selectedScenario.value === null ? 'null' : String(selectedScenario.value)
    return rolloutByScenario.value.get(key) ?? verdict.value.rollouts[0] ?? null
  })

  const commandsForSelected = computed<StartCommand[]>(() => {
    const tt = selectedScenario.value
    return policy.value.commandsFor(tt === null ? null : tt)
  })

  const scenarioLabels = computed(() =>
    SCENARIOS.map((tt) => (tt === null ? '不换舷' : `${tt}s 换舷`)))

  function setWindMode(mode: WindMode) { windMode.value = mode }
  function setChoice(c: PlanChoice) { choice.value = c }
  function selectScenario(tt: number | null) { selectedScenario.value = tt }

  return {
    windMode, choice, selectedScenario, policy, verdict, rolloutByScenario,
    selectedRollout, commandsForSelected, scenarioLabels,
    setWindMode, setChoice, selectScenario,
  }
}
