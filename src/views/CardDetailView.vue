<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { liveQuery } from 'dexie'
import { ChevronLeft, ChevronRight, CircleHelp, FolderInput, Pause, Pencil, Play, RotateCcw, Star, Trash2, TriangleAlert } from '@lucide/vue'
import PageHeader from '@/components/PageHeader.vue'
import CardFace from '@/components/CardFace.vue'
import MoveDeckSheet from '@/components/MoveDeckSheet.vue'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
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
import { pathTo } from '@/lib/tree'
import { useLiveQuery } from '@/composables/useLiveQuery'

const route = useRoute()
const router = useRouter()
const data = useData()
const ui = useUi()

const id = computed(() => String(route.params.id))
const card = computed(() => data.cardById.get(id.value))
const revealed = ref(true)

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
const hasNext = computed(() => browseIndex.value >= 0 && browseIndex.value < browseIds.value.length - 1)

function go(delta: -1 | 1) {
  if (delta < 0 ? !hasPrev.value : !hasNext.value) return
  router.replace(`/card/${browseIds.value[browseIndex.value + delta]}`)
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

const deckPath = computed(() =>
  card.value
    ? pathTo(data.nodes, card.value.deckId)
        .map((n) => n.name)
        .join(' / ')
    : '',
)
const fam = computed(() =>
  card.value ? retrievability(data.scheduler, card.value.sched, data.now) : null,
)
const latest = computed(() => logs.value[0])
const canRerate = computed(() => latest.value && latest.value.studyDay === data.today)
const showRerate = ref(false)
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
async function remove() {
  if (!card.value) return
  if (!(await ui.confirm('刪除這張卡片？', { danger: true, confirmText: '刪除' }))) return
  const deck = card.value.deckId
  await data.patchCards([card.value.id], { deleted: true })
  router.replace(`/node/${deck}`)
}
async function reset() {
  if (!card.value) return
  if (!(await ui.confirm('重設這張卡片的學習進度？', { danger: true, confirmText: '重設' }))) return
  await data.resetCards([card.value.id])
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
  const rows: [string, string][] = [
    ['狀態', STATE_LABEL[s.state]],
    ['熟悉度', fam.value === null ? '—' : `${Math.round(fam.value * 100)}%`],
  ]
  if (s.state !== State.New) {
    rows.push(
      ['下次複習', formatDateTime(s.due)],
      ['穩定度', `${s.stability.toFixed(1)} 天`],
      ['難度', s.difficulty.toFixed(2)],
    )
  }
  rows.push(
    ['複習次數', String(s.reps)],
    ['遺忘次數', String(s.lapses)],
    ['建立時間', formatDateTime(c.createdAt)],
  )
  return rows
})

// one short line per item
const INFO_HELP: Record<string, string[]> = {
  狀態: [
    '新卡：還沒學過',
    '學習中：剛開始學，當天會依學習步驟再出現幾次',
    '複習：已進入長期排程',
    '重新學習：複習時忘記了，當天會再練幾次',
  ],
  熟悉度: [
    '現在還記得這張卡的機率，會隨時間慢慢下降。',
    '剛複習完一定是 100%（當天都算剛複習）。',
    '代表「現在記不記得」，不是掌握得多牢。',
    '新卡沒有熟悉度。',
  ],
  下次複習: ['熟悉度預計降到目標熟悉度（預設 90%）的時間。'],
  穩定度: [
    '記憶能維持多久：過了這麼多天，熟悉度約降到 90%。',
    '數字越大記得越牢；答對會變大，忘記會變小。',
  ],
  難度: [
    '這張卡對你有多難，範圍 1–10。',
    '常按「重來」或「困難」會變高。',
    '越難的卡，穩定度成長越慢。',
  ],
  複習次數: ['這張卡被評分的總次數。'],
  遺忘次數: ['已進入複習狀態後，又按「重來」（忘記）的次數。'],
}
const openHelp = ref<string | null>(null)
</script>

<template>
  <div v-if="card">
    <PageHeader title="卡片">
      <template #right>
        <button class="icon-btn" aria-label="編輯" @click="router.push(`/card/${card.id}/edit`)">
          <Pencil :size="18" />
        </button>
      </template>
    </PageHeader>

    <p class="-mt-2 mb-3 text-center text-xs text-muted">{{ deckPath }}</p>

    <section class="card relative mb-3 min-h-40" @click="revealed = true">
      <!-- out of the flow, so switching between complete and incomplete cards never shifts the height -->
      <span
        v-if="!isComplete(card)"
        class="absolute top-3 right-3 inline-flex items-center gap-1 rounded-md bg-warn/15 px-2 py-0.5 text-xs font-semibold"
        title="這張卡片尚未完成，補齊內容後才會進入學習。"
      >
        <TriangleAlert :size="12" />
        未完成，需補齊內容
      </span>
      <CardFace :card="card" :revealed="revealed" />
    </section>
    <div class="mb-5 flex items-center justify-center gap-3">
      <template v-if="browseIndex >= 0">
        <button class="pill pill-idle px-2.5 disabled:opacity-40" aria-label="上一張" :disabled="!hasPrev" @click="go(-1)">
          <ChevronLeft :size="20" />
        </button>
      </template>
      <button class="pill pill-idle" @click="revealed = !revealed">
        {{ revealed ? '只看正面' : '顯示答案' }}
      </button>
      <template v-if="browseIndex >= 0">
        <button class="pill pill-idle px-2.5 disabled:opacity-40" aria-label="下一張" :disabled="!hasNext" @click="go(1)">
          <ChevronRight :size="20" />
        </button>
      </template>
    </div>
    <p v-if="browseIndex >= 0" class="-mt-3 mb-5 text-center text-xs text-muted">
      {{ browseIndex + 1 }} / {{ browseIds.length }}
    </p>

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

    <section class="card mb-5">
      <dl class="space-y-3 text-sm">
        <div v-for="[k, v] in info" :key="k">
          <div class="flex items-center gap-2">
            <dt class="shrink-0 text-muted">
              <button
                v-if="INFO_HELP[k]"
                class="flex items-center gap-1"
                :aria-expanded="openHelp === k"
                @click="openHelp = openHelp === k ? null : k"
              >
                {{ k }}
                <CircleHelp :size="14" :class="openHelp === k ? 'text-primary' : 'opacity-60'" />
              </button>
              <template v-else>{{ k }}</template>
            </dt>
            <span class="leader min-w-4 flex-1" aria-hidden="true" />
            <dd class="shrink-0 font-semibold">{{ v }}</dd>
          </div>
          <dd
            v-if="openHelp === k"
            class="mt-2 space-y-0.5 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted"
          >
            <p v-for="line in INFO_HELP[k]" :key="line">{{ line }}</p>
          </dd>
        </div>
      </dl>
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
        <li v-for="l in logs" :key="l.id" class="flex items-center justify-between py-2">
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
    </section>

    <MoveDeckSheet v-model="showMove" :current="card.deckId" @pick="moveTo" />
  </div>
  <div v-else-if="data.ready" class="py-20 text-center text-muted">找不到卡片</div>
</template>
