export type PieceKind = 'domino' | 'ramp' | 'splitter' | 'trigger'
export type Axis = 'north' | 'east' | 'south' | 'west'

export interface Vec2 { x: number; y: number }

export interface Piece {
  id: string
  kind: PieceKind
  x: number
  y: number
  angle: number
  facing: Axis
  label: string
  height: number
  width: number
  fallThreshold: number
  friction: number
}

export interface MechanismConnection {
  id: string
  from: string
  to: string
  delay: number
  enabled: boolean
}

export interface StartCue {
  id: string
  pieceId: string
  time: number
  strength: number
  label?: string
}

export interface SceneSettings {
  gravity: number
  friction: number
  width: number
  height: number
  showGrid: boolean
}

export interface DominoDocument {
  id: string
  title: string
  revision: number
  updatedAt: number
  pieces: Piece[]
  connections: MechanismConnection[]
  scene: SceneSettings
  startPieceId: string
  /** Optional timed entries. When absent, older documents fall back to startPieceId at t=0. */
  startCues?: StartCue[]
}

export type ReachKind = 'start' | 'contact' | 'connection'
export type ReachStatus = 'winning' | 'merged-simultaneous' | 'merged-late'

export interface ReachRecord {
  id: string
  kind: ReachKind
  targetId: string
  time: number
  sourceId?: string | null
  sourceEventId?: string | null
  rootCueId?: string | null
  cueLabel?: string | null
  strength: number
  direction: Vec2 | null
  detail: string
  status?: ReachStatus
  mergedIntoEventId?: string | null
}

export interface CollisionSummary {
  outcome: 'single' | 'dominant' | 'balanced' | 'activation'
  winnerReachId: string | null
  mergedReachIds: string[]
  netForce: Vec2
  fallDirection: Vec2 | null
  explanation: string
}

export interface SimulationEvent {
  id: string
  pieceId: string
  time: number
  causeId: string | null
  kind: 'trigger' | 'fall' | 'mechanism' | 'interrupted' | 'merged'
  detail: string
  sequence?: number
  reach?: ReachRecord
  winningReach?: ReachRecord
  mergedReaches?: ReachRecord[]
  collision?: CollisionSummary
  mergedIntoEventId?: string | null
}

export interface SimulationRun {
  id: string
  documentId: string
  revision: number
  startedAt: number
  startPieceId: string
  startCues: StartCue[]
  status: 'complete' | 'interrupted' | 'empty'
  events: SimulationEvent[]
  interruptedPieceId: string | null
  interruptionReason: string | null
  duration: number
}
