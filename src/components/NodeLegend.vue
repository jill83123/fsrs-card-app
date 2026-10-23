<script setup lang="ts">
/** no band behind it; the parent aligns it (under a heading, or centred under a list) */
defineProps<{ plain?: boolean }>()
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/70"
    :class="plain ? '' : 'justify-end bg-surface-2/60 px-4 py-2'"
  >
    <span class="flex items-center gap-1">
      <span
        class="size-3.5 rounded-[4px] border border-primary/70"
        style="background: color-mix(in oklab, var(--primary) 25%, var(--surface))"
      />
      可複習
    </span>
    <span class="flex items-center gap-1">
      <span
        class="size-3.5 rounded-[4px] border"
        style="
          background: color-mix(in oklab, var(--success) 25%, var(--surface));
          border-color: color-mix(in oklab, var(--success) 70%, transparent);
        "
      />
      新卡
    </span>
  </div>
</template>
