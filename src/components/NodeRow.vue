<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Layers,
  PauseCircle,
  Timer,
} from '@lucide/vue'
import NodeList from './NodeList.vue'
import { useTicker } from '@/composables/useTicker'
import { formatCountdown } from '@/lib/date'
import type { TreeNode } from '@/db/types'
import { deckColorCss } from '@/db/defaults'
import { useData } from '@/stores/data'
import { childrenOf } from '@/lib/tree'

const props = defineProps<{
  node: TreeNode
  depth?: number
  collapsed: Set<string>
  sorting?: boolean
}>()
const emit = defineEmits<{ toggle: [id: string]; grip: [e: PointerEvent] }>()

const data = useData()
const router = useRouter()

const children = computed(() => childrenOf(data.nodes, props.node.id))
const stats = computed(() => data.scopeStats(props.node.id))
const progress = computed(() => data.scopeProgress(props.node.id))
const isOpen = computed(() => !props.collapsed.has(props.node.id))
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
      :style="{ paddingLeft: `${16 + (depth ?? 0) * 20}px` }"
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
      <span
        class="flex size-9 shrink-0 items-center justify-center rounded-lg text-ink/70"
        :style="{ background: deckColorCss(node.color) }"
      >
        <Layers :size="18" />
      </span>
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
      <!-- same slot for the expand toggle and the plain arrow keeps rows aligned -->
      <button
        v-if="children.length"
        type="button"
        class="-mr-1.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-muted outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-primary/40"
        :aria-label="isOpen ? '收合子牌組' : '展開子牌組'"
        :aria-expanded="isOpen"
        @click.stop="emit('toggle', node.id)"
      >
        <ChevronDown :size="18" class="transition-transform" :class="{ 'rotate-180': isOpen }" />
      </button>
      <span v-else class="-mr-1.5 flex size-7 shrink-0 items-center justify-center">
        <ChevronRight :size="16" class="text-muted/60" />
      </span>
    </div>
    <template v-if="children.length && isOpen">
      <div>
        <NodeList
          :nodes="children"
          :depth="(depth ?? 0) + 1"
          :collapsed="collapsed"
          :sorting="sorting"
          @toggle="emit('toggle', $event)"
        />
      </div>
    </template>
  </div>
</template>
