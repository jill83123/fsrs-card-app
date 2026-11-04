<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { BellRing } from '@lucide/vue'
import ToggleSwitch from '../ToggleSwitch.vue'
import TimeField from '../TimeField.vue'
import SettingRow from './SettingRow.vue'
import { useSettings } from '@/stores/settings'
import { useReminder } from '@/stores/reminder'
import { useUi } from '@/stores/ui'

const settings = useSettings()
const reminder = useReminder()
const ui = useUi()
const router = useRouter()
const r = settings.synced.reminder
const device = settings.device.reminder
const permissionDenied = ref(
  typeof Notification !== 'undefined' && Notification.permission === 'denied',
)

async function toggle(on: boolean) {
  if (on && !settings.device.sync.workerUrl.trim()) {
    const go = await ui.confirm('尚未設定同步服務網址', {
      message:
        '每日提醒由同步服務（Cloudflare Worker）送出，請先到「Google Drive 同步與備份」填入網址。',
      confirmText: '前往設定',
    })
    // the router opens the section and scrolls to it
    if (go) await router.replace({ hash: '#sync' })
    return
  }
  try {
    if (on) await reminder.enable()
    else await reminder.disable()
  } catch (e) {
    ui.toast(e instanceof Error ? e.message : String(e), 'error')
  }
  permissionDenied.value =
    typeof Notification !== 'undefined' && Notification.permission === 'denied'
}

async function test() {
  try {
    await reminder.test()
    ui.toast('已送出測試通知，幾秒內會收到', 'success')
  } catch (e) {
    ui.toast(e instanceof Error ? e.message : String(e), 'error')
  }
}
</script>

<template>
  <div class="space-y-5">
    <p v-if="!reminder.supported" class="rounded-2xl bg-warn/15 p-4 text-xs">
      這個瀏覽器不支援推播通知。iPhone 請先用 Safari「加入主畫面」，再從主畫面開啟 App。
    </p>
    <template v-else>
      <div class="space-y-0.5 text-xs text-muted">
        <p>通知由同步服務（Cloudflare Worker）送出。</p>
        <p>通知需要各裝置授權，所以每台裝置都要自己開啟「每日提醒」並允許通知。</p>
        <p>提醒會依最近一次開啟 App 時的進度安排，連續超過一週沒開啟就會停止。</p>
      </div>

      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <div class="text-sm font-semibold">每日提醒</div>
          <p v-if="permissionDenied" class="mt-1 text-xs text-danger">
            通知權限已被封鎖，請到瀏覽器或系統的網站設定允許通知。
          </p>
          <p v-else-if="reminder.error" class="mt-1 text-xs text-danger">{{ reminder.error }}</p>
        </div>
        <ToggleSwitch
          :model-value="device.enabled"
          label="每日提醒"
          :class="{ 'pointer-events-none opacity-50': reminder.busy }"
          @update:model-value="toggle"
        />
      </div>

      <SettingRow label="提醒時間" hint="實際送達可能晚幾分鐘">
        <TimeField v-model="r.time" title="提醒時間" />
      </SettingRow>
      <SettingRow label="提醒複習" hint="有到期的卡片時">
        <ToggleSwitch v-model="r.review" label="提醒複習" />
      </SettingRow>
      <SettingRow label="提醒新學習" hint="今天還有新卡可以學時">
        <ToggleSwitch v-model="r.learn" label="提醒新學習" />
      </SettingRow>
      <p v-if="!r.review && !r.learn" class="text-xs text-warn">兩項都關閉時不會收到任何通知。</p>

      <button v-if="device.enabled" class="btn btn-ghost w-full" :disabled="reminder.busy" @click="test">
        <BellRing :size="16" /> 傳送測試通知
      </button>
    </template>
  </div>
</template>
