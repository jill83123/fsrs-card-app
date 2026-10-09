<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { Download, Play } from '@lucide/vue'
import PillTabs from '../PillTabs.vue'
import ToggleSwitch from '../ToggleSwitch.vue'
import SettingRow from './SettingRow.vue'
import SelectBox from '../SelectBox.vue'
import RangeSlider from '../RangeSlider.vue'
import { LANGS } from '@/db/defaults'
import type { Lang } from '@/db/types'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { onVoicesChanged, playClip, speak, systemVoices, ttsError } from '@/lib/tts'
import { SAMPLE_TEXT, sampleUrl } from '@/lib/tts/samples'
import {
  isKokoroLoaded,
  isKokoroVoice,
  KOKORO_SIZE_MB,
  KOKORO_VOICES,
  loadKokoro,
  onKokoroProgress,
  webgpuAvailable,
} from '@/lib/tts/kokoro'
import { clearAudioCache } from '@/lib/tts/audioCache'
import {
  clearEspeakCache,
  ESPEAK_VOICES,
  isEspeakVoiceLoaded,
  loadEspeakVoice,
  onEspeakProgress,
} from '@/lib/tts/espeakPiper'

const settings = useSettings()
const ui = useUi()
const lang = ref<Lang>('en')
const cfg = computed(() => settings.device.tts[lang.value])

const voicesTick = ref(0)
const offVoices = onVoicesChanged(() => voicesTick.value++)
const voices = computed(() => {
  void voicesTick.value
  return systemVoices(lang.value)
})

// en / ja: Kokoro · ko: original Piper (espeak-ng)
const modelOptions = computed(() =>
  [...KOKORO_VOICES, ...ESPEAK_VOICES].filter((v) => v.lang === lang.value),
)
const usesKokoro = computed(() => isKokoroVoice(cfg.value.piperModel))
const hasWebgpu = ref(false)
void webgpuAvailable().then((v) => (hasWebgpu.value = v))
const isLoaded = computed(() =>
  usesKokoro.value
    ? isKokoroLoaded(settings.device.tts.kokoroBackend)
    : isEspeakVoiceLoaded(cfg.value.piperModel),
)

const progress = ref<string | null>(null)
const loading = ref(false)
const showBytes = (p: { loaded: number; total: number }) => {
  progress.value = p.total
    ? `${Math.round((p.loaded / p.total) * 100)}% · ${(p.loaded / 1e6).toFixed(1)} / ${(p.total / 1e6).toFixed(1)} MB`
    : `${(p.loaded / 1e6).toFixed(1)} MB`
}
const offEspeak = onEspeakProgress((_v, p) => showBytes(p))
const offKokoro = onKokoroProgress(showBytes)
onBeforeUnmount(() => {
  offVoices()
  offEspeak()
  offKokoro()
})

async function preload() {
  loading.value = true
  progress.value = null
  try {
    if (usesKokoro.value) await loadKokoro(settings.device.tts.kokoroBackend, cfg.value.piperModel)
    else await loadEspeakVoice(cfg.value.piperModel)
    ui.toast('模型已就緒', 'success')
  } catch (e) {
    ui.toast(`載入失敗：${e instanceof Error ? e.message : e}`, 'error')
  } finally {
    loading.value = false
  }
}

async function test() {
  // neural voices: play the bundled recording so there is no model download / synthesis wait
  if (cfg.value.engine === 'piper') {
    try {
      await playClip(sampleUrl(cfg.value.piperModel), cfg.value.rate)
      return
    } catch {
      /* no recording (or offline) — synthesise it live below */
    }
  }
  await speak(SAMPLE_TEXT[lang.value], lang.value, cfg.value)
  if (ttsError.value) ui.toast(ttsError.value, 'error')
}

async function clearCache() {
  if (
    !(await ui.confirm('清除已下載的語音模型與發音快取？', {
      message: '下次播放時需要重新下載模型並重新合成。',
    }))
  )
    return
  await Promise.all([clearEspeakCache(), clearAudioCache()])
  ui.toast('已清除', 'success')
}
</script>

<template>
  <div class="space-y-5">
    <PillTabs
      v-model="lang"
      size="sm"
      :options="LANGS.map((l) => ({ value: l.id, label: l.label }))"
    />

    <SettingRow label="發音引擎" stacked>
      <PillTabs
        v-model="cfg.engine"
        size="sm"
        :options="[
          {
            value: 'piper',
            label: lang === 'ko' ? 'Piper（高品質）' : 'Kokoro（高品質）',
          },
          { value: 'system', label: '系統語音' },
        ]"
      />
    </SettingRow>

    <template v-if="cfg.engine === 'piper'">
      <SettingRow label="人聲（模型）" stacked>
        <SelectBox v-model="cfg.piperModel">
          <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.label }}</option>
        </SelectBox>
      </SettingRow>
      <SettingRow
        v-if="usesKokoro"
        label="Kokoro 執行方式"
        :hint="
          hasWebgpu
            ? '這台裝置支援 WebGPU，可以選擇高速模式。'
            : '這台裝置不支援 WebGPU，只能使用標準模式。'
        "
        stacked
      >
        <PillTabs
          v-model="settings.device.tts.kokoroBackend"
          size="sm"
          :options="[
            { value: 'wasm', label: `標準（${KOKORO_SIZE_MB.wasm}MB，較慢）` },
            ...(hasWebgpu
              ? [{ value: 'webgpu' as const, label: `高速（${KOKORO_SIZE_MB.webgpu}MB，WebGPU）` }]
              : []),
          ]"
        />
      </SettingRow>
      <div class="space-y-0.5 rounded-2xl bg-surface-2 p-3 text-xs text-muted">
        <template v-if="usesKokoro">
          <template v-if="lang === 'ja'">
            <p>使用 Kokoro-82M（Apache-2.0），日文發音以 kuromoji 斷詞後轉成 Kokoro 的音素。</p>
            <p>
              第一次使用需下載模型約
              {{ KOKORO_SIZE_MB[settings.device.tts.kokoroBackend] }}MB＋日文辭典約 17MB。
            </p>
          </template>
          <template v-else>
            <p>使用 Kokoro-82M（Apache-2.0）。</p>
            <p>英文發音先查 misaki 發音字典（約 18 萬字），查不到的字才交給 espeak-ng 推測。</p>
            <p>
              第一次使用需下載模型約
              {{ KOKORO_SIZE_MB[settings.device.tts.kokoroBackend] }}MB＋發音字典約 1.5MB。
            </p>
            <p>日文也用 Kokoro 時，模型只需下載一次。</p>
          </template>
          <p>合成過的發音會保存，同一個字只產生一次；卡片出現時也會先在背景準備好。</p>
        </template>
        <template v-else>
          <p>Piper 官方聲音，搭配 espeak-ng 轉換發音。</p>
          <p>第一次使用需下載約 81MB（espeak-ng 約 18MB＋聲音模型約 63MB）。</p>
          <p>之後會快取在瀏覽器中，可離線使用。</p>
          <p>KSS 語料的授權為 CC BY-NC-SA 4.0，僅限非商業用途。</p>
        </template>
        <p>載入失敗或模型不支援這個語言時，會自動改用系統語音。</p>
        <div class="mt-2 flex items-center gap-2">
          <button class="btn btn-soft py-1.5 text-xs" :disabled="loading" @click="preload">
            <Download :size="14" /> {{ isLoaded ? '重新檢查' : '預先下載' }}
          </button>
          <span v-if="loading && progress" class="truncate">{{ progress }}</span>
        </div>
      </div>
    </template>

    <SettingRow :label="cfg.engine === 'piper' ? '備用系統語音' : '系統語音'" stacked>
      <SelectBox v-model="cfg.systemVoice">
        <option value="">預設</option>
        <option v-for="v in voices" :key="v.voiceURI" :value="v.voiceURI">
          {{ v.name }}（{{ v.lang }}）
        </option>
      </SelectBox>
      <p v-if="!voices.length" class="text-xs text-muted">這台裝置沒有找到此語言的系統語音。</p>
    </SettingRow>

    <SettingRow :label="`速度 ${cfg.rate.toFixed(2)}×`" stacked>
      <RangeSlider
        v-model="cfg.rate"
        :min="0.5"
        :max="2"
        :step="0.05"
        :ticks="[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]"
        :labels="[
          { value: 0.5, label: '0.5×' },
          { value: 1, label: '1×' },
          { value: 1.5, label: '1.5×' },
          { value: 2, label: '2×' },
        ]"
      />
    </SettingRow>

    <button class="btn btn-ghost w-full" @click="test">
      <Play :size="16" /> 試聽：{{ SAMPLE_TEXT[lang] }}
    </button>
    <p v-if="cfg.engine === 'piper'" class="-mt-3 text-center text-xs text-muted">
      試聽播放的是預先錄好的範例，不需要下載模型。
    </p>

    <hr class="border-line" />

    <SettingRow label="自動朗讀單字" hint="單字卡出現時自動播放發音">
      <ToggleSwitch v-model="settings.device.tts.autoPlay" />
    </SettingRow>
    <button class="text-xs text-muted underline" @click="clearCache">
      清除已下載的語音模型與發音快取
    </button>
    <p class="text-xs text-muted">發音設定只存在這台裝置，不會同步。</p>
  </div>
</template>
