<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeftRight, ChevronRight, Folder, GripVertical, PauseCircle, Timer } from '@lucide/vue'
import { useTicker } from '@/composables/useTicker'
import { formatCountdown } from '@/lib/date'
import type { TreeNode } from '@/db/types'
import { useData } from '@/stores/data'
import { childrenOf } from '@/lib/tree'

const props = defineProps<{
  node: TreeNode
  sorting?: boolean
}>()
const emit = defineEmits<{ grip: [e: PointerEvent] }>()

const data = useData()
const router = useRouter()

const children = computed(() => childrenOf(data.nodes, props.node.id))
const stats = computed(() => data.scopeStats(props.node.id))
const progress = computed(() => data.scopeProgress(props.node.id))
const paused = computed(() => data.pausedIds.has(props.node.id))

const now = useTicker()
const ready = computed(() => stats.value.dueAvail - stats.value.learningWaiting)
const countdown = computed(() => formatCountdown(stats.value.nextDue - now.value))

const subtitle = computed(() => {
  if (children.value.length) {
    return `${children.value.length} 個子牌組 · ${stats.value.total} 張`
  }
  return `${stats.value.total} 張卡片`
})
</script>

<template>
  <div>
    <div
      class="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60"
      :class="{ 'opacity-60': paused }"
      @click="!sorting && router.push(`/node/${node.id}`)"
    >
      <button
        v-if="sorting"
        type="button"
        class="-ml-2 flex size-8 shrink-0 touch-none items-center justify-center rounded-lg text-muted hover:bg-surface-2"
        aria-label="拖曳排序"
        @click.stop
        @pointerdown.stop="emit('grip', $event)"
      >
        <GripVertical :size="18" />
      </button>
      <!-- a folder for a deck that holds sub-decks, a stack for one that holds cards: the line color of the
           active tab bar icon around a soft fill of the same theme color. The stack is drawn here so
           that only its top layer is filled: the two lines below it are open and a fill would smear -->
      <Folder
        v-if="children.length"
        :size="24"
        class="shrink-0 text-primary/85"
        style="fill: var(--color-primary-soft)"
        aria-hidden="true"
      />
      <svg
        v-else
        class="shrink-0 text-primary/85"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path
          d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"
          style="fill: var(--color-primary-soft)"
        />
        <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.66 0l8.58-3.9A1 1 0 0 0 22 12" />
        <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.66 0l8.58-3.9A1 1 0 0 0 22 17" />
      </svg>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5 font-semibold">
          <span class="truncate">{{ node.name }}</span>
          <PauseCircle v-if="paused" :size="14" class="shrink-0 text-muted" aria-label="已暫停">
            <title>已暫停</title>
          </PauseCircle>
          <!-- only where reverse is switched on; children inherit it without repeating the tag -->
          <ArrowLeftRight
            v-if="node.reverse"
            :size="13"
            class="shrink-0 text-muted"
            aria-label="反向學習"
          >
            <title>反向學習</title>
          </ArrowLeftRight>
        </div>
        <div class="truncate text-xs text-muted">
          {{ subtitle }}
          <template v-if="progress.ratio !== null">
            · 今日 {{ Math.round(progress.ratio * 100) }}%</template
          >
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-1.5 text-xs font-semibold tabular-nums">
        <span
          v-if="ready"
          class="rounded-md bg-primary-soft px-2 py-0.5 text-primary-strong"
          title="可複習"
        >
          {{ ready }}
        </span>
        <span
          v-if="stats.learningWaiting"
          class="flex items-center gap-0.5 text-muted"
          :title="`還有 ${stats.learningWaiting} 張學習中的卡片稍後到期`"
        >
          <Timer :size="12" /> {{ countdown }}
        </span>
        <span
          v-if="stats.newAvail"
          class="rounded-md px-2 py-0.5"
          style="
            background: color-mix(in oklab, var(--success) 14%, var(--surface));
            color: var(--success);
          "
          title="新卡"
        >
          {{ stats.newAvail }}
        </span>
      </div>
      <span class="-mr-1.5 flex size-7 shrink-0 items-center justify-center">
        <ChevronRight :size="16" class="text-muted/60" />
      </span>
    </div>
  </div>
</template>
