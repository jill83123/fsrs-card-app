<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { liveQuery } from 'dexie'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { useRouter } from 'vue-router'
import CardListItem from '@/components/CardListItem.vue'
import SelectBox from '@/components/SelectBox.vue'
import PillTabs from '@/components/PillTabs.vue'
import BarChart, { type Bar } from '@/components/stats/BarChart.vue'
import BarRows from '@/components/stats/BarRows.vue'
import DonutChart from '@/components/stats/DonutChart.vue'
import ChartTip from '@/components/stats/ChartTip.vue'
import DueCalendar from '@/components/stats/DueCalendar.vue'
import { useTip } from '@/components/stats/useTip'
import StatsSection from '@/components/stats/StatsSection.vue'
import { CHART_BLUE } from '@/components/stats/colors'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { db } from '@/db'
import {
  addDays,
  formatDayLabel,
  parseYmd,
  studyDayEnd,
  studyDayStart,
  weekdayLabel,
} from '@/lib/date'
import { isLearned, isStudyable } from '@/lib/cards'
import { GRADES, Rating, State } from '@/lib/fsrs'

/** deck id to limit the stats to its subtree; null = everything */
const props = defineProps<{ scope: string | null }>()
const data = useData()
const router = useRouter()
const settings = useSettings()

const scopeCards = computed(() => (props.scope ? data.cardsInScope(props.scope) : data.cards))
const scopeIds = computed(() => (props.scope ? new Set(scopeCards.value.map((c) => c.id)) : null))

// --- review logs -----------------------------------------------------------
const RECENT_DAYS = 30
interface RecentLog {
  day: string
  rating: number
  prevState: State
}
function addTo(m: Map<string, Set<string>>, day: string, cardId: string) {
  let set = m.get(day)
  if (!set) m.set(day, (set = new Set()))
  set.add(cardId)
}
const logs = useLiveQuery<{
  counts: Map<string, number>
  /** per study day: how many times each grade (Again..Easy) was pressed */
  ratings: Map<string, number[]>
  /** per study day: how many different cards were reviewed (cards first learned that day excluded) */
  reviewedPerDay: Map<string, number>
  /** per study day: how many different new cards were studied for the first time */
  learnedPerDay: Map<string, number>
  recent: RecentLog[]
}>(
  () =>
    liveQuery(async () => {
      const ids = scopeIds.value
      const recentStart = addDays(data.today, -(RECENT_DAYS - 1))
      const counts = new Map<string, number>()
      const ratings = new Map<string, number[]>()
      const seenNew = new Map<string, Set<string>>()
      const seenOld = new Map<string, Set<string>>()
      const recent: RecentLog[] = []
      await db.logs.orderBy('studyDay').each((l) => {
        if (l.deleted || (ids && !ids.has(l.cardId))) return
        counts.set(l.studyDay, (counts.get(l.studyDay) ?? 0) + 1)
        let r = ratings.get(l.studyDay)
        if (!r) ratings.set(l.studyDay, (r = [0, 0, 0, 0]))
        if (l.rating >= Rating.Again && l.rating <= Rating.Easy) r[l.rating - 1]!++
        addTo(l.prev.state === State.New ? seenNew : seenOld, l.studyDay, l.cardId)
        if (l.studyDay >= recentStart)
          recent.push({
            day: l.studyDay,
            rating: l.rating,
            prevState: l.prev.state,
          })
      })
      const sizes = (m: Map<string, Set<string>>) =>
        new Map([...m].map(([day, set]) => [day, set.size]))
      return {
        counts,
        ratings,
        reviewedPerDay: new Map(
          [...seenOld].map(([day, set]) => [
            day,
            [...set].filter((id) => !seenNew.get(day)?.has(id)).length,
          ]),
        ),
        learnedPerDay: sizes(seenNew),
        recent,
      }
    }),
  {
    counts: new Map(),
    ratings: new Map(),
    reviewedPerDay: new Map(),
    learnedPerDay: new Map(),
    recent: [],
  },
  [scopeIds, () => data.today],
)
const counts = computed(() => logs.value.counts)
const recentLogs = computed(() => logs.value.recent)

// --- heatmap -----------------------------------------------------------------
// range: the last 53 weeks, or one calendar year
const year = ref<'recent' | number>('recent')
const heatKind = ref<'all' | 'review' | 'learned'>('all')
const heat = computed(() => {
  const { reviewedPerDay, learnedPerDay } = logs.value
  if (heatKind.value === 'review') return reviewedPerDay
  if (heatKind.value === 'learned') return learnedPerDay
  // a card is counted once per day (reviewed excludes cards also learned that day)
  const all = new Map(reviewedPerDay)
  for (const [day, n] of learnedPerDay) all.set(day, (all.get(day) ?? 0) + n)
  return all
})
const { root: heatRoot, tip: heatTip, show: showHeatTip, hide: hideHeatTip } = useTip()
watch([year, heatKind, () => props.scope], hideHeatTip)
const RECENT_WEEKS = 53
const mondayOf = (day: string) => addDays(day, -((parseYmd(day).getDay() + 6) % 7))
const range = computed(() => {
  if (year.value === 'recent') {
    const start = addDays(mondayOf(data.today), -(RECENT_WEEKS - 1) * 7)
    return { first: start, last: data.today, gridStart: start, weeks: RECENT_WEEKS }
  }
  const first = `${year.value}-01-01`
  const last = `${year.value}-12-31`
  const gridStart = mondayOf(first)
  const days = (parseYmd(last).getTime() - parseYmd(gridStart).getTime()) / 864e5 + 1
  return { first, last, gridStart, weeks: Math.ceil(days / 7) }
})

// logs are read in day order, so the map's first key is the earliest study day
const firstLogDay = computed<string | undefined>(() => counts.value.keys().next().value)
const yearOptions = computed(() => {
  const current = parseYmd(data.today).getFullYear()
  const first = firstLogDay.value
    ? Math.min(current, parseYmd(firstLogDay.value).getFullYear())
    : current
  const out: { value: 'recent' | number; label: string }[] = [{ value: 'recent', label: '近一年' }]
  for (let y = current; y >= first; y--) out.push({ value: y, label: `${y} 年` })
  return out
})
watch(yearOptions, (opts) => {
  if (!opts.some((o) => o.value === year.value)) year.value = 'recent'
})

const weeks = computed(() => {
  const { first, last, gridStart, weeks: n } = range.value
  const out: { day: string; n: number; hidden: boolean }[][] = []
  for (let w = 0; w < n; w++) {
    const col = []
    for (let d = 0; d < 7; d++) {
      const day = addDays(gridStart, w * 7 + d)
      col.push({
        day,
        n: heat.value.get(day) ?? 0,
        hidden: day < first || day > last || day > data.today,
      })
    }
    out.push(col)
  }
  return out
})
const visibleDays = computed(() => weeks.value.flat().filter((c) => !c.hidden))

const max = computed(() => Math.max(1, ...visibleDays.value.map((c) => c.n)))
function level(n: number) {
  if (!n) return 0
  const r = n / max.value
  return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1
}
const levelColor = (l: number) =>
  l === 0
    ? 'var(--surface-2)'
    : `color-mix(in oklab, var(--primary) ${[0, 30, 55, 78, 100][l]}%, var(--surface-2))`

const monthLabels = computed(() => {
  let prev = -1
  return weeks.value.map((col) => {
    const firstShown = col.find((c) => c.day >= range.value.first && c.day <= range.value.last)
    if (!firstShown) return ''
    const m = parseYmd(firstShown.day).getMonth()
    if (m === prev) return ''
    prev = m
    return `${m + 1}月`
  })
})

// recent / current year: show the latest weeks; past years: start from January
const scroller = ref<HTMLElement>()
watch(
  [heat, year, scroller],
  async () => {
    await nextTick()
    const el = scroller.value
    if (!el) return
    const past = year.value !== 'recent' && range.value.last < data.today
    el.scrollTo({ left: past ? 0 : el.scrollWidth })
  },
  { immediate: true },
)

// --- headline numbers ----------------------------------------------------------
const totals = computed(() => ({
  cards: scopeCards.value.length,
  learned: scopeCards.value.filter(isLearned).length,
}))

const headline = computed(() => [
  { label: '卡片總數', value: totals.value.cards },
  { label: '已學習', value: totals.value.learned },
])

// --- retention -------------------------------------------------------------------
// true retention: reviews of cards already in the review state that weren't forgotten
function retentionSince(days: number) {
  const start = addDays(data.today, -(days - 1))
  let n = 0
  let pass = 0
  for (const l of recentLogs.value) {
    if (l.day < start || l.prevState !== State.Review) continue
    n++
    if (l.rating !== Rating.Again) pass++
  }
  return { n, rate: n ? pass / n : null }
}
const retention = computed(() => [
  { label: '近 7 天', ...retentionSince(7) },
  { label: '近 30 天', ...retentionSince(30) },
])
const targetRetention = computed(() => settings.synced.fsrs.retention)
// a short verdict on the last 30 days against the target; too few reviews says nothing
const RETENTION_MIN_REVIEWS = 20
const retentionComment = computed(() => {
  const { n, rate } = retentionSince(30)
  if (rate === null || n < RETENTION_MIN_REVIEWS) return ''
  const gap = rate - targetRetention.value
  if (gap >= 0) return '記得很牢，繼續保持！'
  if (gap >= -0.05) return '接近目標了，再努力一點點。'
  return '最近忘記得有點多，多花點時間複習吧。'
})
const pctText = (r: number) => `${(r * 100).toFixed(1).replace(/\.0$/, '')}%`

// --- forecast ----------------------------------------------------------------------
const forecastDays = ref<7 | 30>(7)
// due counts for the next 30 days; the week view uses the first seven
const forecast = computed(() => {
  const hour = settings.synced.study.rolloverHour
  const cards = scopeCards.value.filter((c) => isStudyable(c) && c.sched.state !== State.New)
  return Array.from({ length: 30 }, (_, i) => {
    const day = addDays(data.today, i)
    const start = i === 0 ? -Infinity : studyDayStart(day, hour)
    const end = studyDayEnd(day, hour)
    return { day, n: cards.filter((c) => c.sched.due >= start && c.sched.due < end).length }
  })
})
const forecastWeek = computed<Bar[]>(() =>
  forecast.value.slice(0, 7).map(({ day, n }, i) => ({
    key: day,
    label: i === 0 ? '今天' : weekdayLabel(day),
    n,
    tip: i === 0 ? '今天（含逾期）' : formatDayLabel(day),
    strong: i === 0,
  })),
)

// --- ratings ---------------------------------------------------------------------------
const RATING_PERIODS = [
  { value: '7', label: '近 7 天', days: 7 },
  { value: '30', label: '近 30 天', days: 30 },
  { value: '182', label: '近半年', days: 182 },
  { value: '365', label: '近一年', days: 365 },
  { value: 'all', label: '全部', days: Infinity },
  { value: 'custom', label: '自訂', days: 0 },
] as const
const ratingPeriod = ref<(typeof RATING_PERIODS)[number]['value']>('30')
const customFrom = ref(addDays(data.today, -29))
const customTo = ref(data.today)
const ratingSpan = computed(() => {
  if (ratingPeriod.value === 'custom') {
    const [a, b] = [customFrom.value || '', customTo.value || data.today]
    return a <= b ? { from: a, to: b } : { from: b, to: a }
  }
  const p = RATING_PERIODS.find((x) => x.value === ratingPeriod.value)!
  return { from: p.days === Infinity ? '' : addDays(data.today, -(p.days - 1)), to: data.today }
})
const ratingRows = computed(() => {
  const { from, to } = ratingSpan.value
  const sum = [0, 0, 0, 0]
  for (const [day, r] of logs.value.ratings)
    if (day >= from && day <= to) r.forEach((n, i) => (sum[i]! += n))
  return GRADES.map((g) => ({
    label: g.label,
    n: sum[g.grade - 1] ?? 0,
    color: g.grade === Rating.Easy ? CHART_BLUE : g.tone,
  }))
})

// --- stability (how long a card is remembered) ----------------------------------------
const STABILITY_BUCKETS = [
  { label: '1 週內', max: 7 },
  { label: '1 週–1 月', max: 30 },
  { label: '1–3 個月', max: 90 },
  { label: '3–12 個月', max: 365 },
  { label: '1 年以上', max: Infinity },
]
const stabilityRows = computed(() => {
  const n = STABILITY_BUCKETS.map(() => 0)
  for (const c of scopeCards.value) {
    if (!isStudyable(c) || c.sched.state === State.New) continue
    n[STABILITY_BUCKETS.findIndex((b) => c.sched.stability < b.max)]!++
  }
  return STABILITY_BUCKETS.map((b, i) => ({
    label: b.label,
    n: n[i]!,
    color: `color-mix(in oklab, var(--primary) ${[30, 48, 66, 84, 100][i]}%, var(--surface-2))`,
  }))
})

// --- hardest cards -------------------------------------------------------------------------
// hardest cards by FSRS difficulty (1-10, about 5 on average); needs a few reviews so one
// early answer can't decide it
const HARD_MIN_REPS = 3
const HARD_LEVELS = [
  { min: 8, label: '很難', color: 'var(--danger)' },
  { min: 6.5, label: '偏難', color: 'var(--warn)' },
]
const hardLevel = (difficulty: number) => HARD_LEVELS.find((l) => difficulty >= l.min)
const hardAll = computed(() =>
  scopeCards.value
    .filter(
      (c) =>
        c.sched.state !== State.New &&
        c.sched.reps >= HARD_MIN_REPS &&
        hardLevel(c.sched.difficulty),
    )
    .sort((a, b) => b.sched.difficulty - a.sched.difficulty),
)
const HARD_PAGE_SIZE = 10
const hardPage = ref(0)
const hardPages = computed(() => Math.max(1, Math.ceil(hardAll.value.length / HARD_PAGE_SIZE)))
// the list shrinks when cards improve or the scope changes
watch(hardPages, (n) => (hardPage.value = Math.min(hardPage.value, n - 1)))
watch(
  () => props.scope,
  () => (hardPage.value = 0),
)
const hardCards = computed(() =>
  hardAll.value.slice(hardPage.value * HARD_PAGE_SIZE, (hardPage.value + 1) * HARD_PAGE_SIZE),
)
</script>

<template>
  <div>
    <div class="mb-5 grid grid-cols-2 gap-3">
      <div v-for="h in headline" :key="h.label" class="card p-4">
        <p class="text-xs font-semibold text-muted">{{ h.label }}</p>
        <p class="text-2xl font-bold">{{ h.value }}</p>
      </div>
    </div>

    <div class="flex flex-col gap-5">
      <StatsSection id="retention" title="記憶保留率">
        <div class="grid grid-cols-2 gap-3">
          <div v-for="r in retention" :key="r.label" class="rounded-xl bg-surface-2 p-3">
            <p class="text-xs font-semibold text-muted">{{ r.label }}</p>
            <p class="text-2xl font-bold">{{ r.rate === null ? '—' : pctText(r.rate) }}</p>
          </div>
        </div>
        <p v-if="retentionComment" class="mt-3 text-xs text-muted">{{ retentionComment }}</p>
      </StatsSection>

      <StatsSection id="heatmap" title="學習熱力圖">
        <div class="mb-3 flex items-center justify-between gap-3">
          <PillTabs
            v-model="heatKind"
            size="sm"
            class="max-w-44 flex-1"
            :options="[
              { value: 'all', label: '全部' },
              { value: 'review', label: '複習' },
              { value: 'learned', label: '新學' },
            ]"
          />
          <div class="w-32">
            <SelectBox v-model="year" class="py-1.5 text-sm">
              <option v-for="o in yearOptions" :key="o.value" :value="o.value">
                {{ o.label }}
              </option>
            </SelectBox>
          </div>
        </div>
        <div ref="heatRoot" class="relative">
          <div ref="scroller" class="overflow-x-auto pb-2" @scroll.passive="hideHeatTip">
            <div class="inline-flex flex-col gap-1">
              <div class="flex gap-[3px] pl-6 text-[10px] text-muted">
                <span
                  v-for="(m, i) in monthLabels"
                  :key="i"
                  class="w-3 shrink-0 overflow-visible whitespace-nowrap"
                  >{{ m }}</span
                >
              </div>
              <div class="flex gap-[3px]">
                <div class="flex w-5 flex-col gap-[3px] text-[10px] leading-3 text-muted">
                  <span
                    v-for="(d, i) in ['一', '', '三', '', '五', '', '日']"
                    :key="i"
                    class="h-3"
                    >{{ d }}</span
                  >
                </div>
                <div v-for="(col, i) in weeks" :key="i" class="flex flex-col gap-[3px]">
                  <div
                    v-for="c in col"
                    :key="c.day"
                    class="size-3 rounded-[3px]"
                    :class="{ invisible: c.hidden, 'ring-1 ring-ink/50': c.day === data.today }"
                    :style="{ background: levelColor(level(c.n)) }"
                    @mouseenter="showHeatTip($event, `${formatDayLabel(c.day)}：${c.n} 張`)"
                    @mouseleave="hideHeatTip"
                    @click="showHeatTip($event, `${formatDayLabel(c.day)}：${c.n} 張`)"
                  />
                </div>
              </div>
            </div>
          </div>
          <ChartTip :tip="heatTip" />
        </div>
        <div class="mt-2 flex items-center justify-end gap-2 text-xs text-muted">
          <span class="flex items-center gap-1">
            少
            <span
              v-for="l in 5"
              :key="l"
              class="size-3 rounded-[3px]"
              :style="{ background: levelColor(l - 1) }"
            />
            多
          </span>
        </div>
      </StatsSection>

      <StatsSection id="forecast" title="未來到期">
        <template #actions>
          <div class="w-36">
            <PillTabs
              v-model="forecastDays"
              size="sm"
              :options="[
                { value: 7, label: '7 天' },
                { value: 30, label: '30 天' },
              ]"
            />
          </div>
        </template>
        <BarChart v-if="forecastDays === 7" :bars="forecastWeek" />
        <DueCalendar v-else :days="forecast" />
      </StatsSection>

      <StatsSection id="ratings" title="評分分布">
        <template #actions>
          <div class="w-28">
            <SelectBox v-model="ratingPeriod" class="py-1.5 text-sm" aria-label="時間範圍">
              <option v-for="p in RATING_PERIODS" :key="p.value" :value="p.value">
                {{ p.label }}
              </option>
            </SelectBox>
          </div>
        </template>
        <div v-if="ratingPeriod === 'custom'" class="mb-4 flex items-center gap-2">
          <input
            v-model="customFrom"
            type="date"
            class="input min-w-0 flex-1 py-1.5 text-sm"
            :max="data.today"
            aria-label="開始日期"
          />
          <span class="text-muted">–</span>
          <input
            v-model="customTo"
            type="date"
            class="input min-w-0 flex-1 py-1.5 text-sm"
            :max="data.today"
            aria-label="結束日期"
          />
        </div>
        <DonutChart :slices="ratingRows" />
      </StatsSection>

      <StatsSection id="stability" title="熟練程度">
        <BarRows :rows="stabilityRows" />
        <div class="mt-3 space-y-0.5 text-xs text-muted">
          <p>大約多久之後，記得的機率會降到 90%。</p>
        </div>
      </StatsSection>

      <StatsSection id="hard" title="難記的卡片">
        <template #actions>
          <div class="flex items-center gap-3 text-xs text-muted">
            <span v-for="l in HARD_LEVELS" :key="l.label" class="flex items-center gap-1.5">
              <span class="size-2 rounded-full" :style="{ background: l.color }" />{{ l.label }}
            </span>
          </div>
        </template>
        <div v-if="hardCards.length" class="space-y-1.5">
          <div v-for="(c, i) in hardCards" :key="c.id" class="flex items-center gap-2">
            <span class="w-5 shrink-0 text-right text-xs font-semibold text-muted tabular-nums">{{
              hardPage * HARD_PAGE_SIZE + i + 1
            }}</span>
            <CardListItem
              class="min-w-0 flex-1"
              :card="c"
              compact
              :note="hardLevel(c.sched.difficulty)?.label"
              :note-color="hardLevel(c.sched.difficulty)?.color"
              @click="router.push(`/card/${c.id}`)"
            />
          </div>
          <!-- invisible copies of a row keep a short last page as tall as a full one,
               so the page buttons stay where they were -->
          <template v-if="hardPages > 1">
            <div
              v-for="n in HARD_PAGE_SIZE - hardCards.length"
              :key="`pad-${n}`"
              class="invisible flex items-center gap-2"
              aria-hidden="true"
            >
              <span class="w-5 shrink-0" />
              <CardListItem class="min-w-0 flex-1" :card="hardCards[0]!" compact tabindex="-1" />
            </div>
          </template>
          <div v-if="hardPages > 1" class="flex items-center justify-center gap-3 pt-2">
            <button
              class="icon-btn size-9"
              aria-label="上一頁"
              :disabled="hardPage === 0"
              @click="hardPage--"
            >
              <ChevronLeft :size="18" />
            </button>
            <span class="text-xs text-muted tabular-nums"
              >{{ hardPage + 1 }} / {{ hardPages }}</span
            >
            <button
              class="icon-btn size-9"
              aria-label="下一頁"
              :disabled="hardPage >= hardPages - 1"
              @click="hardPage++"
            >
              <ChevronRight :size="18" />
            </button>
          </div>
        </div>
        <p v-else class="text-sm text-muted">沒有特別難記的卡片。</p>
      </StatsSection>
    </div>
  </div>
</template>
