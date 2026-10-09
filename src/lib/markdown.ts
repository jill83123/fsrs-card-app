import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

// The built-in `text` rule swallows "|", so the spoiler rule would never see "||".
// Same terminator set as markdown-it's rules_inline/text, plus "|" (0x7C).
const TERMINATORS = new Set([
  0x0a, 0x21, 0x23, 0x24, 0x25, 0x26, 0x2a, 0x2b, 0x2d, 0x3a, 0x3c, 0x3d, 0x40, 0x5b, 0x5c, 0x5d,
  0x5e, 0x5f, 0x60, 0x7b, 0x7c, 0x7d, 0x7e,
])
md.inline.ruler.at('text', (state, silent) => {
  let pos = state.pos
  while (pos < state.posMax && !TERMINATORS.has(state.src.charCodeAt(pos))) pos++
  if (pos === state.pos) return false
  if (!silent) state.pending += state.src.slice(state.pos, pos)
  state.pos = pos
  return true
})

/** Inline rule for Discord-style spoilers: ||hidden text|| */
md.inline.ruler.before('emphasis', 'spoiler', (state, silent) => {
  const start = state.pos
  const src = state.src
  if (src.charCodeAt(start) !== 0x7c || src.charCodeAt(start + 1) !== 0x7c) return false
  const end = src.indexOf('||', start + 2)
  if (end < 0 || end === start + 2) return false
  if (!silent) {
    state.push('spoiler_open', 'span', 1).attrSet('class', 'spoiler')
    const oldMax = state.posMax
    state.pos = start + 2
    state.posMax = end
    state.md.inline.tokenize(state)
    state.posMax = oldMax
    state.push('spoiler_close', 'span', -1)
  }
  state.pos = end + 2
  return true
})

// open links in a new tab
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx]!.attrSet('target', '_blank')
  tokens[idx]!.attrSet('rel', 'noopener noreferrer')
  return defaultLinkOpen(tokens, idx, options, env, self)
}

export function renderMarkdown(src: string): string {
  return DOMPurify.sanitize(md.render(src ?? ''), { ADD_ATTR: ['target'] })
}
