<script setup lang="ts">
import { computed } from 'vue'
import { Check } from '@lucide/vue'
import BottomSheet from './BottomSheet.vue'
import { useData } from '@/stores/data'
import { pathTo } from '@/lib/tree'

defineProps<{ current?: string }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ pick: [deckId: string] }>()
const data = useData()

// only decks without sub-decks can hold cards
const targets = computed(() =>
  data.nodes
    .filter((n) => !data.nodes.some((c) => c.parentId === n.id))
    .map((n) => ({
      id: n.id,
      label: pathTo(data.nodes, n.id)
        .map((x) => x.name)
        .join(' / '),
    })),
)
</script>

<template>
  <BottomSheet v-model="open" title="移動到牌組">
    <div class="space-y-2">
      <button
        v-for="t in targets"
        :key="t.id"
        class="flex w-full items-center gap-2 rounded-2xl bg-surface px-4 py-3 text-left font-semibold disabled:opacity-50"
        :disabled="t.id === current"
        @click="emit('pick', t.id)"
      >
        <span class="min-w-0 flex-1 truncate">{{ t.label }}</span>
        <span v-if="t.id === current" class="flex shrink-0 items-center gap-1 text-xs text-muted">
          <Check :size="14" /> 目前
        </span>
      </button>
      <p v-if="targets.length < 2" class="py-4 text-center text-sm text-muted">
        沒有其他牌組可以移動，請先新增牌組。
      </p>
    </div>
  </BottomSheet>
</template>
