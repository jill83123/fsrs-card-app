<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import SelectBox from '@/components/SelectBox.vue'
import StatsPanel from '@/components/StatsPanel.vue'
import { useData } from '@/stores/data'
import { deckRows } from '@/lib/tree'

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

const options = computed(() => deckRows(data.nodes))
</script>

<template>
  <div>
    <PageHeader title="統計" hide-back scroll-away />
    <!-- the title scrolls off; only the deck picker stays pinned -->
    <div class="sticky top-0 z-10 -mx-4 -mt-4 mb-2 bg-bg/80 px-4 py-3 backdrop-blur">
      <SelectBox v-model="scope" collapsible aria-label="牌組">
        <option :value="null">全部牌組</option>
        <option
          v-for="o in options"
          :key="o.node.id"
          :value="o.node.id"
          :path="o.path"
          :tree="o.tree"
        >
          {{ o.node.name }}
        </option>
      </SelectBox>
    </div>
    <StatsPanel :scope="scope" />
  </div>
</template>
