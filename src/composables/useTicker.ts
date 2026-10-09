import { onScopeDispose, ref } from 'vue'

// one shared one-second clock for every countdown on screen
const now = ref(Date.now())
let users = 0
let timer: ReturnType<typeof setInterval> | undefined

export function useTicker() {
  if (users++ === 0) {
    now.value = Date.now()
    timer = setInterval(() => (now.value = Date.now()), 1000)
  }
  onScopeDispose(() => {
    if (--users === 0) clearInterval(timer)
  })
  return now
}
