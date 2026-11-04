<script setup lang="ts">
import { computed } from 'vue'
import { Bell, X } from '@lucide/vue'
import { useSettings } from '@/stores/settings'
import { useReminder } from '@/stores/reminder'
import { useUi } from '@/stores/ui'

/**
 * Offered on the home page of a device that has not turned the daily reminder on while another
 * one has. Asking for the notification permission needs a tap, so it only happens from this button.
 */
const settings = useSettings()
const reminder = useReminder()
const ui = useUi()

const show = computed(
  () =>
    reminder.supported &&
    settings.synced.reminder.used &&
    !settings.device.reminder.enabled &&
    !settings.device.reminder.dismissed &&
    !!settings.device.sync.workerUrl.trim() &&
    Notification.permission !== 'denied',
)

async function turnOn() {
  try {
    await reminder.enable()
    ui.toast('已開啟每日提醒', 'success')
  } catch (e) {
    ui.toast(e instanceof Error ? e.message : String(e), 'error')
  }
}
</script>

<template>
  <section v-if="show" class="card mb-5 flex items-center gap-3 !p-4">
    <span
      class="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-strong dark:text-ink"
    >
      <Bell :size="18" />
    </span>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold">這台裝置也要收到每日提醒嗎？</p>
      <p class="text-xs text-muted">你在其他裝置開啟了每日提醒。</p>
    </div>
    <button class="btn btn-primary shrink-0 px-4 py-2" :disabled="reminder.busy" @click="turnOn">
      開啟
    </button>
    <button
      class="-mr-1.5 shrink-0 p-1 text-muted hover:text-ink"
      aria-label="不再提示"
      @click="settings.device.reminder.dismissed = true"
    >
      <X :size="16" />
    </button>
  </section>
</template>
