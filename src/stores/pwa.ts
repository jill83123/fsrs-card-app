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

  // --- install to home screen ------------------------------------------------
  // Chromium fires beforeinstallprompt once the app is installable; keep it so the
  // settings page can trigger the prompt. iOS Safari never fires it (manual steps only).
  interface InstallPromptEvent extends Event {
    prompt(): Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
  let deferredPrompt: InstallPromptEvent | null = null
  const canInstall = ref(false)
  const standaloneQuery = window.matchMedia('(display-mode: standalone)')
  const installed = ref(
    standaloneQuery.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
  )
  standaloneQuery.addEventListener('change', (e) => (installed.value = e.matches))
  const isIos =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as InstallPromptEvent
    canInstall.value = true
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    canInstall.value = false
    installed.value = true
  })

  /** Show the browser's install dialog. Resolves true when the user accepted. */
  async function install(): Promise<boolean> {
    const p = deferredPrompt
    if (!p) return false
    deferredPrompt = null
    canInstall.value = false
    await p.prompt()
    return (await p.userChoice).outcome === 'accepted'
  }

  return {
    needRefresh,
    checking,
    checkNow,
    update: () => updateServiceWorker(true),
    canInstall,
    installed,
    isIos,
    install,
  }
})
