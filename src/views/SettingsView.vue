<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Archive,
  BookOpen,
  BrainCircuit,
  ChevronRight,
  Cloud,
  Database,
  Download,
  GraduationCap,
  Info,
  Palette,
  RefreshCw,
  RotateCcw,
  Tags,
  Trash2,
  Upload,
  Volume2,
} from '@lucide/vue'
import PageHeader from '@/components/PageHeader.vue'
import PillTabs from '@/components/PillTabs.vue'
import ToggleSwitch from '@/components/ToggleSwitch.vue'
import NumberStepper from '@/components/NumberStepper.vue'
import SettingsSection from '@/components/settings/SettingsSection.vue'
import SettingRow from '@/components/settings/SettingRow.vue'
import PosSettings from '@/components/settings/PosSettings.vue'
import DictSettings from '@/components/settings/DictSettings.vue'
import TtsSettings from '@/components/settings/TtsSettings.vue'
import SyncSettings from '@/components/settings/SyncSettings.vue'
import ArchiveSettings from '@/components/settings/ArchiveSettings.vue'
import SelectBox from '@/components/SelectBox.vue'
import RangeSlider from '@/components/RangeSlider.vue'
import { PRIMARY_PRESETS, defaultSynced } from '@/db/defaults'
import { useSettings } from '@/stores/settings'
import { useData } from '@/stores/data'
import { useSync } from '@/stores/sync'
import { useUi } from '@/stores/ui'
import { usePwa } from '@/stores/pwa'
import { isValidSteps, retentionImpact } from '@/lib/fsrs'
import { formatHour } from '@/lib/date'
import { exportJson, importJson, wipeLocal } from '@/lib/backup'

const settings = useSettings()
const data = useData()
const sync = useSync()
const ui = useUi()
const pwa = usePwa()
const s = settings.synced

// --- study day -------------------------------------------------------------
const rolloverHour = computed({
  get: () => s.study.rolloverHour,
  set: async (h: number) => {
    const old = s.study.rolloverHour
    if (h === old) return
    s.study.rolloverHour = h
    await data.rebucketRecentLogs(old, h)
  },
})
async function resetStudy() {
  const old = s.study.rolloverHour
  settings.resetSynced('study')
  if (old !== s.study.rolloverHour) await data.rebucketRecentLogs(old, s.study.rolloverHour)
}

async function resetAll() {
  const ok = await ui.confirm('重置所有設定？', {
    message:
      '外觀、學習、FSRS、詞性、發音與字典設定都會回到預設值，自訂的詞性會保留。\n卡片、複習紀錄與 Google Drive 連線不受影響。',
    danger: true,
    confirmText: '全部重置',
  })
  if (!ok) return
  const old = s.study.rolloverHour
  settings.resetAll()
  if (old !== s.study.rolloverHour) await data.rebucketRecentLogs(old, s.study.rolloverHour)
  ui.toast('已重置所有設定', 'success')
}

// --- fsrs ------------------------------------------------------------------
const retentionPct = computed({
  get: () => Math.round(s.fsrs.retention * 100),
  set: (v: number) => (s.fsrs.retention = v / 100),
})
const RETENTION_TICKS = Array.from({ length: 30 }, (_, i) => 70 + i)
const impact = computed(() => retentionImpact(s.fsrs.retention))
// one short line per item
const impactLines = computed(() => {
  const r = retentionPct.value
  if (r === 90) return ['這是 FSRS 建議的預設值。', '在記憶效果與複習量之間取得平衡。']
  const i = impact.value
  const fmt = (x: number) => (x >= 10 ? x.toFixed(0) : x.toFixed(2).replace(/0$/, ''))
  if (r > 90)
    return [
      '記得更牢，但複習更頻繁：',
      `複習間隔約為 90% 時的 ${fmt(i.intervalRatio)} 倍`,
      `每日複習量約變成 ${fmt(i.workloadRatio)} 倍`,
      ...(r >= 97 ? ['超過 97% 時複習量會急遽上升，通常不建議。'] : []),
    ]
  return [
    '複習較少，但會忘得比較多：',
    `複習間隔約為 90% 時的 ${fmt(i.intervalRatio)} 倍`,
    `每日複習量約變成 ${fmt(i.workloadRatio)} 倍`,
    `約每 ${Math.round(100 / (100 - r))} 張忘 1 張`,
    ...(r < 80 ? ['低於 80% 時遺忘會明顯增加，通常不建議。'] : []),
  ]
})
const stepsOk = computed(() => isValidSteps(s.fsrs.learningSteps))
const relearnOk = computed(() => isValidSteps(s.fsrs.relearningSteps))

// --- data ------------------------------------------------------------------
const fileInput = ref<HTMLInputElement>()
async function onImport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  const ok = await ui.confirm('從檔案還原？', {
    message: '檔案中的資料會取代目前所有資料。\n若有連線雲端，也會同步覆蓋其他裝置。',
    danger: true,
    confirmText: '還原',
  })
  if (!ok) return
  try {
    const n = await importJson(file)
    await sync.reloadSettings()
    ui.toast(`已還原 ${n} 張卡片`, 'success')
  } catch (err) {
    ui.toast(err instanceof Error ? err.message : '匯入失敗', 'error')
  }
}

async function wipe() {
  const ok = await ui.confirm('清除這台裝置上的所有資料？', {
    message: sync.connected
      ? '包含牌組、卡片、複習紀錄與設定。\n雲端資料不會被刪除，重新整理後會再從雲端同步回來。\n想連雲端一起清除，請到「Google Drive 同步與備份」→「清除雲端與所有裝置的資料」。'
      : '包含牌組、卡片、複習紀錄與設定。\n此動作無法復原，建議先匯出備份。',
    danger: true,
    confirmText: '清除',
  })
  if (!ok) return
  await wipeLocal()
  localStorage.removeItem('sr.google.lastSync')
  location.reload()
}

// --- version ---------------------------------------------------------------
const appVersion = __APP_VERSION__
async function checkUpdate() {
  try {
    if (!(await pwa.checkNow())) ui.toast('已經是最新版本', 'success')
  } catch (err) {
    ui.toast(err instanceof Error ? err.message : '檢查更新失敗', 'error')
  }
}

const def = defaultSynced()
</script>

<template>
  <div>
    <PageHeader title="設定" hide-back />

    <div class="space-y-4">
      <!-- appearance -->
      <SettingsSection
        id="appearance"
        title="外觀"
        hint="主色、深色模式"
        :icon="Palette"
        resettable
        @reset="settings.resetSynced('appearance')"
      >
        <SettingRow label="主色" stacked>
          <div class="flex flex-wrap items-center gap-3">
            <button
              v-for="c in PRIMARY_PRESETS"
              :key="c"
              class="size-9 rounded-full ring-offset-2 ring-offset-surface transition"
              :class="s.appearance.primary.toLowerCase() === c ? 'ring-2 ring-ink' : ''"
              :style="{ background: c }"
              :aria-label="c"
              @click="s.appearance.primary = c"
            />
            <label
              class="relative flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)]"
              title="自訂顏色"
            >
              <input
                v-model="s.appearance.primary"
                type="color"
                class="absolute inset-0 opacity-0"
              />
            </label>
          </div>
        </SettingRow>
        <SettingRow label="深色模式" hint="也可以點首頁右上角的按鈕切換" stacked>
          <PillTabs
            v-model="s.appearance.theme"
            size="sm"
            :options="[
              { value: 'system', label: '跟隨系統' },
              { value: 'light', label: '淺色' },
              { value: 'dark', label: '深色' },
            ]"
          />
        </SettingRow>
      </SettingsSection>

      <!-- study -->
      <SettingsSection
        id="study"
        title="學習"
        hint="換日時間、每日上限、新卡順序"
        :icon="GraduationCap"
        resettable
        @reset="resetStudy"
      >
        <SettingRow
          label="換日時間"
          :hint="[
            '這個時間之前的複習，會算在前一天。',
            `例如設 ${formatHour(s.study.rolloverHour)}，凌晨 ${formatHour(Math.max(0, s.study.rolloverHour - 1))} 的複習會記在前一個學習日。`,
            '修改時只會重新歸類前一天與今天的紀錄。',
          ]"
          stacked
        >
          <SelectBox v-model.number="rolloverHour">
            <option v-for="h in 13" :key="h" :value="h - 1">
              {{ formatHour(h - 1) }}{{ h - 1 === def.study.rolloverHour ? '（預設）' : '' }}
            </option>
          </SelectBox>
        </SettingRow>
        <SettingRow label="每日新卡上限" :hint="`預設 ${def.study.newPerDay}，牌組可以個別覆寫`">
          <NumberStepper v-model="s.study.newPerDay" :max="9999" />
        </SettingRow>
        <SettingRow
          label="每日複習上限"
          :hint="`預設 ${def.study.reviewPerDay}，學習中的卡片不受限制`"
        >
          <NumberStepper v-model="s.study.reviewPerDay" :max="99999" :step="10" />
        </SettingRow>
        <SettingRow label="新卡順序" stacked>
          <PillTabs
            v-model="s.study.newOrder"
            size="sm"
            :options="[
              { value: 'created', label: '依建立順序' },
              { value: 'random', label: '隨機' },
            ]"
          />
        </SettingRow>
      </SettingsSection>

      <!-- fsrs -->
      <SettingsSection
        id="fsrs"
        title="FSRS 排程"
        hint="目標熟悉度、間隔與學習步驟"
        :icon="BrainCircuit"
        resettable
        @reset="settings.resetSynced('fsrs')"
      >
        <SettingRow :label="`目標熟悉度 ${retentionPct}%`" stacked>
          <RangeSlider
            v-model="retentionPct"
            :min="70"
            :max="99"
            :step="1"
            :ticks="RETENTION_TICKS"
            :labels="[
              { value: 70, label: '70%' },
              { value: 80, label: '80%' },
              { value: 90, label: '90%（預設）' },
              { value: 99, label: '99%' },
            ]"
          />
          <div class="space-y-0.5 rounded-2xl bg-primary-soft px-4 py-3 text-sm">
            <p v-for="line in impactLines" :key="line">{{ line }}</p>
          </div>
        </SettingRow>
        <SettingRow label="最大間隔（天）" :hint="`預設 ${def.fsrs.maximumInterval}`">
          <NumberStepper v-model="s.fsrs.maximumInterval" :min="1" :max="36500" :step="30" />
        </SettingRow>
        <SettingRow label="間隔隨機化（fuzz）" hint="讓同一天學的卡片之後不會擠在同一天到期">
          <ToggleSwitch v-model="s.fsrs.enableFuzz" />
        </SettingRow>
        <details class="group" :open="!stepsOk || !relearnOk || undefined">
          <summary
            class="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-muted [&::-webkit-details-marker]:hidden"
          >
            <ChevronRight :size="16" class="transition-transform group-open:rotate-90" />
            進階
          </summary>
          <div class="mt-4 space-y-5">
            <div class="space-y-0.5 text-xs text-muted">
              <p>學習步驟是同一天內的短期練習。</p>
              <p>新卡或忘記的卡片，會在設定的時間後再出現一次。</p>
              <p>走完步驟後，才交給 FSRS 以「天」為單位排程。</p>
              <p>留空表示不做當天的短期複習。</p>
            </div>
            <SettingRow
              label="學習步驟"
              :hint="[
                '新卡的短期間隔，用空白分隔，例如「1m 10m」。',
                `m 分、h 時、d 天。預設 ${def.fsrs.learningSteps}`,
              ]"
              stacked
            >
              <input
                v-model="s.fsrs.learningSteps"
                class="input"
                :class="{ 'border-danger!': !stepsOk }"
              />
            </SettingRow>
            <SettingRow
              label="重新學習步驟"
              :hint="`忘記後的短期間隔。預設 ${def.fsrs.relearningSteps}`"
              stacked
            >
              <input
                v-model="s.fsrs.relearningSteps"
                class="input"
                :class="{ 'border-danger!': !relearnOk }"
              />
            </SettingRow>
          </div>
        </details>
      </SettingsSection>

      <SettingsSection
        id="pos"
        title="詞性選項"
        hint="英文、日文、韓文的詞性清單"
        :icon="Tags"
        resettable
        @reset="settings.resetPos()"
      >
        <PosSettings />
      </SettingsSection>

      <SettingsSection
        id="tts"
        title="發音（TTS）"
        hint="各語言的聲音與速度"
        :icon="Volume2"
        resettable
        @reset="settings.resetDevice('tts')"
      >
        <TtsSettings />
      </SettingsSection>

      <SettingsSection
        id="dict"
        title="字典"
        hint="查詢用的字典網址"
        :icon="BookOpen"
        resettable
        @reset="settings.resetSynced('dictionaries')"
      >
        <DictSettings />
      </SettingsSection>

      <SettingsSection
        id="sync"
        title="Google Drive 同步與備份"
        hint="多裝置同步、雲端備份與還原"
        :icon="Cloud"
      >
        <SyncSettings />
      </SettingsSection>

      <SettingsSection
        id="archive"
        title="封存與最近刪除"
        hint="還原封存或刪除的牌組"
        :icon="Archive"
      >
        <ArchiveSettings />
      </SettingsSection>

      <SettingsSection id="data" title="資料" hint="匯出、匯入與清除資料" :icon="Database">
        <div class="grid grid-cols-2 gap-2">
          <button class="btn btn-ghost" @click="exportJson">
            <Download :size="16" /> 匯出 JSON
          </button>
          <button class="btn btn-ghost" @click="fileInput?.click()">
            <Upload :size="16" /> 從 JSON 還原
          </button>
        </div>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          class="hidden"
          @change="onImport"
        />
        <button class="flex items-center gap-1.5 text-sm text-danger" @click="wipe">
          <Trash2 :size="16" /> 清除這台裝置的所有資料
        </button>
      </SettingsSection>

      <SettingsSection id="about" title="版本與更新" :hint="appVersion" :icon="Info">
        <div class="flex items-center justify-between gap-3">
          <p class="text-xs text-muted">
            {{
              pwa.needRefresh
                ? '新版本已下載，重新整理後就會套用。'
                : 'App 會在開啟時與每小時自動檢查，有新版本時下方會出現提示。'
            }}
          </p>
          <button
            v-if="pwa.needRefresh"
            class="btn btn-primary shrink-0 py-2"
            @click="pwa.update()"
          >
            <RefreshCw :size="16" /> 更新到新版本
          </button>
          <button
            v-else
            class="btn btn-soft shrink-0 py-2"
            :disabled="pwa.checking"
            @click="checkUpdate"
          >
            <RefreshCw :size="16" :class="{ 'animate-spin': pwa.checking }" />
            {{ pwa.checking ? '檢查中…' : '檢查更新' }}
          </button>
        </div>
      </SettingsSection>

      <button class="btn btn-ghost w-full text-danger" @click="resetAll">
        <RotateCcw :size="16" /> 重置所有設定
      </button>
    </div>
  </div>
</template>
