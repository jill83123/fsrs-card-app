<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/lib/markdown'

const props = defineProps<{ source: string }>()
const html = computed(() => renderMarkdown(props.source))

function onClick(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest('.spoiler')
  if (el && !el.classList.contains('revealed')) {
    el.classList.add('revealed')
    e.preventDefault()
    e.stopPropagation()
  }
}
</script>

<template>
  <!-- sanitized with DOMPurify in renderMarkdown -->
  <div class="md" @click="onClick" v-html="html" />
</template>
