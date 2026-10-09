import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'

// Browsers only look for a new service worker on navigation, and an installed app is
// often just resumed, so also check when it comes back to the foreground and hourly.
const UPDATE_CHECK_MS = 60 * 60 * 1000

export const usePwa = defineStore('pwa', () => {
  let registration: ServiceWorkerRegistration | undefined
  const checking = ref(false)

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return
      registration = reg
      const check = () => {
        if (navigator.onLine && !reg.installing) void reg.update().catch(() => {})
      }
      setInterval(check, UPDATE_CHECK_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })

  /** Ask the server for a newer version now. Resolves true when one is ready to install. */
  async function checkNow(): Promise<boolean> {
    const reg = registration
    if (!reg) throw new Error('目前無法檢查更新（開發模式或瀏覽器不支援）')
    if (!navigator.onLine) throw new Error('目前離線，無法檢查更新')
    checking.value = true
    try {
      await reg.update()
      // a new version is downloaded first; wait until it is installed and waiting
      const sw = reg.installing
      if (sw)
        await new Promise<void>((resolve) => {
          const done = () => {
            if (sw.state === 'installed' || sw.state === 'redundant') resolve()
          }
          sw.addEventListener('statechange', done)
          done()
        })
      // with no controller this is the very first install, which activates by itself
      if (reg.waiting && navigator.serviceWorker.controller) needRefresh.value = true
      return needRefresh.value
    } finally {
      checking.value = false
    }
  }

  return { needRefresh, checking, checkNow, update: () => updateServiceWorker(true) }
})
