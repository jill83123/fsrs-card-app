<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { liveQuery } from 'dexie'
import SelectBox from '@/components/SelectBox.vue'
import PillTabs from '@/components/PillTabs.vue'
import BarChart, { type Bar } from '@/components/stats/BarChart.vue'
import BarRows from '@/components/stats/BarRows.vue'
import DonutChart from '@/components/stats/DonutChart.vue'
import DueCalendar from '@/components/stats/DueCalendar.vue'
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
  studyDayOf,
  studyDayStart,
  weekdayLabel,
} from '@/lib/date'
import { cardTitle, isLearned, isStudyable } from '@/lib/cards'
import { GRADES, Rating, retrievability, State } from '@/lib/fsrs'

/** deck id to limit the stats to its subtree; null = everything */
const props = defineProps<{ scope: string | null }>()
const data = useData()
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
const logs = useLiveQuery<{
  counts: Map<string, number>
  /** per study day: how many times each grade (Again..Easy) was pressed */
  ratings: Map<string, number[]>
  recent: RecentLog[]
}>(
  () =>
    liveQuery(async () => {
      const ids = scopeIds.value
      const recentStart = addDays(data.today, -(RECENT_DAYS - 1))
      const counts = new Map<string, number>()
      const ratings = new Map<string, number[]>()
      const recent: RecentLog[] = []
      await db.logs.orderBy('studyDay').each((l) => {
        if (l.deleted || (ids && !ids.has(l.cardId))) return
        counts.set(l.studyDay, (counts.get(l.studyDay) ?? 0) + 1)
        let r = ratings.get(l.studyDay)
        if (!r) ratings.set(l.studyDay, (r = [0, 0, 0, 0]))
        if (l.rating >= Rating.Again && l.rating <= Rating.Easy) r[l.rating - 1]!++
        if (l.studyDay >= recentStart)
          recent.push({ day: l.studyDay, rating: l.rating, prevState: l.prev.state })
      })
      return { counts, ratings, recent }
    }),
  { counts: new Map(), ratings: new Map(), recent: [] },
  [scopeIds, () => data.today],
)
const counts = computed(() => logs.value.counts)
const recentLogs = computed(() => logs.value.recent)

// --- heatmap -----------------------------------------------------------------
// range: the last 53 weeks, or one calendar year
const year = ref<'recent' | number>('recent')
const hovered = ref<{ day: string; n: number } | null>(null)
watch([year, () => props.scope], () => (hovered.value = null))
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
        n: counts.value.get(day) ?? 0,
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
  [() => counts.value, year, scroller],
  async () => {
    await nextTick()
    const el = scroller.value
    if (!el) return
    const past = year.value !== 'recent' && range.value.last < data.today
    el.scrollTo({ left: past ? 0 : el.scrollWidth })
  },
  { immediate: true },
)

const totalReviews = computed(() => visibleDays.value.reduce((a, c) => a + c.n, 0))
const activeDays = computed(() => visibleDays.value.filter((c) => c.n).length)

// --- headline numbers ----------------------------------------------------------
const streak = computed(() => {
  let n = 0
  let day = data.today
  if (!counts.value.get(day)) day = addDays(day, -1)
  while (counts.value.get(day)) {
    n++
    day = addDays(day, -1)
  }
  return n
})
const longestStreak = computed(() => {
  let best = 0
  let run = 0
  let prev = ''
  for (const day of counts.value.keys()) {
    run = prev && addDays(prev, 1) === day ? run + 1 : 1
    best = Math.max(best, run)
    prev = day
  }
  return best
})
const dailyAverage = computed(() => recentLogs.value.length / RECENT_DAYS)

const totals = computed(() => ({
  cards: scopeCards.value.length,
  learned: scopeCards.value.filter(isLearned).length,
}))

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
    title: `${i === 0 ? '今天（含逾期）' : formatDayLabel(day)}：${n} 張`,
    strong: i === 0,
  })),
)
const forecastWeekTotal = computed(() => forecastWeek.value.reduce((a, b) => a + b.n, 0))

// --- added / newly learned per day -----------------------------------------------
const trendKind = ref<'added' | 'learned'>('added')
const trendDays = computed(() =>
  Array.from({ length: RECENT_DAYS }, (_, i) => addDays(data.today, i - (RECENT_DAYS - 1))),
)
const addedByDay = computed(() => {
  const hour = settings.synced.study.rolloverHour
  const m = new Map<string, number>()
  for (const c of scopeCards.value) {
    const day = studyDayOf(c.createdAt, hour)
    m.set(day, (m.get(day) ?? 0) + 1)
  }
  return m
})
const learnedByDay = computed(() => {
  const m = new Map<string, number>()
  for (const l of recentLogs.value)
    if (l.prevState === State.New) m.set(l.day, (m.get(l.day) ?? 0) + 1)
  return m
})
const trendSum = (m: Map<string, number>) =>
  trendDays.value.reduce((a, d) => a + (m.get(d) ?? 0), 0)
const trendOptions = computed(() => [
  { value: 'added' as const, label: `新增卡片（${trendSum(addedByDay.value)}）` },
  { value: 'learned' as const, label: `新學卡片（${trendSum(learnedByDay.value)}）` },
])
const trend = computed<Bar[]>(() => {
  const m = trendKind.value === 'added' ? addedByDay.value : learnedByDay.value
  const verb = trendKind.value === 'added' ? '新增' : '新學'
  return trendDays.value.map((day, i) => {
    const d = parseYmd(day)
    const n = m.get(day) ?? 0
    const last = i === RECENT_DAYS - 1
    return {
      key: day,
      label: last
        ? '今天'
        : (RECENT_DAYS - 1 - i) % 7 === 0
          ? `${d.getMonth() + 1}/${d.getDate()}`
          : '',
      n,
      title: `${formatDayLabel(day)}：${verb} ${n} 張`,
      strong: last,
    }
  })
})

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
const stabilityTotal = computed(() => stabilityRows.value.reduce((a, r) => a + r.n, 0))

// --- hardest cards -------------------------------------------------------------------------
const hardCards = computed(() =>
  scopeCards.value
    .filter((c) => c.sched.lapses > 0)
    .sort((a, b) => b.sched.lapses - a.sched.lapses || b.sched.difficulty - a.sched.difficulty)
    .slice(0, 10)
    .map((c) => ({
      card: c,
      deck: data.nodeById.get(c.deckId)?.name,
      fam: retrievability(data.scheduler, c.sched, data.now),
    })),
)
const multiDeck = computed(() => new Set(scopeCards.value.map((c) => c.deckId)).size > 1)
</script>

<template>
  <div>
    <div class="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div class="card p-4">
        <p class="text-xs font-semibold text-muted">今日複習</p>
        <p class="text-2xl font-bold">{{ counts.get(data.today) ?? 0 }}</p>
      </div>
      <div class="card p-4">
        <p class="text-xs font-semibold text-muted">近 30 天日均</p>
        <p class="text-2xl font-bold">
          {{ dailyAverage.toFixed(1).replace(/\.0$/, '') }}
        </p>
      </div>
      <div class="card p-4">
        <p class="text-xs font-semibold text-muted">連續天數</p>
        <p class="text-2xl font-bold">{{ streak }}</p>
      </div>
      <div class="card p-4">
        <p class="text-xs font-semibold text-muted">最長連續</p>
        <p class="text-2xl font-bold">{{ longestStreak }}</p>
      </div>
      <div class="card p-4">
        <p class="text-xs font-semibold text-muted">卡片總數</p>
        <p class="text-2xl font-bold">{{ totals.cards }}</p>
      </div>
      <div class="card p-4">
        <p class="text-xs font-semibold text-muted">已學習</p>
        <p class="text-2xl font-bold">{{ totals.learned }}</p>
      </div>
    </div>

    <div class="flex flex-col gap-5">
      <StatsSection id="retention" title="記憶保留率">
        <div class="grid grid-cols-2 gap-3">
          <div v-for="r in retention" :key="r.label" class="rounded-xl bg-surface-2 p-3">
            <p class="text-xs font-semibold text-muted">{{ r.label }}</p>
            <p class="text-2xl font-bold">{{ r.rate === null ? '—' : pctText(r.rate) }}</p>
            <p class="text-xs text-muted">
              {{ r.n }} 次複習
              <template v-if="r.rate !== null">
                · 比目標{{ r.rate >= targetRetention ? '高' : '低' }}
                {{ pctText(Math.abs(r.rate - targetRetention)) }}
              </template>
            </p>
          </div>
        </div>
        <div class="mt-3 space-y-0.5 text-xs text-muted">
          <p>目標保留率 {{ pctText(targetRetention) }}。只計算複習卡，按「重來」算忘記。</p>
          <p>明顯低於目標：間隔太長。高出很多：複習得太頻繁。</p>
        </div>
      </StatsSection>

      <StatsSection id="heatmap" title="複習熱力圖">
        <template #actions>
          <div class="w-32">
            <SelectBox v-model="year" class="py-1.5 text-sm">
              <option v-for="o in yearOptions" :key="o.value" :value="o.value">
                {{ o.label }}
              </option>
            </SelectBox>
          </div>
        </template>
        <div ref="scroller" class="overflow-x-auto pb-2">
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
                <span v-for="(d, i) in ['一', '', '三', '', '五', '', '日']" :key="i" class="h-3">{{
                  d
                }}</span>
              </div>
              <div v-for="(col, i) in weeks" :key="i" class="flex flex-col gap-[3px]">
                <div
                  v-for="c in col"
                  :key="c.day"
                  class="size-3 rounded-[3px]"
                  :class="{ invisible: c.hidden, 'ring-1 ring-ink/50': c.day === data.today }"
                  :style="{ background: levelColor(level(c.n)) }"
                  :title="`${c.day}：${c.n} 次`"
                  @mouseenter="hovered = c"
                  @click="hovered = c"
                />
              </div>
            </div>
          </div>
        </div>
        <div class="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
          <span>{{
            hovered
              ? `${formatDayLabel(hovered.day)}：${hovered.n} 次`
              : `共 ${totalReviews} 次 · ${activeDays} 天有複習`
          }}</span>
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
        <BarChart v-if="forecastDays === 7" :bars="forecastWeek">
          共 {{ forecastWeekTotal }} 張 · 今天包含已逾期的卡片；不含新卡。
        </BarChart>
        <DueCalendar v-else :days="forecast" />
      </StatsSection>

      <StatsSection id="trend" title="近 30 天新增與學習">
        <PillTabs v-model="trendKind" size="sm" class="mb-4" :options="trendOptions" />
        <BarChart :bars="trend">
          {{
            trendKind === 'added' ? '每天新增到牌組的卡片數。' : '每天第一次學習的新卡數。'
          }}點選長條可看當天數字。
        </BarChart>
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
        <div class="mt-3 space-y-0.5 text-xs text-muted">
          <p>含新卡與學習中的評分。</p>
          <p>「重來」偏多時，可以考慮少加一點新卡。</p>
        </div>
      </StatsSection>

      <StatsSection id="stability" title="熟練程度">
        <BarRows :rows="stabilityRows" />
        <div class="mt-3 space-y-0.5 text-xs text-muted">
          <p>依記憶穩定度分組：大約多久之後，記得的機率會降到 90%。</p>
          <p>共 {{ stabilityTotal }} 張已學過的卡片。</p>
        </div>
      </StatsSection>

      <StatsSection id="hard" title="難記的卡片">
        <div v-if="hardCards.length" class="-mx-1 flex flex-col">
          <RouterLink
            v-for="(h, i) in hardCards"
            :key="h.card.id"
            :to="`/card/${h.card.id}`"
            class="flex items-center gap-3 rounded-xl px-1 py-2 transition hover:bg-surface-2"
          >
            <span class="w-5 shrink-0 text-center text-xs font-semibold text-muted">{{
              i + 1
            }}</span>
            <div class="min-w-0 flex-1">
              <p class="truncate font-semibold">{{ cardTitle(h.card) || '（空白）' }}</p>
              <p class="truncate text-[11px] text-muted">
                <span v-if="multiDeck && h.deck" class="mr-3">{{ h.deck }}</span>
                <span v-if="h.fam !== null">熟悉度 {{ Math.round(h.fam * 100) }}%</span>
              </p>
            </div>
            <span class="shrink-0 text-sm font-semibold tabular-nums"
              >忘記 {{ h.card.sched.lapses }} 次</span
            >
          </RouterLink>
        </div>
        <p v-else class="text-sm text-muted">還沒有忘記過的卡片。</p>
      </StatsSection>
    </div>
  </div>
</template>
