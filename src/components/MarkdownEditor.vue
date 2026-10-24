<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Bold,
  Code,
  EyeOff,
  Heading,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
} from '@lucide/vue'
import MarkdownView from './MarkdownView.vue'

defineProps<{ placeholder?: string; rows?: number; label?: string }>()
const model = defineModel<string>({ required: true })
const preview = ref(false)
const ta = ref<HTMLTextAreaElement>()

// on a narrow screen the tools scroll sideways; a fade on the edge says there is more that way
const toolbar = ref<HTMLElement>()
const fadeLeft = ref(false)
const fadeRight = ref(false)
function measureTools() {
  const el = toolbar.value
  if (!el) return
  fadeLeft.value = el.scrollLeft > 2
  fadeRight.value = el.scrollWidth - el.scrollLeft - el.clientWidth > 2
}
let sizeWatch: ResizeObserver | undefined
onMounted(() => {
  if (!toolbar.value) return
  sizeWatch = new ResizeObserver(measureTools)
  sizeWatch.observe(toolbar.value)
  measureTools()
})
onBeforeUnmount(() => sizeWatch?.disconnect())
watch(preview, () => nextTick(measureTools))

type Action =
  { kind: 'wrap'; before: string; after: string; sample: string } | { kind: 'line'; prefix: string }

const tools: { icon: unknown; title: string; action: Action }[] = [
  {
    icon: Bold,
    title: '粗體',
    action: { kind: 'wrap', before: '**', after: '**', sample: '粗體' },
  },
  {
    icon: Italic,
    title: '斜體',
    action: { kind: 'wrap', before: '*', after: '*', sample: '斜體' },
  },
  {
    icon: Strikethrough,
    title: '刪除線',
    action: { kind: 'wrap', before: '~~', after: '~~', sample: '刪除線' },
  },
  {
    icon: EyeOff,
    title: '防劇透 ||文字||',
    action: { kind: 'wrap', before: '||', after: '||', sample: '隱藏文字' },
  },
  { icon: Heading, title: '標題', action: { kind: 'line', prefix: '## ' } },
  { icon: List, title: '清單', action: { kind: 'line', prefix: '- ' } },
  { icon: ListOrdered, title: '編號清單', action: { kind: 'line', prefix: '1. ' } },
  { icon: Quote, title: '引用', action: { kind: 'line', prefix: '> ' } },
  {
    icon: Code,
    title: '程式碼',
    action: { kind: 'wrap', before: '`', after: '`', sample: 'code' },
  },
  {
    icon: Link,
    title: '連結',
    action: { kind: 'wrap', before: '[', after: '](https://)', sample: '連結文字' },
  },
]

async function apply(a: Action) {
  const el = ta.value
  if (!el) return
  const v = model.value
  const s = el.selectionStart
  const e = el.selectionEnd
  let next: string
  let selStart: number
  let selEnd: number
  if (a.kind === 'wrap') {
    const sel = v.slice(s, e) || a.sample
    next = v.slice(0, s) + a.before + sel + a.after + v.slice(e)
    selStart = s + a.before.length
    selEnd = selStart + sel.length
  } else {
    const lineStart = v.lastIndexOf('\n', s - 1) + 1
    const block = v.slice(lineStart, e)
    const lines = block.split('\n')
    const allHave = lines.every((l) => l.startsWith(a.prefix))
    const changed = lines.map((l) => (allHave ? l.slice(a.prefix.length) : a.prefix + l)).join('\n')
    next = v.slice(0, lineStart) + changed + v.slice(e)
    selStart = lineStart
    selEnd = lineStart + changed.length
  }
  model.value = next
  await nextTick()
  el.focus()
  el.setSelectionRange(selStart, selEnd)
}

function onKeydown(e: KeyboardEvent) {
  if (!(e.ctrlKey || e.metaKey)) return
  const k = e.key.toLowerCase()
  const map: Record<string, number> = { b: 0, i: 1 }
  if (k in map) {
    e.preventDefault()
    apply(tools[map[k]!]!.action)
  }
}
</script>

<template>
  <div>
    <!-- the label and the edit / preview switch share a line above the box, so the toolbar inside gets the whole row -->
    <div class="mb-1.5 flex items-center gap-1">
      <span class="label mb-0 mr-auto">{{ label }}</span>
      <button
        type="button"
        class="rounded-md px-2.5 py-1 text-xs font-semibold"
        :class="!preview ? 'bg-primary text-white' : 'text-muted'"
        @click="preview = false"
      >
        編輯
      </button>
      <button
        type="button"
        class="rounded-md px-2.5 py-1 text-xs font-semibold"
        :class="preview ? 'bg-primary text-white' : 'text-muted'"
        @click="preview = true"
      >
        預覽
      </button>
    </div>
    <div
      class="overflow-hidden rounded-2xl border border-line bg-surface focus-within:border-primary"
    >
      <!-- hidden (not removed) in preview, so the size watcher keeps its element -->
      <div v-show="!preview" class="flex items-center border-b border-line px-2 py-1.5">
        <div class="relative min-w-0 flex-1">
          <div
            ref="toolbar"
            class="scrollbar-none flex items-center gap-0.5 overflow-x-auto"
            @scroll.passive="measureTools"
          >
            <template v-if="!preview">
              <button
                v-for="t in tools"
                :key="t.title"
                type="button"
                class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
                :title="t.title"
                :aria-label="t.title"
                @mousedown.prevent
                @click="apply(t.action)"
              >
                <component :is="t.icon" :size="16" />
              </button>
            </template>
          </div>
          <div
            class="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-surface to-transparent transition-opacity"
            :class="fadeLeft ? 'opacity-100' : 'opacity-0'"
            aria-hidden="true"
          />
          <div
            class="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface to-transparent transition-opacity"
            :class="fadeRight ? 'opacity-100' : 'opacity-0'"
            aria-hidden="true"
          />
        </div>
      </div>
      <textarea
        v-show="!preview"
        ref="ta"
        v-model="model"
        :rows="rows ?? 4"
        :placeholder="placeholder"
        class="block w-full resize-y bg-transparent px-4 py-3 leading-relaxed text-ink outline-none placeholder:text-muted"
        @keydown="onKeydown"
      />
      <div v-if="preview" class="min-h-24 px-4 py-3">
        <MarkdownView v-if="model.trim()" :source="model" />
        <p v-else class="text-muted">（沒有內容）</p>
      </div>
    </div>
  </div>
</template>
