<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BookOpen, Hourglass, Pause, Pencil, PartyPopper, Star, Undo2, X } from '@lucide/vue'
import CardFace from '@/components/CardFace.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import DictLinks from '@/components/DictLinks.vue'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { useSync } from '@/stores/sync'
import { useUi } from '@/stores/ui'
import { GRADES, previewIntervals, State, type Grade } from '@/lib/fsrs'
import { formatCountdown, formatInterval } from '@/lib/date'
import { useTicker } from '@/composables/useTicker'
import { isStudyable, parseKey, schedOf, sideKey } from '@/lib/cards'
import { pickedDecks } from '@/lib/tree'
import { prefetchSpeech, stopSpeaking } from '@/lib/tts'
import {
  buildSession,
  dropSession,
  getSession,
  pickNext,
  putSession,
  remaining,
  snapshotOf,
  type StudyMode,
  type StudySession,
} from '@/lib/session'

const route = useRoute()
const router = useRouter()
const data = useData()
const settings = useSettings()
const sync = useSync()
const ui = useUi()

const mode = computed(() => route.params.mode as StudyMode)
const scope = computed(() => (route.query.scope ? String(route.query.scope) : null))
const title = computed(() => (mode.value === 'review' ? '複習' : '新學習'))
const decks = computed(() => pickedDecks(route.query.decks, data.nodes, scope.value))
const scopeName = computed(() => {
  const name = scope.value ? data.nodeById.get(scope.value)?.name : '全部牌組'
  return decks.value ? `${name}（已選 ${decks.value.length} 個牌組）` : name
})

const session = ref<StudySession | null>(null)
const revealed = ref(false)
const waitUntil = ref<number | null>(null)
const finished = ref(false)
const busy = ref(false)

const currentKey = computed(() => (session.value?.current ? parseKey(session.value.current) : null))
const current = computed(() =>
  currentKey.value ? data.cardById.get(currentKey.value.id) : undefined,
)
const reverse = computed(() => currentKey.value?.side === 'r')
const intervals = computed(() =>
  current.value && currentKey.value
    ? previewIntervals(data.scheduler, schedOf(current.value, currentKey.value.side), data.now)
    : null,
)
const left = computed(() => (session.value ? remaining(session.value) : 0))
const progress = computed(() => {
  const s = session.value
  if (!s) return 0
  const total = s.done + remaining(s)
  return total ? s.done / total : 1
})

function start() {
  const key = `${mode.value}:${scope.value ?? '*'}:${decks.value?.join(',') ?? ''}:${data.today}`
  let s = getSession(key)
  if (!s || (!remaining(s) && !s.history.length)) {
    s = buildSession(key, {
      mode: mode.value,
      scope: scope.value,
      decks: decks.value,
      nodes: data.nodes,
      cardsByDeck: data.cardsByDeck,
      dayEnd: data.dayEnd,
      limitsOf: data.limitsOf,
      doneToday: data.doneToday,
      newOrder: settings.synced.study.newOrder,
      sidesOf: data.sidesOf,
    })
    putSession(s)
  }
  session.value = reactive(s) as StudySession
  if (!s.current) advance()
  else finished.value = false
}

let waitTimer: ReturnType<typeof setTimeout> | undefined

function advance(learnAhead = false, avoid?: string) {
  const s = session.value
  if (!s) return
  clearTimeout(waitTimer)
  revealed.value = false
  waitUntil.value = null
  for (;;) {
    const r = pickNext(s, Date.now(), avoid, learnAhead)
    if (r.kind === 'card') {
      const c = data.cardById.get(parseKey(r.id).id)
      // skip cards deleted, suspended or emptied since the session started
      if (!c || !isStudyable(c)) continue
      s.current = r.id
      finished.value = false
      prefetchNext(s)
      return
    }
    s.current = null
    if (r.kind === 'wait') {
      waitUntil.value = r.until
      waitTimer = setTimeout(() => advance(), Math.max(1000, r.until - Date.now() + 200))
    } else {
      finished.value = true
      if (sync.status === 'dirty') void sync.syncNow(false)
    }
    return
  }
}

/** Prepare the audio of the card most likely to come next. */
function prefetchNext(s: StudySession) {
  const key = s.main[0] ?? [...s.learning].sort((a, b) => a.due - b.due)[0]?.id
  const k = key ? parseKey(key) : undefined
  const c = k ? data.cardById.get(k.id) : undefined
  // the reverse side shows the word only after the answer is revealed
  if (c?.type === 'vocab' && k?.side !== 'r')
    prefetchSpeech(c.word, c.lang, settings.device.tts[c.lang], c.reading)
}

async function rate(g: Grade) {
  const s = session.value
  const c = current.value
  const side = currentKey.value?.side
  if (!s || !c || !side || busy.value) return
  busy.value = true
  try {
    const snap = snapshotOf(s)
    const key = sideKey(c.id, side)
    const { log, sched } = await data.applyRating(c.id, g, side)
    s.history.push({ key, logId: log.id, snap })
    s.done++
    if (sched.state !== State.Review && sched.state !== State.New && sched.due < data.dayEnd) {
      s.learning.push({ id: key, due: sched.due })
    }
    s.current = null
    advance(false, c.id)
  } catch (e) {
    ui.toast(e instanceof Error ? e.message : '評分失敗', 'error')
  } finally {
    busy.value = false
  }
}

async function undo() {
  const s = session.value
  const last = s?.history.pop()
  if (!s || !last) return
  await data.undoLog(last.logId)
  s.main = last.snap.main
  s.learning = last.snap.learning
  s.current = last.key
  s.done = Math.max(0, s.done - 1)
  finished.value = false
  waitUntil.value = null
  revealed.value = false
  ui.toast('已撤銷上一個評分')
}

async function toggleStar() {
  if (current.value) await data.patchCards([current.value.id], { starred: !current.value.starred })
}

async function suspendCurrent() {
  const c = current.value
  if (!c) return
  await data.patchCards([c.id], { suspended: true })
  ui.toast('已暫停這張卡片', 'info', {
    label: '復原',
    run: () => data.patchCards([c.id], { suspended: false }),
  })
  advance()
}

function exit() {
  stopSpeaking()
  router.push(scope.value ? `/node/${scope.value}` : '/')
}

function finishAndLeave() {
  if (session.value) dropSession(session.value.key)
  exit()
}

// dictionary lookup for selected text (mainly for basic cards)
const showDict = ref(false)
const dictWord = ref('')
function openDict() {
  const sel = window.getSelection()?.toString().trim()
  const c = current.value
  dictWord.value = sel || (c?.type === 'vocab' ? c.word : '')
  showDict.value = true
}

function onKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
  if (showDict.value || ui.dialog) return
  if (e.key.toLowerCase() === 'z') {
    e.preventDefault()
    void undo()
    return
  }
  if (!current.value) return
  if (!revealed.value) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      revealed.value = true
    }
    return
  }
  const g = GRADES.find((x) => x.key === e.key)
  if (g) return void rate(g.grade)
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    void rate(GRADES[2]!.grade)
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  if (data.ready) start()
})
watch(
  () => data.ready,
  (r) => r && !session.value && start(),
)
watch(
  () => route.fullPath,
  () => data.ready && start(),
)
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  clearTimeout(waitTimer)
  stopSpeaking()
})

const tick = useTicker()
const waitText = computed(() =>
  waitUntil.value ? formatCountdown(waitUntil.value - tick.value) : '',
)
</script>

<template>
  <div class="flex min-h-[calc(100dvh-2.5rem)] flex-col">
    <header class="flex items-center gap-3 py-3">
      <button class="icon-btn" aria-label="離開" @click="exit"><X :size="20" /></button>
      <div class="min-w-0 flex-1 text-center">
        <div class="font-bold">{{ title }}</div>
        <div class="truncate text-xs text-muted">{{ scopeName }}</div>
      </div>
      <button
        class="icon-btn"
        aria-label="撤銷上一個評分"
        title="撤銷（Z）"
        :disabled="!session?.history.length"
        @click="undo"
      >
        <Undo2 :size="20" />
      </button>
    </header>

    <div class="mb-4 flex items-center gap-3">
      <div class="h-2 flex-1 overflow-hidden rounded-full bg-surface">
        <div
          class="h-full rounded-full bg-primary transition-[width]"
          :style="{ width: `${progress * 100}%` }"
        />
      </div>
      <span class="text-xs font-semibold text-muted">剩 {{ left }}</span>
    </div>

    <!-- card -->
    <template v-if="current">
      <div class="mb-3 flex justify-end gap-2">
        <button class="icon-btn size-9" title="星號" @click="toggleStar">
          <Star :size="16" :class="current.starred ? 'fill-warn text-warn' : ''" />
        </button>
        <button class="icon-btn size-9" title="暫停這張卡" @click="suspendCurrent">
          <Pause :size="16" />
        </button>
        <button class="icon-btn size-9" title="查字典" @click="openDict">
          <BookOpen :size="16" />
        </button>
        <button
          class="icon-btn size-9"
          title="編輯"
          @click="router.push(`/card/${current.id}/edit`)"
        >
          <Pencil :size="16" />
        </button>
      </div>
      <section
        class="card flex min-h-[45dvh] flex-1 flex-col justify-center px-6 py-8"
        @click="!revealed && (revealed = true)"
      >
        <CardFace :card="current" :revealed="revealed" :reverse="reverse" />
      </section>

      <div class="sticky bottom-0 mt-4 bg-bg pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          v-if="!revealed"
          class="btn btn-primary w-full py-4 text-lg"
          @click="revealed = true"
        >
          顯示答案
        </button>
        <div v-else class="grid grid-cols-4 gap-2">
          <button
            v-for="g in GRADES"
            :key="g.grade"
            class="flex flex-col items-center gap-0.5 rounded-2xl py-3 font-bold text-white transition active:scale-95 disabled:opacity-60"
            :style="{ background: g.tone }"
            :disabled="busy"
            @click="rate(g.grade)"
          >
            {{ g.label }}
            <span v-if="intervals" class="text-xs font-medium opacity-90">{{
              formatInterval(intervals[g.grade])
            }}</span>
          </button>
        </div>
      </div>
    </template>

    <!-- waiting for learning steps -->
    <section
      v-else-if="waitUntil"
      class="card flex flex-1 flex-col items-center justify-center gap-4 text-center"
    >
      <Hourglass :size="40" class="text-primary" />
      <p class="text-lg font-bold">稍等一下</p>
      <p class="text-4xl font-bold tabular-nums text-primary">{{ waitText }}</p>
      <p class="text-sm text-muted">
        還有 {{ session?.learning.length }} 張學習中的卡片，下一張倒數結束後會自動出現。
      </p>
      <button class="btn btn-primary" @click="advance(true)">提前複習</button>
    </section>

    <!-- finished -->
    <section
      v-else-if="finished"
      class="card flex flex-1 flex-col items-center justify-center gap-4 text-center"
    >
      <PartyPopper :size="44" class="text-primary" />
      <p class="text-xl font-bold">
        {{ session?.done ? '完成了！' : '目前沒有要' + title + '的卡片' }}
      </p>
      <p v-if="session?.done" class="text-sm text-muted">這一輪共評分 {{ session.done }} 次</p>
      <div class="flex gap-2">
        <button v-if="session?.history.length" class="btn btn-ghost" @click="undo">
          <Undo2 :size="18" /> 撤銷
        </button>
        <button class="btn btn-primary" @click="finishAndLeave">返回</button>
      </div>
    </section>

    <BottomSheet v-model="showDict" title="查字典">
      <input
        v-model="dictWord"
        class="input mb-4"
        placeholder="輸入要查的字（可先在卡片上選取文字）"
      />
      <DictLinks :word="dictWord" :lang="current?.type === 'vocab' ? current.lang : undefined" />
      <p v-if="!settings.synced.dictionaries.length" class="text-sm text-muted">尚未設定字典</p>
    </BottomSheet>
  </div>
</template>
