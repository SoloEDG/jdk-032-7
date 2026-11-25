import type {
  CollisionSummary,
  DominoDocument,
  Piece,
  ReachKind,
  ReachRecord,
  SimulationEvent,
  Vec2,
} from '@/shared/document'
import { forwardVector, nextContact } from '../../layout/lib/geometry'
import {
  comparePositions,
  compareReaches,
  isSameTime,
  normalizeVector,
  resolveCollision,
  type TimedReach,
} from './collisions'
import { normalizeStartCues } from './startCues'

interface ScheduledReach extends TimedReach {
  kind: ReachKind
  sourceId: string | null
  sourceEventId: string | null
  rootCueId: string | null
  cueLabel: string | null
  detail: string
}

const FALLBACK_DIRECTION: Vec2 = { x: 1, y: 0 }

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function directionBetween(a?: Vec2 | null, b?: Vec2 | null): Vec2 | null {
  if (!a || !b) return null
  const delta = { x: b.x - a.x, y: b.y - a.y }
  const magnitude = Math.hypot(delta.x, delta.y)
  if (magnitude <= 1e-9) return null
  return { x: delta.x / magnitude, y: delta.y / magnitude }
}

function directionAngle(direction: Vec2 | null | undefined, piece: Piece) {
  const vector = direction ?? forwardVector(piece) ?? FALLBACK_DIRECTION
  return Math.atan2(vector.y, vector.x) * 180 / Math.PI
}

function transmitStrength(piece: Piece, document: DominoDocument, inherited: number) {
  const surfaceGrip = (document.scene.friction + piece.friction) / 2
  const tipSpeed = Math.max(1.8, piece.height * document.scene.gravity / 2) * (0.75 + surfaceGrip * 0.5)
  const transfer = clamp(
    (piece.height / 1.6) * (0.85 + piece.friction * 0.3) * (1.15 - piece.fallThreshold * 0.18),
    0.35,
    1.5,
  )
  return Math.max(0, inherited * transfer + tipSpeed * 0.025)
}

export function propagate(document: DominoDocument) {
  const piecesById = new Map(document.pieces.map(piece => [piece.id, piece]))
  const normalizedCues = normalizeStartCues(document)
  const cueEntries = normalizedCues
    .map((cue, index) => ({ cue, index, position: piecesById.get(cue.pieceId) ?? null }))
    .sort((a, b) => a.cue.time - b.cue.time
      || comparePositions(a.position, b.position)
      || b.cue.strength - a.cue.strength
      || a.index - b.index)

  let reachSequence = 0
  const queue: ScheduledReach[] = cueEntries.map(({ cue }) => {
    const piece = piecesById.get(cue.pieceId)!
    return {
      id: `reach-${++reachSequence}`,
      kind: 'start',
      targetId: cue.pieceId,
      time: cue.time,
      sourceId: null,
      sourceEventId: null,
      rootCueId: cue.id,
      cueLabel: cue.label ?? null,
      strength: Math.max(0, Number.isFinite(cue.strength) ? cue.strength : 1),
      direction: forwardVector(piece),
      detail: cue.label?.trim() || '手动触发',
      targetPosition: { x: piece.x, y: piece.y },
      sourcePosition: null,
    }
  })

  const events: SimulationEvent[] = []
  const settled = new Set<string>()
  const primaryEventByPiece = new Map<string, SimulationEvent>()
  let eventSequence = 0
  let interruptedPieceId: string | null = null
  let interruptionReason: string | null = null
  let reachedTrigger = false

  function pushEvent(draft: Omit<SimulationEvent, 'id' | 'sequence'>): SimulationEvent {
    eventSequence += 1
    const event: SimulationEvent = { id: `event-${eventSequence}`, sequence: eventSequence, ...draft }
    events.push(event)
    return event
  }

  function labelOf(pieceId: string | null | undefined) {
    if (!pieceId) return '起点'
    const piece = piecesById.get(pieceId)
    return piece?.label?.trim() || pieceId
  }

  function describeReach(reach: ScheduledReach | ReachRecord) {
    if (reach.kind === 'start') {
      return `起倒点「${reach.cueLabel?.trim() || reach.rootCueId || '手动'}」`
    }
    const source = labelOf(reach.sourceId)
    const channel = reach.kind === 'contact' ? '碰撞触达' : '连线触达'
    return `${channel}「${source}」`
  }

  function toReachRecord(
    reach: ScheduledReach,
    status: ReachRecord['status'],
    mergedIntoEventId: string | null = null,
  ): ReachRecord {
    return {
      id: reach.id,
      kind: reach.kind,
      targetId: reach.targetId,
      time: reach.time,
      sourceId: reach.sourceId,
      sourceEventId: reach.sourceEventId,
      rootCueId: reach.rootCueId,
      cueLabel: reach.cueLabel,
      strength: reach.strength,
      direction: reach.direction,
      detail: reach.detail,
      status,
      mergedIntoEventId,
    }
  }

  function appendMergedEvent(
    reach: ScheduledReach,
    winner: ScheduledReach | null,
    primaryEvent: SimulationEvent,
    timing: 'simultaneous' | 'late',
  ) {
    const status = timing === 'late' ? 'merged-late' : 'merged-simultaneous'
    const record = toReachRecord(reach, status, primaryEvent.id)
    primaryEvent.mergedReaches = [...(primaryEvent.mergedReaches ?? []), record]
    if (primaryEvent.collision) {
      primaryEvent.collision.mergedReachIds = [
        ...new Set([...primaryEvent.collision.mergedReachIds, reach.id]),
      ]
      primaryEvent.collision.explanation = timing === 'late'
        ? winner
          ? `${describeReach(winner)}首先到达，并已于 ${primaryEvent.time.toFixed(3)}s 胜出；${describeReach(reach)}在 ${reach.time.toFixed(3)}s 晚到并合并，同一元件不重复倒下。`
          : `该元件已于 ${primaryEvent.time.toFixed(3)}s 完成同刻仲裁并停止；${describeReach(reach)}在 ${reach.time.toFixed(3)}s 晚到并合并，不改变均势结果。`
        : `同刻触达由${describeReach(winner ?? reach)}胜出；${describeReach(reach)}被合并，不产生第二次倒下。`
    }
    return pushEvent({
      pieceId: reach.targetId,
      time: reach.time,
      causeId: reach.sourceEventId,
      kind: 'merged',
      detail: timing === 'late'
        ? `晚到触达已合并 · ${describeReach(reach)}晚于胜出触达，未改变下游`
        : `同刻触达已合并 · ${describeReach(reach)}未在同刻仲裁中胜出`,
      reach: record,
      mergedIntoEventId: primaryEvent.id,
    })
  }

  function canonicalLinks(piece: Piece) {
    return document.connections
      .filter(link => link.from === piece.id && link.enabled)
      .map(link => ({ link, target: piecesById.get(link.to) ?? null }))
      .sort((a, b) => comparePositions(
        a.target ? { x: a.target.x, y: a.target.y } : null,
        b.target ? { x: b.target.x, y: b.target.y } : null,
      ) || a.link.delay - b.link.delay || a.link.id.localeCompare(b.link.id))
  }

  function scheduleConnections(piece: Piece, winner: ScheduledReach, sourceEvent: SimulationEvent) {
    for (const { link, target } of canonicalLinks(piece)) {
      if (!target) continue
      queue.push({
        id: `reach-${++reachSequence}`,
        kind: 'connection',
        targetId: target.id,
        time: winner.time + link.delay,
        sourceId: piece.id,
        sourceEventId: sourceEvent.id,
        rootCueId: winner.rootCueId,
        cueLabel: winner.cueLabel,
        strength: transmitStrength(piece, document, winner.strength),
        direction: directionBetween(piece, target),
        detail: '机关连线',
        targetPosition: { x: target.x, y: target.y },
        sourcePosition: { x: piece.x, y: piece.y },
      })
    }
  }

  function pickRampTarget(piece: Piece, candidates: readonly Piece[], fallDirection: Vec2 | null) {
    const horizontal = fallDirection?.x ?? Math.cos(piece.angle * Math.PI / 180)
    return candidates
      .filter(item => horizontal >= 0 ? item.x > piece.x : item.x < piece.x)
      .filter(item => Math.abs(item.y - piece.y) < 2.1)
      .sort((a, b) => (horizontal >= 0 ? a.x - b.x : b.x - a.x)
        || Math.abs(a.y - piece.y) - Math.abs(b.y - piece.y)
        || a.y - b.y
        || a.id.localeCompare(b.id))[0] ?? null
  }

  function schedulePhysicalContact(
    piece: Piece,
    winner: ScheduledReach,
    sourceEvent: SimulationEvent,
    fallDirection: Vec2 | null,
  ) {
    const surfaceGrip = (document.scene.friction + piece.friction) / 2
    const reachScale = (0.94 + surfaceGrip * 0.35) * (1.25 - piece.fallThreshold * 0.25)
    const directedPiece = fallDirection
      ? { ...piece, angle: directionAngle(fallDirection, piece) }
      : piece

    // Active propagation skips already-settled pieces so a fallen tile does not
    // block the next standing target. If no standing target remains, a settled
    // target in the same reach cone is still audited as a merged late reach.
    const activeCandidates = document.pieces.filter(item => !settled.has(item.id) && item.id !== piece.id)
    let target: Piece | null = piece.kind === 'ramp'
      ? pickRampTarget(piece, activeCandidates, fallDirection)
      : nextContact(directedPiece, activeCandidates, reachScale)
    let contactsSettledTarget = false

    if (!target) {
      const allCandidates = document.pieces.filter(item => item.id !== piece.id)
      target = piece.kind === 'ramp'
        ? pickRampTarget(piece, allCandidates, fallDirection)
        : nextContact(directedPiece, allCandidates, reachScale)
      contactsSettledTarget = Boolean(target && settled.has(target.id))
    }

    if (!target) return false
    const separation = Math.hypot(piece.x - target.x, piece.y - target.y)
    const speed = Math.max(1.8, piece.height * document.scene.gravity / 2) * (0.75 + surfaceGrip * 0.5)
    const travel = Math.max(0.24, separation / speed)
    queue.push({
      id: `reach-${++reachSequence}`,
      kind: 'contact',
      targetId: target.id,
      time: winner.time + travel,
      sourceId: piece.id,
      sourceEventId: sourceEvent.id,
      rootCueId: winner.rootCueId,
      cueLabel: winner.cueLabel,
      strength: transmitStrength(piece, document, winner.strength),
      direction: directionBetween(piece, target),
      detail: contactsSettledTarget ? '晚到接触追踪' : (piece.kind === 'splitter' ? '分岔臂接触'
        : piece.kind === 'ramp' ? '坡面末端接触'
          : '相邻接触'),
      targetPosition: { x: target.x, y: target.y },
      sourcePosition: { x: piece.x, y: piece.y },
    })
    return true
  }

  while (queue.length > 0) {
    queue.sort(compareReaches)
    const first = queue.shift()!
    const piece = piecesById.get(first.targetId)
    if (!piece) continue

    const existingPrimary = primaryEventByPiece.get(piece.id)
    if (settled.has(piece.id) && existingPrimary) {
      appendMergedEvent(first, existingPrimary.winningReach
        ? reachFromRecord(existingPrimary.winningReach)
        : null, existingPrimary, 'late')
      continue
    }

    const simultaneous: ScheduledReach[] = [first]
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      const candidate = queue[index]
      if (candidate.targetId === piece.id && isSameTime(candidate.time, first.time)) {
        simultaneous.push(candidate)
        queue.splice(index, 1)
      }
    }

    const resolution = resolveCollision(simultaneous)
    if (!resolution.winner) {
      settled.add(piece.id)
      const records = resolution.merged.map(reach => toReachRecord(reach, 'merged-simultaneous'))
      const collision: CollisionSummary = {
        outcome: resolution.outcome,
        winnerReachId: null,
        mergedReachIds: resolution.merged.map(reach => reach.id),
        netForce: resolution.netForce,
        fallDirection: null,
        explanation: `同刻反向触达的净冲量为 ${Math.hypot(resolution.netForce.x, resolution.netForce.y).toFixed(3)}，强弱相抵；${piece.label || piece.id} 被夹持而未倒下，${records.length} 路触达合并。`,
      }
      const event = pushEvent({
        pieceId: piece.id,
        time: first.time,
        causeId: null,
        kind: 'interrupted',
        detail: '同刻对撞夹持 · 反向冲量相抵，元件未倒下',
        mergedReaches: records,
        collision,
      })
      primaryEventByPiece.set(piece.id, event)
      for (const reach of resolution.merged) {
        appendMergedEvent(reach, null, event, 'simultaneous')
      }
      if (interruptedPieceId === null) {
        interruptedPieceId = piece.id
        interruptionReason = '同刻反向碰撞强弱相抵，元件被夹持，链路在此停止。'
      }
      continue
    }

    const winner = resolution.winner
    settled.add(piece.id)
    const fallDirection = resolution.direction
      ?? normalizeVector(winner.direction ?? { x: 0, y: 0 })
      ?? forwardVector(piece)
    const winningRecord = toReachRecord(winner, 'winning')
    const mergedRecords: ReachRecord[] = []
    const mergedDescription = resolution.merged.map(reach => describeReach(reach)).join('、')
    const simultaneousCollision = resolution.merged.length > 0
    const collision: CollisionSummary = {
      outcome: resolution.outcome,
      winnerReachId: winner.id,
      mergedReachIds: resolution.merged.map(reach => reach.id),
      netForce: resolution.netForce,
      fallDirection,
      explanation: simultaneousCollision
        ? resolution.outcome === 'activation'
          ? `同刻非方向触达中${describeReach(winner)}胜出；${mergedDescription}被合并，下游方向仍由元件朝向决定。`
          : `同刻对撞净冲量方向为 (${fallDirection.x.toFixed(3)}, ${fallDirection.y.toFixed(3)})；${describeReach(winner)}胜出，${mergedDescription}被合并。`
        : `${describeReach(winner)}首先到达并胜出。`,
    }

    let detail: string
    if (piece.kind === 'trigger') {
      detail = `触发器响应 · ${winner.detail}`
    } else if (piece.kind === 'splitter') {
      detail = `分岔展开 · ${winner.detail}`
    } else if (piece.kind === 'ramp') {
      detail = `坡道传递 · ${winner.detail}`
    } else {
      detail = `受力倒下 · ${winner.detail}`
    }
    if (simultaneousCollision) {
      detail += ` · 同刻仲裁：${describeReach(winner)}胜出，合并 ${resolution.merged.length} 路`
    }

    const event = pushEvent({
      pieceId: piece.id,
      time: winner.time,
      causeId: winner.sourceEventId,
      kind: piece.kind === 'trigger' || piece.kind === 'splitter' ? 'mechanism' : 'fall',
      detail,
      reach: winningRecord,
      winningReach: winningRecord,
      mergedReaches: mergedRecords,
      collision,
    })
    primaryEventByPiece.set(piece.id, event)
    for (const reach of resolution.merged) {
      appendMergedEvent(reach, winner, event, 'simultaneous')
    }

    if (piece.kind === 'trigger') {
      reachedTrigger = true
      scheduleConnections(piece, winner, event)
      continue
    }

    scheduleConnections(piece, winner, event)
    const madeContact = schedulePhysicalContact(piece, winner, event, fallDirection)

    const hasConnection = document.connections.some(link => link.from === piece.id && link.enabled)
    if (!madeContact && !hasConnection && interruptedPieceId === null) {
      interruptedPieceId = piece.id
      interruptionReason = '倒下方向内没有可触达的元件，链路在此停止。'
      pushEvent({
        pieceId: piece.id,
        time: winner.time + 0.05,
        causeId: event.id,
        kind: 'interrupted',
        detail: interruptionReason,
      })
    }
  }

  const duration = events.reduce((max, event) => Math.max(max, event.time), 0)
  return {
    events,
    startCues: normalizedCues,
    interruptedPieceId,
    interruptionReason,
    reachedTrigger,
    status: events.length === 0 ? 'empty' as const
      : interruptedPieceId || !reachedTrigger ? 'interrupted' as const : 'complete' as const,
    duration,
  }
}

function reachFromRecord(record: ReachRecord): ScheduledReach {
  return {
    id: record.id,
    kind: record.kind,
    targetId: record.targetId,
    time: record.time,
    sourceId: record.sourceId ?? null,
    sourceEventId: record.sourceEventId ?? null,
    rootCueId: record.rootCueId ?? null,
    cueLabel: record.cueLabel ?? null,
    strength: record.strength,
    direction: record.direction,
    detail: record.detail,
  }
}
