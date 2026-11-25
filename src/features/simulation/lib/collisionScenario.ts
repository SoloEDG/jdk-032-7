import type { DominoDocument, Piece, StartCue } from '@/shared/document'

export type CollisionScenarioMode = 'early-weak' | 'right-first' | 'simultaneous-strong'

function tile(
  id: string,
  x: number,
  y: number,
  angle: number,
  label: string,
  kind: Piece['kind'] = 'domino',
): Piece {
  return {
    id,
    kind,
    x,
    y,
    angle,
    facing: angle === 180 ? 'west' : angle === 90 ? 'south' : angle > 90 ? 'west' : 'east',
    label,
    height: kind === 'trigger' ? 0.8 : 1.6,
    width: kind === 'trigger' ? 0.7 : 0.42,
    fallThreshold: 0.8,
    friction: 0.55,
  }
}

/**
 * Deterministic verification topology:
 * two horizontal chains strike one shared tile from opposite sides, with a
 * delayed vertical branch. Distances are 1.5 m so contact travel clamps to
 * the same 0.24 s step used by the propagator.
 */
export function createCollisionScenarioDocument(
  mode: CollisionScenarioMode = 'simultaneous-strong',
): DominoDocument {
  const pieces: Piece[] = [
    tile('verify-l0', 1.2, 4, 0, '左链起点'),
    tile('verify-l1', 2.7, 4, 0, '左链中继'),
    tile('verify-l2', 4.2, 4, 0, '左撞块'),
    tile('verify-merge', 5.7, 4, 0, '交会核'),
    tile('verify-r2', 7.2, 4, 180, '右撞块'),
    tile('verify-r1', 8.7, 4, 180, '右链中继'),
    tile('verify-r0', 10.2, 4, 180, '右链起点'),
    tile('verify-east-arm', 7.1, 5, 35, '东向岔牌'),
    tile('verify-west-arm', 4.3, 5, 145, '西向岔牌'),
    tile('verify-east-target', 8.6, 5, 0, '东终点', 'trigger'),
    tile('verify-west-target', 2.8, 5, 0, '西终点', 'trigger'),
    tile('verify-late1', 5.7, 2.5, 90, '晚到撞块'),
    tile('verify-late0', 5.7, 1, 90, '晚到支路起点'),
  ]

  let startCues: StartCue[]
  if (mode === 'early-weak') {
    startCues = [
      { id: 'cue-left-early', pieceId: 'verify-l0', time: 0, strength: 1, label: '左路弱起先到' },
      { id: 'cue-right-strong-late', pieceId: 'verify-r0', time: 0.8, strength: 6, label: '右路强援晚到' },
      { id: 'cue-late-branch', pieceId: 'verify-late0', time: 2.2, strength: 2, label: '第三条晚到支路' },
    ]
  } else if (mode === 'right-first') {
    startCues = [
      { id: 'cue-right-early', pieceId: 'verify-r0', time: 0, strength: 1, label: '右路先到' },
      { id: 'cue-left-late', pieceId: 'verify-l0', time: 0.8, strength: 6, label: '左路强援晚到' },
      { id: 'cue-late-branch', pieceId: 'verify-late0', time: 2.2, strength: 2, label: '第三条晚到支路' },
    ]
  } else {
    startCues = [
      { id: 'cue-left-weak', pieceId: 'verify-l0', time: 0, strength: 1, label: '左路弱触达' },
      { id: 'cue-right-strong', pieceId: 'verify-r0', time: 0, strength: 6, label: '右路强触达' },
      { id: 'cue-late-branch', pieceId: 'verify-late0', time: 2.2, strength: 2, label: '晚到支路' },
    ]
  }

  return {
    id: `collision-scenario-${mode}`,
    title: '两路交会 / 同刻碰撞验证',
    revision: 1,
    updatedAt: 0,
    pieces,
    connections: [],
    scene: { gravity: 9.8, friction: 0.62, width: 12, height: 7, showGrid: false },
    startPieceId: startCues[0].pieceId,
    startCues,
  }
}

export type TimedConvergenceWinner = 'a' | 'b'

/**
 * Explicit-delay graph for first-arrival versus already-queued late reaches.
 * Source nodes are triggers far outside physical contact range, so connection
 * delays make the arrival order exact without geometry cross-talk.
 */
export function createTimedConvergenceDocument(winner: TimedConvergenceWinner = 'a'): DominoDocument {
  const aFirst = winner === 'a'
  const pieces: Piece[] = [
    tile('timed-a', 2.5, 4, 0, '左路定时链', 'trigger'),
    tile('timed-b', 9.5, 4, 180, '右路定时链', 'trigger'),
    tile('timed-late', 6, 1.3, 90, '晚到支路', 'trigger'),
    tile('timed-merge', 6, 4, 0, '定时交会核'),
    tile('timed-east-arm', 7.2, 5, 35, '定时东岔牌'),
    tile('timed-west-arm', 4.8, 5, 145, '定时西岔牌'),
    tile('timed-east-target', 8.5, 5, 0, '定时东终点', 'trigger'),
    tile('timed-west-target', 3.5, 5, 0, '定时西终点', 'trigger'),
  ]

  return {
    id: `timed-convergence-${winner}`,
    title: '两路定时交会验证',
    revision: 1,
    updatedAt: 0,
    pieces,
    connections: [
      { id: 'timed-link-a', from: 'timed-a', to: 'timed-merge', delay: 0.3, enabled: true },
      { id: 'timed-link-b', from: 'timed-b', to: 'timed-merge', delay: aFirst ? 0.9 : 0.3, enabled: true },
      { id: 'timed-link-late', from: 'timed-late', to: 'timed-merge', delay: 1, enabled: true },
      { id: 'timed-link-east', from: 'timed-east-arm', to: 'timed-east-target', delay: 0.05, enabled: true },
      { id: 'timed-link-west', from: 'timed-west-arm', to: 'timed-west-target', delay: 0.05, enabled: true },
    ],
    scene: { gravity: 9.8, friction: 0.62, width: 12, height: 7, showGrid: false },
    startPieceId: aFirst ? 'timed-a' : 'timed-b',
    startCues: [
      aFirst
        ? { id: 'timed-cue-a', pieceId: 'timed-a', time: 0, strength: 1, label: '左路弱起点' }
        : { id: 'timed-cue-b-first', pieceId: 'timed-b', time: 0, strength: 1, label: '右路弱起点' },
      aFirst
        ? { id: 'timed-cue-b-strong-late', pieceId: 'timed-b', time: 0.2, strength: 6, label: '右路强起点' }
        : { id: 'timed-cue-a-strong-late', pieceId: 'timed-a', time: 0.2, strength: 6, label: '左路强起点' },
      { id: 'timed-cue-late', pieceId: 'timed-late', time: 0.4, strength: 2, label: '晚到支路起点' },
    ],
  }
}
