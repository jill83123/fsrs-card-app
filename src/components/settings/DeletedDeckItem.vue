<script setup lang="ts">
import { ref } from 'vue'
import { ChevronRight, Minus, RotateCcw, Trash2 } from '@lucide/vue'
import type { DeletedDeck } from '@/lib/purge'

defineProps<{
  item: DeletedDeck
  /** only the top-most deck shows the countdown; sub-decks go with it */
  daysLeft?: number
}>()
defineEmits<{
  restore: [d: DeletedDeck]
  purge: [d: DeletedDeck]
}>()

const open = ref(false)
</script>

<template>
  <li class="py-2">
    <div class="flex items-center gap-2">
      <button
        v-if="item.children.length"
        class="flex size-6 shrink-0 self-start items-center justify-center text-muted transition hover:text-ink"
        :aria-label="open ? '收合' : '展開'"
        :aria-expanded="open"
        @click="open = !open"
      >
        <ChevronRight :size="16" class="transition-transform" :class="{ 'rotate-90': open }" />
      </button>
      <span v-else class="flex size-6 shrink-0 self-start items-center justify-center text-muted">
        <Minus :size="14" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate">{{ item.node.name }}</p>
        <p class="text-xs text-muted">
          {{ item.children.length ? `${item.decks - 1} 個子牌組、` : ''
          }}{{ item.cards }} 張卡片<template v-if="daysLeft !== undefined">
            · {{ daysLeft }} 天後永久刪除</template
          >
        </p>
      </div>
      <button
        v-if="daysLeft !== undefined"
        class="pill pill-idle bg-surface-2 py-1.5 text-xs"
        @click="$emit('restore', item)"
      >
        <RotateCcw :size="13" /> 還原
      </button>
      <button
        class="icon-btn text-danger"
        aria-label="永久刪除"
        title="永久刪除"
        @click="$emit('purge', item)"
      >
        <Trash2 :size="16" />
      </button>
    </div>
    <ul v-if="open && item.children.length" class="ml-8 mt-1">
      <DeletedDeckItem
        v-for="c in item.children"
        :key="c.node.id"
        :item="c"
        @restore="$emit('restore', $event)"
        @purge="$emit('purge', $event)"
      />
    </ul>
  </li>
</template>
