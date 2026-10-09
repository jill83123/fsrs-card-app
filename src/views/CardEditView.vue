<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { Eye, Plus, Sparkles, Trash2 } from '@lucide/vue'
import PageHeader from '@/components/PageHeader.vue'
import PillTabs from '@/components/PillTabs.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import SpeakButton from '@/components/SpeakButton.vue'
import DictLinks from '@/components/DictLinks.vue'
import CardFace from '@/components/CardFace.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import SelectBox from '@/components/SelectBox.vue'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { LANGS } from '@/db/defaults'
import type { BasicCard, Card, Lang, VocabCard } from '@/db/types'
import { isComplete, newBasicCard, newVocabCard } from '@/lib/cards'
import { uid } from '@/lib/id'
import { pathTo } from '@/lib/tree'
import { db } from '@/db'
import { canAutoReading, generateReading } from '@/lib/tts/autoReading'

const route = useRoute()
const router = useRouter()
const data = useData()
const settings = useSettings()
const ui = useUi()

const genBusy = ref(false)
async function autoReading() {
  const v = vocab.value
  if (!v || genBusy.value) return
  if (!v.word.trim()) return ui.toast('請先輸入單字', 'error')
  genBusy.value = true
  try {
    const r = await generateReading(v.word, v.lang)
    if (r) v.reading = r
    else ui.toast('無法產生這個單字的讀音', 'error')
  } catch {
    ui.toast('產生讀音失敗', 'error')
  } finally {
    genBusy.value = false
  }
}

const editingId = computed(() => (route.name === 'card-edit' ? String(route.params.id) : null))
const LAST_LANG = 'sr.lastLang'

const card = ref<Card | null>(null)
const original = ref('')
let saved = false

async function init() {
  saved = false
  if (editingId.value) {
    const c = await db.cards.get(editingId.value)
    card.value = c && !c.deleted ? structuredClone(c) : null
  } else {
    const deck = String(route.query.deck ?? '')
    const type = route.query.type === 'vocab' ? 'vocab' : 'basic'
    const lang = (route.query.lang as Lang) || (localStorage.getItem(LAST_LANG) as Lang) || 'en'
    card.value = type === 'vocab' ? newVocabCard(deck, lang) : newBasicCard(deck)
  }
  original.value = JSON.stringify(card.value)
}
watch(() => route.fullPath, init, { immediate: true })

const dirty = computed(() => card.value && JSON.stringify(card.value) !== original.value)

const deckOptions = computed(() =>
  data.nodes
    .filter((n) => !data.nodes.some((c) => c.parentId === n.id))
    .map((n) => ({
      id: n.id,
      label: pathTo(data.nodes, n.id)
        .map((x) => x.name)
        .join(' / '),
    })),
)

/** Switch between card types while creating, carrying over the main text. */
function switchType(t: 'basic' | 'vocab') {
  const c = card.value
  if (!c || c.type === t) return
  if (t === 'vocab') {
    const v = newVocabCard(c.deckId, (localStorage.getItem(LAST_LANG) as Lang) || 'en')
    const b = c as BasicCard
    v.word = b.front
    v.meaning = b.back
    v.id = c.id
    card.value = v
  } else {
    const b = newBasicCard(c.deckId)
    const v = c as VocabCard
    b.front = v.word
    b.back = v.meaning
    b.id = c.id
    card.value = b
  }
}

const typeModel = computed({
  get: () => card.value?.type ?? 'basic',
  set: (t) => switchType(t),
})

const vocab = computed(() => (card.value?.type === 'vocab' ? card.value : null))
const basic = computed(() => (card.value?.type === 'basic' ? card.value : null))

const missing = computed(() => {
  const c = card.value
  if (!c) return []
  const m: string[] = []
  if (c.type === 'basic') {
    if (!c.front.trim()) m.push('正面')
    if (!c.back.trim()) m.push('反面')
  } else {
    if (!c.word.trim()) m.push('單字')
    if (!c.meaning.trim()) m.push('意思')
  }
  return m
})

const frontEmpty = computed(() => {
  const c = card.value
  return !c || (c.type === 'basic' ? !c.front.trim() : !c.word.trim())
})

function togglePos(id: string) {
  const v = vocab.value
  if (!v) return
  v.pos = v.pos.includes(id) ? v.pos.filter((p) => p !== id) : [...v.pos, id]
}

function addExample() {
  vocab.value?.examples.push({ id: uid(), sentence: '', translation: '' })
}

async function save(next = false) {
  const c = card.value
  if (!c) return
  if (!c.deckId || !data.nodeById.get(c.deckId)) return ui.toast('請選擇牌組', 'error')
  if (frontEmpty.value)
    return ui.toast(c.type === 'basic' ? '至少要填寫正面' : '至少要填寫單字', 'error')
  if (c.type === 'vocab') {
    c.examples = c.examples.filter((e) => e.sentence.trim() || e.translation.trim())
    localStorage.setItem(LAST_LANG, c.lang)
  }
  await data.saveCard(c)
  saved = true
  ui.toast(isComplete(c) ? '已儲存' : '已儲存為未完成卡片', 'success')
  if (next) {
    const deck = c.deckId
    const type = c.type
    card.value = type === 'vocab' ? newVocabCard(deck, (c as VocabCard).lang) : newBasicCard(deck)
    original.value = JSON.stringify(card.value)
    saved = false
    window.scrollTo({ top: 0 })
  } else if (editingId.value) router.back()
  else router.replace(`/node/${c.deckId}`)
}

onBeforeRouteLeave(async () => {
  if (saved || !dirty.value) return true
  return ui.confirm('放棄尚未儲存的變更？', { confirmText: '放棄', danger: true })
})

const showPreview = ref(false)
const previewRevealed = ref(false)
</script>

<template>
  <div v-if="card">
    <PageHeader hide-back>
      <template #left>
        <button class="btn px-2 text-muted hover:text-ink" @click="router.back()">取消</button>
      </template>
      <template #title>{{ editingId ? '編輯卡片' : '新卡片' }}</template>
      <template #right>
        <button class="btn btn-primary py-2" :disabled="frontEmpty" @click="save()">儲存</button>
      </template>
    </PageHeader>

    <div class="space-y-4">
      <PillTabs
        v-if="!editingId"
        v-model="typeModel"
        :options="[
          { value: 'basic', label: '正反卡' },
          { value: 'vocab', label: '單字卡' },
        ]"
      />

      <div>
        <label class="label">牌組</label>
        <SelectBox v-model="card.deckId">
          <option value="" disabled>選擇牌組</option>
          <option v-for="d in deckOptions" :key="d.id" :value="d.id">{{ d.label }}</option>
        </SelectBox>
      </div>

      <!-- basic -->
      <template v-if="basic">
        <div>
          <label class="label">正面（問題）</label>
          <MarkdownEditor
            v-model="basic.front"
            placeholder="輸入問題，支援 Markdown 與 ||防劇透||"
            :rows="4"
          />
        </div>
        <div>
          <label class="label">反面（答案）</label>
          <MarkdownEditor v-model="basic.back" placeholder="輸入答案（可以之後再補）" :rows="5" />
        </div>
      </template>

      <!-- vocab -->
      <template v-if="vocab">
        <div>
          <label class="label">語言</label>
          <PillTabs
            v-model="vocab.lang"
            :options="LANGS.map((l) => ({ value: l.id, label: l.label }))"
          />
        </div>
        <div class="card space-y-3">
          <div>
            <label class="label">單字</label>
            <div class="flex items-center gap-2">
              <input
                v-model="vocab.word"
                class="input text-lg font-semibold"
                placeholder="想記住的單字"
              />
              <SpeakButton :text="vocab.word" :lang="vocab.lang" :reading="vocab.reading" />
            </div>
          </div>
          <div>
            <div class="flex items-center justify-between">
              <label class="label">讀音（選填）</label>
              <button
                v-if="canAutoReading(vocab.lang)"
                class="mb-1.5 flex items-center gap-1 text-xs font-semibold text-primary disabled:opacity-50"
                :disabled="genBusy"
                @click="autoReading"
              >
                <Sparkles :size="14" /> {{ genBusy ? '產生中…' : '自動產生' }}
              </button>
            </div>
            <input
              v-model="vocab.reading"
              class="input"
              :placeholder="
                vocab.lang === 'ja' ? 'ふりがな' : vocab.lang === 'en' ? '/fəˈnetɪk/' : 'hangugeo'
              "
            />
            <div class="mt-1.5 space-y-0.5 text-xs text-muted">
              <p
                v-for="line in {
                  en: [
                    '填寫 IPA（/əˈreɪndʒ/）或 KK 音標（[əˋrendʒ]）時，Kokoro 會照讀音發音。',
                    '有多個讀音時用第一個。',
                  ],
                  ja: [
                    '填寫假名時會照假名發音，可以指定多音字的念法。',
                    '寫了多個讀音時改念單字。',
                  ],
                  ko: [
                    '自動產生的是羅馬拼音（依實際唸法，例如 읽다 → ikda）。',
                    '也可以填實際發音的韓文（例如 [익따]），發音會照它念；其他寫法改念單字。',
                  ],
                }[vocab.lang]"
                :key="line"
              >
                {{ line }}
              </p>
            </div>
          </div>
          <DictLinks :word="vocab.word" :lang="vocab.lang" />
        </div>
        <div>
          <label class="label">意思</label>
          <textarea v-model="vocab.meaning" rows="2" class="input" placeholder="單字的意思" />
        </div>
        <div>
          <label class="label">詞性</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="p in settings.synced.pos[vocab.lang].filter(
                (o) => !o.hidden || vocab!.pos.includes(o.id),
              )"
              :key="p.id"
              type="button"
              class="chip"
              :class="{ 'chip-on': vocab.pos.includes(p.id) }"
              @click="togglePos(p.id)"
            >
              {{ p.label }}
            </button>
          </div>
        </div>
        <div>
          <label class="label">例句</label>
          <div class="space-y-3">
            <div v-for="(e, i) in vocab.examples" :key="e.id" class="card space-y-2 p-4">
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold text-muted">#{{ i + 1 }}</span>
                <div class="flex-1" />
                <SpeakButton :text="e.sentence" :lang="vocab.lang" />
                <button
                  class="icon-btn size-9 bg-surface-2 text-danger"
                  aria-label="刪除例句"
                  @click="vocab.examples.splice(i, 1)"
                >
                  <Trash2 :size="16" />
                </button>
              </div>
              <textarea v-model="e.sentence" rows="2" class="input" placeholder="例句" />
              <textarea v-model="e.translation" rows="2" class="input" placeholder="翻譯" />
            </div>
            <button type="button" class="btn btn-ghost w-full" @click="addExample">
              <Plus :size="18" /> 新增例句
            </button>
          </div>
        </div>
        <div>
          <label class="label">備註（選填）</label>
          <MarkdownEditor v-model="vocab.note" placeholder="補充說明、相似字…" :rows="2" />
        </div>
      </template>

      <div v-if="missing.length" class="space-y-0.5 rounded-2xl bg-warn/15 px-4 py-3 text-sm">
        <p class="font-semibold">尚未填寫：{{ missing.join('、') }}</p>
        <p>可以先儲存，卡片會標示為「未完成」，補齊後才會進入學習。</p>
      </div>

      <div class="flex gap-2">
        <button class="btn btn-ghost" @click="((showPreview = true), (previewRevealed = false))">
          <Eye :size="18" /> 預覽
        </button>
        <button
          v-if="!editingId"
          class="btn btn-soft flex-1"
          :disabled="frontEmpty"
          @click="save(true)"
        >
          儲存並新增下一張
        </button>
        <button class="btn btn-primary flex-1" :disabled="frontEmpty" @click="save()">儲存</button>
      </div>
    </div>

    <BottomSheet v-model="showPreview" title="預覽">
      <div class="card min-h-48" @click="previewRevealed = true">
        <CardFace :card="card" :revealed="previewRevealed" />
      </div>
      <button class="btn btn-primary mt-4 w-full" @click="previewRevealed = !previewRevealed">
        {{ previewRevealed ? '看正面' : '顯示答案' }}
      </button>
    </BottomSheet>
  </div>
  <div v-else class="py-20 text-center text-muted">找不到卡片</div>
</template>
