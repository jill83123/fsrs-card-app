<script setup lang="ts">
import { ref } from 'vue'
import { ArchiveRestore, ChevronRight } from '@lucide/vue'
import type { ArchivedDeck } from '@/lib/purge'

defineProps<{
  item: ArchivedDeck
  /** only the top-most archived deck can be restored */
  top?: boolean
  /** a sub-deck inside its parent's card */
  nested?: boolean
  /** leave room for the expand arrow when a sibling has one, so the names line up */
  reserve?: boolean
}>()
defineEmits<{ unarchive: [d: ArchivedDeck] }>()

const open = ref(false)
</script>

<template>
  <li :class="nested ? 'py-1.5 last:pb-0' : 'rounded-xl bg-surface-2 px-3 py-2.5'">
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
      <span v-else-if="reserve" class="size-6 shrink-0" />
      <div class="min-w-0 flex-1">
        <p class="truncate">{{ item.node.name }}</p>
        <p class="text-xs text-muted">
          {{ item.children.length ? `${item.decks - 1} 個子牌組、` : '' }}{{ item.cards }} 張卡片
        </p>
      </div>
      <button
        v-if="top"
        class="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary"
        @click="$emit('unarchive', item)"
      >
        <ArchiveRestore :size="13" /> 取消封存
      </button>
    </div>
    <ul v-if="open && item.children.length" class="mt-1 ml-8">
      <ArchivedDeckItem
        v-for="c in item.children"
        :key="c.node.id"
        :item="c"
        nested
        :reserve="item.children.some((x) => x.children.length > 0)"
      />
    </ul>
  </li>
</template>
