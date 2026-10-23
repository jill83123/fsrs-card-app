<script setup lang="ts">
import { computed } from 'vue'
import { BookOpen } from '@lucide/vue'
import type { Lang } from '@/db/types'
import { useSettings } from '@/stores/settings'

const props = defineProps<{ word: string; lang?: Lang }>()
const settings = useSettings()

const href = (url: string) => url.replaceAll('{word}', encodeURIComponent(props.word.trim()))

// settings can arrive from a backup or sync, so never link to javascript: and the like
const isWebUrl = (url: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(href(url)).protocol)
  } catch {
    return false
  }
}

const dicts = computed(() =>
  settings.synced.dictionaries.filter(
    (d) =>
      isWebUrl(d.url) && (!props.lang || d.langs.length === 0 || d.langs.includes(props.lang)),
  ),
)
</script>

<template>
  <div v-if="word.trim() && dicts.length" class="flex flex-wrap gap-2">
    <a
      v-for="d in dicts"
      :key="d.id"
      :href="href(d.url)"
      target="_blank"
      rel="noopener noreferrer"
      class="chip hover:border-primary hover:text-primary"
      @click.stop
    >
      <BookOpen :size="13" />
      {{ d.name }}
    </a>
  </div>
</template>
