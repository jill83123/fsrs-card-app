<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Bold,
  Code,
  EyeOff,
  Heading,
  Highlighter,
  Italic,
  Link,
  List,
  ListOrdered,
  Palette,
  Quote,
  Strikethrough,
} from '@lucide/vue'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view'
import { continueList, liveMarkdown } from '@/lib/liveMarkdown'

const props = defineProps<{ placeholder?: string; rows?: number; label?: string }>()
const model = defineModel<string>({ required: true })
const host = ref<HTMLElement>()
let view: EditorView | undefined

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
  view = new EditorView({
    parent: host.value!,
    doc: model.value,
    extensions: [
      history(),
      keymap.of([
        { key: 'Enter', run: continueList },
        { key: 'Mod-b', run: () => (apply(tools[0]!.action), true) },
        { key: 'Mod-i', run: () => (apply(tools[1]!.action), true) },
        ...historyKeymap,
        ...defaultKeymap,
      ]),
      EditorView.lineWrapping,
      placeholderExt(props.placeholder ?? ''),
      liveMarkdown,
      EditorView.updateListener.of((u) => {
        if (u.docChanged) model.value = u.state.doc.toString()
        if (u.docChanged || u.selectionSet) refreshActive()
      }),
    ],
  })
  if (!toolbar.value) return
  sizeWatch = new ResizeObserver(measureTools)
  sizeWatch.observe(toolbar.value)
  measureTools()
  refreshActive()
})
onBeforeUnmount(() => {
  sizeWatch?.disconnect()
  view?.destroy()
})
// the model changes from outside too (loading a card, undo of an import)
watch(model, (v) => {
  if (view && v !== view.state.doc.toString())
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } })
})

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
    icon: Highlighter,
    title: '螢光筆 ==文字==',
    action: { kind: 'wrap', before: '==', after: '==', sample: '重點' },
  },
  {
    icon: Palette,
    title: '主題色文字 ++文字++',
    action: { kind: 'wrap', before: '++', after: '++', sample: '重點' },
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

/** Where `before … after` pairs sit in a line, as [start, end) with the marks included. */
function spans(line: string, before: string, after: string): [number, number][] {
  if (before === '[')
    return [...line.matchAll(/\[[^\]]*\]\([^)]*\)/g)].map((m) => [m.index, m.index + m[0].length])
  // a single * or ` next to the same character belongs to a longer marker
  const single = before.length === 1 && before === after
  const clash = (i: number, len: number) =>
    single && (line.charAt(i - 1) === before || line.charAt(i + len) === before)
  const find = (marker: string, from: number) => {
    let i = line.indexOf(marker, from)
    while (i >= 0 && clash(i, marker.length)) i = line.indexOf(marker, i + 1)
    return i
  }
  const out: [number, number][] = []
  let from = 0
  for (;;) {
    const i = find(before, from)
    if (i < 0) break
    const j = find(after, i + before.length)
    if (j < 0) break
    out.push([i, j + after.length])
    from = j + after.length
  }
  return out
}

/** The pair of marks that holds the selection (a cursor at the very edge of it is not inside). */
function holding(a: Extract<Action, { kind: 'wrap' }>, text: string, ss: number, ee: number) {
  return spans(text, a.before, a.after).find(
    ([from, to]) => ss >= from && ee <= to && !(ss === ee && (ss === from || ss === to)),
  )
}

const LINE_TEST: Record<string, RegExp> = {
  '## ': /^#{1,3} /,
  '- ': /^[-*] /,
  '1. ': /^\d+\. /,
  '> ': /^> /,
}

// which tools apply to where the cursor (or the selection) is: those buttons light up
const active = ref<boolean[]>(tools.map(() => false))
function refreshActive() {
  if (!view) return
  const { from: s, to: e } = view.state.selection.main
  const doc = view.state.doc
  const first = doc.lineAt(s)
  const last = doc.lineAt(e)
  active.value = tools.map(({ action: a }) => {
    if (a.kind === 'line') {
      const test = LINE_TEST[a.prefix] ?? new RegExp(`^${a.prefix}`)
      for (let n = first.number; n <= last.number; n++)
        if (!test.test(doc.line(n).text)) return false
      return true
    }
    // marks cannot be told apart across lines, so only a selection inside one line counts
    if (first.number !== last.number) return false
    const ss = s - first.from
    const ee = e - first.from
    return !!holding(a, first.text, ss, ee)
  })
}

function apply(a: Action) {
  if (!view) return
  const v = view.state.doc.toString()
  let { from: s, to: e } = view.state.selection.main
  // the text of a code span is selected without its backticks: take them in, so the marks go
  // round the code instead of into it (where they would show as plain characters)
  if (
    a.kind === 'wrap' &&
    a.before !== '`' &&
    s < e &&
    v.charAt(s - 1) === '`' &&
    v.charAt(e) === '`'
  ) {
    const inner = v.slice(s, e)
    if (!inner.includes('`') && !inner.includes('\n')) {
      s -= 1
      e += 1
    }
  }
  let next: string
  let selStart: number
  let selEnd: number
  if (a.kind === 'wrap') {
    const { before, after } = a
    const picked = v.slice(s, e)
    const line = view.state.doc.lineAt(s)
    // inside a pair of marks (not a link, whose marks are not fixed text): take that pair off
    const held =
      before !== '[' && e <= line.to
        ? holding(a, line.text, s - line.from, e - line.from)
        : undefined
    // a single * or ` next to the same character belongs to a longer marker (** is not italic)
    const single = before.length === 1 && before === after
    const clash = (c: string) => single && c === before
    if (held) {
      const open = line.from + held[0]
      const close = line.from + held[1] - after.length
      const keep = (p: number) => Math.min(Math.max(p, open + before.length), close) - before.length
      next = v.slice(0, open) + v.slice(open + before.length, close) + v.slice(close + after.length)
      selStart = keep(s)
      selEnd = keep(e)
    } else if (
      picked &&
      v.slice(s - before.length, s) === before &&
      v.slice(e, e + after.length) === after &&
      !clash(v.charAt(s - before.length - 1)) &&
      !clash(v.charAt(e + after.length))
    ) {
      // the marks sit just outside the selection: take them off
      next = v.slice(0, s - before.length) + picked + v.slice(e + after.length)
      selStart = s - before.length
      selEnd = selStart + picked.length
    } else if (
      picked.length >= before.length + after.length &&
      picked.startsWith(before) &&
      picked.endsWith(after) &&
      !clash(picked.charAt(before.length)) &&
      !clash(picked.charAt(picked.length - after.length - 1))
    ) {
      // the selection includes the marks: take them off
      const inner = picked.slice(before.length, picked.length - after.length)
      next = v.slice(0, s) + inner + v.slice(e)
      selStart = s
      selEnd = s + inner.length
    } else {
      const sel = picked || a.sample
      next = v.slice(0, s) + before + sel + after + v.slice(e)
      selStart = s + before.length
      selEnd = selStart + sel.length
    }
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
  view.dispatch({
    changes: { from: 0, to: v.length, insert: next },
    selection: { anchor: selStart, head: selEnd },
  })
  view.focus()
}
</script>

<template>
  <div>
    <span class="mb-1.5 block text-sm font-semibold text-ink/65">{{ label }}</span>
    <div
      class="overflow-hidden rounded-2xl border border-line bg-surface focus-within:border-primary"
    >
      <div class="flex items-center border-b border-line px-2 py-1.5">
        <div class="relative min-w-0 flex-1">
          <div
            ref="toolbar"
            class="scrollbar-none flex items-center gap-0.5 overflow-x-auto"
            @scroll.passive="measureTools"
          >
            <button
              v-for="t in tools"
              :key="t.title"
              type="button"
              class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg"
              :class="
                active[tools.indexOf(t)]
                  ? 'bg-primary-soft text-primary-strong'
                  : 'text-muted hover:bg-surface-2 hover:text-ink'
              "
              :aria-pressed="active[tools.indexOf(t)]"
              :title="t.title"
              :aria-label="t.title"
              @mousedown.prevent
              @click="apply(t.action)"
            >
              <component :is="t.icon" :size="16" />
            </button>
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
      <div ref="host" class="md-editor px-4 py-3 text-ink" :style="{ '--rows': rows ?? 4 }" />
    </div>
  </div>
</template>

<style>
.md-editor .cm-editor {
  outline: none;
  background: transparent;
}
.md-editor .cm-scroller {
  font-family: inherit;
  line-height: 1.625;
}
.md-editor .cm-content {
  min-height: calc(var(--rows) * 1.625em);
  padding: 0;
  caret-color: var(--ink);
}
.md-editor .cm-line {
  padding: 0;
}
.md-editor .cm-placeholder {
  color: var(--muted);
}
.md-editor .cm-md-sign {
  color: var(--muted);
}
.md-editor .cm-md-strong {
  font-weight: 700;
}
.md-editor .cm-md-em {
  font-style: italic;
}
.md-editor .cm-md-del {
  text-decoration: line-through;
}
.md-editor .cm-md-hl {
  --hl: color-mix(in oklab, var(--primary) 24%, transparent);
  background: linear-gradient(
    to bottom,
    transparent 0.66em,
    var(--hl) 0.66em,
    var(--hl) 1.32em,
    transparent 1.32em
  );
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  border-radius: 2px;
  padding: 0 0 0.12em;
}
.md-editor .cm-md-tint {
  color: var(--primary);
}
.md-editor .cm-md-spoiler {
  background: color-mix(in oklab, var(--primary) 18%, transparent);
  border-radius: 4px;
}
.md-editor .cm-md-covered {
  background: var(--primary);
  color: transparent;
}
.md-editor .cm-md-code {
  background: var(--surface-2);
  border-radius: 6px;
  padding: 0.08em 0.25em;
  font-family: var(--font-mono);
  font-size: 0.95em;
  font-weight: 500;
}
.md-editor .cm-md-strong .cm-md-code,
.md-editor .cm-md-code .cm-md-strong {
  font-weight: 700;
}
.md-editor .cm-md-h1,
.md-editor .cm-md-h2,
.md-editor .cm-md-h3 {
  font-weight: 700;
}
.md-editor .cm-md-h1 {
  font-size: 1.4em;
}
.md-editor .cm-md-h2 {
  font-size: 1.25em;
}
.md-editor .cm-md-h3 {
  font-size: 1.12em;
}
.md-editor .cm-md-quote {
  border-left: 4px solid var(--primary);
  padding-left: 0.8em;
  color: var(--muted);
}
.md-editor .cm-md-li {
  padding-left: 1.4em;
  text-indent: -1.4em;
}
.md-editor .cm-md-bullet {
  display: inline-block;
  width: 1.4em;
  text-indent: 0;
  text-align: center;
}
.md-editor .cm-md-num {
  color: var(--muted);
}
</style>
