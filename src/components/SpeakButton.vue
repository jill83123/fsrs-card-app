<script setup lang="ts">
import { computed, ref } from 'vue'
import { LoaderCircle, Volume2 } from '@lucide/vue'
import type { Lang } from '@/db/types'
import { speak, speaking, stopSpeaking } from '@/lib/tts'
import { useSettings } from '@/stores/settings'

const props = defineProps<{
  text: string
  lang: Lang
  size?: number
  /** a vocab card's reading, used for the pronunciation when it is usable */
  reading?: string
}>()
const settings = useSettings()
const busy = ref(false)
const active = computed(() => busy.value && speaking.value !== null)

async function run() {
  if (active.value) return stopSpeaking()
  busy.value = true
  try {
    await speak(props.text, props.lang, settings.device.tts[props.lang], props.reading)
  } finally {
    busy.value = false
  }
}

defineExpose({ run })
</script>

<template>
  <button
    type="button"
    class="inline-flex shrink-0 items-center justify-center rounded-lg text-primary transition hover:bg-primary-soft active:scale-95"
    :style="{ width: `${(size ?? 18) + 18}px`, height: `${(size ?? 18) + 18}px` }"
    aria-label="發音"
    title="發音"
    @click.stop="run"
  >
    <LoaderCircle v-if="active" :size="size ?? 18" class="animate-spin" />
    <Volume2 v-else :size="size ?? 18" />
  </button>
</template>
