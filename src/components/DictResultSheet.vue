<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check } from '@lucide/vue'
import BottomSheet from './BottomSheet.vue'
import type { Example, Lang } from '@/db/types'
import { DICT_REL_KINDS, type RelatedWords } from '@/lib/relations'
import type { DictResult } from '@/lib/dictLookup'
import { useSettings } from '@/stores/settings'

const props = defineProps<{ result: DictResult | null; word: string; lang: Lang }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{
  apply: [
    picked: {
      senses: { meaning: string; pos: string[] }[]
      pos: string[]
      examples: Example[]
      related: RelatedWords
    },
  ]
}>()
const settings = useSettings()

const meanings = computed(() => props.result?.meaning.split('\n').filter(Boolean) ?? [])
const posLabel = (id: string) =>
  settings.synced.pos[props.lang].find((o) => o.id === id)?.label ?? id
const posOptions = computed(() =>
  (props.result?.pos ?? []).map((id) => ({ id, label: posLabel(id) })),
)

// meanings gathered under their part of speech, in order of first appearance; the ones a source
// gives no part of speech for come last
const groups = computed(() => {
  const out: { key: string; label: string; items: { text: string; i: number }[] }[] = []
  meanings.value.forEach((text, i) => {
    const ids = props.result?.meaningPos[i] ?? []
    const label = ids.map((id) => posLabel(id)).join('、')
    let g = out.find((x) => x.label === label)
    if (!g) out.push((g = { key: ids.join(','), label, items: [] }))
    g.items.push({ text, i })
  })
  return out.sort((a, b) => +!a.label - +!b.label)
})
const grouped = computed(() => groups.value.some((g) => g.label))

const pickedMeanings = ref<number[]>([])
const pickedPos = ref<string[]>([])
const pickedExamples = ref<string[]>([])
const pickedRelated = ref<RelatedWords>({ syn: [], ant: [], der: [] })

// every new result starts with senses and parts of speech selected; example sentences are
// matched to a sense only loosely, so they start unselected
watch(
  () => props.result,
  (r) => {
    pickedMeanings.value = meanings.value.map((_, i) => i)
    pickedPos.value = r?.pos.slice() ?? []
    pickedExamples.value = []
    pickedRelated.value = { syn: [], ant: [], der: [] }
  },
  { immediate: true },
)

function toggle<T>(list: T[], item: T) {
  const i = list.indexOf(item)
  if (i >= 0) list.splice(i, 1)
  else list.push(item)
}

const googleUrl = computed(
  () => `https://www.google.com/search?q=${encodeURIComponent(`${props.word.trim()} 意思`)}`,
)
const nothing = computed(
  () =>
    !pickedMeanings.value.length &&
    !pickedPos.value.length &&
    !pickedExamples.value.length &&
    !DICT_REL_KINDS.some((k) => pickedRelated.value[k.id].length),
)

function apply() {
  const r = props.result
  if (!r) return
  emit('apply', {
    // each meaning keeps its own part of speech
    senses: meanings.value
      .map((meaning, i) => ({
        meaning,
        pos: r.meaningPos[i] ?? [],
      }))
      .filter((_, i) => pickedMeanings.value.includes(i)),
    pos: pickedPos.value,
    examples: r.examples.filter((e) => pickedExamples.value.includes(e.id)),
    related: pickedRelated.value,
  })
  open.value = false
}
</script>

<template>
  <BottomSheet v-model="open" title="字典結果">
    <div v-if="result" class="space-y-5">
      <p
        v-if="result.warnings.length"
        class="rounded-2xl bg-warn/15 px-4 py-3 text-sm whitespace-pre-line"
      >
        {{ result.warnings.join('\n') }}
      </p>

      <section v-if="meanings.length" class="space-y-3">
        <h3 class="label">詞義</h3>
        <div v-for="g in groups" :key="g.key" class="space-y-2">
          <p v-if="grouped" class="text-xs font-bold tracking-[1px] text-muted">
            {{ g.label || '未分類' }}
          </p>
          <button
            v-for="m in g.items"
            :key="m.i"
            type="button"
            class="pick"
            :class="{ 'pick-on': pickedMeanings.includes(m.i) }"
            @click="toggle(pickedMeanings, m.i)"
          >
            <span class="pick-box"><Check v-if="pickedMeanings.includes(m.i)" :size="14" /></span>
            <span class="flex-1">{{ m.text }}</span>
          </button>
        </div>
      </section>

      <section v-if="posOptions.length && !grouped" class="space-y-2">
        <h3 class="label">詞性</h3>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="p in posOptions"
            :key="p.id"
            type="button"
            class="chip"
            :class="{ 'chip-on': pickedPos.includes(p.id) }"
            @click="toggle(pickedPos, p.id)"
          >
            {{ p.label }}
          </button>
        </div>
      </section>

      <section class="space-y-2">
        <h3 class="label">例句</h3>
        <button
          v-for="e in result.examples"
          :key="e.id"
          type="button"
          class="pick"
          :class="{ 'pick-on': pickedExamples.includes(e.id) }"
          @click="toggle(pickedExamples, e.id)"
        >
          <span class="pick-box"><Check v-if="pickedExamples.includes(e.id)" :size="14" /></span>
          <span class="flex-1 space-y-0.5">
            <span class="block">{{ e.sentence }}</span>
            <span class="block text-sm text-muted">{{ e.translation || '（沒有翻譯）' }}</span>
          </span>
        </button>
        <p v-if="!result.examples.length" class="text-sm text-muted">字典沒有提供例句。</p>
      </section>

      <section
        v-for="k in DICT_REL_KINDS"
        v-show="result.related[k.id].length"
        :key="k.id"
        class="space-y-2"
      >
        <h3 class="label">{{ k.label }}</h3>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="w in result.related[k.id]"
            :key="w"
            type="button"
            class="chip"
            :class="{ 'chip-on': pickedRelated[k.id].includes(w) }"
            @click="toggle(pickedRelated[k.id], w)"
          >
            {{ w }}
          </button>
        </div>
      </section>

      <button class="btn btn-primary w-full" :disabled="nothing" @click="apply">
        加入勾選的項目
      </button>

      <section v-if="result.sources.length" class="space-y-2">
        <h3 class="label">資料來源</h3>
        <ul class="list-disc space-y-0.5 pl-5 text-xs text-muted">
          <li v-for="src in result.sources" :key="src">{{ src }}</li>
        </ul>
      </section>
    </div>

    <div v-else class="space-y-4 py-2 text-center">
      <p class="text-muted">字典找不到「{{ word.trim() }}」。</p>
      <a
        :href="googleUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="btn btn-soft inline-flex w-full"
      >
        在 Google 搜尋
      </a>
    </div>
  </BottomSheet>
</template>

<style scoped>
.pick {
  display: flex;
  width: 100%;
  align-items: flex-start;
  gap: 0.75rem;
  border-radius: 1rem;
  border: 1px solid var(--color-line);
  background: var(--color-surface);
  padding: 0.75rem 1rem;
  text-align: left;
}
.pick-on {
  border-color: var(--color-primary);
}
.pick-box {
  display: flex;
  height: 1.25rem;
  width: 1.25rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  margin-top: 0.125rem;
  border-radius: 0.375rem;
  border: 1px solid var(--color-line);
  color: white;
}
.pick-on .pick-box {
  background: var(--color-primary);
  border-color: var(--color-primary);
}
</style>
