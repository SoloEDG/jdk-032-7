<script setup lang="ts">
import { AlertTriangle, CheckCircle2, CircleStop, FastForward, GitMerge, Pause, Play, RotateCcw, SkipBack } from '@lucide/vue'
import type { DominoDocument, ReachRecord, SimulationEvent, SimulationRun } from '@/shared/document'
import { formatSeconds } from '@/shared/time'

const props = defineProps<{
  document: DominoDocument | null
  run: SimulationRun | null; events: SimulationEvent[]; time: number; playing: boolean
  currentEvent: SimulationEvent | null; stale: boolean
}>()
const emit = defineEmits<{ toggle: []; seek: [number]; restart: []; event: [string] }>()
const iconFor = (kind: SimulationEvent['kind']) => kind === 'interrupted' ? AlertTriangle
  : kind === 'merged' ? GitMerge
    : kind === 'mechanism' ? FastForward : CheckCircle2

function pieceLabel(id?: string | null) {
  if (!id) return '起点'
  return props.document?.pieces.find(piece => piece.id === id)?.label ?? id
}
function eventTitle(event: SimulationEvent) {
  if (event.kind === 'merged') return '合并触达'
  if (event.winningReach?.kind === 'start') return '起倒点'
  return event.detail.split(' · ')[0]
}
function eventSubtitle(event: SimulationEvent) {
  const subtitle = event.detail.split(' · ').slice(1).join(' · ')
  return subtitle || event.pieceId
}
function reachText(reach?: ReachRecord | null) {
  if (!reach) return '未知触达'
  const source = reach.kind === 'start'
    ? (reach.cueLabel || '定时起点')
    : `${reach.kind === 'contact' ? '碰撞' : '连线'} · ${pieceLabel(reach.sourceId)}`
  return `${source} / t=${reach.time.toFixed(2)}s / 冲量=${reach.strength.toFixed(2)}`
}
</script>

<template>
  <section class="replay-panel" aria-labelledby="replay-title">
    <div class="replay-heading">
      <div class="section-kicker"><span>05 / REVIEW</span><h2 id="replay-title">结果回看</h2></div>
      <span v-if="run" class="replay-revision" :class="{ stale }">{{ stale ? '旧版布局' : `R${run.revision}` }}</span>
    </div>
    <template v-if="run">
      <div class="replay-summary" :class="run.status">
        <div class="summary-symbol"><CircleStop v-if="run.status === 'interrupted'" :size="17" /><CheckCircle2 v-else :size="17" /></div>
        <div><strong>{{ run.status === 'interrupted' ? '找到中断点' : run.status === 'complete' ? '连锁已完成' : '场景暂无元件' }}</strong>
          <small>{{ run.interruptionReason ?? '所有触发事件均已记录' }}</small></div>
      </div>
      <div class="replay-controls">
        <button class="replay-icon" aria-label="回到开头" @click="emit('restart')"><SkipBack :size="15" /></button>
        <button class="replay-play" :aria-label="playing ? '暂停回放' : '播放回放'" @click="emit('toggle')">
          <Pause v-if="playing" :size="16" fill="currentColor" /><Play v-else :size="16" fill="currentColor" />
        </button>
        <span class="replay-clock mono">{{ formatSeconds(time) }}</span>
        <input aria-label="回放进度" class="replay-range" type="range" min="0" :max="run.duration || 0.01" step="0.01" :value="time"
          @input="emit('seek', Number(($event.target as HTMLInputElement).value))" />
        <span class="replay-clock mono">{{ formatSeconds(run.duration) }}</span>
      </div>

      <div v-if="currentEvent?.collision" class="collision-card" aria-live="polite">
        <strong>触达仲裁 · {{ pieceLabel(currentEvent.pieceId) }}</strong>
        <p>{{ currentEvent.collision.explanation }}</p>
        <p v-if="currentEvent.winningReach" class="reach-winner">胜出：{{ reachText(currentEvent.winningReach) }}</p>
        <ul v-if="currentEvent.mergedReaches?.length" class="reach-list">
          <li v-for="reach in currentEvent.mergedReaches" :key="reach.id">
            <span>合并：{{ reachText(reach) }}</span><em>{{ reach.status === 'merged-late' ? '晚到合并' : '同刻合并' }}</em>
          </li>
        </ul>
      </div>
      <div v-else-if="currentEvent?.kind === 'merged'" class="collision-card merged" aria-live="polite">
        <strong>被合并的触达 · {{ pieceLabel(currentEvent.pieceId) }}</strong>
        <p>{{ currentEvent.detail }}</p>
        <p class="reach-merged">{{ reachText(currentEvent.reach) }}</p>
      </div>

      <div class="event-list-heading"><span>事件轨迹</span><span>{{ events.length }} EVENTS</span></div>
      <ol class="event-list">
        <li v-for="event in events" :key="event.id">
          <button class="event-row" :class="{ current: currentEvent?.id === event.id, interrupted: event.kind === 'interrupted' }"
            :aria-current="currentEvent?.id === event.id ? 'step' : undefined" @click="emit('event', event.id)">
            <span class="event-time mono">{{ formatSeconds(event.time) }}</span>
            <span class="event-icon"><component :is="iconFor(event.kind)" :size="14" /></span>
            <span class="event-copy"><strong>{{ eventTitle(event) }}</strong><small :title="event.detail">{{ eventSubtitle(event) }}</small></span>
            <span class="event-flags">
              <span v-if="event.mergedReaches?.length" class="event-merge-flag">合并 {{ event.mergedReaches.length }}</span>
              <span v-if="event.kind === 'interrupted'" class="event-flag">中断</span>
            </span>
          </button>
        </li>
      </ol>
      <div v-if="run.interruptedPieceId" class="interruption-card">
        <span class="interrupt-icon"><AlertTriangle :size="16" /></span>
        <div><strong>中断位置</strong><p>{{ pieceLabel(run.interruptedPieceId) }} 未产生新的下游触达。可返回场景调整间距、方向或碰撞强度。</p></div>
        <button :aria-label="'定位到 ' + run.interruptedPieceId" @click="emit('event', run.events.find(event => event.kind === 'interrupted')?.id ?? '')">定位</button>
      </div>
      <div v-if="stale" class="stale-note"><RotateCcw :size="13" /> 当前布局已改变，这份结果仍对应运行时保存的场景。</div>
    </template>
    <div v-else class="replay-empty">
      <div class="empty-orbit"><i></i><i></i><i></i><span></span></div>
      <strong>等待第一次模拟</strong><p>点击「运行模拟」，倒下顺序与中断位置会显示在这里。</p>
    </div>
  </section>
</template>
