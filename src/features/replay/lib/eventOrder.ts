import type { SimulationEvent } from '@/shared/document'

export function sortedEvents(events: readonly SimulationEvent[]) {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.time - b.event.time
      || (a.event.sequence ?? Number.MAX_SAFE_INTEGER) - (b.event.sequence ?? Number.MAX_SAFE_INTEGER)
      || a.index - b.index)
    .map(entry => entry.event)
}

export function previousEvent(events: readonly SimulationEvent[], time: number) {
  return sortedEvents(events).filter(event => event.time <= time).at(-1) ?? null
}
