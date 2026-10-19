import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Floating tooltip for chart cells: `show` puts it above the element that fired the event,
 * relative to `root` (the chart's `relative` wrapper). Any press elsewhere dismisses it.
 */
export function useTip() {
  const root = ref<HTMLElement>()
  const tip = ref<{ text: string; x: number; y: number } | null>(null)

  function show(e: Event, text: string) {
    const box = root.value?.getBoundingClientRect()
    if (!box) return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    // keep the bubble inside the chart: ~70px is about half of its widest text
    const half = Math.min(70, box.width / 2)
    const x = Math.min(Math.max(r.left - box.left + r.width / 2, half), box.width - half)
    tip.value = { text, x, y: r.top - box.top }
  }
  const hide = () => (tip.value = null)

  onMounted(() => document.addEventListener('pointerdown', hide))
  onBeforeUnmount(() => document.removeEventListener('pointerdown', hide))

  return { root, tip, show, hide }
}
