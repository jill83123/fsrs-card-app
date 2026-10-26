<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { liveQuery } from 'dexie'
import {
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Eye,
  EyeOff,
  FolderInput,
  Info,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Star,
  Trash2,
  TriangleAlert,
} from '@lucide/vue'
import PageHeader from '@/components/PageHeader.vue'
import CardFace from '@/components/CardFace.vue'
import SpeakButton from '@/components/SpeakButton.vue'
import CardExamples from '@/components/CardExamples.vue'
import DictLinks from '@/components/DictLinks.vue'
import MoveDeckSheet from '@/components/MoveDeckSheet.vue'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { useSettings } from '@/stores/settings'
import { regenerateSpeech } from '@/lib/tts'
import { db } from '@/db'
import type { ReviewLogRecord } from '@/db/types'
import {
  GRADES,
  previewIntervals,
  retrievability,
  State,
  STATE_LABEL,
  type Grade,
} from '@/lib/fsrs'
import { formatDateTime, formatInterval } from '@/lib/date'
import { isComplete } from '@/lib/cards'
import { REL_KINDS } from '@/lib/relations'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useTip } from '@/components/stats/useTip'
import ChartTip from '@/components/stats/ChartTip.vue'

const route = useRoute()
const router = useRouter()
const data = useData()
const ui = useUi()
const settings = useSettings()

const id = computed(() => String(route.params.id))
const card = computed(() => data.cardById.get(id.value))
const revealed = ref(true)

// related words are for browsing only: they never appear while studying
const related = computed(() => {
  const c = card.value
  if (c?.type !== 'vocab') return []
  return REL_KINDS.map((k) => ({
    label: k.label,
    cards: (c.rel?.[k.id] ?? []).flatMap((id) => {
      const r = data.cardById.get(id)
      return r?.type === 'vocab' ? [r] : []
    }),
  })).filter((g) => g.cards.length)
})

// sibling cards from the list the user came from (saved by CardList)
const browseIds = computed<string[]>(() => {
  try {
    const raw = sessionStorage.getItem('sr.browse.cards')
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((i) => data.cardById.get(i)) : []
  } catch {
    return []
  }
})
const browseIndex = computed(() => browseIds.value.indexOf(id.value))
const hasPrev = computed(() => browseIndex.value > 0)
const hasNext = computed(
  () => browseIndex.value >= 0 && browseIndex.value < browseIds.value.length - 1,
)

function go(delta: -1 | 1) {
  if (delta < 0 ? !hasPrev.value : !hasNext.value) return
  router.replace(`/card/${browseIds.value[browseIndex.value + delta]}`)
}

// arrow keys on desktop, horizontal swipes on touch screens
function onKey(e: KeyboardEvent) {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  const t = e.target
  if (
    t instanceof Element &&
    t.closest('input, textarea, select, [contenteditable], [role="dialog"]')
  )
    return
  e.preventDefault()
  go(e.key === 'ArrowLeft' ? -1 : 1)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

let swipeStart: { x: number; y: number } | null = null
function onTouchStart(e: TouchEvent) {
  const t = e.touches[0]
  swipeStart = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null
}
function onTouchEnd(e: TouchEvent) {
  const t = e.changedTouches[0]
  const start = swipeStart
  swipeStart = null
  if (!start || !t) return
  const dx = t.clientX - start.x
  const dy = t.clientY - start.y
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
  go(dx < 0 ? 1 : -1)
}

const logs = useLiveQuery<ReviewLogRecord[]>(
  () =>
    liveQuery(() =>
      db.logs
        .where('cardId')
        .equals(id.value)
        .filter((l) => !l.deleted)
        .reverse()
        .sortBy('review'),
    ),
  [],
  [id],
)

const LOG_FIRST = 3
const LOG_PAGE = 5
const logLimit = ref(LOG_FIRST)
watch(id, () => (logLimit.value = LOG_FIRST))
const shownLogs = computed(() => logs.value.slice(0, logLimit.value))

const deckName = computed(() =>
  card.value ? (data.nodeById.get(card.value.deckId)?.name ?? '卡片') : '卡片',
)
const fam = computed(() =>
  card.value ? retrievability(data.scheduler, card.value.sched, data.now) : null,
)
const latest = computed(() => logs.value[0])
const canRerate = computed(() => latest.value && latest.value.studyDay === data.today)
const showRerate = ref(false)
// status and review history are rarely needed, so they stay folded until asked for
// and it remembers the last choice, also after leaving the page
const INFO_KEY = 'sr.cardInfoOpen'
const showInfo = ref(localStorage.getItem(INFO_KEY) === '1')
watch(showInfo, (v) => localStorage.setItem(INFO_KEY, v ? '1' : '0'))
const rerateIntervals = computed(() =>
  latest.value ? previewIntervals(data.scheduler, latest.value.prev, data.now) : null,
)

const gradeLabel = (r: number) => GRADES.find((g) => g.grade === r)?.label ?? '—'
const gradeTone = (r: number) => GRADES.find((g) => g.grade === r)?.tone ?? 'var(--muted)'

async function toggleStar() {
  if (card.value) await data.patchCards([card.value.id], { starred: !card.value.starred })
}
async function toggleSuspend() {
  if (card.value) await data.patchCards([card.value.id], { suspended: !card.value.suspended })
}
const showMove = ref(false)
async function moveTo(deckId: string) {
  if (!card.value) return
  await data.patchCards([card.value.id], { deckId })
  showMove.value = false
  ui.toast('已移動', 'success')
}
// a clip that came out wrong: drop this card's stored clips so they are made again
async function regenSpeech() {
  const c = card.value
  if (c?.type !== 'vocab') return
  await regenerateSpeech(
    [
      { text: c.word, lang: c.lang, reading: c.reading },
      ...c.examples.map((e) => ({ text: e.sentence, lang: c.lang })),
    ],
    (l) => settings.device.tts[l],
  )
  ui.toast('已重新生成發音', 'success')
}
async function remove() {
  if (!card.value) return
  if (!(await ui.confirm('刪除這張卡片？', { danger: true, confirmText: '刪除' }))) return
  const deck = card.value.deckId
  await data.patchCards([card.value.id], { deleted: true })
  router.replace(`/node/${deck}`)
}
async function reset() {
  if (!card.value) return
  const res = await ui.confirmCheck('重設這張卡片的學習進度？', {
    message: '卡片會回到「尚未學習」狀態。',
    checkLabel: '同時刪除複習紀錄（統計也會一併移除）',
    danger: true,
    confirmText: '重設',
  })
  if (!res) return
  await data.resetCards([card.value.id], res.checked)
}
async function rerate(g: Grade) {
  const log = latest.value
  if (!log || !rerateIntervals.value) return
  const ok = await ui.confirm('修改上一次的複習紀錄？', {
    message: `${formatDateTime(log.review)} 的評分：「${gradeLabel(log.rating)}」→「${gradeLabel(g)}」\n下次複習會在 ${formatInterval(rerateIntervals.value[g])}後，原本的評分會被取代。`,
    confirmText: '修改',
  })
  if (!ok) return
  try {
    await data.rerate(id.value, g, latest.value?.side ?? 'f')
    showRerate.value = false
    ui.toast('已重新評分', 'success')
  } catch (e) {
    ui.toast(e instanceof Error ? e.message : '無法重新評分', 'error')
  }
}

const info = computed(() => {
  const c = card.value
  if (!c) return []
  const s = c.sched
  const rows: [string, string][] = [['狀態', STATE_LABEL[s.state]]]
  const isNew = s.state === State.New
  if (!isNew) rows.push(['下次複習', formatDateTime(s.due)])
  rows.push(['熟悉度', fam.value === null ? '—' : `${Math.round(fam.value * 100)}%`])
  if (!isNew) {
    rows.push(['穩定度', `${s.stability.toFixed(1)} 天`], ['難度', s.difficulty.toFixed(2)])
  }
  rows.push(
    ['複習次數', String(s.reps)],
    ['遺忘次數', String(s.lapses)],
    ['建立時間', formatDateTime(c.createdAt)],
  )
  return rows
})

// plain-language hint per item, shown in a floating bubble
const INFO_HELP: Record<string, string> = {
  狀態: [
    '尚未學習：還沒練習過',
    '學習中：剛開始學',
    '複習：已進入長期排程',
    '重新學習：忘記後重學',
  ].join('\n'),
  熟悉度: ['現在還記得的機率，會隨時間下降。', '剛複習完是 100%。'].join('\n'),
  穩定度: '記憶能撐多久。',
  難度: '這張卡對你有多難（1–10）。',
  遺忘次數: '學會後又按「重來」的次數。',
}
const { root: infoRoot, tip: infoTip, show: showInfoTip } = useTip()
</script>

<template>
  <div v-if="card">
    <PageHeader
      :title="deckName"
      :subtitle="browseIndex >= 0 ? `${browseIndex + 1} / ${browseIds.length}` : undefined"
    >
      <template #right>
        <button
          class="icon-btn"
          :class="{ 'text-primary': showInfo }"
          aria-label="狀態與複習紀錄"
          :aria-expanded="showInfo"
          @click="showInfo = !showInfo"
        >
          <Info :size="18" />
        </button>
        <button class="icon-btn" aria-label="編輯" @click="router.push(`/card/${card.id}/edit`)">
          <Pencil :size="18" />
        </button>
      </template>
    </PageHeader>

    <!-- the arrows sit at a fixed height inside the card, so they stay put whatever the content -->
    <div class="relative mb-3" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
      <section class="card relative flex min-h-80 flex-col" @click="revealed = true">
        <!-- the incomplete warning, level with the eye icon; out of the flow, so switching between complete and
             incomplete cards never shifts the height -->
        <div class="absolute top-3 left-1/2 flex h-8 -translate-x-1/2 items-center gap-1.5">
          <span
            v-if="!isComplete(card)"
            class="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold"
            style="
              color: #d99100;
              background: color-mix(in oklab, #f5b301 10%, var(--surface));
              box-shadow: inset 0 0 0 1px color-mix(in oklab, #f5b301 45%, transparent);
            "
            title="這張卡片尚未完成，補齊內容後才會進入學習。"
          >
            <TriangleAlert :size="12" />
            內容未完成
          </span>
        </div>
        <!-- stays in the corner, so it never moves when the examples below appear or disappear -->
        <button
          class="absolute top-3 left-3 flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:text-primary"
          :aria-label="revealed ? '只看正面' : '顯示答案'"
          :title="revealed ? '只看正面' : '顯示答案'"
          @click.stop="revealed = !revealed"
        >
          <component :is="revealed ? Eye : EyeOff" :size="18" />
        </button>
        <!-- the word's speaker, in the opposite corner from the eye -->
        <SpeakButton
          v-if="card.type === 'vocab'"
          :text="card.word"
          :lang="card.lang"
          :reading="card.reading"
          :size="18"
          class="absolute top-[10px] right-[10px]"
        />
        <!-- arrows sit inside the card on both sides, level with the divider in the middle -->
        <template v-if="browseIndex >= 0">
          <button
            class="absolute top-1/2 left-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted opacity-60 transition-colors hover:text-primary hover:opacity-100 disabled:opacity-0"
            aria-label="上一張"
            :disabled="!hasPrev"
            @click.stop="go(-1)"
          >
            <ChevronLeft :size="20" />
          </button>
          <button
            class="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted opacity-60 transition-colors hover:text-primary hover:opacity-100 disabled:opacity-0"
            aria-label="下一張"
            :disabled="!hasNext"
            @click.stop="go(1)"
          >
            <ChevronRight :size="20" />
          </button>
        </template>
        <!-- equal room above and below, so the divider stays level with the arrows -->
        <div class="flex flex-1 flex-col px-10 py-2">
          <CardFace class="flex-1" :card="card" :revealed="revealed" list-examples />
        </div>
      </section>
    </div>
    <CardExamples v-if="revealed" :card="card" />
    <section v-if="related.length" class="card mb-3 space-y-3">
      <div v-for="g in related" :key="g.label">
        <h2 class="mb-1.5 text-xs font-semibold text-muted">{{ g.label }}</h2>
        <div class="flex flex-wrap gap-2">
          <RouterLink v-for="r in g.cards" :key="r.id" :to="`/card/${r.id}`" class="chip">
            {{ r.word }}
          </RouterLink>
        </div>
      </div>
    </section>
    <DictLinks
      v-if="revealed && card.type === 'vocab'"
      :word="card.word"
      :lang="card.lang"
      class="mb-5"
    />
    <div class="mb-5 grid grid-cols-5 gap-2">
      <button
        class="flex flex-col items-center gap-1 rounded-xl border border-line bg-surface py-3 text-xs font-semibold"
        @click="toggleStar"
      >
        <Star :size="20" :class="card.starred ? 'fill-warn text-warn' : ''" />
        {{ card.starred ? '已加星號' : '星號' }}
      </button>
      <button
        class="flex flex-col items-center gap-1 rounded-xl border border-line bg-surface py-3 text-xs font-semibold"
        @click="toggleSuspend"
      >
        <component :is="card.suspended ? Play : Pause" :size="20" />
        {{ card.suspended ? '恢復' : '暫停' }}
      </button>
      <button
        class="flex flex-col items-center gap-1 rounded-xl border border-line bg-surface py-3 text-xs font-semibold"
        @click="showMove = true"
      >
        <FolderInput :size="20" /> 移動
      </button>
      <button
        class="flex flex-col items-center gap-1 rounded-xl border border-line bg-surface py-3 text-xs font-semibold"
        @click="reset"
      >
        <RotateCcw :size="20" /> 重設
      </button>
      <button
        class="flex flex-col items-center gap-1 rounded-xl border border-line bg-surface py-3 text-xs font-semibold text-danger"
        @click="remove"
      >
        <Trash2 :size="20" /> 刪除
      </button>
    </div>

    <template v-if="showInfo">
      <section ref="infoRoot" class="card relative mb-5">
        <dl class="space-y-3 text-sm">
          <div v-for="[k, v] in info" :key="k" class="flex items-center gap-2">
            <dt class="shrink-0 text-muted">
              <button
                v-if="INFO_HELP[k]"
                class="flex items-center gap-1"
                @click="showInfoTip($event, INFO_HELP[k], 110)"
              >
                {{ k }}
                <CircleHelp :size="14" class="opacity-60" />
              </button>
              <template v-else>{{ k }}</template>
            </dt>
            <span class="leader min-w-4 flex-1" aria-hidden="true" />
            <dd class="shrink-0 font-semibold">{{ v }}</dd>
          </div>
        </dl>
        <ChartTip :tip="infoTip" />
      </section>

      <section class="card">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="font-bold">複習紀錄</h2>
          <button
            v-if="canRerate"
            class="pill btn-soft py-1.5 text-xs"
            @click="showRerate = !showRerate"
          >
            重新評分今天的紀錄
          </button>
        </div>
        <div v-if="showRerate && rerateIntervals" class="mb-4 rounded-2xl bg-surface-2 p-3">
          <div class="mb-2 space-y-0.5 text-xs text-muted">
            <p>只能修改最後一次（{{ formatDateTime(latest!.review) }}）的評分。</p>
            <p>卡片會回到那次複習前的狀態，再重新排程。</p>
          </div>
          <div class="grid grid-cols-4 gap-2">
            <button
              v-for="g in GRADES"
              :key="g.grade"
              class="flex flex-col items-center rounded-xl py-2 text-sm font-bold text-white"
              :style="{ background: g.tone }"
              @click="rerate(g.grade)"
            >
              {{ g.label }}
              <span class="text-[10px] font-medium opacity-90">{{
                formatInterval(rerateIntervals[g.grade])
              }}</span>
            </button>
          </div>
        </div>
        <ul v-if="logs.length" class="leader-divide text-sm">
          <li v-for="l in shownLogs" :key="l.id" class="flex items-center justify-between py-2">
            <span class="text-muted">{{ formatDateTime(l.review) }}</span>
            <span class="flex items-center gap-3">
              <span v-if="l.side === 'r'" class="chip">反向</span>
              <span class="text-muted">{{ STATE_LABEL[l.prev.state] }}</span>
              <span class="font-bold" :style="{ color: gradeTone(l.rating) }">{{
                gradeLabel(l.rating)
              }}</span>
            </span>
          </li>
        </ul>
        <p v-else class="text-sm text-muted">還沒有複習紀錄</p>
        <button
          v-if="logs.length > logLimit"
          class="mt-2 w-full py-2 text-xs text-muted"
          @click="logLimit += LOG_PAGE"
        >
          顯示更多（還有 {{ logs.length - logLimit }} 筆）
        </button>
      </section>
    </template>

    <button
      v-if="card.type === 'vocab'"
      class="mt-8 mb-4 block w-full text-center text-xs text-muted underline"
      @click="regenSpeech"
    >
      重新生成這張卡片的發音
    </button>

    <MoveDeckSheet v-model="showMove" :current="card.deckId" @pick="moveTo" />
  </div>
  <div v-else-if="data.ready" class="py-20 text-center text-muted">找不到卡片</div>
</template>
