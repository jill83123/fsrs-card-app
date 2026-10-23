<script setup lang="ts">
import { computed, ref } from 'vue'
import { Eye, EyeOff, Pencil, Plus, Trash2 } from '@lucide/vue'
import { DEFAULT_DICTIONARIES, LANGS } from '@/db/defaults'
import type { Dictionary, Lang } from '@/db/types'
import { useSettings } from '@/stores/settings'
import { uid } from '@/lib/id'
import BottomSheet from '@/components/BottomSheet.vue'

const settings = useSettings()

const DEFAULT_IDS = new Set(DEFAULT_DICTIONARIES.map((d) => d.id))
const isDefault = (d: Dictionary) => DEFAULT_IDS.has(d.id)

// grouped by language; one that serves several languages (or all) goes to the last group
const groups = computed(() => {
  const list = settings.synced.dictionaries
  const out = LANGS.map((l) => ({
    key: l.id as string,
    label: l.label,
    items: list.filter((d) => d.langs.length === 1 && d.langs[0] === l.id),
  }))
  out.push({
    key: 'all',
    label: '多語言／所有語言',
    items: list.filter((d) => d.langs.length !== 1),
  })
  return out.filter((g) => g.items.length)
})

// the sheet edits a copy, so cancelling leaves the dictionary untouched
const showEdit = ref(false)
const draft = ref<Dictionary>({ id: '', name: '', url: 'https://', langs: [] })
const isNew = ref(false)

function openAdd() {
  draft.value = { id: uid(), name: '', url: 'https://', langs: [] }
  isNew.value = true
  showEdit.value = true
}
function openEdit(d: Dictionary) {
  draft.value = { ...d, langs: [...d.langs] }
  isNew.value = false
  showEdit.value = true
}
function toggleLang(l: Lang) {
  const d = draft.value
  d.langs = d.langs.includes(l) ? d.langs.filter((x) => x !== l) : [...d.langs, l]
}
const canSave = computed(() => draft.value.name.trim() && draft.value.url.includes('{word}'))
function save() {
  if (!canSave.value) return
  const list = settings.synced.dictionaries
  const d = {
    ...draft.value,
    name: draft.value.name.trim(),
    kind: draft.value.kind?.trim() || undefined,
  }
  if (isNew.value) list.push(d)
  else
    list.splice(
      list.findIndex((x) => x.id === d.id),
      1,
      d,
    )
  showEdit.value = false
}
function remove() {
  const list = settings.synced.dictionaries
  list.splice(
    list.findIndex((x) => x.id === draft.value.id),
    1,
  )
  showEdit.value = false
}
</script>

<template>
  <div class="space-y-4">
    <p class="text-xs text-muted">隱藏的字典不會出現在卡片裡。</p>
    <section v-for="g in groups" :key="g.key" class="space-y-1.5">
      <h3 class="px-1 text-xs font-semibold text-muted">{{ g.label }}</h3>
      <div v-for="d in g.items" :key="d.id" class="flex items-center rounded-2xl bg-surface-2">
        <button
          type="button"
          class="flex size-11 shrink-0 items-center justify-center"
          :class="d.hidden ? 'text-muted' : 'text-primary'"
          :aria-label="d.hidden ? '顯示這個字典' : '隱藏這個字典'"
          :aria-pressed="!d.hidden"
          @click="d.hidden = !d.hidden"
        >
          <component :is="d.hidden ? EyeOff : Eye" :size="18" />
        </button>
        <span class="flex min-w-0 flex-1 items-center gap-1.5 py-2.5">
          <span class="truncate text-sm font-semibold" :class="{ 'text-muted': d.hidden }">
            {{ d.name }}
          </span>
          <span v-if="d.kind" class="shrink-0 text-xs tracking-wide text-muted">
            · {{ d.kind }}
          </span>
        </span>
        <button
          type="button"
          class="flex size-11 shrink-0 items-center justify-center text-muted hover:text-primary"
          aria-label="編輯字典"
          @click="openEdit(d)"
        >
          <Pencil :size="16" />
        </button>
      </div>
    </section>
    <button class="btn btn-ghost w-full" @click="openAdd"><Plus :size="16" /> 新增字典</button>

    <BottomSheet v-model="showEdit" :title="isNew ? '新增字典' : '編輯字典'">
      <div class="space-y-6">
        <label class="block space-y-2">
          <span class="text-xs font-semibold text-muted">名稱</span>
          <input v-model="draft.name" class="input" placeholder="例如：Wiktionary" />
        </label>
        <label class="block space-y-2">
          <span class="text-xs font-semibold text-muted">種類（選填）</span>
          <input v-model="draft.kind" class="input" placeholder="例如：英英" />
        </label>
        <label class="block space-y-2">
          <span class="text-xs font-semibold text-muted">網址</span>
          <input
            v-model="draft.url"
            class="input text-sm"
            placeholder="https://example.com/search?q={word}"
          />
          <span
            class="block pt-0.5 text-xs leading-relaxed"
            :class="draft.url.includes('{word}') ? 'text-muted' : 'text-warn'"
          >
            網址要包含 {word}，查字典時會換成要查的字。字典網站大多禁止內嵌，會在新分頁開啟。
          </span>
        </label>
        <div class="space-y-2">
          <span class="text-xs font-semibold text-muted">用於哪些語言</span>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="l in LANGS"
              :key="l.id"
              class="chip"
              :class="{ 'chip-on': draft.langs.includes(l.id) }"
              @click="toggleLang(l.id)"
            >
              {{ l.label }}
            </button>
          </div>
          <span class="block pt-0.5 text-xs leading-relaxed text-muted"
            >如果都不選，所有語言的卡片都會顯示這個字典</span
          >
        </div>
        <div class="flex gap-2 pt-2">
          <button
            v-if="!isNew && !isDefault(draft)"
            class="icon-btn shrink-0 text-danger"
            aria-label="刪除字典"
            @click="remove"
          >
            <Trash2 :size="18" />
          </button>
          <button class="btn btn-primary flex-1" :disabled="!canSave" @click="save">儲存</button>
        </div>
      </div>
    </BottomSheet>
  </div>
</template>
