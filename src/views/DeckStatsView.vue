<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import StatsPanel from '@/components/StatsPanel.vue'
import { useData } from '@/stores/data'

const route = useRoute()
const data = useData()

const id = computed(() => String(route.params.id))
const node = computed(() => data.nodeById.get(id.value))
</script>

<template>
  <div v-if="node">
    <PageHeader :back="`/node/${node.id}`" :title="node.name" subtitle="統計" />
    <StatsPanel :scope="node.id" />
  </div>
  <div
    v-else-if="data.ready"
    class="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-muted"
  >
    <p>找不到這個項目</p>
    <RouterLink to="/" class="btn btn-primary px-6">回首頁</RouterLink>
  </div>
</template>
