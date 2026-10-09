<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Check,
  ChevronRight,
  NotebookPen,
  PartyPopper,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from '@lucide/vue'
import PageHeader from '@/components/PageHeader.vue'
import PillTabs from '@/components/PillTabs.vue'
import ToggleSwitch from '@/components/ToggleSwitch.vue'
import CardListItem from '@/components/CardListItem.vue'
import CardFilterSheet from '@/components/CardFilterSheet.vue'
import CardFace from '@/components/CardFace.vue'
import SpeakButton from '@/components/SpeakButton.vue'
import DeckPickSheet from '@/components/DeckPickSheet.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { cardSubtitle, cardTitle, isComplete } from '@/lib/cards'
import { isMeaningCorrect, isSpellingCorrect, pickExample } from '@/lib/spelling'
import { activeFilterCount, applyFilter, defaultFilter } from '@/lib/filter'
import { shuffle } from '@/lib/id'
import { decksInScope, pickedDecks } from '@/lib/tree'
import { speak, stopSpeaking } from '@/lib/tts'

const route = useRoute()
const router = useRouter()
const data = useData()
const settings = useSettings()

const scope = computed(() => (route.query.scope ? String(route.query.scope) : null))

// decks can be narrowed here too; starts from what the study entry passed in
const allDecks = computed(() => decksInScope(data.nodes, scope.value))
const excluded = ref(new Set<string>())
const picked = pickedDecks(route.query.decks, data.nodes, scope.value)
if (picked) excluded.value = new Set(allDecks.value.filter((id) => !picked.includes(id)))
// only decks that can hold cards (parent decks never do)
const pickable = computed(() =>
  allDecks.value.filter((id) => !data.nodes.some((n) => n.parentId === id)),
)
const pickedCount = computed(() => pickable.value.filter((id) => !excluded.value.has(id)).length)
// undefined = the whole scope
const decks = computed(() =>
  pickedCount.value < pickable.value.length
    ? allDecks.value.filter((id) => !excluded.value.has(id))
    : undefined,
)
const showPick = ref(false)
// keep the choice in the URL so a reload keeps it
watch(decks, (d) => {
  router.replace({ query: { ...route.query, decks: d?.join(',') } })
})

// ----- setup -------------------------------------------------------------
const filter = ref(defaultFilter())
const showFilter = ref(false)
const includeSuspended = ref(false)
const order = ref<'random' | 'sequential'>('random')
const direction = ref<'forward' | 'reverse' | 'mixed'>('forward')
// spell: type the word from its meaning and an example sentence (vocab cards only)
const mode = ref<'flip' | 'spell'>('flip')

const pool = computed(() =>
  (decks.value ? data.cardsInDecks(decks.value) : data.cardsInScope(scope.value)).filter(
    (c) => isComplete(c) && (includeSuspended.value || !c.suspended),
  ),
)
const filtered = computed(() => applyFilter(pool.value, filter.value, data.scheduler, data.now))
const hasVocab = computed(() => filtered.value.some((c) => c.type === 'vocab'))

const selected = ref(new Set<string>())
const touched = ref(false)
const limit = ref(80)

onMounted(() => {
  if (route.query.pick) {
    try {
      const ids = JSON.parse(sessionStorage.getItem('sr.practice.cards') ?? '[]') as string[]
      selected.value = new Set(ids)
      touched.value = true
      includeSuspended.value = true
    } catch {
      /* ignore */
    }
  }
})

// until the user picks cards by hand, everything that matches the filter is selected
const effective = computed(() =>
  touched.value ? filtered.value.filter((c) => selected.value.has(c.id)) : filtered.value,
)

function toggle(id: string) {
  if (!touched.value) {
    selected.value = new Set(filtered.value.map((c) => c.id))
    touched.value = true
  }
  const s = new Set(selected.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selected.value = s
}
function selectAll(on: boolean) {
  touched.value = true
  selected.value = on ? new Set(filtered.value.map((c) => c.id)) : new Set()
}
const isSel = (id: string) => !touched.value || selected.value.has(id)

// ----- run -----------------------------------------------------------------
interface Item {
  id: string
  reverse: boolean
  spell?: boolean
  /** spelling: the example sentence played along with the word */
  exId?: string
}
const running = ref(false)
const queue = ref<Item[]>([])
const cur = ref<Item | null>(null)
const revealed = ref(false)
const total = ref(0)
const remembered = ref(new Set<string>())
const forgotten = ref(new Set<string>())
const finished = ref(false)
const typed = ref('')
const typedMeaning = ref('')
const wordOk = ref(false)
const meaningOk = ref(false)
const meaningInput = ref<HTMLInputElement>()
const checked = ref(false)
// the verdict can be changed by hand, e.g. for a typo that should still count
const verdict = ref(false)
const answerInput = ref<HTMLInputElement>()

const curCard = computed(() => (cur.value ? data.cardById.get(cur.value.id) : undefined))

function begin(ids?: string[]) {
  const cards = ids ? ids.map((id) => data.cardById.get(id)!).filter(Boolean) : effective.value
  const list = order.value === 'random' ? shuffle(cards) : cards
  queue.value = list.map((c) => {
    if (mode.value === 'spell' && c.type === 'vocab') {
      return { id: c.id, reverse: true, spell: true, exId: pickExample(c)?.id }
    }
    return {
      id: c.id,
      reverse:
        c.type === 'vocab' &&
        (direction.value === 'reverse' || (direction.value === 'mixed' && Math.random() < 0.5)),
    }
  })
  total.value = queue.value.length
  remembered.value = new Set()
  forgotten.value = new Set()
  finished.value = false
  running.value = true
  next()
}

function next() {
  revealed.value = false
  typed.value = ''
  checked.value = false
  typedMeaning.value = ''
  cur.value = queue.value.shift() ?? null
  if (!cur.value) finished.value = true
  else if (cur.value.spell) void nextTick(() => answerInput.value?.focus())
}

const curExample = computed(() => {
  const c = curCard.value
  if (!cur.value?.spell || c?.type !== 'vocab') return undefined
  return c.examples.find((e) => e.id === cur.value?.exId)
})
// spelling by listening: only the word and its example are played, nothing is shown
const listen = computed(() => !!cur.value?.spell && !revealed.value)
watch(
  () => [cur.value, running.value] as const,
  async () => {
    const c = curCard.value
    if (!cur.value?.spell || c?.type !== 'vocab' || !settings.device.tts.autoPlay) return
    const cfg = settings.device.tts[c.lang]
    await speak(c.word, c.lang, cfg, c.reading)
    if (curExample.value) await speak(curExample.value.sentence, c.lang, cfg)
  },
)

function check() {
  const c = curCard.value
  if (checked.value || c?.type !== 'vocab') return
  wordOk.value = isSpellingCorrect(typed.value, c)
  meaningOk.value = isMeaningCorrect(typedMeaning.value, c)
  verdict.value = wordOk.value && meaningOk.value
  checked.value = true
  revealed.value = true
}
const confirmSpell = () => answer(verdict.value)

function answer(ok: boolean) {
  const it = cur.value
  if (!it) return
  if (ok) {
    if (!forgotten.value.has(it.id)) remembered.value.add(it.id)
  } else {
    forgotten.value.add(it.id)
    // show it again a little later in this round
    const pos = Math.min(queue.value.length, 3 + Math.floor(Math.random() * 3))
    queue.value.splice(pos, 0, { ...it })
  }
  next()
}

function onKey(e: KeyboardEvent) {
  if (!running.value || !cur.value || e.target instanceof HTMLInputElement) return
  if (cur.value.spell) {
    if (checked.value && e.key === 'Enter') {
      e.preventDefault()
      confirmSpell()
    }
    return
  }
  if (!revealed.value && (e.key === ' ' || e.key === 'Enter')) {
    e.preventDefault()
    revealed.value = true
  } else if (revealed.value) {
    if (e.key === '1') {
      e.preventDefault()
      answer(false)
    }
    if (e.key === '2' || e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      answer(true)
    }
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  stopSpeaking()
})

// ----- summary: cards that were forgotten --------------------------------
const forgottenCards = computed(() =>
  [...forgotten.value].flatMap((id) => data.cardById.get(id) ?? []),
)
const noteCard = ref<string | null>(null)
const noteText = ref('')
const showNote = computed({
  get: () => noteCard.value !== null,
  set: (v) => {
    if (!v) noteCard.value = null
  },
})
const toggleStar = (id: string) => {
  const c = data.cardById.get(id)
  if (c) void data.patchCards([id], { starred: !c.starred })
}
function openNote(id: string) {
  const c = data.cardById.get(id)
  if (c?.type !== 'vocab') return
  noteText.value = c.note
  noteCard.value = id
}
async function saveNote() {
  const c = noteCard.value ? data.cardById.get(noteCard.value) : undefined
  if (c?.type === 'vocab') await data.saveCard({ ...c, note: noteText.value })
  noteCard.value = null
}

const progress = computed(() => {
  const doneCount = remembered.value.size + forgotten.value.size
  return total.value ? Math.min(1, doneCount / total.value) : 0
})
</script>

<template>
  <!-- setup -->
  <div v-if="!running">
    <PageHeader title="練習模式" subtitle="不影響複習排程" />

    <section class="card mb-4 space-y-4">
      <button
        v-if="pickable.length > 1"
        type="button"
        class="flex w-full items-center justify-between gap-3"
        @click="showPick = true"
      >
        <span class="text-sm font-semibold">練習範圍</span>
        <span class="flex items-center gap-1 text-sm text-muted">
          {{ decks ? `${pickedCount} / ${pickable.length} 個牌組` : '全部' }}
          <ChevronRight :size="16" class="shrink-0" />
        </span>
      </button>
      <div>
        <label class="label">順序</label>
        <PillTabs
          v-model="order"
          size="sm"
          :options="[
            { value: 'random', label: '隨機' },
            { value: 'sequential', label: '依列表順序' },
          ]"
        />
      </div>
      <div v-if="hasVocab">
        <label class="label">玩法</label>
        <PillTabs
          v-model="mode"
          size="sm"
          :options="[
            { value: 'flip', label: '翻卡' },
            { value: 'spell', label: '聽寫' },
          ]"
        />
        <p class="mt-1.5 text-xs text-muted">
          {{
            mode === 'flip'
              ? '看卡片回想答案，自己判斷記不記得'
              : '聽單字與例句發音，輸入單字與意思（正反卡仍用翻卡）'
          }}
        </p>
      </div>
      <div v-if="hasVocab && mode === 'flip'">
        <label class="label">單字卡方向</label>
        <PillTabs
          v-model="direction"
          size="sm"
          :options="[
            { value: 'forward', label: '單字 → 意思' },
            { value: 'reverse', label: '意思 → 單字' },
            { value: 'mixed', label: '混合' },
          ]"
        />
      </div>
      <div class="flex items-center justify-between">
        <span class="text-sm font-semibold">包含暫停的卡片</span>
        <ToggleSwitch v-model="includeSuspended" />
      </div>
    </section>

    <div class="mb-3 flex items-center gap-2">
      <div class="relative flex-1">
        <Search :size="16" class="absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
        <input v-model="filter.q" class="input py-2 pl-10" placeholder="搜尋卡片" />
      </div>
      <button class="icon-btn relative" aria-label="篩選" @click="showFilter = true">
        <SlidersHorizontal :size="18" />
        <span
          v-if="activeFilterCount(filter)"
          class="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white"
        >
          {{ activeFilterCount(filter) }}
        </span>
      </button>
    </div>
    <div class="mb-2 flex items-center justify-between px-1 text-xs text-muted">
      <span>已選 {{ effective.length }} / {{ filtered.length }} 張</span>
      <span class="flex gap-3 font-semibold text-primary">
        <button @click="selectAll(true)">全選</button>
        <button @click="selectAll(false)">全不選</button>
      </span>
    </div>
    <div class="space-y-2 pb-24">
      <CardListItem
        v-for="c in filtered.slice(0, limit)"
        :key="c.id"
        :card="c"
        selectable
        :selected="isSel(c.id)"
        show-deck
        @click="toggle(c.id)"
      />
      <button v-if="filtered.length > limit" class="btn btn-ghost w-full" @click="limit += 100">
        顯示更多
      </button>
      <p v-if="!filtered.length" class="py-8 text-center text-sm text-muted">
        沒有可以練習的卡片（未完成的卡片不會出現）
      </p>
    </div>

    <div
      class="fixed inset-x-0 bottom-0 z-20 flex justify-center bg-gradient-to-t from-bg via-bg px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <button
        class="btn btn-primary w-full max-w-xl py-4 text-lg"
        :disabled="!effective.length"
        @click="begin()"
      >
        開始練習（{{ effective.length }} 張）
      </button>
    </div>

    <CardFilterSheet v-model="showFilter" v-model:filter="filter" hide-draft />
    <DeckPickSheet
      v-model="showPick"
      v-model:excluded="excluded"
      :scope="scope"
      :decks="allDecks"
      count="cards"
    />
  </div>

  <!-- running -->
  <div v-else class="flex min-h-[calc(100dvh-2.5rem)] flex-col">
    <header class="flex items-center gap-3 py-3">
      <button class="icon-btn" aria-label="結束練習" @click="running = false">
        <X :size="20" />
      </button>
      <div class="flex-1 text-center font-bold">練習</div>
      <span class="w-11 text-right text-xs font-semibold text-muted">{{
        queue.length + (cur ? 1 : 0)
      }}</span>
    </header>
    <div class="mb-4 h-2 overflow-hidden rounded-full bg-surface">
      <div
        class="h-full rounded-full bg-primary transition-[width]"
        :style="{ width: `${progress * 100}%` }"
      />
    </div>

    <template v-if="curCard && cur">
      <section
        class="card flex min-h-[45dvh] flex-1 flex-col justify-center px-6 py-8"
        @click="cur.spell || (revealed = true)"
      >
        <!-- spelling by listening: play the word and its example, show nothing -->
        <div v-if="listen && curCard.type === 'vocab'" class="space-y-6 text-center">
          <div class="flex items-start justify-center gap-8">
            <div class="flex flex-col items-center gap-1">
              <SpeakButton
                :text="curCard.word"
                :lang="curCard.lang"
                :reading="curCard.reading"
                :size="40"
              />
              <span class="text-xs text-muted">單字</span>
            </div>
            <div v-if="curExample" class="flex flex-col items-center gap-1">
              <SpeakButton :text="curExample.sentence" :lang="curCard.lang" :size="40" />
              <span class="text-xs text-muted">例句</span>
            </div>
          </div>
        </div>
        <CardFace v-else :card="curCard" :revealed="revealed" :reverse="cur.reverse" />
      </section>
      <div
        v-if="cur.spell"
        class="sticky bottom-0 mt-4 bg-bg pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <template v-if="!checked">
          <input
            ref="answerInput"
            v-model="typed"
            class="input mb-2 text-center text-lg"
            placeholder="輸入單字"
            autocapitalize="off"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            @keydown.enter.prevent="meaningInput?.focus()"
          />
          <input
            ref="meaningInput"
            v-model="typedMeaning"
            class="input mb-2 text-center text-lg"
            placeholder="輸入意思"
            autocomplete="off"
            @keydown.enter.prevent="check"
          />
          <div class="grid grid-cols-2 gap-2">
            <button class="btn btn-ghost py-4" @click="check">不知道</button>
            <button
              class="btn btn-primary py-4"
              :disabled="!typed.trim() && !typedMeaning.trim()"
              @click="check"
            >
              檢查
            </button>
          </div>
        </template>
        <template v-else>
          <div
            class="mb-2 space-y-2 rounded-2xl border border-line bg-surface px-4 py-3 text-center"
          >
            <p class="text-xs text-muted">你的答案</p>
            <div
              v-for="r in [
                { label: '單字', text: typed, ok: wordOk },
                { label: '意思', text: typedMeaning, ok: meaningOk },
              ]"
              :key="r.label"
              class="flex items-baseline gap-3"
            >
              <span class="w-8 shrink-0 text-xs text-muted">{{ r.label }}</span>
              <span
                class="flex-1 text-lg font-semibold break-all"
                :style="{ color: r.ok ? 'var(--success)' : 'var(--danger)' }"
              >
                {{ r.text.trim() || '（空白）' }}
              </span>
            </div>
          </div>
          <div class="mb-2 grid grid-cols-2 gap-2">
            <button
              v-for="o in [
                { ok: true, label: '正確', icon: Check },
                { ok: false, label: '錯誤', icon: X },
              ]"
              :key="o.label"
              class="btn py-2.5 text-sm"
              :class="
                verdict !== o.ok
                  ? 'btn-ghost text-muted'
                  : o.ok
                    ? 'bg-success text-white'
                    : 'bg-danger text-white'
              "
              :aria-pressed="verdict === o.ok"
              @click="verdict = o.ok"
            >
              <component :is="o.icon" :size="16" /> {{ o.label }}
            </button>
          </div>
          <button class="btn btn-primary w-full py-4" @click="confirmSpell">下一張</button>
        </template>
      </div>
      <div
        v-else
        class="sticky bottom-0 mt-4 bg-bg pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <button
          v-if="!revealed"
          class="btn btn-primary w-full py-4 text-lg"
          @click="revealed = true"
        >
          顯示答案
        </button>
        <div v-else class="grid grid-cols-2 gap-2">
          <button class="btn btn-danger py-4" @click="answer(false)"><X :size="18" /> 忘記</button>
          <button
            class="btn py-4 text-white"
            style="background: var(--success)"
            @click="answer(true)"
          >
            <Check :size="18" /> 記得
          </button>
        </div>
      </div>
    </template>

    <section
      v-else-if="finished"
      class="card flex flex-1 flex-col items-center justify-center gap-4 text-center"
    >
      <PartyPopper :size="44" class="text-primary" />
      <p class="text-xl font-bold">練習完成！</p>
      <p class="text-sm text-muted">
        一次就記得 {{ remembered.size }} 張 · 曾經忘記 {{ forgotten.size }} 張
      </p>
      <div v-if="forgottenCards.length" class="w-full space-y-2 text-left">
        <p class="px-1 text-sm font-semibold">不記得的卡片</p>
        <div
          v-for="c in forgottenCards"
          :key="c.id"
          class="flex items-center gap-2 rounded-2xl bg-surface-2 px-4 py-2.5"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold">{{ cardTitle(c) }}</p>
            <p class="truncate text-sm text-muted">{{ cardSubtitle(c) }}</p>
          </div>
          <button
            v-if="c.type === 'vocab'"
            class="icon-btn size-10"
            :class="c.note.trim() ? 'text-primary' : ''"
            aria-label="備註"
            @click="openNote(c.id)"
          >
            <NotebookPen :size="18" />
          </button>
          <button
            class="icon-btn size-10"
            :aria-label="c.starred ? '取消星號' : '加星號'"
            @click="toggleStar(c.id)"
          >
            <Star :size="18" :class="c.starred ? 'fill-warn text-warn' : ''" />
          </button>
        </div>
      </div>
      <div class="flex flex-wrap justify-center gap-2">
        <button v-if="forgotten.size" class="btn btn-soft" @click="begin([...forgotten])">
          再練忘記的
        </button>
        <button class="btn btn-ghost" @click="running = false">重新選卡</button>
        <button class="btn btn-primary" @click="router.back()">返回</button>
      </div>
    </section>

    <BottomSheet v-model="showNote" title="備註">
      <textarea v-model="noteText" class="input mb-3 min-h-28" placeholder="補充說明、相似字…" />
      <button class="btn btn-primary w-full" @click="saveNote">儲存</button>
    </BottomSheet>
  </div>
</template>
