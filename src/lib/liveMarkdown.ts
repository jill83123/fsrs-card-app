import { type Range } from '@codemirror/state'
import {
  type Command,
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'

/**
 * Live preview for the note editor: the text stays Markdown, but marks are hidden and the text
 * between them is styled, except on the line (or inside the span) the cursor is in, where the marks
 * show up dimmed so they can be edited. The pairs follow the same rules as lib/markdown.ts.
 */

class Bullet extends WidgetType {
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-md-bullet'
    el.textContent = '•'
    return el
  }
  eq() {
    return true
  }
}

const hide = Decoration.replace({})
const bullet = Decoration.replace({ widget: new Bullet() })
const dim = Decoration.mark({ class: 'cm-md-sign' })

const PAIRS: { re: RegExp; len: number; cls: string }[] = [
  { re: /\*\*(?=\S)(.+?)(?<=\S)\*\*/g, len: 2, cls: 'cm-md-strong' },
  { re: /\|\|(.+?)\|\|/g, len: 2, cls: 'cm-md-spoiler' },
  { re: /==(?=\S)(.+?)(?<=\S)==/g, len: 2, cls: 'cm-md-hl' },
  { re: /\+\+(?=\S)(.+?)(?<=\S)\+\+/g, len: 2, cls: 'cm-md-tint' },
  { re: /~~(?=\S)(.+?)(?<=\S)~~/g, len: 2, cls: 'cm-md-del' },
  { re: /(?<!\*)\*(?![*\s])(.+?)(?<![*\s])\*(?!\*)/g, len: 1, cls: 'cm-md-em' },
]

function build(view: EditorView): { deco: DecorationSet; atomic: DecorationSet } {
  const { doc, selection } = view.state
  const touches = (from: number, to: number) =>
    selection.ranges.some((r) => r.from <= to && r.to >= from)
  const out: Range<Decoration>[] = []
  // what the cursor must jump over as one unit: the hidden marks and bullets, not the styled text
  const atomic: Range<Decoration>[] = []

  // a mark is hidden unless the cursor touches the span it belongs to
  const sign = (from: number, to: number, active: boolean) => {
    if (active) return out.push(dim.range(from, to))
    out.push(hide.range(from, to))
    atomic.push(hide.range(from, to))
  }

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n)
    const active = touches(line.from, line.to)
    let text = line.text
    let offset = 0

    const head = /^(#{1,3})\s+/.exec(text)
    const quote = !head && /^>\s?/.exec(text)
    const bulleted = !head && !quote && /^(\s*)[-*+]\s+/.exec(text)
    const numbered = !head && !quote && !bulleted && /^(\s*)\d+\.\s+/.exec(text)

    if (head) {
      out.push(Decoration.line({ class: `cm-md-h${head[1]!.length}` }).range(line.from))
      sign(line.from, line.from + head[0].length, active)
      offset = head[0].length
    } else if (quote) {
      out.push(Decoration.line({ class: 'cm-md-quote' }).range(line.from))
      sign(line.from, line.from + quote[0].length, active)
      offset = quote[0].length
    } else if (bulleted) {
      out.push(Decoration.line({ class: 'cm-md-li' }).range(line.from))
      const dot = bullet.range(line.from + bulleted[1]!.length, line.from + bulleted[0].length)
      out.push(dot)
      atomic.push(dot)
      offset = bulleted[0].length
    } else if (numbered) {
      out.push(Decoration.line({ class: 'cm-md-li' }).range(line.from))
      out.push(
        Decoration.mark({ class: 'cm-md-num' }).range(line.from, line.from + numbered[0].length),
      )
      offset = numbered[0].length
    }

    text = text.slice(offset)
    const base = line.from + offset

    // code first; its content is blanked so nothing inside it is read as a mark
    text = text.replace(/`([^`\n]+)`/g, (all, _inner: string, at: number) => {
      const from = base + at
      const to = from + all.length
      const on = touches(from, to)
      sign(from, from + 1, on)
      sign(to - 1, to, on)
      out.push(Decoration.mark({ class: 'cm-md-code' }).range(from + 1, to - 1))
      return '\0'.repeat(all.length)
    })

    for (const { re, len, cls } of PAIRS) {
      re.lastIndex = 0
      for (const m of text.matchAll(re)) {
        const from = base + m.index
        const to = from + m[0].length
        const on = touches(from, to)
        sign(from, from + len, on)
        sign(to - len, to, on)
        out.push(Decoration.mark({ class: cls }).range(from + len, to - len))
      }
    }
  }
  return { deco: Decoration.set(out, true), atomic: Decoration.set(atomic, true) }
}

const plugin = ViewPlugin.fromClass(
  class {
    deco: DecorationSet
    atomic: DecorationSet
    constructor(view: EditorView) {
      ;({ deco: this.deco, atomic: this.atomic } = build(view))
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged)
        ({ deco: this.deco, atomic: this.atomic } = build(u.view))
    }
  },
  {
    decorations: (p) => p.deco,
    provide: (p) => EditorView.atomicRanges.of((view) => view.plugin(p)?.atomic ?? Decoration.none),
  },
)

export const liveMarkdown = [plugin]

/** Enter on a list or quote line starts the next item; on an empty item it ends the list. */
export const continueList: Command = (view) => {
  const { state } = view
  const sel = state.selection.main
  if (!sel.empty) return false
  const line = state.doc.lineAt(sel.head)
  const m = /^(\s*)([-*+]|\d+\.|>)\s+/.exec(line.text)
  if (!m || sel.head < line.from + m[0].length) return false
  if (line.text.length === m[0].length) {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: '' },
      selection: { anchor: line.from },
    })
    return true
  }
  const num = /^\d+/.exec(m[2]!)
  const next = `${m[1]}${num ? `${Number(num[0]) + 1}.` : m[2]} `
  view.dispatch({
    changes: { from: sel.head, insert: `\n${next}` },
    selection: { anchor: sel.head + 1 + next.length },
  })
  return true
}
