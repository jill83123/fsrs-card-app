import { defineStore } from 'pinia'
import { ref } from 'vue'
import { backfillSpeech } from '@/lib/tts'
import { useData } from './data'
import { useSettings } from './settings'
import { useUi } from './ui'

/**
 * Makes the clips that this device is missing for every vocab card. It lives in a store
 * (not in the settings page), so it keeps going while the app is open and the user moves
 * to other pages; it stops when the app is closed or suspended.
 */
export const useBackfill = defineStore('backfill', () => {
  const data = useData()
  const settings = useSettings()
  const ui = useUi()
  const progress = ref<{ done: number; total: number } | null>(null)
  let abort: AbortController | null = null

  async function start() {
    if (abort) return
    abort = new AbortController()
    const { signal } = abort
    progress.value = { done: 0, total: 0 }
    try {
      const items = data.cards.flatMap((c) =>
        c.type === 'vocab' ? [{ text: c.word, lang: c.lang, reading: c.reading }] : [],
      )
      const done = await backfillSpeech(
        items,
        (l) => settings.device.tts[l],
        (d, t) => (progress.value = { done: d, total: t }),
        signal,
      )
      ui.toast(
        signal.aborted ? `已停止（完成 ${done} 個）` : `完成，新產生 ${done} 個發音`,
        'success',
      )
    } catch (e) {
      ui.toast(`補齊失敗：${e instanceof Error ? e.message : e}`, 'error')
    } finally {
      progress.value = null
      abort = null
    }
  }

  const stop = () => abort?.abort()

  return { progress, start, stop }
})
