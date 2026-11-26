import { evaluate, makeFullPolicy, makeAggressivePolicy } from '../src/features/startline/lib/planner'
import { simulate } from '../src/features/startline/lib/simulate'
import assert from 'node:assert'

function approx(a: number | null, b: number, eps = 0.15) {
  assert.ok(a !== null && Math.abs(a - b) < eps, `expected ~${b}, got ${a}`)
}

for (const windMode of ['steady', 'shifting'] as const) {
  const v = evaluate(makeFullPolicy(windMode), windMode)
  console.log(`[${windMode}] full verdict:`, v.kind)
  assert.equal(v.kind, 'full')
  assert.equal(v.consistency.length, 0)
  assert.equal(v.rollouts.length, 4)
  for (const r of v.rollouts) {
    assert.equal(r.ok, true)
    assert.equal(r.ocsCount, 0)
    assert.ok(r.crossTime !== null && r.crossTime >= 0 && r.crossTime <= 8)
    assert.ok((r.crossSpeed ?? 0) >= 6)
    assert.ok(r.minGap >= 11.9, `min gap ${r.minGap}`)
    assert.ok(r.maxDeficit <= 0.55, 'shadow must not reverse wind')
    console.log('  ', r.scenario, 'cross', r.crossTime?.toFixed(2), 'kn', r.crossSpeed?.toFixed(1),
      'gap', r.minGap.toFixed(1), 'deficit', r.maxDeficit.toFixed(2))
  }

  const agg = evaluate(makeAggressivePolicy(), windMode)
  console.log(`[${windMode}] aggressive verdict:`, agg.kind, 'failed', agg.failed)
  assert.equal(agg.kind, 'partial')
  assert.ok(agg.failed.includes(null))
}

// OCS rule: early launch crosses before the gun and must be counted
const ocs = simulate(
  [
    { at: -60, kind: 'luff', tack: 0, fw: 31, branch: 'common', note: '' },
    { at: -6, kind: 'sail', tack: 1, fw: 60, branch: 'common', note: '' },
  ],
  null, 'steady', null,
)
console.log('OCS rollout: count =', ocs.ocsCount, 'reason =', ocs.reason)
assert.ok(ocs.ocsCount >= 1)

// same-belief determinism: no-tack and -6 streams identical until the -6 tack is visible
const full = makeFullPolicy('steady')
const sig = (tt: number | null, upto: number) =>
  full.commandsFor(tt).filter((c) => c.at <= upto).map((c) => [c.at, c.kind, c.tack])
assert.deepEqual(sig(null, -5.6), sig(-6, -5.6))
console.log('causal determinism OK')
console.log('ALL TS CHECKS PASSED')
