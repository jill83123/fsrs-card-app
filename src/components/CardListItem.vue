<script setup lang="ts">
import { computed } from 'vue'
import { Check, PauseCircle, Star } from '@lucide/vue'
import type { Card } from '@/db/types'
import { cardSubtitle, cardTitle, isComplete } from '@/lib/cards'
import { State, STATE_LABEL } from '@/lib/fsrs'
import { formatDayLabel, studyDayOf } from '@/lib/date'
import { LANGS } from '@/db/defaults'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { STATE_COLORS } from '@/components/stats/colors'

const props = defineProps<{
  card: Card
  selectable?: boolean
  selected?: boolean
  showDeck?: boolean
}>()
defineEmits<{ click: [] }>()
const data = useData()
const settings = useSettings()

const complete = computed(() => isComplete(props.card))
const dueText = computed(() => {
  const s = props.card.sched
  if (s.state === State.New) return null
  if (s.due < data.dayEnd) return '今天到期'
  return formatDayLabel(studyDayOf(s.due, settings.synced.study.rolloverHour)) + ' 到期'
})
const langShort = computed(() =>
  props.card.type === 'vocab'
    ? LANGS.find((l) => l.id === (props.card as { lang: string }).lang)?.short
    : '',
)
const deckName = computed(() => data.nodeById.get(props.card.deckId)?.name)
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left transition hover:bg-surface-2/50"
    :class="{ 'ring-2 ring-primary': selected, 'opacity-60': card.suspended }"
    @click="$emit('click')"
  >
    <span
      v-if="selectable"
      class="flex size-6 shrink-0 items-center justify-center rounded-full border-2"
      :class="selected ? 'border-primary bg-primary text-white' : 'border-line'"
    >
      <Check v-if="selected" :size="14" />
    </span>
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-1.5">
        <span
          v-if="card.type === 'vocab'"
          class="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted"
        >
          {{ langShort }}
        </span>
        <span class="truncate font-semibold">{{ cardTitle(card) || '（空白）' }}</span>
        <Star v-if="card.starred" :size="14" class="shrink-0 fill-warn text-warn" />
        <PauseCircle v-if="card.suspended" :size="14" class="shrink-0 text-muted" />
      </div>
      <div class="truncate text-sm text-muted">
        <span v-if="!complete" class="font-semibold text-warn">未完成</span>
        <template v-else>{{ cardSubtitle(card) }}</template>
      </div>
      <div v-if="showDeck && deckName" class="mt-1 truncate text-[11px] text-muted">
        {{ deckName }}
      </div>
    </div>
    <!-- schedule info on the right -->
    <div class="flex shrink-0 flex-col items-end gap-1 text-[11px] text-muted">
      <span class="flex items-center gap-1.5 font-semibold">
        <span class="size-2 rounded-full" :style="{ background: STATE_COLORS[card.sched.state] }" />
        {{ STATE_LABEL[card.sched.state] }}
      </span>
      <span v-if="dueText">{{ dueText }}</span>
    </div>
  </button>
</template>
