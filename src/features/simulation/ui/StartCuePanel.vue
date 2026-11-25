<script setup lang="ts">
import { Clock3, ClockPlus, FlaskConical, X } from '@lucide/vue'
import type { DominoDocument, StartCue } from '@/shared/document'

defineProps<{
  document: DominoDocument
  cues: StartCue[]
  selectedId: string | null
}>()
const emit = defineEmits<{
  add: [pieceId?: string | null]
  update: [id: string, patch: Partial<Omit<StartCue, 'id'>>]
  remove: [id: string]
  loadScenario: [kind: 'simultaneous-strong' | 'a-first' | 'b-first']
}>()

function numberValue(event: Event) {
  return Number((event.target as HTMLInputElement).value)
}
</script>

<template>
  <section class="mechanism-panel cue-panel" aria-labelledby="cue-title">
    <div class="section-kicker"><span>04 / CUES</span><h2 id="cue-title">起倒时刻</h2></div>
    <div class="link-summary">
      <Clock3 :size="15" />
      <span>{{ cues.length }} 个独立开始时刻 · 共享骨牌只倒一次</span>
    </div>

    <div v-if="cues.length" class="cue-list">
      <div v-for="cue in cues" :key="cue.id" class="cue-row">
        <button class="cue-remove" :aria-label="`移除起倒点 ${cue.label ?? cue.pieceId}`" @click="emit('remove', cue.id)">
          <X :size="13" />
        </button>
        <label class="field-label cue-piece">元件
          <select :value="cue.pieceId" @change="emit('update', cue.id, { pieceId: ($event.target as HTMLSelectElement).value })">
            <option v-for="piece in document.pieces" :key="piece.id" :value="piece.id">{{ piece.label || piece.id }}</option>
          </select>
        </label>
        <div class="cue-fields">
          <label class="field-label">开始 s
            <input type="number" min="0" step="0.1" :value="cue.time"
              @change="emit('update', cue.id, { time: Math.max(0, numberValue($event)) })" />
          </label>
          <label class="field-label">冲量
            <input type="number" min="0" step="0.1" :value="cue.strength"
              @change="emit('update', cue.id, { strength: Math.max(0, numberValue($event)) })" />
          </label>
        </div>
      </div>
    </div>
    <p v-else class="cue-empty">还没有起倒点。添加一处或载入交会验证样例。</p>

    <button class="add-connection cue-add" @click="emit('add', selectedId)"><ClockPlus :size="15" /> 添加不同时间的起倒点</button>
    <div class="scenario-actions">
      <button class="scenario-button" @click="emit('loadScenario', 'a-first')"><FlaskConical :size="13" /> 两路先到（东）</button>
      <button class="scenario-button" @click="emit('loadScenario', 'b-first')"><FlaskConical :size="13" /> 两路先到（西）</button>
      <button class="scenario-button primary" @click="emit('loadScenario', 'simultaneous-strong')"><FlaskConical :size="13" /> 同刻强弱 + 晚到支路</button>
    </div>
    <p class="cue-hint">规则：先到先胜；同刻比较反向净冲量；之后到达的触达只合并，不重跑共享骨牌。</p>
  </section>
</template>
