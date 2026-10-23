<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import NodeRow from './NodeRow.vue'
import type { TreeNode } from '@/db/types'
import { useData } from '@/stores/data'
import { moved, useDragSort } from '@/composables/useDragSort'

const props = defineProps<{
  nodes: TreeNode[]
  sorting?: boolean
}>()
const data = useData()

// show the new order right away instead of waiting for the database round trip
const local = ref<string[] | null>(null)
watch(
  () => props.nodes.map((n) => `${n.id}:${n.order}`).join(),
  () => (local.value = null),
)
const list = computed(() => {
  if (!local.value) return props.nodes
  const byId = new Map(props.nodes.map((n) => [n.id, n]))
  return local.value.map((id) => byId.get(id)).filter((n): n is TreeNode => !!n)
})

const drag = useDragSort((from, to) => {
  const ids = moved(
    list.value.map((n) => n.id),
    from,
    to,
  )
  local.value = ids
  void data.reorderNodes(ids)
})
</script>

<template>
  <div
    v-for="(n, i) in list"
    :key="n.id"
    data-sort-item
    class="bg-surface"
    :class="drag.dragging(i) && 'shadow-lg'"
    :style="drag.style(i)"
  >
    <NodeRow :node="n" :sorting="sorting" @grip="drag.start($event, i)" />
  </div>
</template>
