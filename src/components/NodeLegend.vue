<script setup lang="ts">
import { Timer } from '@lucide/vue'
</script>

<template>
  <div
    class="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 bg-surface-2/60 px-4 py-2 text-[11px] text-muted"
  >
    <span class="flex items-center gap-1">
      <span class="size-3 rounded-[4px] border border-primary/40 bg-primary-soft" />
      可複習
    </span>
    <span class="flex items-center gap-1">
      <span
        class="size-3 rounded-[4px] border"
        style="
          background: color-mix(in oklab, var(--success) 14%, var(--surface));
          border-color: color-mix(in oklab, var(--success) 40%, transparent);
        "
      />
      新卡
    </span>
    <span class="flex items-center gap-1"><Timer :size="12" /> 稍後到期倒數</span>
  </div>
</template>
