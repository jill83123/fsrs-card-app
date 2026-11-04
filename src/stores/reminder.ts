import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { reminderSlots } from '@/lib/reminder'
import {
  currentSubscription,
  pushSupported,
  sendTestPush,
  subscribePush,
  unsubscribePush,
  uploadSlots,
} from '@/lib/push'
import { useData } from './data'
import { useSettings } from './settings'

/** After the last change, wait this long before telling the Worker (it counts KV writes). */
const UPLOAD_DELAY_MS = 60_000
/** Upload again at least this often so the Worker keeps the record and the week ahead stays planned. */
const REFRESH_MS = 12 * 60 * 60 * 1000

export const useReminder = defineStore('reminder', () => {
  const settings = useSettings()
  const data = useData()
  const busy = ref(false)
  const error = ref('')
  const supported = pushSupported()

  let lastSignature = ''
  let lastUpload = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  function slots() {
    const r = settings.synced.reminder
    return reminderSlots({
      now: Date.now(),
      time: r.time,
      review: r.review,
      learn: r.learn,
      rolloverHour: settings.synced.study.rolloverHour,
      newOrder: settings.synced.study.newOrder,
      nodes: data.nodes,
      cardsByDeck: data.cardsByDeck,
      limitsOf: data.limitsOf,
      doneToday: data.doneToday,
      sidesOf: data.sidesOf,
      paused: data.pausedIds,
    })
  }

  /** Send the reminders to the Worker unless nothing changed since the last time. */
  async function upload(force = false, keepalive = false) {
    clearTimeout(timer)
    if (!settings.device.reminder.enabled || !data.ready || !navigator.onLine) return
    const sub = await currentSubscription()
    if (!sub) return
    const planned = slots()
    const signature = JSON.stringify(planned)
    if (!force && signature === lastSignature && Date.now() - lastUpload < REFRESH_MS) return
    try {
      await uploadSlots(settings.device.sync.workerUrl, sub, planned, keepalive)
      lastSignature = signature
      lastUpload = Date.now()
      error.value = ''
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    }
  }

  function later() {
    clearTimeout(timer)
    timer = setTimeout(() => void upload().catch(() => {}), UPLOAD_DELAY_MS)
  }

  async function enable() {
    busy.value = true
    try {
      await subscribePush(settings.device.sync.workerUrl)
      settings.device.reminder.enabled = true
      settings.synced.reminder.used = true
      await upload(true)
    } catch (e) {
      settings.device.reminder.enabled = false
      await unsubscribePush(settings.device.sync.workerUrl).catch(() => {})
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      busy.value = false
    }
  }

  async function disable() {
    busy.value = true
    clearTimeout(timer)
    settings.device.reminder.enabled = false
    // turned off on purpose: no offer to turn it back on here
    settings.device.reminder.dismissed = true
    try {
      await unsubscribePush(settings.device.sync.workerUrl)
      error.value = ''
    } finally {
      busy.value = false
    }
  }

  /** Upload right away and ask the Worker to push a test notification. */
  async function test() {
    busy.value = true
    try {
      await upload(true)
      const sub = await currentSubscription()
      if (!sub) throw new Error('這台裝置沒有推播訂閱，請關閉再重新開啟提醒')
      await sendTestPush(settings.device.sync.workerUrl, sub)
    } finally {
      busy.value = false
    }
  }

  let started = false
  function init() {
    if (started || !supported) return
    started = true
    // reminders follow what is left to study, so any change replans them
    watch(
      [
        () => data.cards,
        () => data.nodes,
        () => data.doneToday,
        () => {
          const s = settings.synced.study
          return [s.rolloverHour, s.newPerDay, s.reviewPerDay, s.newOrder].join()
        },
        () => settings.synced.reminder.time,
        () => settings.synced.reminder.review,
        () => settings.synced.reminder.learn,
        () => settings.device.reminder.enabled,
      ],
      later,
    )
    document.addEventListener('visibilitychange', () => {
      // leaving the app is the moment the last study session is over: send at once
      if (document.visibilityState === 'hidden') void upload(false, true).catch(() => {})
      else later()
    })
    later()
  }

  return { supported, busy, error, init, enable, disable, test }
})
