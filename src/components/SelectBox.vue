<script setup lang="ts">
import {
  Fragment,
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  useId,
  useSlots,
  watch,
  type VNode,
} from 'vue'
import { Check, ChevronDown } from '@lucide/vue'

/**
 * A drop-down list in the app's own style, instead of the browser's. Fill it with <option> elements,
 * like a native <select>: `<SelectBox v-model="x"><option :value="1">One</option></SelectBox>`.
 * Classes and attributes (such as `input-sm`, `aria-label`) go on the button that opens the list.
 */
defineOptions({ inheritAttrs: false })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const model = defineModel<any>()

interface Opt {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any
  label: string
  /** shown on the button instead of `label`, e.g. the whole path of a deck */
  full: string
  /** branches to draw before the label, see `deckRows` */
  tree: string
  disabled: boolean
}

const slots = useSlots()

function textOf(children: VNode['children']): string {
  if (typeof children === 'string') return children
  if (!Array.isArray(children)) return ''
  return children
    .map((c) => (typeof c === 'object' && c ? textOf((c as VNode).children) : ''))
    .join('')
}

// read the <option>s out of the slot (also through v-for, which wraps them in a fragment)
function collect(nodes: VNode[], out: Opt[]) {
  for (const n of nodes) {
    if (n.type === Fragment && Array.isArray(n.children)) collect(n.children as VNode[], out)
    else if (n.type === 'option') {
      const p = n.props ?? {}
      const label = textOf(n.children).replace(/\s+/g, ' ').trim()
      out.push({
        value: p.value,
        label,
        full: typeof p.path === 'string' ? p.path : label,
        tree: typeof p.tree === 'string' ? p.tree : '',
        disabled: p.disabled === '' || p.disabled === true,
      })
    }
  }
}
// read at render time: the slot changes whenever the parent re-renders
function options(): Opt[] {
  const out: Opt[] = []
  collect(slots.default?.() ?? [], out)
  return out
}

const same = (a: unknown, b: unknown) => a === b || (a == null && b == null)
const selectedLabel = computed(() => {
  const o = options().find((o) => same(o.value, model.value))
  return o ? o.full : ''
})

const id = useId()
const trigger = ref<HTMLElement>()
const menu = ref<HTMLElement>()
const open = ref(false)
const active = ref(-1)
const place = ref<Record<string, string>>({})

function position() {
  const r = trigger.value?.getBoundingClientRect()
  if (!r) return
  const gap = 4
  const below = window.innerHeight - r.bottom - gap - 8
  const above = r.top - gap - 8
  const flip = below < 160 && above > below
  const max = Math.max(120, Math.min(288, flip ? above : below))
  place.value = {
    left: `${r.left}px`,
    width: `${r.width}px`,
    maxHeight: `${max}px`,
    ...(flip
      ? { bottom: `${window.innerHeight - r.top + gap}px` }
      : { top: `${r.bottom + gap}px` }),
  }
}

async function show() {
  const list = options()
  if (!list.length) return
  position()
  open.value = true
  active.value = Math.max(
    0,
    list.findIndex((o) => same(o.value, model.value)),
  )
  await nextTick()
  menu.value
    ?.querySelector<HTMLElement>('[data-active="true"]')
    ?.scrollIntoView({ block: 'nearest' })
}
function close() {
  open.value = false
}
function choose(o: Opt) {
  if (o.disabled) return
  model.value = o.value
  close()
  trigger.value?.focus()
}
function step(dir: 1 | -1) {
  const list = options()
  let i = active.value
  for (let n = 0; n < list.length; n++) {
    i = (i + dir + list.length) % list.length
    if (!list[i]!.disabled) break
  }
  active.value = i
  void nextTick(() =>
    menu.value
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' }),
  )
}
function onKey(e: KeyboardEvent) {
  if (!open.value) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault()
      void show()
    }
    return
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    step(e.key === 'ArrowDown' ? 1 : -1)
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault()
    active.value = e.key === 'Home' ? 0 : options().length - 1
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    const o = options()[active.value]
    if (o) choose(o)
  } else if (e.key === 'Escape' || e.key === 'Tab') {
    if (e.key === 'Escape') e.stopPropagation()
    close()
  }
}

// while it is open: a press elsewhere, a resize or a scroll of the page closes it
function away(e: Event) {
  const t = e.target as Node | null
  if (t && (trigger.value?.contains(t) || menu.value?.contains(t))) return
  close()
}
watch(open, (o) => {
  const fn = o ? document.addEventListener : document.removeEventListener
  fn.call(document, 'pointerdown', away, true)
  fn.call(document, 'scroll', away, true)
  const w = o ? window.addEventListener : window.removeEventListener
  w.call(window, 'resize', close)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', away, true)
  document.removeEventListener('scroll', away, true)
  window.removeEventListener('resize', close)
})
</script>

<template>
  <div class="relative w-full">
    <button
      ref="trigger"
      type="button"
      class="input flex cursor-pointer items-center pr-10 text-left"
      v-bind="$attrs"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="`${id}-list`"
      :aria-activedescendant="open && active >= 0 ? `${id}-${active}` : undefined"
      @click="open ? close() : show()"
      @keydown="onKey"
    >
      <span class="min-w-0 flex-1 truncate">{{ selectedLabel }}</span>
    </button>
    <ChevronDown
      :size="18"
      class="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted transition-transform"
      :class="{ 'rotate-180': open }"
    />
    <Teleport to="body">
      <ul
        v-if="open"
        :id="`${id}-list`"
        ref="menu"
        role="listbox"
        class="fixed z-[70] overflow-y-auto rounded-xl border border-line bg-surface shadow-lg"
        :style="place"
      >
        <li
          v-for="(o, i) in options()"
          :id="`${id}-${i}`"
          :key="i"
          role="option"
          :aria-selected="same(o.value, model)"
          :aria-disabled="o.disabled || undefined"
          :data-active="i === active"
          class="flex items-stretch px-3.5 text-sm"
          :class="[
            o.disabled ? 'cursor-not-allowed text-muted/60' : 'cursor-pointer',
            i === active && !o.disabled && 'bg-surface-2',
            same(o.value, model) && 'font-semibold text-primary-strong dark:text-ink',
          ]"
          @pointermove="!o.disabled && (active = i)"
          @click="choose(o)"
        >
          <!-- the branches of the tree: one column per level, drawn with hairlines -->
          <span
            v-for="(g, k) in o.tree.split('')"
            :key="k"
            class="relative w-4 shrink-0 self-stretch"
          >
            <span
              v-if="g !== ' '"
              class="absolute left-1/2 w-px bg-line"
              :class="g === '└' ? 'top-0 h-1/2' : 'top-0 bottom-0'"
            />
            <span
              v-if="g === '├' || g === '└'"
              class="absolute top-1/2 left-1/2 h-px w-1/2 bg-line"
            />
          </span>
          <span
            class="flex min-w-0 flex-1 items-center justify-between gap-2 py-2.5"
            :class="o.tree ? 'pl-1.5' : ''"
          >
            <span class="min-w-0 flex-1 break-words">{{ o.label }}</span>
            <Check v-if="same(o.value, model)" :size="16" class="shrink-0 text-primary" />
          </span>
        </li>
      </ul>
    </Teleport>
  </div>
</template>
