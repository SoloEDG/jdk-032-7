import { computed, type Ref } from 'vue'
import type { DominoDocument, StartCue } from '@/shared/document'
import { stableId } from '@/shared/time'
import { normalizeStartCues } from '../lib/startCues'

type CuePatch = Partial<Omit<StartCue, 'id'>>

export function useStartCues(document: Ref<DominoDocument>, changed: () => void) {
  const cues = computed(() => normalizeStartCues(document.value))

  function commit(next: StartCue[]) {
    const valid = next.filter(cue => document.value.pieces.some(piece => piece.id === cue.pieceId))
    const first = [...valid].sort((a, b) => a.time - b.time)[0]
    document.value = {
      ...document.value,
      startCues: valid,
      startPieceId: first?.pieceId ?? '',
    }
    changed()
  }

  function add(pieceId?: string | null) {
    const targetId = pieceId && document.value.pieces.some(piece => piece.id === pieceId)
      ? pieceId
      : document.value.startPieceId && document.value.pieces.some(piece => piece.id === document.value.startPieceId)
        ? document.value.startPieceId
        : document.value.pieces[0]?.id
    if (!targetId) return

    const current = Array.isArray(document.value.startCues)
      ? normalizeStartCues({ ...document.value, startCues: document.value.startCues })
      : cues.value
    const nextTime = current.length
      ? Math.round((Math.max(...current.map(cue => cue.time)) + 0.5) * 100) / 100
      : 0
    commit([
      ...current,
      { id: stableId('cue'), pieceId: targetId, time: nextTime, strength: 1, label: '定时起倒' },
    ])
  }

  function update(id: string, patch: CuePatch) {
    commit(cues.value.map(cue => cue.id === id ? { ...cue, ...patch } : cue))
  }

  function remove(id: string) {
    commit(cues.value.filter(cue => cue.id !== id))
  }

  return { cues, add, update, remove }
}
