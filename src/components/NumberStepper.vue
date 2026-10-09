<script setup lang="ts">
import { Minus, Plus } from '@lucide/vue'

const props = withDefaults(defineProps<{ min?: number; max?: number; step?: number }>(), {
  min: 0,
  max: 9999,
  step: 1,
})
const model = defineModel<number>({ required: true })

const clamp = (v: number) => Math.min(props.max, Math.max(props.min, v))
function onInput(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(v)) model.value = clamp(Math.round(v))
}
</script>

<template>
  <div class="flex items-center gap-2">
    <button
      type="button"
      class="icon-btn size-9 bg-surface-2"
      :disabled="model <= min"
      aria-label="減少"
      @click="model = clamp(model - step)"
    >
      <Minus :size="16" />
    </button>
    <input
      :value="model"
      inputmode="numeric"
      class="w-14 bg-transparent text-center text-lg font-semibold outline-none"
      @change="onInput"
    />
    <button
      type="button"
      class="icon-btn size-9 bg-surface-2"
      :disabled="model >= max"
      aria-label="增加"
      @click="model = clamp(model + step)"
    >
      <Plus :size="16" />
    </button>
  </div>
</template>
