<script setup lang="ts">
import { ChevronLeft } from '@lucide/vue'
import { useRouter } from 'vue-router'

const props = defineProps<{ title?: string; subtitle?: string; back?: string; hideBack?: boolean }>()
const router = useRouter()

function goBack() {
  if (props.back) router.push(props.back)
  else if (window.history.state?.back) router.back()
  else router.push('/')
}
</script>

<template>
  <header
    class="sticky top-0 z-20 -mx-4 mb-4 flex items-center gap-3 bg-bg/90 px-4 py-3 backdrop-blur"
  >
    <!-- both sides grow from zero equally, so the title stays centered on the page
         however wide the buttons beside it are -->
    <div class="flex min-w-fit flex-1 basis-0 items-center gap-3">
      <button v-if="!hideBack" class="icon-btn" aria-label="返回" @click="goBack">
        <ChevronLeft :size="22" />
      </button>
      <slot name="left" />
    </div>
    <div class="min-w-0 text-center">
      <h1 class="truncate text-lg font-bold">
        <slot name="title">{{ title }}</slot>
      </h1>
      <p v-if="subtitle" class="truncate text-xs text-muted">{{ subtitle }}</p>
    </div>
    <div class="flex min-w-fit flex-1 basis-0 items-center justify-end gap-2">
      <slot name="right" />
    </div>
  </header>
</template>
