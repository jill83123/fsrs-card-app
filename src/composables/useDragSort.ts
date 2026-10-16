import { reactive } from 'vue'

/**
 * Drag-to-reorder for a vertical list. Mark each item with `data-sort-item` (all siblings
 * in one parent), spread `style(i)` on it and call `start(e, i)` from a drag handle's
 * pointerdown (the handle needs `touch-none`). `onMove` gets the final from/to indexes.
 */
export function useDragSort(onMove: (from: number, to: number) => void) {
  const s = reactive({ from: -1, over: -1, dy: 0, step: 0 })
  let rects: DOMRect[] = []
  let startY = 0

  function start(e: PointerEvent, index: number) {
    const handle = e.currentTarget as HTMLElement
    const item = handle.closest<HTMLElement>('[data-sort-item]')
    const parent = item?.parentElement
    if (!item || !parent) return
    e.preventDefault()
    const els = [...parent.children].filter((c) => c.hasAttribute('data-sort-item'))
    rects = els.map((el) => el.getBoundingClientRect())
    const own = rects[index]
    if (!own) return
    const next = rects[index + 1] ?? rects[index - 1]
    const gap = next ? Math.abs(next.top - own.top) - own.height : 0
    s.step = own.height + (index + 1 < rects.length ? gap : Math.max(0, gap))
    s.from = s.over = index
    s.dy = 0
    startY = e.clientY
    handle.setPointerCapture(e.pointerId)

    const move = (ev: PointerEvent) => {
      s.dy = ev.clientY - startY
      const y = own.top + own.height / 2 + s.dy
      let over = 0
      rects.forEach((r, i) => {
        if (i !== index && r.top + r.height / 2 < y) over++
      })
      s.over = over
    }
    const end = (ev: PointerEvent) => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', end)
      handle.removeEventListener('pointercancel', end)
      if (handle.hasPointerCapture(ev.pointerId)) handle.releasePointerCapture(ev.pointerId)
      const { from, over } = s
      s.from = s.over = -1
      s.dy = 0
      if (ev.type !== 'pointercancel' && from !== over) onMove(from, over)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', end)
  }

  function style(i: number) {
    if (s.from < 0) return undefined
    if (i === s.from) {
      return { transform: `translateY(${s.dy}px)`, zIndex: 10, position: 'relative' as const }
    }
    let shift = 0
    if (s.from < s.over && i > s.from && i <= s.over) shift = -s.step
    else if (s.from > s.over && i >= s.over && i < s.from) shift = s.step
    return { transform: `translateY(${shift}px)`, transition: 'transform 150ms' }
  }

  const dragging = (i: number) => s.from === i

  return { start, style, dragging, active: () => s.from >= 0 }
}

/** Move one element of a list, returning a new array. */
export function moved<T>(list: T[], from: number, to: number): T[] {
  const out = [...list]
  const [x] = out.splice(from, 1)
  out.splice(to, 0, x!)
  return out
}
