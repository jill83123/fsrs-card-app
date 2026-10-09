<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check } from '@lucide/vue'
import BottomSheet from './BottomSheet.vue'
import type { Example, Lang } from '@/db/types'
import type { DictResult } from '@/lib/dictLookup'
import { useSettings } from '@/stores/settings'

const props = defineProps<{ result: DictResult | null; word: string; lang: Lang }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{
  apply: [picked: { meanings: string[]; pos: string[]; examples: Example[] }]
}>()
const settings = useSettings()

const meanings = computed(() => props.result?.meaning.split('\n').filter(Boolean) ?? [])
const posOptions = computed(() =>
  (props.result?.pos ?? []).map((id) => ({
    id,
    label: settings.synced.pos[props.lang].find((o) => o.id === id)?.label ?? id,
  })),
)

const pickedMeanings = ref<number[]>([])
const pickedPos = ref<string[]>([])
const pickedExamples = ref<string[]>([])

// every new result starts with senses and parts of speech selected; example sentences are
// matched to a sense only loosely, so they start unselected
watch(
  () => props.result,
  (r) => {
    pickedMeanings.value = meanings.value.map((_, i) => i)
    pickedPos.value = r?.pos.slice() ?? []
    pickedExamples.value = []
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
  () => !pickedMeanings.value.length && !pickedPos.value.length && !pickedExamples.value.length,
)

function apply() {
  const r = props.result
  if (!r) return
  emit('apply', {
    meanings: meanings.value.filter((_, i) => pickedMeanings.value.includes(i)),
    pos: pickedPos.value,
    examples: r.examples.filter((e) => pickedExamples.value.includes(e.id)),
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

      <section v-if="meanings.length" class="space-y-2">
        <h3 class="label">意思</h3>
        <button
          v-for="(m, i) in meanings"
          :key="i"
          type="button"
          class="pick"
          :class="{ 'pick-on': pickedMeanings.includes(i) }"
          @click="toggle(pickedMeanings, i)"
        >
          <span class="pick-box"><Check v-if="pickedMeanings.includes(i)" :size="14" /></span>
          <span class="flex-1">{{ m }}</span>
        </button>
      </section>

      <section v-if="posOptions.length" class="space-y-2">
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

      <button class="btn btn-primary w-full" :disabled="nothing" @click="apply">
        加入勾選的項目
      </button>
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
