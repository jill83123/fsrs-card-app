<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/lib/markdown'

const props = defineProps<{ source: string }>()
const html = computed(() => renderMarkdown(props.source))

function onClick(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest('.spoiler')
  if (!el) return
  if (!el.classList.contains('revealed')) {
    el.classList.add('revealed')
    e.preventDefault()
    e.stopPropagation()
    return
  }
  // a revealed one covers again when tapped, but not while selecting its text or following a link in it
  if ((e.target as HTMLElement).closest('a') || !window.getSelection()?.isCollapsed) return
  el.classList.remove('revealed')
}
</script>

<template>
  <!-- sanitized with DOMPurify in renderMarkdown -->
  <div class="md" @click="onClick" v-html="html" />
</template>
