<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Clock } from '@lucide/vue'
import BottomSheet from './BottomSheet.vue'

/**
 * A time of day ("HH:MM") picked in a sheet with two scrolling wheels, instead of the browser's
 * own picker. Minutes go in steps of 5; a saved time between two steps stays selectable.
 * The wheels loop: each list is drawn COPIES times and, once still, the wheel jumps back to the
 * middle copy, so scrolling past 23 carries on at 00.
 */
const model = defineModel<string>({ required: true })
defineProps<{ title?: string }>()

const ITEM = 44
const COPIES = 5
const MIDDLE = Math.floor(COPIES / 2)
const pad = (n: number) => String(n).padStart(2, '0')
const HOURS = Array.from({ length: 24 }, (_, i) => i)

const open = ref(false)
const hour = ref(0)
const minute = ref(0)
// the row each wheel is on (the list is drawn several times, so the value alone does not say which)
const hourRow = ref(0)
const minuteRow = ref(0)
const hourWheel = ref<HTMLElement>()
const minuteWheel = ref<HTMLElement>()

const minutes = computed(() => {
  const list = Array.from({ length: 12 }, (_, i) => i * 5)
  const [, m = 0] = model.value.split(':').map(Number)
  if (!list.includes(m)) list.push(m)
  return list.sort((a, b) => a - b)
})

const rowsOf = (values: number[]) =>
  Array.from({ length: values.length * COPIES }, (_, k) => values[k % values.length]!)

function scrollTo(el: HTMLElement | undefined, index: number, smooth = false) {
  el?.scrollTo({ top: index * ITEM, behavior: smooth ? 'smooth' : 'auto' })
}

/** Once a wheel has stopped outside the middle copy, move it to the same row there (looks the same). */
function recenter(el: HTMLElement, n: number) {
  const i = Math.round(el.scrollTop / ITEM)
  if (i < n * MIDDLE || i >= n * (MIDDLE + 1)) el.scrollTop = (n * MIDDLE + (i % n)) * ITEM
}

watch(open, async (o) => {
  if (!o) return
  const [h = 0, m = 0] = model.value.split(':').map(Number)
  hour.value = h
  minute.value = m
  await nextTick()
  hourRow.value = HOURS.length * MIDDLE + HOURS.indexOf(h)
  minuteRow.value = minutes.value.length * MIDDLE + minutes.value.indexOf(m)
  scrollTo(hourWheel.value, hourRow.value)
  scrollTo(minuteWheel.value, minuteRow.value)
})

const settle: Partial<Record<number, ReturnType<typeof setTimeout>>> = {}
function onScroll(e: Event, values: number[], w: number) {
  const el = e.target as HTMLElement
  const rows = values.length * COPIES
  const i = Math.min(rows - 1, Math.max(0, Math.round(el.scrollTop / ITEM)))
  const value = values[i % values.length]!
  if (w) {
    minute.value = value
    minuteRow.value = i
  } else {
    hour.value = value
    hourRow.value = i
  }
  clearTimeout(settle[w])
  settle[w] = setTimeout(() => recenter(el, values.length), 150)
}

// a mouse cannot scroll by dragging, so a wheel follows the pointer itself (touch scrolls natively)
const dragging = ref(false)
let dragged = false
function startDrag(e: PointerEvent, n: number) {
  const el = e.currentTarget as HTMLElement
  if (e.pointerType !== 'mouse' || e.button !== 0) return
  const startY = e.clientY
  let startTop = el.scrollTop
  dragged = false
  const move = (m: PointerEvent) => {
    if (!dragged && Math.abs(m.clientY - startY) < 4) return
    dragged = true
    // the rows stop snapping while held, or they would fight the pointer
    dragging.value = true
    // dragging far enough to leave the middle copy: carry on from the same row inside it
    const span = n * ITEM
    const at = startTop - (m.clientY - startY)
    if (at < span * MIDDLE) startTop += span
    else if (at >= span * (MIDDLE + 1)) startTop -= span
    el.scrollTop = startTop - (m.clientY - startY)
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    if (!dragged) return
    dragging.value = false
    el.scrollTo({ top: Math.round(el.scrollTop / ITEM) * ITEM, behavior: 'smooth' })
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}

function pick(el: HTMLElement | undefined, index: number) {
  // the click that ends a drag is not a choice
  if (!dragged) scrollTo(el, index, true)
}

function done() {
  model.value = `${pad(hour.value)}:${pad(minute.value)}`
  open.value = false
}
</script>

<template>
  <button
    type="button"
    class="input flex w-auto cursor-pointer items-center gap-2 text-sm tabular-nums"
    @click="open = true"
  >
    <Clock :size="16" class="text-muted" /> {{ model }}
  </button>

  <BottomSheet v-model="open" :title="title ?? '選擇時間'">
    <div class="relative">
      <!-- the band the chosen row sits in: as wide as the sheet's content, rounded -->
      <div
        class="pointer-events-none absolute inset-x-0 top-1/2 h-11 -translate-y-1/2 rounded-2xl bg-surface/70"
      />
    <div class="relative mx-auto flex w-3/4 max-w-sm min-w-64 items-center justify-center gap-10">
      <div
        v-for="(wheel, w) in [
          { values: HOURS, row: hourRow, label: '時' },
          { values: minutes, row: minuteRow, label: '分' },
        ]"
        :key="w"
        class="relative w-[4.5rem] shrink-0"
      >
        <div
          :ref="(el) => (w ? (minuteWheel = el as HTMLElement) : (hourWheel = el as HTMLElement))"
          class="no-scrollbar wheel h-[220px] cursor-grab touch-pan-y overflow-y-auto overscroll-contain py-[88px] select-none"
          :class="dragging ? 'cursor-grabbing' : 'snap-y snap-mandatory'"
          role="listbox"
          :aria-label="wheel.label"
          @scroll.passive="onScroll($event, wheel.values, w)"
          @pointerdown="startDrag($event, wheel.values.length)"
        >
          <div
            v-for="(v, i) in rowsOf(wheel.values)"
            :key="i"
            role="option"
            :aria-selected="i === wheel.row"
            class="flex h-11 cursor-pointer snap-center items-center justify-center tabular-nums transition-all"
            :class="i === wheel.row ? 'text-2xl font-semibold text-primary' : 'text-lg text-muted'"
            @click="pick(w ? minuteWheel : hourWheel, i)"
          >
            {{ pad(v) }}
          </div>
        </div>
      </div>
      <!-- same size and line box as the chosen row, so it lines up with the digits -->
      <span
        class="pointer-events-none absolute inset-x-0 top-1/2 flex h-11 -translate-y-1/2 items-center justify-center pb-1.5 text-2xl leading-none font-semibold"
        >:</span
      >
    </div>
    </div>
    <button type="button" class="btn btn-primary mt-5 w-full" @click="done">完成</button>
  </BottomSheet>
</template>

<style scoped>
/* rows fade out toward the top and bottom, so the one in the middle stands out */
.wheel {
  mask-image: linear-gradient(to bottom, transparent, #000 32%, #000 68%, transparent);
}
.no-scrollbar {
  scrollbar-width: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
