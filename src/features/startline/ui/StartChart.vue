<script setup lang="ts">
import { computed } from 'vue'
import { axis } from '../../../shared/math'
import { START_GATE, PLAYER_START, lineCoordinate } from '../lib/startWorld'
import type { ScenarioRollout, TrainingBoatState } from '../lib/types'

const props = defineProps<{ rollout: ScenarioRollout | null; trainers: TrainingBoatState[] }>()

const gateEnds = computed(() => {
  const across = axis(START_GATE.bearing + 90)
  const half = START_GATE.width / 2
  return [
    { x: START_GATE.center.x - across.x * half, y: START_GATE.center.y - across.y * half },
    { x: START_GATE.center.x + across.x * half, y: START_GATE.center.y + across.y * half },
  ]
})
const trail = computed(() => props.rollout?.track ?? [])
const behind = computed(() => lineCoordinate(PLAYER_START) < 0)
</script>

<template>
  <section class="start-chart" aria-label="起跑练习场">
    <svg viewBox="500 240 320 200" role="img" aria-label="起跑练习场与训练艇">
      <rect x="500" y="240" width="320" height="200" fill="#27555b" />
      <!-- start gate -->
      <line :x1="gateEnds[0].x" :y1="gateEnds[0].y" :x2="gateEnds[1].x" :y2="gateEnds[1].y"
        stroke="#ffd455" stroke-width="2.4" stroke-dasharray="7 5" />
      <text :x="START_GATE.center.x" :y="START_GATE.center.y - 12" fill="#ffd455" class="sc-text">起线</text>
      <!-- player anchor -->
      <circle :cx="PLAYER_START.x" :cy="PLAYER_START.y" r="4" fill="#fcefaa" />
      <text :x="PLAYER_START.x + 7" :y="PLAYER_START.y + 4" fill="#fcefaa" class="sc-text">
        起航锚点{{ behind ? '（线后）' : '' }}
      </text>
      <!-- training boats -->
      <g v-for="tr in trainers" :key="tr.name">
        <circle :cx="tr.boat.position.x" :cy="tr.boat.position.y" r="7"
          :fill="tr.name === '领航艇' ? '#e77c62' : '#7fc7d9'" stroke="#1c3a3c" stroke-width="1.6" />
        <text :x="tr.boat.position.x + 9" :y="tr.boat.position.y + 4" fill="#e5e1c2" class="sc-text">{{ tr.name }}</text>
      </g>
      <!-- rollout trail -->
      <polyline v-if="trail.length > 1" :points="trail.map(p => `${p.x},${p.y}`).join(' ')"
        fill="none" stroke="#e9f6ef" stroke-width="1.8" stroke-linejoin="round" />
    </svg>
  </section>
</template>
