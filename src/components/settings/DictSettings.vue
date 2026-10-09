<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown, Plus, Trash2, TriangleAlert } from '@lucide/vue'
import { LANGS } from '@/db/defaults'
import type { Dictionary, Lang } from '@/db/types'
import { useSettings } from '@/stores/settings'
import { uid } from '@/lib/id'

const settings = useSettings()

// every dictionary starts collapsed; a new one opens so it can be filled in
const expanded = ref(new Set<string>())
function toggleOpen(id: string) {
  const s = new Set(expanded.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  expanded.value = s
}

function toggleLang(d: Dictionary, l: Lang) {
  d.langs = d.langs.includes(l) ? d.langs.filter((x) => x !== l) : [...d.langs, l]
}
function add() {
  const id = uid()
  settings.synced.dictionaries.push({ id, name: '', url: 'https://', langs: [] })
  expanded.value = new Set(expanded.value).add(id)
}
</script>

<template>
  <div class="space-y-3">
    <div class="space-y-0.5 text-xs text-muted">
      <p>網址中用 <code class="rounded bg-surface-2 px-1">{word}</code> 代表要查的字。</p>
      <p>字典網站大多禁止內嵌，所以會在新分頁開啟。</p>
      <p>沒有勾選語言＝所有語言都顯示。</p>
    </div>
    <div
      v-for="(d, i) in settings.synced.dictionaries"
      :key="d.id"
      class="overflow-hidden rounded-2xl bg-surface-2"
    >
      <button
        type="button"
        class="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        :aria-expanded="expanded.has(d.id)"
        @click="toggleOpen(d.id)"
      >
        <span
          class="min-w-0 flex-1 truncate text-sm font-semibold"
          :class="{ 'text-muted': !d.name }"
        >
          {{ d.name || '未命名字典' }}
        </span>
        <TriangleAlert
          v-if="!d.url.includes('{word}')"
          :size="14"
          class="shrink-0 text-warn"
          aria-label="網址缺少 {word}"
        />
        <span class="flex shrink-0 gap-1">
          <span
            v-for="l in LANGS.filter((x) => d.langs.includes(x.id))"
            :key="l.id"
            class="rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-medium text-muted"
          >
            {{ l.label }}
          </span>
          <span
            v-if="!d.langs.length"
            class="rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-medium text-muted"
          >
            所有語言
          </span>
        </span>
        <ChevronDown
          :size="16"
          class="shrink-0 text-muted transition-transform"
          :class="{ 'rotate-180': expanded.has(d.id) }"
        />
      </button>
      <div v-if="expanded.has(d.id)" class="space-y-2 px-3 pb-3">
        <div class="flex gap-2">
          <input v-model="d.name" class="input py-2" placeholder="名稱" />
          <button
            class="icon-btn size-10 shrink-0 text-danger"
            aria-label="刪除字典"
            @click="settings.synced.dictionaries.splice(i, 1)"
          >
            <Trash2 :size="16" />
          </button>
        </div>
        <input
          v-model="d.url"
          class="input py-2 text-sm"
          placeholder="https://example.com/search?q={word}"
        />
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="l in LANGS"
            :key="l.id"
            class="chip"
            :class="{ 'chip-on': d.langs.includes(l.id) }"
            @click="toggleLang(d, l.id)"
          >
            {{ l.label }}
          </button>
          <span v-if="!d.url.includes('{word}')" class="text-xs text-warn">網址缺少 {word}</span>
        </div>
      </div>
    </div>
    <button class="btn btn-ghost w-full" @click="add"><Plus :size="16" /> 新增字典</button>
  </div>
</template>
