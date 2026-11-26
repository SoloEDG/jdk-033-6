<script setup lang="ts">
import { computed } from 'vue'
import { Flag, GitBranch, Radar, ShieldCheck, ShieldAlert, HelpCircle, Clock, Wind as WindIcon } from 'lucide-vue-next'
import { clock } from '../../../shared/format'
import { SCENARIOS } from '../lib/startWorld'
import type { PlanVerdict, ScenarioRollout } from '../lib/types'

const props = defineProps<{
  verdict: PlanVerdict
  windMode: 'steady' | 'shifting'
  choice: 'full' | 'aggressive'
  selectedTack: number | null
  rollout: ScenarioRollout | null
  commands: { at: number; kind: string; tack: number; branch: string; note: string }[]
}>()
const emit = defineEmits<{
  wind: [value: 'steady' | 'shifting']
  choice: [value: 'full' | 'aggressive']
  select: [value: number | null]
}>()

const verdictMeta = {
  full: { icon: ShieldCheck, text: '全情形可过线', cls: 'full',
    hint: '每个允许的换舷时刻（含不换舷）都验证为及时合法过线，且无因果冲突。' },
  partial: { icon: ShieldAlert, text: '只能保住部分情形', cls: 'partial',
    hint: '部分情形合法，其余会碰撞/OCS/超时；失败清单见下，需用观测分支补足。' },
  unknown: { icon: HelpCircle, text: '尚无法判断', cls: 'unknown',
    hint: '没有任何情形成功，或存在未消解的因果冲突，证据不足以给出可执行打法。' },
} as const

const meta = computed(() => verdictMeta[props.verdict.kind])
const labelOf = (tt: number | null) => (tt === null ? '不换舷' : `${tt}s 换舷`)
const branchLabel = (tag: string) =>
  tag === 'common' ? '公共指令' : tag === 'no-tack' ? '未见换舷分支' : `观测分支 ${tag.replace('obs:', '')}s`
</script>

<template>
  <section class="startline" aria-label="起跑规划">
    <header class="sl-head">
      <h2><Flag :size="17" /> 起跑指令规划</h2>
      <span class="verdict" :class="meta.cls"><component :is="meta.icon" :size="15" />{{ meta.text }}</span>
    </header>
    <p class="verdict-hint">{{ meta.hint }}</p>

    <div class="sl-controls">
      <div class="seg" role="group" aria-label="风模式">
        <button :aria-pressed="windMode === 'steady'" @click="emit('wind', 'steady')">稳定风</button>
        <button :aria-pressed="windMode === 'shifting'" @click="emit('wind', 'shifting')">变向风</button>
      </div>
      <div class="seg" role="group" aria-label="打法">
        <button :aria-pressed="choice === 'full'" @click="emit('choice', 'full')">因果完整打法</button>
        <button :aria-pressed="choice === 'aggressive'" @click="emit('choice', 'aggressive')">激进公共打法</button>
      </div>
    </div>

    <div class="scenario-grid">
      <button v-for="tt in SCENARIOS" :key="String(tt)" type="button"
        :class="['scenario-card', { active: selectedTack === tt, ok: verdict.covered.includes(tt), bad: verdict.failed.includes(tt) }]"
        @click="emit('select', tt)">
        <span class="sc-name">{{ labelOf(tt) }}</span>
        <span class="sc-state">
          <ShieldCheck v-if="verdict.covered.includes(tt)" :size="14" />
          <ShieldAlert v-else :size="14" />
        </span>
      </button>
    </div>

    <div v-if="rollout" class="rollout">
      <h3><GitBranch :size="15" /> 情形回放 · {{ labelOf(selectedTack) }}</h3>
      <div class="metrics">
        <div><Clock :size="14" /><span>过线时刻</span><strong>{{ rollout.crossTime === null ? '—' : clock(rollout.crossTime) }}</strong></div>
        <div><WindIcon :size="14" /><span>过线航速</span><strong>{{ rollout.crossSpeed === null ? '—' : rollout.crossSpeed.toFixed(1) + ' kn' }}</strong></div>
        <div><Radar :size="14" /><span>OCS 次数</span><strong>{{ rollout.ocsCount }}</strong></div>
        <div><ShieldAlert :size="14" /><span>最小船距</span><strong>{{ rollout.minGap.toFixed(1) }} m</strong></div>
      </div>

      <h4>该情形实际执行的指令（观测后才会出现分支指令）</h4>
      <ol class="cmd-list">
        <li v-for="(c, i) in commands" :key="i" :class="c.branch">
          <time>{{ c.at < 0 ? 'T' + c.at : 'T+' + c.at }}</time>
          <div>
            <p>{{ c.note }}</p>
            <small>{{ branchLabel(c.branch) }}</small>
          </div>
        </li>
      </ol>

      <h4>事件时间线（回看可追到指令为何改变、空等或折返）</h4>
      <ol class="event-list">
        <li v-for="(e, i) in rollout.events" :key="i" :data-kind="e.kind">
          <time>{{ clock(Math.max(0, e.time)) }}</time>
          <span class="ev-time-raw">{{ e.time < 0 ? 'T' + e.time.toFixed(1) : '+' + e.time.toFixed(1) }}</span>
          <span>{{ e.label }}</span>
        </li>
      </ol>
    </div>

    <details class="why">
      <summary>裁决依据（全情形 / 部分 / 无法判断）</summary>
      <ul><li v-for="(line, i) in verdict.explanation" :key="i">{{ line }}</li></ul>
      <p v-if="verdict.consistency.length" class="conflict">检测到 {{ verdict.consistency.length }} 处因果冲突：相同观测历史的情形收到了相反指令。</p>
    </details>
  </section>
</template>
