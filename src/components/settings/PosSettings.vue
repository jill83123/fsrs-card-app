<script setup lang="ts">
import { ref } from 'vue'
import { Eye, EyeOff, GripVertical, Plus, RotateCcw, Trash2 } from '@lucide/vue'
import PillTabs from '../PillTabs.vue'
import { DEFAULT_POS, isDefaultPos, LANGS } from '@/db/defaults'
import type { Lang, PosOption } from '@/db/types'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { uid } from '@/lib/id'

const settings = useSettings()
const data = useData()
const ui = useUi()
const lang = ref<Lang>('en')
const draft = ref('')

/** original label of a default option; undefined for custom ones */
const defaultLabel = (id: string) => DEFAULT_POS[lang.value].find((o) => o.id === id)?.label

function add() {
  const label = draft.value.trim()
  if (!label) return
  settings.synced.pos[lang.value].push({ id: uid(), label })
  draft.value = ''
}

async function restoreLabel(p: PosOption) {
  const original = defaultLabel(p.id)
  if (!original) return
  const ok = await ui.confirm(`還原「${p.label || '（空白）'}」？`, {
    message: `名稱會恢復為預設的「${original}」。`,
    confirmText: '還原',
  })
  if (ok) p.label = original
}

// default options can only be hidden; custom ones can be deleted
async function remove(p: PosOption) {
  const used = data.cards.filter((c) => c.type === 'vocab' && c.pos.includes(p.id)).length
  const ok = await ui.confirm(`刪除「${p.label}」？`, {
    message: used
      ? `有 ${used} 張卡片標記了這個詞性，刪除後這些卡片上不會再顯示它。`
      : '目前沒有卡片使用這個詞性。\n刪除後無法復原，需要時可以再新增。',
    danger: true,
    confirmText: '刪除',
  })
  if (!ok) return
  const list = settings.synced.pos[lang.value]
  const i = list.findIndex((o) => o.id === p.id)
  if (i !== -1) list.splice(i, 1)
}

// drag the grip to reorder; works with mouse and touch
const listEl = ref<HTMLElement>()
const dragging = ref<string | null>(null)

function onDragStart(e: PointerEvent, id: string) {
  dragging.value = id
  // a long press would otherwise start selecting the text around the grip
  document.documentElement.classList.add('select-none')
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onDragMove(e: PointerEvent) {
  if (!dragging.value || !listEl.value) return
  const list = settings.synced.pos[lang.value]
  const from = list.findIndex((p) => p.id === dragging.value)
  const rows = [...listEl.value.children] as HTMLElement[]
  // the target is the row whose vertical span holds the pointer (clamped to the ends)
  let to = rows.findIndex((r) => e.clientY < r.getBoundingClientRect().bottom)
  if (to === -1) to = rows.length - 1
  if (from === -1 || to === from) return
  list.splice(to, 0, list.splice(from, 1)[0]!)
}

function onDragEnd() {
  dragging.value = null
  document.documentElement.classList.remove('select-none')
}
</script>

<template>
  <div class="space-y-3">
    <PillTabs
      v-model="lang"
      size="sm"
      :options="LANGS.map((l) => ({ value: l.id, label: l.label }))"
    />
    <ul ref="listEl" class="space-y-1.5">
      <li v-for="p in settings.synced.pos[lang]" :key="p.id">
        <div class="flex items-center gap-1.5">
          <button
            class="flex size-8 shrink-0 cursor-grab touch-none items-center select-none [-webkit-touch-callout:none] justify-center rounded-lg hover:bg-surface-2 active:cursor-grabbing"
            :class="dragging === p.id ? 'text-primary' : 'text-muted'"
            aria-label="拖曳排序"
            @pointerdown.prevent="onDragStart($event, p.id)"
            @touchstart.prevent
            @contextmenu.prevent
            @pointermove="onDragMove"
            @pointerup="onDragEnd"
            @pointercancel="onDragEnd"
          >
            <GripVertical :size="16" />
          </button>
          <input
            v-model="p.label"
            :placeholder="defaultLabel(p.id)"
            class="input py-1.5"
            :class="{
              'border-primary ring-2 ring-primary/20': dragging === p.id,
              'text-muted line-through': p.hidden,
            }"
          />
          <button
            v-if="defaultLabel(p.id) && p.label !== defaultLabel(p.id)"
            class="icon-btn size-8 shrink-0 bg-surface-2 text-primary"
            aria-label="還原名稱"
            :title="`還原為預設名稱：${defaultLabel(p.id)}`"
            @click="restoreLabel(p)"
          >
            <RotateCcw :size="14" />
          </button>
          <button
            v-if="isDefaultPos(p.id)"
            class="icon-btn size-8 shrink-0 bg-surface-2"
            :class="p.hidden ? 'text-muted' : 'text-ink'"
            :aria-label="p.hidden ? '顯示' : '隱藏'"
            :title="p.hidden ? '已隱藏，點擊顯示' : '隱藏（預設詞性不能刪除）'"
            @click="p.hidden = !p.hidden"
          >
            <EyeOff v-if="p.hidden" :size="14" />
            <Eye v-else :size="14" />
          </button>
          <button
            v-else
            class="icon-btn size-8 shrink-0 bg-surface-2 text-danger"
            aria-label="刪除"
            @click="remove(p)"
          >
            <Trash2 :size="14" />
          </button>
        </div>
      </li>
    </ul>
    <form class="flex gap-2" @submit.prevent="add">
      <input v-model="draft" class="input py-2" placeholder="新增詞性，例如：助動詞" />
      <button class="btn btn-soft shrink-0" type="submit"><Plus :size="16" /> 新增</button>
    </form>
    <ul class="list-disc space-y-0.5 pl-4 text-xs text-muted">
      <li>拖曳左側把手調整順序。</li>
      <li>預設詞性不能刪除，但可以按眼睛圖示隱藏。</li>
      <li>隱藏後不會出現在編輯卡片的選項中，但已標記的卡片仍會顯示。</li>
      <li>自訂的詞性可以刪除。</li>
      <li>「還原預設」會恢復預設詞性的名稱、順序與顯示，自訂詞性會保留。</li>
    </ul>
  </div>
</template>
