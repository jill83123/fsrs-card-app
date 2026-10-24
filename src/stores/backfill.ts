import { defineStore } from 'pinia'
import { ref } from 'vue'
import { backfillSpeech, unusedSpeech } from '@/lib/tts'
import { deleteAudio } from '@/lib/tts/audioCache'
import { useData } from './data'
import { useSettings } from './settings'
import { useUi } from './ui'

/**
 * Makes the clips that this device is missing for every vocab card. It lives in a store
 * (not in the settings page), so it keeps going while the app is open and the user moves
 * to other pages; it stops when the app is closed or suspended.
 */
export type BackfillKind = 'words' | 'examples'

export const useBackfill = defineStore('backfill', () => {
  const data = useData()
  const settings = useSettings()
  const ui = useUi()
  // words and examples run on their own, so one can be started or stopped without the other
  const progress = ref<Record<BackfillKind, { done: number; total: number } | null>>({
    words: null,
    examples: null,
  })
  const aborts: Partial<Record<BackfillKind, AbortController>> = {}
  const label = { words: '單字', examples: '例句' }

  const itemsOf = (kind: BackfillKind) =>
    data.cards.flatMap((c) => {
      if (c.type !== 'vocab') return []
      if (kind === 'words') return [{ text: c.word, lang: c.lang, reading: c.reading }]
      return c.examples.map((e) => ({ text: e.sentence, lang: c.lang }))
    })

  /** Stored clips that no current word or example needs with the current voice settings. */
  const findUnused = () =>
    unusedSpeech([...itemsOf('words'), ...itemsOf('examples')], (l) => settings.device.tts[l])
  const removeUnused = deleteAudio

  async function start(kind: BackfillKind) {
    if (aborts[kind]) return
    const abort = (aborts[kind] = new AbortController())
    const { signal } = abort
    progress.value[kind] = { done: 0, total: 0 }
    try {
      const done = await backfillSpeech(
        itemsOf(kind),
        (l) => settings.device.tts[l],
        (d, t) => (progress.value[kind] = { done: d, total: t }),
        signal,
      )
      ui.toast(
        signal.aborted
          ? `已停止${label[kind]}（完成 ${done} 個）`
          : `${label[kind]}完成，新產生 ${done} 個發音`,
        'success',
      )
    } catch (e) {
      ui.toast(`補齊失敗：${e instanceof Error ? e.message : e}`, 'error')
    } finally {
      progress.value[kind] = null
      delete aborts[kind]
    }
  }

  const stop = (kind: BackfillKind) => aborts[kind]?.abort()

  return { progress, start, stop, findUnused, removeUnused }
})
