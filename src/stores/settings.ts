import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { DEFAULT_POS, defaultDevice, defaultSynced, isDefaultPos } from '@/db/defaults'
import type { DeviceSettings, Lang, PosOption, SyncedSettings } from '@/db/types'
import { getMeta, markLocalChange, setMeta } from '@/db'
import { setKokoroBackend } from '@/lib/tts'
import { KOKORO_VOICES } from '@/lib/tts/kokoro'
import { ESPEAK_VOICES } from '@/lib/tts/espeakPiper'

const DEVICE_KEY = 'sr.device'
export const SETTINGS_META_KEY = 'settings'

/** Fill in keys missing from stored settings (forward compatibility). */
function mergeDefaults<T>(def: T, val: unknown): T {
  if (Array.isArray(def)) return (Array.isArray(val) ? val : def) as T
  if (def && typeof def === 'object') {
    const out: Record<string, unknown> = {}
    const v = (val && typeof val === 'object' ? val : {}) as Record<string, unknown>
    for (const k of Object.keys(def)) {
      out[k] = mergeDefaults((def as Record<string, unknown>)[k], v[k])
    }
    return out as T
  }
  return (val === undefined || val === null || typeof val !== typeof def ? def : val) as T
}

/**
 * Default parts of speech can only be hidden, never removed, so any default missing from
 * a saved list is one added in a newer version: append it, keeping the user's own edits.
 */
function withDefaultPos(pos: Record<Lang, PosOption[]>) {
  for (const lang of Object.keys(DEFAULT_POS) as Lang[]) {
    const list = pos[lang]
    for (const d of DEFAULT_POS[lang]) {
      if (!list.some((o) => o.id === d.id)) list.push({ ...d })
    }
  }
  return pos
}

/** Defaults back to their original label, order and visibility; custom options are kept. */
function resetPosList(pos: Record<Lang, PosOption[]>) {
  const out = structuredClone(DEFAULT_POS)
  for (const lang of Object.keys(out) as Lang[]) {
    out[lang].push(...pos[lang].filter((o) => !isDefaultPos(o.id)))
  }
  return out
}

const TTS_VERSION_KEY = 'sr.ttsVersion'
const TTS_VERSION = 3

export const useSettings = defineStore('settings', () => {
  const synced = reactive<SyncedSettings>(defaultSynced())
  const device = reactive<DeviceSettings>(defaultDevice())
  const systemDark = ref(window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
  let loading = true

  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    systemDark.value = e.matches
  })

  /** One-time moves to new default voices for settings saved by older versions. */
  function migrateTts() {
    const def = defaultDevice().tts
    // a saved voice that no longer exists for its language falls back to the default
    // (e.g. the English Piper voices, replaced by Kokoro)
    for (const lang of ['en', 'ja', 'ko'] as const) {
      const id = device.tts[lang].piperModel
      if (![...KOKORO_VOICES, ...ESPEAK_VOICES].some((v) => v.id === id && v.lang === lang))
        device.tts[lang].piperModel = def[lang].piperModel
    }
    const version = Number(localStorage.getItem(TTS_VERSION_KEY) ?? 1)
    if (version < 2) {
      // English moved from the Japanese piper-plus voices to an American voice
      if (['tsukuyomi', 'css10'].includes(device.tts.en.piperModel)) {
        device.tts.en.piperModel = def.en.piperModel
      }
    }
    if (version < 3) {
      // Japanese moved from piper-plus' former default voice to Kokoro
      if (device.tts.ja.piperModel === 'tsukuyomi') device.tts.ja.piperModel = def.ja.piperModel
    }
    localStorage.setItem(TTS_VERSION_KEY, String(TTS_VERSION))
  }

  async function load() {
    loading = true
    const rec = await getMeta<SyncedSettings>(SETTINGS_META_KEY)
    Object.assign(synced, mergeDefaults(defaultSynced(), rec?.value))
    withDefaultPos(synced.pos)
    try {
      const raw = localStorage.getItem(DEVICE_KEY)
      if (raw) Object.assign(device, mergeDefaults(defaultDevice(), JSON.parse(raw)))
      migrateTts()
      // an empty Client ID saved before one was built in should still pick up the default
      if (!device.sync.clientId.trim()) device.sync.clientId = defaultDevice().sync.clientId
    } catch {
      /* ignore broken storage */
    }
    // let watchers flush before we start persisting again
    await Promise.resolve()
    loading = false
  }

  /** Replace synced settings with a version that came from sync / restore. */
  async function applyRemote(value: SyncedSettings) {
    loading = true
    Object.assign(synced, mergeDefaults(defaultSynced(), value))
    withDefaultPos(synced.pos)
    await Promise.resolve()
    loading = false
  }

  let saveTimer: ReturnType<typeof setTimeout> | undefined
  watch(
    synced,
    () => {
      if (loading) return
      clearTimeout(saveTimer)
      saveTimer = setTimeout(async () => {
        await setMeta(SETTINGS_META_KEY, JSON.parse(JSON.stringify(synced)))
        markLocalChange()
      }, 300)
    },
    { deep: true },
  )

  watch(
    device,
    () => {
      try {
        localStorage.setItem(DEVICE_KEY, JSON.stringify(device))
      } catch {
        /* ignore */
      }
    },
    { deep: true },
  )

  watch(() => device.tts.kokoroBackend, setKokoroBackend, { immediate: true })

  const isDark = computed(() =>
    synced.appearance.theme === 'system' ? systemDark.value : synced.appearance.theme === 'dark',
  )

  function toggleDark() {
    synced.appearance.theme = isDark.value ? 'light' : 'dark'
  }

  function resetSynced<K extends keyof SyncedSettings>(key: K) {
    synced[key] = defaultSynced()[key]
  }

  function resetDevice<K extends keyof DeviceSettings>(key: K) {
    device[key] = defaultDevice()[key]
  }

  /** Every settings group back to defaults; the Google connection (sync) is kept. */
  function resetPos() {
    synced.pos = resetPosList(synced.pos)
  }

  function resetAll() {
    Object.assign(synced, { ...defaultSynced(), pos: resetPosList(synced.pos) })
    resetDevice('tts')
  }

  // apply theme to the document
  watch(
    [() => synced.appearance.primary, isDark],
    ([primary, dark]) => {
      const root = document.documentElement
      root.style.setProperty('--primary', primary)
      root.classList.toggle('dark', dark)
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#2b2b2b' : '#eeedea')
    },
    { immediate: true },
  )

  return {
    synced,
    device,
    isDark,
    load,
    applyRemote,
    toggleDark,
    resetSynced,
    resetDevice,
    resetPos,
    resetAll,
  }
})
