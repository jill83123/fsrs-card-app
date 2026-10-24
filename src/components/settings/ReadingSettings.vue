<script setup lang="ts">
import { computed, ref } from 'vue'
import PillTabs from '../PillTabs.vue'
import SettingRow from './SettingRow.vue'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { generateReading } from '@/lib/tts/autoReading'

const data = useData()
const settings = useSettings()
const ui = useUi()

const style = computed(() => settings.synced.reading.enStyle)
const english = computed(() => data.cards.filter((c) => c.type === 'vocab' && c.lang === 'en'))
const missing = computed(() => english.value.filter((c) => c.type === 'vocab' && !c.reading.trim()))

const progress = ref<{ done: number; total: number } | null>(null)

/** Write the reading of each card: generated again, or emptied when `clear`. */
async function rewrite(targets: typeof english.value, clear = false) {
  progress.value = { done: 0, total: targets.length }
  let ok = 0
  for (const c of targets) {
    if (c.type === 'vocab') {
      const r = clear ? '' : await generateReading(c.word, c.lang, style.value).catch(() => null)
      if (r !== null) {
        await data.saveCard({ ...c, reading: r })
        ok++
      }
    }
    progress.value = { done: progress.value.done + 1, total: targets.length }
  }
  progress.value = null
  return ok
}

async function fillMissing() {
  if (!missing.value.length) return ui.toast('沒有缺少讀音的英文單字')
  const ok = await rewrite(missing.value)
  ui.toast(`已補上 ${ok} / ${missing.value.length} 個讀音`, ok ? 'success' : 'error')
}

async function regenerateAll() {
  if (!english.value.length) return ui.toast('沒有英文單字')
  const yes = await ui.confirm(`重新生成 ${english.value.length} 個英文單字的讀音？`, {
    message: '現有的讀音（包含手動輸入的）都會被取代。',
    danger: true,
    confirmText: '重新生成',
  })
  if (!yes) return
  const ok = await rewrite(english.value)
  ui.toast(`已重新生成 ${ok} 個讀音`, 'success')
}

async function clearAll() {
  const filled = english.value.filter((c) => c.type === 'vocab' && c.reading.trim())
  if (!filled.length) return ui.toast('沒有英文讀音可清除')
  const yes = await ui.confirm(`清除 ${filled.length} 個英文單字的讀音？`, {
    message: '包含手動輸入的讀音。之後發音會直接讀單字。',
    danger: true,
    confirmText: '清除',
  })
  if (!yes) return
  const ok = await rewrite(filled, true)
  ui.toast(`已清除 ${ok} 個讀音`, 'success')
}
</script>

<template>
  <div class="space-y-5">
    <SettingRow
      label="英文讀音格式"
      :hint="['自動產生讀音時使用。', 'KK 音標是台灣字典常用的 [ ] 標示，IPA 是國際音標 / /。']"
      stacked
    >
      <PillTabs
        v-model="settings.synced.reading.enStyle"
        :options="[
          { value: 'ipa', label: 'IPA' },
          { value: 'kk', label: 'KK 音標' },
        ]"
      />
    </SettingRow>

    <SettingRow
      label="批次處理英文單字"
      hint="已有的讀音不會自動改成新格式，需要的話請重新生成。"
      stacked
    >
      <div v-if="progress" class="text-sm text-muted">
        處理中 {{ progress.done }} / {{ progress.total }}
      </div>
      <div v-else class="grid grid-cols-3 gap-2">
        <button class="btn btn-soft btn-sm" @click="fillMissing">補上缺少的</button>
        <button class="btn btn-soft btn-sm" @click="regenerateAll">全部重新生成</button>
        <button class="btn btn-ghost btn-sm text-danger" @click="clearAll">全部清除</button>
      </div>
    </SettingRow>
  </div>
</template>
