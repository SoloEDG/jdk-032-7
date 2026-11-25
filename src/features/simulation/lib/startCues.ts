import type { DominoDocument, StartCue } from '@/shared/document'

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function normalizeStartCues(document: DominoDocument): StartCue[] {
  // An explicit empty array means the user removed every cue. Only an absent
  // field is treated as an older document and migrated from startPieceId.
  if (Array.isArray(document.startCues)) {
    return document.startCues
      .filter(cue => cue && typeof cue.pieceId === 'string'
        && document.pieces.some(piece => piece.id === cue.pieceId))
      .map((cue, index) => ({
        id: typeof cue.id === 'string' && cue.id ? cue.id : `cue-${index + 1}`,
        pieceId: cue.pieceId,
        time: Math.max(0, finiteNumber(cue.time, 0)),
        strength: Math.max(0, finiteNumber(cue.strength, 1)),
        label: typeof cue.label === 'string' ? cue.label : undefined,
      }))
  }

  if (document.startPieceId && document.pieces.some(piece => piece.id === document.startPieceId)) {
    return [{ id: 'cue-legacy-start', pieceId: document.startPieceId, time: 0, strength: 1, label: '手动触发' }]
  }
  return []
}

export function earliestStartPieceId(document: DominoDocument) {
  return [...normalizeStartCues(document)].sort((a, b) => a.time - b.time)[0]?.pieceId
    ?? document.startPieceId
    ?? ''
}
