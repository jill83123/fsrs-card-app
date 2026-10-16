<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ sentence: string; marks?: string[] }>()

/** The sentence cut into plain and marked parts; every occurrence of a marked text is colored. */
const parts = computed(() => {
  const s = props.sentence
  const on = Array.from({ length: s.length }, () => false)
  for (const m of props.marks ?? []) {
    if (!m) continue
    for (let i = s.indexOf(m); i >= 0; i = s.indexOf(m, i + m.length)) {
      on.fill(true, i, i + m.length)
    }
  }
  const out: { text: string; marked: boolean }[] = []
  for (let i = 0; i < s.length; i++) {
    const last = out[out.length - 1]
    if (last && last.marked === on[i]) last.text += s[i]
    else out.push({ text: s[i]!, marked: on[i]! })
  }
  return out
})
</script>

<template>
  <template v-for="(p, i) in parts" :key="i">
    <b v-if="p.marked" class="font-bold text-primary">{{ p.text }}</b>
    <template v-else>{{ p.text }}</template>
  </template>
</template>
