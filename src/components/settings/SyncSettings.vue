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

const allBackups = computed(() => [...sync.backups].sort((a, b) => b.time - a.time))

onMounted(() => {
  preloadGis()
  if (sync.connected && sync.status !== 'reauth') void sync.refreshBackups().catch(() => {})
})
</script>

<template>
  <div class="space-y-5">
    <template v-if="!sync.connected">
      <div class="space-y-0.5 text-xs text-muted">
        <p>多裝置同步，並每天自動備份。</p>
        <p>資料存在 Google Drive 的 App 專用資料夾，看不到你的其他檔案。</p>
      </div>
      <SettingRow label="同步服務網址" stacked>
        <input
          v-model="settings.device.sync.workerUrl"
          class="input text-sm"
          placeholder="https://fsrs-sync-auth.xxxx.workers.dev"
        />
        <div class="space-y-0.5 text-xs text-muted">
          <p>填入自己部署的 Cloudflare Worker 網址，由它提供 Google 登入設定。</p>
          <p>設定步驟請看 README 的「Google Drive 同步」。</p>
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
      <div class="space-y-3 rounded-2xl bg-surface-2 p-4 text-sm">
        <div>
          <div class="font-semibold">已連線 Google Drive</div>
          <div class="text-xs text-muted">
            上次同步：{{ sync.lastSync ? formatDateTime(sync.lastSync) : '尚未同步' }}
          </div>
          <div v-if="sync.error" class="mt-1 text-xs text-danger">{{ sync.error }}</div>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-ghost flex-1 py-2" :disabled="working" @click="disconnect">
            <LogOut :size="16" /> 中斷連線
          </button>
          <button
            class="btn btn-primary flex-1 py-2"
            :disabled="working || sync.busy"
            @click="syncNow"
          >
            <RefreshCw :size="16" :class="{ 'animate-spin': sync.busy }" /> 同步
          </button>
        </div>
      </div>

      <div v-if="sync.conflict" class="flex gap-2.5 rounded-2xl bg-warn/15 p-4 text-xs">
        <TriangleAlert :size="16" class="mt-0.5 shrink-0 text-warn" />
        <div class="flex-1 space-y-1.5">
          <p class="font-semibold">{{ formatDateTime(sync.conflict.time) }} 同步時發現衝突</p>
          <p>{{ describeConflict(sync.conflict) }}</p>
          <p class="text-muted">少了修改的話，可以從下方備份還原，或重新編輯。</p>
          <button class="font-semibold text-primary" @click="sync.dismissConflict()">知道了</button>
        </div>
      </div>

      <SettingRow label="自動同步" hint="開啟 App、資料變更、離開頁面時自動同步">
        <ToggleSwitch v-model="settings.device.sync.auto" />
      </SettingRow>

      <div class="space-y-3">
        <div>
          <h3 class="text-sm font-semibold">雲端備份</h3>
          <p class="text-xs text-muted">每天自動備份，自動與手動各保留最新 3 份。</p>
        </div>
        <ul class="space-y-1.5">
          <li
            v-for="b in allBackups"
            :key="b.id"
            class="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm"
          >
            <span>
              {{ formatDateTime(b.time) }}
              <span class="text-xs text-muted">
                · {{ b.cards }} 張{{ b.kind === 'manual' ? ' · 手動' : '' }}
              </span>
            </span>
            <button
              class="flex items-center gap-1 text-xs font-semibold text-primary"
              @click="restore(b.id, b.time)"
            >
              <CloudDownload :size="14" /> 還原
            </button>
          </li>
          <li v-if="!allBackups.length" class="text-xs text-muted">尚無備份</li>
        </ul>
        <button class="btn btn-ghost w-full" :disabled="working" @click="backup">
          <CloudUpload :size="16" /> 立即備份
        </button>
      </div>

      <div class="flex flex-col items-start gap-2 border-t border-line pt-5 text-sm">
        <button
          class="flex items-center gap-1.5 text-danger"
          :disabled="working"
          @click="deleteAllBackups"
        >
          <Trash2 :size="16" /> 只刪除雲端備份
        </button>
        <button
          class="flex items-center gap-1.5 text-danger"
          :disabled="working"
          @click="wipeEverywhere"
        >
          <Trash2 :size="16" /> 清空所有資料（含其他裝置）
        </button>
      </div>
    </template>
  </div>
</template>
