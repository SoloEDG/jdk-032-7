import type { Vec2 } from '@/shared/document'

export const TIME_EPSILON = 1e-9
export const FORCE_EPSILON = 1e-8

export interface TimedReach {
  id: string
  targetId: string
  time: number
  strength: number
  direction: Vec2 | null
  kind: string
  targetPosition?: Vec2 | null
  sourcePosition?: Vec2 | null
}

export type CollisionOutcome = 'single' | 'dominant' | 'balanced' | 'activation'

export interface CollisionResolution<T extends TimedReach> {
  outcome: CollisionOutcome
  winner: T | null
  merged: T[]
  netForce: Vec2
  direction: Vec2 | null
}

export function isSameTime(a: number, b: number) {
  return Math.abs(a - b) <= TIME_EPSILON
}

export function comparePositions(a?: Vec2 | null, b?: Vec2 | null) {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return a.y - b.y || a.x - b.x
}

function directionAngle(direction: Vec2 | null) {
  return direction ? Math.atan2(direction.y, direction.x) : Number.POSITIVE_INFINITY
}

/**
 * Semantic ordering only. IDs are the final tie-break for otherwise
 * indistinguishable records and therefore cannot decide a collision winner.
 */
export function compareReaches(a: TimedReach, b: TimedReach) {
  return a.time - b.time
    || comparePositions(a.targetPosition, b.targetPosition)
    || b.strength - a.strength
    || directionAngle(a.direction) - directionAngle(b.direction)
    || comparePositions(a.sourcePosition, b.sourcePosition)
    || a.kind.localeCompare(b.kind)
    || a.id.localeCompare(b.id)
}

export function netForce(reaches: readonly Pick<TimedReach, 'strength' | 'direction'>[]): Vec2 {
  let x = 0
  let y = 0
  for (const reach of reaches) {
    if (!reach.direction) continue
    x += reach.direction.x * reach.strength
    y += reach.direction.y * reach.strength
  }
  return { x, y }
}

export function normalizeVector(vector: Vec2): Vec2 | null {
  const magnitude = Math.hypot(vector.x, vector.y)
  if (magnitude <= FORCE_EPSILON) return null
  return { x: vector.x / magnitude, y: vector.y / magnitude }
}

function compareForWinner(a: TimedReach, b: TimedReach) {
  return b.strength - a.strength || compareReaches(a, b)
}

function dominantReach<T extends TimedReach>(reaches: readonly T[], direction: Vec2): T {
  let winner = reaches[0]
  let bestProjection = Number.NEGATIVE_INFINITY
  for (const reach of reaches) {
    const projection = reach.direction
      ? reach.strength * (reach.direction.x * direction.x + reach.direction.y * direction.y)
      : Number.NEGATIVE_INFINITY
    if (
      projection > bestProjection + FORCE_EPSILON
      || (Math.abs(projection - bestProjection) <= FORCE_EPSILON && compareForWinner(reach, winner) < 0)
    ) {
      bestProjection = projection
      winner = reach
    }
  }
  return winner
}

/**
 * Resolves all reaches known to arrive at one element at one timestamp.
 * Earlier reaches must never call this with later reaches: first arrival wins
 * immediately, while this function only decides a genuinely simultaneous batch.
 */
export function resolveCollision<T extends TimedReach>(input: readonly T[]): CollisionResolution<T> {
  const reaches = [...input].sort(compareReaches)
  if (reaches.length === 0) {
    return { outcome: 'balanced', winner: null, merged: [], netForce: { x: 0, y: 0 }, direction: null }
  }
  if (reaches.length === 1) {
    return {
      outcome: 'single',
      winner: reaches[0],
      merged: [],
      netForce: netForce(reaches),
      direction: reaches[0].direction,
    }
  }

  const force = netForce(reaches)
  const direction = normalizeVector(force)
  const directional = reaches.filter(reach => reach.direction !== null)

  if (direction && directional.length > 0) {
    const winner = dominantReach(reaches, direction)
    return {
      outcome: 'dominant',
      winner,
      merged: reaches.filter(reach => reach.id !== winner.id),
      netForce: force,
      direction,
    }
  }

  if (directional.length > 0) {
    // Equal, opposed impulses cancel. Returning no winner makes the stalemate
    // explicit instead of choosing an ID or array index.
    return { outcome: 'balanced', winner: null, merged: reaches, netForce: force, direction: null }
  }

  const winner = [...reaches].sort(compareForWinner)[0]
  return {
    outcome: 'activation',
    winner,
    merged: reaches.filter(reach => reach.id !== winner.id),
    netForce: force,
    direction: null,
  }
}
