<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ClipboardPaste, Copy } from '@lucide/vue'
import BottomSheet from './BottomSheet.vue'
import type { Lang, VocabCard } from '@/db/types'
import { db } from '@/db'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { effectiveTemplate } from '@/lib/tree'
import { uid } from '@/lib/id'
import { applySenses, findWordMark, newVocabCard } from '@/lib/cards'
import { canAutoReading, generateReading } from '@/lib/tts/autoReading'
import { importPrompt, parseImport, type ImportResult } from '@/lib/importCards'

const props = defineProps<{ deckId: string }>()
const open = defineModel<boolean>({ required: true })

const data = useData()
const settings = useSettings()
const ui = useUi()

const text = ref('')
watch(open, (v) => {
  if (v) text.value = ''
})

const deckLang = () =>
  effectiveTemplate(data.nodes, props.deckId)?.lang ??
  (localStorage.getItem('sr.lastLang') as Lang | null) ??
  'en'
const posOf = (l: Lang) => settings.synced.pos[l]

const parsed = computed<{ result?: ImportResult; error?: string }>(() => {
  if (!text.value.trim()) return {}
  try {
    return { result: parseImport(text.value, posOf, deckLang()) }
  } catch (e) {
    return { error: e instanceof SyntaxError ? 'JSON 格式有誤' : (e as Error).message }
  }
})

// a word already in the deck (same language) is skipped
const existing = computed(
  () =>
    new Set(
      (data.cardsByDeck.get(props.deckId) ?? []).flatMap((c) =>
        c.type === 'vocab' ? [`${c.lang}:${c.word}`] : [],
      ),
    ),
)
const fresh = computed(
  () => parsed.value.result?.rows.filter((r) => !existing.value.has(`${r.lang}:${r.word}`)) ?? [],
)
const dupCount = computed(() => (parsed.value.result?.rows.length ?? 0) - fresh.value.length)
// a word already there is not imported again, but its derived words are added
// (unless the card already has some)
const refill = computed(() =>
  (parsed.value.result?.rows ?? []).flatMap((r) => {
    if (!r.derived.length) return []
    const c = (data.cardsByDeck.get(props.deckId) ?? []).find(
      (x): x is VocabCard => x.type === 'vocab' && x.lang === r.lang && x.word === r.word,
    )
    return c && !c.derived?.length ? [{ card: c, derived: r.derived }] : []
  }),
)
const unknownPos = computed(() => [...new Set(fresh.value.flatMap((r) => r.unknownPos))])

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(importPrompt(posOf))
    ui.toast('已複製提示詞')
  } catch {
    ui.toast('無法複製', 'error')
  }
}

async function paste() {
  try {
    text.value = await navigator.clipboard.readText()
  } catch {
    ui.toast('無法讀取剪貼簿，請手動貼上', 'error')
  }
}

// the readings are made here, after the cards are in: one at a time, without making the user wait
async function fillReadings(ids: string[]) {
  for (const id of ids) {
    // read from the database: the store may not have the new cards yet
    const c = await db.cards.get(id)
    if (c?.type !== 'vocab' || c.reading.trim() || !canAutoReading(c.lang)) continue
    const reading = await generateReading(c.word, c.lang, settings.synced.reading.enStyle).catch(
      () => null,
    )
    // the card may have been edited meanwhile
    const now = await db.cards.get(id)
    if (reading && now?.type === 'vocab' && !now.reading.trim()) {
      await data.saveCard({ ...now, reading })
    }
  }
}

async function run() {
  const base = Date.now()
  const cards = fresh.value.map((r, i) => {
    const c = newVocabCard(props.deckId, r.lang, r.word)
    applySenses(
      c,
      r.senses.map((x) => ({ id: uid(), ...x })),
    )
    c.examples = r.examples.map((e) => {
      if (e.marks?.length) return { id: uid(), ...e }
      const mark = findWordMark(r.word, r.lang, e.sentence)
      return {
        id: uid(),
        sentence: e.sentence,
        translation: e.translation,
        ...(mark ? { marks: [mark] } : {}),
      }
    })
    if (r.derived.length) c.derived = r.derived.map((d) => ({ id: uid(), ...d }))
    c.createdAt = base + i
    return c
  })
  await data.addCards(cards)
  for (const { card, derived } of refill.value) {
    await data.saveCard({ ...card, derived: derived.map((d) => ({ id: uid(), ...d })) })
  }
  void fillReadings(cards.map((c) => c.id))
  if (cards.length) localStorage.setItem('sr.lastLang', cards[cards.length - 1]!.lang)
  ui.toast(
    [
      cards.length && `已匯入 ${cards.length} 張卡片`,
      refill.value.length && `已為 ${refill.value.length} 張卡補上衍生字`,
    ]
      .filter(Boolean)
      .join('，'),
    'success',
  )
  open.value = false
}
</script>

<template>
  <BottomSheet v-model="open" title="匯入單字">
    <div class="space-y-4">
      <div>
        <div class="mb-1.5 flex items-center justify-between">
          <p class="text-sm font-medium">AI 整理的內容</p>
          <div class="flex gap-1">
            <button type="button" class="btn btn-ghost btn-sm" @click="copyPrompt">
              <Copy :size="14" /> 複製提示詞
            </button>
            <button type="button" class="btn btn-ghost btn-sm" @click="paste">
              <ClipboardPaste :size="14" /> 貼上
            </button>
          </div>
        </div>
        <textarea
          v-model="text"
          class="input min-h-40 font-mono text-xs"
          placeholder='[{"word": "run", "lang": "en", "senses": [{"pos": ["v."], "meaning": "跑"}]}]'
          spellcheck="false"
        />
        <ul class="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
          <li>把圖片和提示詞交給 AI，再貼上它的回覆。</li>
          <li>語言、詞性與例句標記由 AI 判斷，不一定每項都有。</li>
          <li>只有單字和意思是必填。</li>
        </ul>
      </div>

      <p v-if="parsed.error" class="text-sm text-danger">{{ parsed.error }}</p>
      <div v-else-if="parsed.result" class="space-y-0.5 text-sm">
        <p>
          將匯入 <b>{{ fresh.length }}</b> 張卡片
        </p>
        <p v-if="dupCount" class="text-muted">{{ dupCount }} 筆單字已在此牌組，會略過</p>
        <p v-if="refill.length" class="text-muted">其中 {{ refill.length }} 張會補上衍生字</p>
        <p v-if="parsed.result.skipped" class="text-muted">
          {{ parsed.result.skipped }} 筆缺少單字或意思，會略過
        </p>
        <p v-if="unknownPos.length" class="text-muted">
          找不到對應的詞性（不會設定）：{{ unknownPos.join('、') }}
        </p>
      </div>

      <button
        class="btn btn-primary w-full"
        :disabled="!fresh.length && !refill.length"
        @click="run"
      >
        匯入
      </button>
    </div>
  </BottomSheet>
</template>
