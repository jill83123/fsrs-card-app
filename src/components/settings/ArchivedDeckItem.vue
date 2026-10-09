<script setup lang="ts">
import { ref } from 'vue'
import { ArchiveRestore, ChevronRight, Minus } from '@lucide/vue'
import type { ArchivedDeck } from '@/lib/purge'

defineProps<{
  item: ArchivedDeck
  /** only the top-most archived deck can be restored */
  top?: boolean
}>()
defineEmits<{ unarchive: [d: ArchivedDeck] }>()

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
          {{ item.children.length ? `${item.decks - 1} 個子牌組、` : '' }}{{ item.cards }} 張卡片
        </p>
      </div>
      <button
        v-if="top"
        class="pill pill-idle bg-surface-2 py-1.5 text-xs"
        @click="$emit('unarchive', item)"
      >
        <ArchiveRestore :size="13" /> 取消封存
      </button>
    </div>
    <ul v-if="open && item.children.length" class="ml-8 mt-1">
      <ArchivedDeckItem v-for="c in item.children" :key="c.node.id" :item="c"
      />
    </ul>
  </li>
</template>
