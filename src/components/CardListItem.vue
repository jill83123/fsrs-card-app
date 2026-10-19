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
  /** hide the meaning and part of speech so they can't be glimpsed while picking cards to practise */
  hideAnswer?: boolean
  /** extra line in the schedule column, e.g. a count specific to the screen it is shown on */
  note?: string
  /** compact layout: `note` is shown as a dot in this colour (the screen explains the colours) */
  noteColor?: string
  /** one borderless line (title and `note` only), for lists inside another card */
  compact?: boolean
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
const posTags = computed(() => {
  const c = props.card
  if (c.type !== 'vocab') return []
  const opts = settings.synced.pos[c.lang]
  // options deleted from settings are skipped; "名詞 n." shows as "n.", labels without one whole
  return c.pos
    .flatMap((id) => opts.find((o) => o.id === id)?.label ?? [])
    .map((l) => l.match(/\s([A-Za-z0-9][A-Za-z0-9. -]*)$/)?.[1] ?? l)
})
const deckName = computed(() => data.nodeById.get(props.card.deckId)?.name)
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center gap-3 rounded-xl text-left transition"
    :class="[
      compact
        ? 'bg-surface-2 px-3 py-2 hover:bg-surface-2/60'
        : 'border border-line bg-surface px-4 py-3 hover:bg-surface-2/50',
      { 'ring-2 ring-primary': selected, 'opacity-60': card.suspended },
    ]"
    @click="$emit('click')"
  >
    <span
      v-if="selectable"
      class="flex size-6 shrink-0 items-center justify-center rounded-full border-2"
      :class="selected ? 'border-primary bg-primary text-white' : 'border-line'"
    >
      <Check v-if="selected" :size="14" />
    </span>
    <!-- badge gets its own column so the subtitle lines up under the word -->
    <div class="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-1.5">
      <span
        v-if="card.type === 'vocab' && !compact"
        class="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted"
      >
        {{ langShort }}
      </span>
      <div
        class="flex items-center gap-1.5"
        :class="card.type === 'vocab' && !compact ? '' : 'col-span-2'"
      >
        <span class="truncate font-semibold" :class="{ 'text-sm': compact }">{{
          cardTitle(card) || '（空白）'
        }}</span>
        <Star v-if="card.starred" :size="14" class="shrink-0 fill-warn text-warn" />
        <PauseCircle v-if="card.suspended" :size="14" class="shrink-0 text-muted" />
      </div>
      <div
        v-if="!compact && (!hideAnswer || !complete)"
        class="flex min-h-5 items-center gap-1.5 text-sm text-muted"
        :class="card.type === 'vocab' ? 'col-start-2' : 'col-span-2'"
      >
        <template v-if="complete">
          <span v-for="p in posTags" :key="p" class="shrink-0 text-xs font-semibold text-primary">
            {{ p }}
          </span>
        </template>
        <span v-if="!complete" class="truncate text-xs font-semibold text-warn">未完成</span>
        <span v-else class="truncate">{{ cardSubtitle(card) }}</span>
      </div>
    </div>
    <!-- schedule info on the right -->
    <div class="flex shrink-0 flex-col items-end gap-1 text-[11px] text-muted">
      <span v-if="!compact" class="flex items-center gap-1.5 font-semibold">
        <span class="size-2 rounded-full" :style="{ background: STATE_COLORS[card.sched.state] }" />
        {{ STATE_LABEL[card.sched.state] }}
      </span>
      <span v-if="dueText && !compact">{{ dueText }}</span>
      <span
        v-if="note && compact && noteColor"
        class="size-2 rounded-full"
        :style="{ background: noteColor }"
        :title="note"
      />
      <span v-else-if="note && compact" class="text-xs">{{ note }}</span>
      <span v-else-if="note" class="font-semibold text-ink">{{ note }}</span>
      <span v-if="showDeck && deckName && !compact" class="max-w-28 truncate">{{ deckName }}</span>
    </div>
  </button>
</template>
