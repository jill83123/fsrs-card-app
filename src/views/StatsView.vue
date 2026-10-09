<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import SelectBox from '@/components/SelectBox.vue'
import StatsPanel from '@/components/StatsPanel.vue'
import { useData } from '@/stores/data'
import { childrenOf } from '@/lib/tree'

const data = useData()

// the picked deck is remembered on this device
const STORE_KEY = 'sr.stats.deck'
function load() {
  try {
    return localStorage.getItem(STORE_KEY)
  } catch {
    return null
  }
}
const scope = ref<string | null>(load())
watch(scope, (v) => {
  try {
    if (v) localStorage.setItem(STORE_KEY, v)
    else localStorage.removeItem(STORE_KEY)
  } catch {
    /* ignore */
  }
})
// fall back to everything once the deck is gone
watch(
  () => data.ready && scope.value && !data.nodeById.has(scope.value),
  (gone) => {
    if (gone) scope.value = null
  },
  { immediate: true },
)

const options = computed(() => {
  const out: { id: string; label: string }[] = []
  const walk = (parentId: string | null, depth: number) => {
    for (const n of childrenOf(data.nodes, parentId)) {
      out.push({ id: n.id, label: `${'　'.repeat(depth)}${n.name}` })
      walk(n.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
})
</script>

<template>
  <div>
    <PageHeader title="統計" hide-back />
    <div class="mb-4">
      <SelectBox v-model="scope" aria-label="牌組">
        <option :value="null">全部牌組</option>
        <option v-for="o in options" :key="o.id" :value="o.id">{{ o.label }}</option>
      </SelectBox>
    </div>
    <StatsPanel :scope="scope" />
  </div>
</template>
