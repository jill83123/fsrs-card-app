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
  <div v-else-if="data.ready" class="py-20 text-center text-muted">
    找不到這個項目。<RouterLink to="/" class="text-primary">回首頁</RouterLink>
  </div>
</template>
