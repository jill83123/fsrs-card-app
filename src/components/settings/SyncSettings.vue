<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { CloudDownload, CloudUpload, LogOut, RefreshCw, Trash2, TriangleAlert } from '@lucide/vue'
import ToggleSwitch from '../ToggleSwitch.vue'
import SettingRow from './SettingRow.vue'
import { useSettings } from '@/stores/settings'
import { describeConflict, useSync } from '@/stores/sync'
import { useUi } from '@/stores/ui'
import { formatDateTime } from '@/lib/date'
import { preloadGis } from '@/lib/google/gis'

const settings = useSettings()
const sync = useSync()
const ui = useUi()
const working = ref(false)
const origin = computed(() => location.origin)

async function run(fn: () => Promise<unknown>, ok?: string) {
  working.value = true
  try {
    await fn()
    if (ok) ui.toast(ok, 'success')
  } catch (e) {
    ui.toast(e instanceof Error ? e.message : String(e), 'error')
  } finally {
    working.value = false
  }
}

const connect = () => run(() => sync.connect(), '已連線並完成同步')
const syncNow = () => run(() => sync.syncNow(true), '同步完成')
const backup = () => run(() => sync.backupNow(), '已建立備份')
const refresh = () => run(() => sync.refreshBackups(true))

async function disconnect() {
  if (
    !(await ui.confirm('中斷 Google Drive 連線？', {
      message: '本機資料會保留，雲端資料也不會被刪除。',
    }))
  )
    return
  await sync.disconnect()
}

async function restore(id: string, time: number) {
  const ok = await ui.confirm('從這份備份還原？', {
    message: `${formatDateTime(time)} 的備份會取代目前所有裝置上的資料。\n還原後會同步到雲端。`,
    danger: true,
    confirmText: '還原',
  })
  if (ok) await run(() => sync.restoreBackup(id), '已還原')
}

async function wipeEverywhere() {
  const ok = await ui.confirm('清除雲端與所有裝置的資料？', {
    message:
      '所有牌組、卡片與複習紀錄都會被刪除，其他裝置下次同步時也會跟著清空。\n清除前會先建立一份手動備份，後悔時可以從「雲端備份」還原。\n設定不受影響。',
    danger: true,
    confirmText: '繼續',
  })
  if (!ok) return
  const typed = await ui.prompt('確認清除', {
    message: '請輸入「清除」兩個字確認。',
    placeholder: '清除',
    confirmText: '清除所有資料',
  })
  if (typed === null) return
  if (typed.trim() !== '清除') return ui.toast('輸入不符，資料沒有清除', 'error')
  await run(() => sync.wipeEverywhere(), '已清除雲端與所有裝置的資料')
}

async function deleteAllBackups() {
  const ok = await ui.confirm('刪除所有雲端備份？', {
    message: '自動與手動備份都會被永久刪除，之後無法再從這些備份還原。\n目前的資料不受影響。',
    danger: true,
    confirmText: '刪除備份',
  })
  if (ok) await run(() => sync.deleteAllBackups(), '已刪除所有雲端備份')
}

const autoBackups = computed(() => sync.backups.filter((b) => b.kind === 'auto'))
const manualBackups = computed(() => sync.backups.filter((b) => b.kind === 'manual'))

onMounted(() => {
  preloadGis()
  if (sync.connected && sync.status !== 'reauth') void sync.refreshBackups().catch(() => {})
})
</script>

<template>
  <div class="space-y-5">
    <template v-if="!sync.connected">
      <div class="space-y-0.5 text-sm text-muted">
        <p>連線後，資料會同步到你 Google Drive 的 App 專用隱藏資料夾（appDataFolder）。</p>
        <p>可以在多台裝置之間同步，並每天自動備份。</p>
        <p>這個 App 看不到你 Drive 裡的其他檔案。</p>
      </div>
      <SettingRow label="同步服務網址" stacked>
        <input
          v-model="settings.device.sync.workerUrl"
          class="input text-sm"
          placeholder="https://fsrs-sync-auth.xxxx.workers.dev"
        />
        <div class="space-y-0.5 text-xs text-muted">
          <p>填入自己部署的 Cloudflare Worker 網址，Google 登入設定由它提供。</p>
          <p>
            Google Cloud 與 Worker 的設定步驟請看 README 的「Google Drive 同步」，Google 用戶端 ID
            的「已授權的 JavaScript 來源」要包含
            <code class="break-all">{{ origin }}</code>
          </p>
        </div>
      </SettingRow>
      <button
        class="btn btn-primary w-full"
        :disabled="!settings.device.sync.workerUrl.trim() || working"
        @click="connect"
      >
        連線 Google Drive
      </button>
    </template>

    <template v-else>
      <div class="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3 text-sm">
        <div>
          <div class="font-semibold">已連線 Google Drive</div>
          <div class="text-xs text-muted">
            上次同步：{{ sync.lastSync ? formatDateTime(sync.lastSync) : '尚未同步' }}
          </div>
          <div v-if="sync.error" class="mt-1 text-xs text-danger">{{ sync.error }}</div>
        </div>
        <button
          class="btn btn-primary shrink-0 py-2"
          :disabled="working || sync.busy"
          @click="syncNow"
        >
          <RefreshCw :size="16" :class="{ 'animate-spin': sync.busy }" /> 同步
        </button>
      </div>

      <div v-if="sync.conflict" class="flex gap-2.5 rounded-2xl bg-warn/15 p-3 text-xs">
        <TriangleAlert :size="16" class="mt-0.5 shrink-0 text-warn" />
        <div class="flex-1 space-y-1.5">
          <p class="font-semibold">{{ formatDateTime(sync.conflict.time) }} 同步時發現衝突</p>
          <p>{{ describeConflict(sync.conflict) }}</p>
          <p class="text-muted">
            如果少了需要的修改，可以從下方較早的備份還原，或直接重新編輯那些項目。
          </p>
          <button class="font-semibold text-primary" @click="sync.dismissConflict()">知道了</button>
        </div>
      </div>

      <SettingRow label="自動同步" hint="開啟 App、資料變更、離開頁面時自動同步">
        <ToggleSwitch v-model="settings.device.sync.auto" />
      </SettingRow>

      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold">雲端備份</h3>
          <div class="flex gap-2">
            <button
              class="pill pill-idle bg-surface-2 py-1.5 text-xs"
              :disabled="working"
              @click="refresh"
            >
              <RefreshCw :size="13" /> 重新整理
            </button>
            <button class="pill pill-active py-1.5 text-xs" :disabled="working" @click="backup">
              <CloudUpload :size="13" /> 立即備份
            </button>
          </div>
        </div>
        <p class="text-xs text-muted">
          自動備份每天一次，保留最新 3 份；手動備份另外保留最新 3 份。
        </p>
        <div
          v-for="group in [
            { label: '手動備份', list: manualBackups },
            { label: '自動備份', list: autoBackups },
          ]"
          :key="group.label"
        >
          <p class="mb-1.5 text-xs font-semibold text-muted">{{ group.label }}</p>
          <ul class="space-y-1.5">
            <li
              v-for="b in group.list"
              :key="b.id"
              class="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm"
            >
              <span>
                {{ formatDateTime(b.time) }}
                <span class="text-xs text-muted"
                  >· {{ b.cards }} 張 · {{ (b.size / 1024).toFixed(0) }} KB</span
                >
              </span>
              <button
                class="flex items-center gap-1 text-xs font-semibold text-primary"
                @click="restore(b.id, b.time)"
              >
                <CloudDownload :size="14" /> 還原
              </button>
            </li>
            <li v-if="!group.list.length" class="text-xs text-muted">（尚無）</li>
          </ul>
        </div>
      </div>

      <div class="space-y-2 rounded-2xl border border-danger/30 p-3">
        <h3 class="text-sm font-bold text-danger">清除雲端資料</h3>
        <div class="space-y-0.5 text-xs text-muted">
          <p>「中斷連線」不會刪除雲端資料。</p>
          <p>想完全重來時，可以清除雲端與所有裝置上的資料，或刪除雲端備份。</p>
        </div>
        <div class="flex flex-col items-start gap-2">
          <button
            class="flex items-center gap-1.5 text-sm text-danger"
            :disabled="working"
            @click="wipeEverywhere"
          >
            <Trash2 :size="16" /> 清除雲端與所有裝置的資料
          </button>
          <button
            class="flex items-center gap-1.5 text-sm text-danger"
            :disabled="working"
            @click="deleteAllBackups"
          >
            <Trash2 :size="16" /> 刪除所有雲端備份
          </button>
        </div>
      </div>

      <button class="flex items-center gap-1.5 text-sm text-danger" @click="disconnect">
        <LogOut :size="16" /> 中斷連線
      </button>
    </template>
  </div>
</template>
