<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { Archive, Trash2 } from '@lucide/vue'
import { DELETED_KEEP_DAYS } from '@/lib/purge'
import BottomSheet from './BottomSheet.vue'
import ColorDots from './ColorDots.vue'
import NumberStepper from './NumberStepper.vue'
import ToggleSwitch from './ToggleSwitch.vue'
import SelectBox from './SelectBox.vue'
import type { CardTemplate, DeckColor, Lang, TreeNode } from '@/db/types'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import { effectiveReverse, effectiveTemplate, pathTo, validParents } from '@/lib/tree'
import { templateLabel } from '@/lib/cards'
import PillTabs from './PillTabs.vue'
import { LANGS } from '@/db/defaults'

const props = defineProps<{
  /** node being edited; when absent we create a new node */
  node?: TreeNode | null
  parentId?: string | null
}>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ saved: [node: TreeNode]; deleted: [parentId: string | null] }>()

const data = useData()
const settings = useSettings()
const ui = useUi()

const form = reactive({
  name: '',
  color: 'blue' as DeckColor,
  parentId: null as string | null,
  overrideNew: false,
  overrideReview: false,
  newPerDay: 20,
  reviewPerDay: 200,
  /** 'inherit' = follow the parent deck's template */
  cardType: 'inherit' as CardTemplate['type'] | 'inherit',
  /** '' = the last language used */
  cardLang: '' as Lang | '',
  /** the effective setting; saved as an override only when it differs from the parent's */
  reverse: false,
})

watch(open, (v) => {
  if (!v) return
  const n = props.node
  const study = settings.synced.study
  form.name = n?.name ?? ''
  form.color = n?.color ?? 'blue'
  form.parentId = n ? n.parentId : (props.parentId ?? null)
  form.overrideNew = n?.limits?.newPerDay !== undefined
  form.overrideReview = n?.limits?.reviewPerDay !== undefined
  form.newPerDay = n?.limits?.newPerDay ?? study.newPerDay
  form.reviewPerDay = n?.limits?.reviewPerDay ?? study.reviewPerDay
  form.cardType = n?.defaultCard?.type ?? (form.parentId ? 'inherit' : 'basic')
  form.cardLang = n?.defaultCard?.lang ?? ''
  form.reverse = effectiveReverse(data.nodes, n ? n.id : form.parentId)
})

// a top-level deck has nothing to inherit from
watch(
  () => form.parentId,
  (p) => {
    if (!p && form.cardType === 'inherit') form.cardType = 'basic'
  },
)
const inheritedReverse = computed(() => effectiveReverse(data.nodes, form.parentId))
const inheritedLabel = computed(() => templateLabel(effectiveTemplate(data.nodes, form.parentId)))

const deckHasCards = (id: string) => (data.cardsByDeck.get(id)?.length ?? 0) > 0

const parentOptions = computed(() => {
  return validParents(data.nodes, props.node?.id ?? '__new__', deckHasCards).map((p) => ({
    id: p.id,
    label: pathTo(data.nodes, p.id)
      .map((x) => x.name)
      .join(' / '),
  }))
})

async function remove() {
  const n = props.node
  if (!n) return
  const count = data.cardsInScope(n.id).length
  const ok = await ui.confirm(`刪除「${n.name}」？`, {
    message:
      (count
        ? `底下的所有子項目與 ${count} 張卡片都會一併刪除，`
        : '底下的所有子項目都會一併刪除，') +
      `這些牌組的複習紀錄也不再列入統計。\n可以在「設定 → 封存與最近刪除」中於 ${DELETED_KEEP_DAYS} 天內還原，超過就會永久刪除。\n只想暫時收起來的話，請改用「封存」。`,
    danger: true,
    confirmText: '刪除',
  })
  if (!ok) return
  await data.deleteNode(n.id)
  open.value = false
  emit('deleted', n.parentId)
}

async function archive() {
  const n = props.node
  if (!n) return
  await data.setArchived(n.id, true)
  open.value = false
  ui.toast(`已封存「${n.name}」，可在「設定 → 封存與最近刪除」還原`, 'success')
  emit('deleted', n.parentId)
}

async function save() {
  const name = form.name.trim()
  if (!name) return ui.toast('請輸入名稱', 'error')
  const limits = {
    ...(form.overrideNew ? { newPerDay: form.newPerDay } : {}),
    ...(form.overrideReview ? { reviewPerDay: form.reviewPerDay } : {}),
  }
  // undefined clears the field, so the deck follows its parent again
  const defaultCard: CardTemplate | undefined =
    form.cardType === 'inherit' && form.parentId
      ? undefined
      : form.cardType === 'vocab'
        ? { type: 'vocab', ...(form.cardLang ? { lang: form.cardLang } : {}) }
        : { type: 'basic' }
  // matching the parent clears the override, so the deck keeps following its parent
  const reverse =
    form.parentId && form.reverse === inheritedReverse.value ? undefined : form.reverse
  let saved: TreeNode
  if (props.node) {
    await data.updateNode(props.node.id, {
      name,
      color: form.color,
      parentId: form.parentId,
      limits,
      defaultCard,
      reverse,
    })
    saved = {
      ...props.node,
      name,
      color: form.color,
      parentId: form.parentId,
      limits,
      defaultCard,
      reverse,
    }
  } else {
    saved = await data.createNode(form.parentId, name, form.color)
    await data.updateNode(saved.id, { limits, defaultCard, reverse })
    saved = { ...saved, limits, defaultCard, reverse }
  }
  open.value = false
  emit('saved', saved)
}
</script>

<template>
  <BottomSheet v-model="open" :title="node ? '編輯牌組' : parentId ? '新增子牌組' : '新增牌組'">
    <form class="space-y-5" @submit.prevent="save">
      <div>
        <label class="label">名稱</label>
        <input v-model="form.name" class="input" placeholder="例如：日文 N3 單字" autofocus />
      </div>

      <div>
        <label class="label">顏色</label>
        <ColorDots v-model="form.color" />
      </div>

      <div>
        <label class="label">位置</label>
        <SelectBox v-model="form.parentId">
          <option :value="null">（最上層）</option>
          <option v-for="p in parentOptions" :key="p.id" :value="p.id">{{ p.label }}</option>
        </SelectBox>
      </div>

      <div>
        <label class="label">新增卡片的預設模板</label>
        <PillTabs
          v-model="form.cardType"
          :options="[
            ...(form.parentId ? [{ value: 'inherit' as const, label: '沿用上層' }] : []),
            { value: 'basic', label: '正反卡' },
            { value: 'vocab', label: '單字卡' },
          ]"
        />
        <p v-if="form.cardType === 'inherit'" class="mt-2 text-sm text-muted">
          目前上層使用：{{ inheritedLabel }}
        </p>
        <div v-if="form.cardType === 'vocab'" class="mt-3">
          <label class="label">單字卡語言</label>
          <PillTabs
            v-model="form.cardLang"
            size="sm"
            :options="[
              { value: '', label: '沿用上次' },
              ...LANGS.map((l) => ({ value: l.id, label: l.label })),
            ]"
          />
        </div>
        <div class="mt-1.5 space-y-0.5 text-xs text-muted">
          <p>按「新增卡片」時會先打開這個模板，編輯時仍可切換。</p>
          <p>子牌組預設沿用上層設定。</p>
        </div>
      </div>

      <div class="card space-y-2">
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm font-semibold">反向學習（意思 → 單字）</span>
          <ToggleSwitch v-model="form.reverse" label="反向學習" />
        </div>
        <div class="space-y-0.5 text-xs text-muted">
          <p>只對單字卡有效。每張單字卡會多一份獨立排程的反向複習。</p>
          <p>正向進入複習狀態後，反向才會開始以新卡出現，不計入每日上限。</p>
          <p>關閉後反向的進度會保留，重新開啟可接續。子牌組預設沿用上層。</p>
        </div>
      </div>

      <div class="card space-y-4">
        <p class="text-sm font-semibold">每日上限（覆寫全域設定）</p>
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <ToggleSwitch v-model="form.overrideNew" label="覆寫新卡上限" />
            <span class="text-sm">新卡</span>
          </div>
          <NumberStepper v-if="form.overrideNew" v-model="form.newPerDay" :max="9999" />
          <span v-else class="text-sm text-muted">預設 {{ settings.synced.study.newPerDay }}</span>
        </div>
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <ToggleSwitch v-model="form.overrideReview" label="覆寫複習上限" />
            <span class="text-sm">複習</span>
          </div>
          <NumberStepper
            v-if="form.overrideReview"
            v-model="form.reviewPerDay"
            :max="99999"
            :step="10"
          />
          <span v-else class="text-sm text-muted"
            >預設 {{ settings.synced.study.reviewPerDay }}</span
          >
        </div>
      </div>

      <button class="btn btn-primary w-full" type="submit">儲存</button>
      <div v-if="node" class="-mt-2">
        <button
          type="button"
          class="flex w-full items-center justify-center gap-2 py-2 text-sm text-muted"
          @click="archive"
        >
          <Archive :size="16" /> 封存牌組（保留統計，不再顯示）
        </button>
        <button
          type="button"
          class="flex w-full items-center justify-center gap-2 py-2 text-sm text-danger"
          @click="remove"
        >
          <Trash2 :size="16" /> 刪除牌組
        </button>
      </div>
    </form>
  </BottomSheet>
</template>
