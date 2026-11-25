import type { DominoDocument, SimulationRun } from '../src/shared/document'
import { resolveCollision, type TimedReach } from '../src/features/simulation/lib/collisions'
import { propagate } from '../src/features/simulation/lib/propagate'
import {
  createCollisionScenarioDocument,
  createTimedConvergenceDocument,
} from '../src/features/simulation/lib/collisionScenario'

let passed = 0
const failures: string[] = []

function check(condition: unknown, message: string) {
  if (condition) {
    passed += 1
    console.log(`  ✓ ${message}`)
  } else {
    failures.push(message)
    console.error(`  ✗ ${message}`)
  }
}

function reach(id: string, strength: number, x: number): TimedReach {
  return { id, targetId: 'shared', time: 1, strength, direction: { x, y: 0 }, kind: 'contact' }
}

function pieceIdByLabel(document: DominoDocument, label: string) {
  const piece = document.pieces.find(item => item.label === label)
  if (!piece) throw new Error(`Missing piece labelled ${label}`)
  return piece.id
}

function primaryEvent(document: DominoDocument, run: SimulationRun, label: string) {
  const id = pieceIdByLabel(document, label)
  const event = run.events.find(item => item.pieceId === id && (item.kind === 'fall' || item.kind === 'mechanism'))
  if (!event) throw new Error(`Shared tile ${label} has no primary event`)
  return event
}

function reached(document: DominoDocument, run: SimulationRun, label: string) {
  const id = pieceIdByLabel(document, label)
  return run.events.some(event => event.pieceId === id
    && (event.kind === 'fall' || event.kind === 'mechanism' || event.kind === 'trigger'))
}

function sourceLabel(document: DominoDocument, sourceId?: string | null) {
  if (!sourceId) return '—'
  return document.pieces.find(piece => piece.id === sourceId)?.label ?? sourceId
}

function statusBySource(document: DominoDocument, event: ReturnType<typeof primaryEvent>) {
  return Object.fromEntries((event.mergedReaches ?? []).map(record => [
    sourceLabel(document, record.sourceId),
    record.status,
  ]))
}

function round(value: number) {
  return Number(value.toFixed(6))
}

function mulberry32(seed: number) {
  return function random() {
    let value = seed += 0x6D2B79F5
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const random = mulberry32(seed)
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[result[index], result[swap]] = [result[swap], result[index]]
  }
  return result
}

function reidentifyAndReorder(document: DominoDocument, seed: number): DominoDocument {
  const idMap = new Map(document.pieces.map((piece, index) => [
    piece.id,
    `renamed-${seed}-${document.pieces.length - index}`,
  ]))
  return {
    ...document,
    id: `${document.id}-shuffled-${seed}`,
    pieces: shuffled(document.pieces.map(piece => ({ ...piece, id: idMap.get(piece.id)! })), seed),
    connections: shuffled(document.connections.map(link => ({
      ...link,
      id: `renamed-link-${seed}-${link.id}`,
      from: idMap.get(link.from)!,
      to: idMap.get(link.to)!,
    })), seed + 17),
    startCues: shuffled((document.startCues ?? []).map(cue => ({
      ...cue,
      id: `renamed-cue-${seed}-${cue.id}`,
      pieceId: idMap.get(cue.pieceId)!,
    })), seed + 31),
    startPieceId: idMap.get(document.startPieceId)!,
  }
}

function semanticSignature(document: DominoDocument, run: SimulationRun, mergeLabel: string) {
  const mergeId = pieceIdByLabel(document, mergeLabel)
  const primary = primaryEvent(document, run, mergeLabel)
  const name = (id?: string | null) => sourceLabel(document, id)
  return JSON.stringify({
    primaryCount: run.events.filter(event => event.pieceId === mergeId && event.id === primary.id).length,
    timeline: run.events.map(event => ({
      time: round(event.time),
      kind: event.kind,
      piece: name(event.pieceId),
      winner: name(event.winningReach?.sourceId),
      merged: (event.mergedReaches ?? []).map(record => name(record.sourceId)).sort(),
    })),
    winner: name(primary.winningReach?.sourceId),
    outcome: primary.collision?.outcome,
    direction: primary.collision?.fallDirection
      ? { x: round(primary.collision.fallDirection.x), y: round(primary.collision.fallDirection.y) }
      : null,
    merged: (primary.mergedReaches ?? []).map(record => ({
      source: name(record.sourceId),
      status: record.status,
      time: round(record.time),
    })).sort((a, b) => a.source.localeCompare(b.source)),
  })
}

function verifyOrderInvariance(document: DominoDocument, mergeLabel: string, label: string) {
  console.log(`\n  顺序/编号不变性：${label}`)
  const baseline = semanticSignature(document, propagate(document), mergeLabel)
  for (const seed of [1, 2, 3, 7, 11, 23, 42, 99]) {
    const reordered = reidentifyAndReorder(document, seed)
    const signature = semanticSignature(reordered, propagate(reordered), mergeLabel)
    check(signature === baseline, `seed=${seed} 重命名并打乱后，胜者、方向、时间线和合并状态不变`)
  }
}

console.log('\n1) 纯仲裁器：同刻强弱与完全均势')
const weakEast = reach('weak-east', 1, 1)
const strongWest = reach('strong-west', 6, -1)
for (const candidates of [[weakEast, strongWest], [strongWest, weakEast]] as TimedReach[][]) {
  const result = resolveCollision(candidates)
  check(result.outcome === 'dominant', '强弱不同的同刻反向碰撞由净冲量选出主导触达')
  check(result.winner?.id === 'strong-west', '胜者是强西路，而不是编号或列表靠前的触达')
  check(result.direction !== null && result.direction.x < 0, '下游方向指向强西路推动的西方')
  check(result.merged.map(item => item.id).includes('weak-east'), '弱东路被标记为同刻合并')
}
const equalEast = reach('equal-east', 3, 1)
const equalWest = { ...reach('zzz-west', 3, -1), id: 'equal-west' }
for (const candidates of [[equalEast, equalWest], [equalWest, equalEast]] as TimedReach[][]) {
  const result = resolveCollision(candidates)
  check(result.outcome === 'balanced' && result.winner === null, '等强反向碰撞确定为夹持均势，不使用编号破平')
  check(result.merged.length === 2, '均势中的两路触达均被合并记录')
}

console.log('\n2) 两路交会：先到弱触达 vs 后到强触达，另有晚到支路')
for (const winnerSide of ['a', 'b'] as const) {
  const document = createTimedConvergenceDocument(winnerSide)
  const run = propagate(document)
  const primary = primaryEvent(document, run, '定时交会核')
  const statuses = statusBySource(document, primary)
  const winnerLabel = winnerSide === 'a' ? '左路定时链' : '右路定时链'
  const loserLabel = winnerSide === 'a' ? '右路定时链' : '左路定时链'
  const winnerTarget = winnerSide === 'a' ? '定时东终点' : '定时西终点'
  const loserTarget = winnerSide === 'a' ? '定时西终点' : '定时东终点'

  check(run.events.filter(event => event.pieceId === pieceIdByLabel(document, '定时交会核') && event.kind === 'fall').length === 1,
    `${winnerSide.toUpperCase()} 先到时，共享交会核只倒下一次`)
  check(sourceLabel(document, primary.winningReach?.sourceId) === winnerLabel,
    `先到且较弱的「${winnerLabel}」胜出，强度不能推翻时间顺序`)
  check(statuses[loserLabel] === 'merged-late', `后到但更强的「${loserLabel}」被 merged-late 合并`)
  check(statuses['晚到支路'] === 'merged-late', '第三条晚到支路被 merged-late 合并')
  check(reached(document, run, winnerTarget), `先到方向的「${winnerTarget}」被触发`)
  check(!reached(document, run, loserTarget), `相反方向的「${loserTarget}」未被触发`)
  check(run.events.some(event => event.kind === 'merged' && event.detail.includes('晚到触达已合并')),
    '事件轨迹包含“晚到触达已合并”')
  check(primary.collision?.explanation.includes('首先到达'), '胜出记录说明它是首先到达的触达')
  check((primary.mergedReaches ?? []).length === 2, '主事件精确保存两路被合并触达')

  console.log('\n  —— 定时交会核记录 ——')
  console.log(`  t=${primary.time.toFixed(3)} ${primary.detail}`)
  console.log(`  ${primary.collision?.explanation}`)
  for (const event of run.events.filter(item => item.mergedIntoEventId === primary.id)) {
    console.log(`  t=${event.time.toFixed(3)} [${event.kind}] ${event.detail}`)
  }
  verifyOrderInvariance(document, '定时交会核', `timed-${winnerSide}`)
}

console.log('\n3) 同刻强弱相反的物理碰撞 + 一条晚到物理支路')
{
  const document = createCollisionScenarioDocument('simultaneous-strong')
  const run = propagate(document)
  const primary = primaryEvent(document, run, '交会核')
  const statuses = statusBySource(document, primary)

  check(run.events.filter(event => event.pieceId === pieceIdByLabel(document, '交会核') && event.kind === 'fall').length === 1,
    '物理交会核只有一次倒下事件')
  check(primary.collision?.outcome === 'dominant', ' exact 同刻触达进入强弱仲裁')
  check(sourceLabel(document, primary.winningReach?.sourceId) === '右撞块', '强右撞块在同刻反向碰撞中胜出')
  check(primary.collision.fallDirection !== null && primary.collision.fallDirection.x < 0,
    '净冲量方向朝西，因此下游西岔牌/西终点生效')
  check(statuses['左撞块'] === 'merged-simultaneous', '弱左撞块被 merged-simultaneous 合并')
  check(statuses['晚到撞块'] === 'merged-late', '晚到物理支路被 merged-late 合并')
  check(reached(document, run, '西终点') && !reached(document, run, '东终点'), '只有西侧终点到达')
  check(run.status === 'complete', '胜出方向到达触发器，运行状态为 complete')

  console.log('\n  —— 同刻碰撞记录 ——')
  console.log(`  t=${primary.time.toFixed(3)} ${primary.detail}`)
  console.log(`  ${primary.collision?.explanation}`)
  for (const event of run.events.filter(item => item.mergedIntoEventId === primary.id)) {
    console.log(`  t=${event.time.toFixed(3)} [${event.kind}] ${event.detail}`)
  }
  verifyOrderInvariance(document, '交会核', 'simultaneous-physical')
}

console.log(`\n结果：${passed} 项断言通过，${failures.length} 项失败。`)
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAILED: ${failure}`)
  process.exit(1)
}
