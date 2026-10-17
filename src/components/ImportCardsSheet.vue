<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Copy } from '@lucide/vue'
import BottomSheet from './BottomSheet.vue'
import PillTabs from './PillTabs.vue'
import { LANGS } from '@/db/defaults'
import type { Lang } from '@/db/types'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { effectiveTemplate } from '@/lib/tree'
import { uid } from '@/lib/id'
import { findWordMark, newVocabCard } from '@/lib/cards'
import { importPrompt, parseImport, type ImportResult } from '@/lib/importCards'

const props = defineProps<{ deckId: string }>()
const open = defineModel<boolean>({ required: true })

const data = useData()
const settings = useSettings()
const ui = useUi()

const lang = ref<Lang>('en')
const text = ref('')

watch(open, (v) => {
  if (!v) return
  text.value = ''
  lang.value =
    effectiveTemplate(data.nodes, props.deckId)?.lang ??
    (localStorage.getItem('sr.lastLang') as Lang | null) ??
    'en'
})

const options = computed(() => settings.synced.pos[lang.value])

const parsed = computed<{ result?: ImportResult; error?: string }>(() => {
  if (!text.value.trim()) return {}
  try {
    return { result: parseImport(text.value, options.value) }
  } catch (e) {
    return { error: e instanceof SyntaxError ? 'JSON 格式有誤' : (e as Error).message }
  }
})

const existing = computed(
  () =>
    new Set(
      (data.cardsByDeck.get(props.deckId) ?? []).map((c) => (c.type === 'vocab' ? c.word : '')),
    ),
)
const fresh = computed(
  () => parsed.value.result?.rows.filter((r) => !existing.value.has(r.word)) ?? [],
)
const dupCount = computed(() => (parsed.value.result?.rows.length ?? 0) - fresh.value.length)
const unknownPos = computed(() => [...new Set(fresh.value.flatMap((r) => r.unknownPos))])

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(importPrompt(lang.value, options.value))
    ui.toast('已複製提示詞')
  } catch {
    ui.toast('無法複製', 'error')
  }
}

async function run() {
  const base = Date.now()
  const cards = fresh.value.map((r, i) => {
    const c = newVocabCard(props.deckId, lang.value, r.word)
    c.meaning = r.meaning
    c.pos = r.pos
    c.examples = r.examples.map((e) => {
      if (e.marks?.length) return { id: uid(), ...e }
      const mark = findWordMark(r.word, lang.value, e.sentence)
      return { id: uid(), sentence: e.sentence, translation: e.translation, ...(mark ? { marks: [mark] } : {}) }
    })
    c.createdAt = base + i
    return c
  })
  await data.addCards(cards)
  localStorage.setItem('sr.lastLang', lang.value)
  ui.toast(`已匯入 ${cards.length} 張卡片`)
  open.value = false
}
</script>

<template>
  <BottomSheet v-model="open" title="以 JSON 匯入單字">
    <div class="space-y-4">
      <div>
        <p class="mb-1.5 text-sm font-medium">語言</p>
        <PillTabs
          v-model="lang"
          size="sm"
          :options="LANGS.map((l) => ({ value: l.id, label: l.label }))"
        />
      </div>

      <div>
        <div class="mb-1.5 flex items-center justify-between">
          <p class="text-sm font-medium">JSON</p>
          <button type="button" class="btn btn-ghost px-2 py-1 text-xs" @click="copyPrompt">
            <Copy :size="14" /> 複製給 AI 的提示詞
          </button>
        </div>
        <textarea
          v-model="text"
          class="input min-h-40 font-mono text-xs"
          placeholder='[{"word": "resume", "meaning": "履歷", "pos": ["n."]}]'
          spellcheck="false"
        />
        <ul class="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
          <li>必填：word（單字）、meaning（意思）。</li>
          <li>可省略：pos（詞性）、examples（例句，每筆 sentence + translation + marks）。</li>
          <li>marks 是例句中該單字實際出現的字（含過去式等變化），省略時由程式自動比對。</li>
          <li>詞性請寫選項名稱，如「名詞 n.」。</li>
          <li>英文詞性可只寫「名詞」或「n.」。</li>
        </ul>
      </div>

      <p v-if="parsed.error" class="text-sm text-danger">{{ parsed.error }}</p>
      <div v-else-if="parsed.result" class="space-y-0.5 text-sm">
        <p>
          將匯入 <b>{{ fresh.length }}</b> 張卡片
        </p>
        <p v-if="dupCount" class="text-muted">{{ dupCount }} 筆單字已在此牌組，會略過</p>
        <p v-if="parsed.result.skipped" class="text-muted">
          {{ parsed.result.skipped }} 筆缺少單字或意思，會略過
        </p>
        <p v-if="unknownPos.length" class="text-muted">
          找不到對應的詞性（不會設定）：{{ unknownPos.join('、') }}
        </p>
      </div>

      <button class="btn btn-primary w-full" :disabled="!fresh.length" @click="run">匯入</button>
    </div>
  </BottomSheet>
</template>
