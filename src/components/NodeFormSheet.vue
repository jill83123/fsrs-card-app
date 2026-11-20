<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ChevronDown, CircleHelp } from '@lucide/vue'
import ChartTip from './stats/ChartTip.vue'
import { useTip } from './stats/useTip'
import BottomSheet from './BottomSheet.vue'
import NumberStepper from './NumberStepper.vue'
import ToggleSwitch from './ToggleSwitch.vue'
import SelectBox from './SelectBox.vue'
import type { CardTemplate, Lang, TreeNode } from '@/db/types'
import { useData } from '@/stores/data'
import { useSettings } from '@/stores/settings'
import { useUi } from '@/stores/ui'
import {
  effectiveLimits,
  effectiveReverse,
  effectiveTemplate,
  deckRows,
  subtreeIds,
  validParents,
} from '@/lib/tree'
import { templateLabel } from '@/lib/cards'
import PillTabs from './PillTabs.vue'
import { LANGS } from '@/db/defaults'

const props = defineProps<{
  /** node being edited; when absent we create a new node */
  node?: TreeNode | null
  parentId?: string | null
}>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ saved: [node: TreeNode] }>()

const data = useData()
const settings = useSettings()
const ui = useUi()

const form = reactive({
  name: '',
  parentId: null as string | null,
  overrideNew: false,
  overrideReview: false,
  newPerDay: 20,
  reviewPerDay: 200,
  /** 'inherit' = follow the parent deck's template */
  cardType: 'inherit' as CardTemplate['type'] | 'inherit',
  /** '' = the last language used */
  cardLang: '' as Lang | '',
  /** the deck's own setting; a sub-deck can also follow its parent instead (`reverseMode`) */
  reverse: false,
  reverseMode: 'inherit' as 'inherit' | 'on' | 'off',
})

const advanced = ref(false)
// plain-language hints, shown in the same floating bubble as on the card detail page
const HELP = {
  template: '新增卡片時會先套用這個模板，編輯時仍可切換。',
  reverse:
    '詞義 → 單字的反向複習，只對單字卡有效。正向進入複習後才會出現，不計入每日上限，關閉後進度會保留。',
  limits: '關閉時沿用上層牌組的設定，最上層沿用設定頁的全域值；打開後可為這個牌組自訂。',
}
const { root: tipRoot, tip, show: showTip } = useTip()

watch(open, (v) => {
  if (!v) return
  advanced.value = false
  const n = props.node
  const study = settings.synced.study
  form.name = n?.name ?? ''
  form.parentId = n ? n.parentId : (props.parentId ?? null)
  form.overrideNew = n?.limits?.newPerDay !== undefined
  form.overrideReview = n?.limits?.reviewPerDay !== undefined
  form.newPerDay = n?.limits?.newPerDay ?? study.newPerDay
  form.reviewPerDay = n?.limits?.reviewPerDay ?? study.reviewPerDay
  form.cardType = n?.defaultCard?.type ?? (form.parentId ? 'inherit' : 'basic')
  form.cardLang = n?.defaultCard?.lang ?? ''
  form.reverse = effectiveReverse(data.nodes, n ? n.id : form.parentId)
  form.reverseMode = n?.reverse === undefined ? 'inherit' : n.reverse ? 'on' : 'off'
})

// a top-level deck has nothing to inherit from
watch(
  () => form.parentId,
  (p) => {
    if (!p && form.cardType === 'inherit') form.cardType = 'basic'
  },
)
const inherited = computed(() => effectiveLimits(data.nodes, form.parentId, settings.synced.study))
const inheritedReverse = computed(() => effectiveReverse(data.nodes, form.parentId))
const inheritedLabel = computed(() => templateLabel(effectiveTemplate(data.nodes, form.parentId)))

const deckHasCards = (id: string) => (data.cardsByDeck.get(id)?.length ?? 0) > 0

// every deck as a tree; one that cannot take sub-decks (it has cards) is greyed out
const parentOptions = computed(() => {
  const ok = new Set(
    validParents(data.nodes, props.node?.id ?? '__new__', deckHasCards).map((p) => p.id),
  )
  const own = new Set(props.node ? subtreeIds(data.nodes, props.node.id) : [])
  return deckRows(data.nodes, (n) => own.has(n.id)).map((r) => ({
    id: r.node.id,
    name: r.node.name,
    path: r.path,
    tree: r.tree,
    disabled: !ok.has(r.node.id),
  }))
})

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
  // undefined clears the override, so a sub-deck follows its parent again
  const reverse = form.parentId
    ? form.reverseMode === 'inherit'
      ? undefined
      : form.reverseMode === 'on'
    : form.reverse
  let saved: TreeNode
  if (props.node) {
    await data.updateNode(props.node.id, {
      name,
      parentId: form.parentId,
      limits,
      defaultCard,
      reverse,
    })
    saved = {
      ...props.node,
      name,
      parentId: form.parentId,
      limits,
      defaultCard,
      reverse,
    }
  } else {
    // a deck holds either cards or sub-decks, so its existing cards have to go somewhere
    const parentCards = form.parentId ? (data.cardsByDeck.get(form.parentId) ?? []) : []
    const parentName = form.parentId ? data.nodeById.get(form.parentId)?.name : ''
    if (parentCards.length) {
      const ok = await ui.confirm(`「${parentName}」已有 ${parentCards.length} 張卡片`, {
        message: `牌組不能同時放卡片和子牌組。
建立後，這 ${parentCards.length} 張卡片會一併移到新的子牌組「${name}」裡。`,
        confirmText: '移入新子牌組',
      })
      if (!ok) return
    }
    saved = await data.createNode(form.parentId, name, 'blue')
    if (parentCards.length) {
      await data.patchCards(
        parentCards.map((c) => c.id),
        { deckId: saved.id },
      )
    }
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
        <label class="label">位置</label>
        <SelectBox v-model="form.parentId">
          <option :value="null">（最上層）</option>
          <option
            v-for="p in parentOptions"
            :key="p.id"
            :value="p.id"
            :path="p.path"
            :tree="p.tree"
            :disabled="p.disabled"
          >
            {{ p.name }}
          </option>
        </SelectBox>
      </div>

      <button
        type="button"
        class="flex w-full items-center justify-between py-1 text-sm font-semibold text-muted"
        :aria-expanded="advanced"
        @click="advanced = !advanced"
      >
        進階設定
        <ChevronDown :size="18" class="transition-transform" :class="advanced && 'rotate-180'" />
      </button>
      <div v-if="advanced" ref="tipRoot" class="relative -mt-2 space-y-5">
        <div class="card space-y-2">
          <div class="flex items-center gap-1">
            <span class="text-sm font-semibold text-ink/65">新增卡片的預設模板</span>
            <button
              type="button"
              class="help-btn"
              aria-label="說明"
              @click="showTip($event, HELP.template, 110)"
            >
              <CircleHelp :size="15" />
            </button>
          </div>
          <PillTabs
            v-model="form.cardType"
            :options="[
              ...(form.parentId ? [{ value: 'inherit' as const, label: '沿用上層' }] : []),
              { value: 'basic', label: '正反卡' },
              { value: 'vocab', label: '單字卡' },
            ]"
          />
          <p v-if="form.cardType === 'inherit'" class="text-xs text-muted">
            目前上層使用：<strong class="font-semibold text-primary">{{ inheritedLabel }}</strong>
          </p>
          <div v-if="form.cardType === 'vocab'" class="space-y-1.5 pt-2">
            <label class="block text-sm font-semibold text-ink/65">單字卡語言</label>
            <PillTabs
              v-model="form.cardLang"
              :options="[
                { value: '', label: '沿用上次' },
                ...LANGS.map((l) => ({ value: l.id, label: l.label })),
              ]"
            />
          </div>
        </div>

        <div class="card space-y-2">
          <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-1">
              <span class="text-sm font-semibold text-ink/65">反向學習</span>
              <button
                type="button"
                class="help-btn"
                aria-label="說明"
                @click="showTip($event, HELP.reverse, 110)"
              >
                <CircleHelp :size="15" />
              </button>
            </div>
            <ToggleSwitch v-if="!form.parentId" v-model="form.reverse" label="反向學習" />
          </div>
          <!-- a sub-deck chooses between following its parent and its own on / off -->
          <template v-if="form.parentId">
            <PillTabs
              v-model="form.reverseMode"
              :options="[
                { value: 'inherit', label: '沿用上層' },
                { value: 'on', label: '開啟' },
                { value: 'off', label: '關閉' },
              ]"
            />
            <p v-if="form.reverseMode === 'inherit'" class="text-xs text-muted">
              目前上層：<strong class="font-semibold text-primary">{{
                inheritedReverse ? '開啟' : '關閉'
              }}</strong>
            </p>
          </template>
        </div>

        <div class="card space-y-4">
          <div class="flex items-center gap-1">
            <span class="text-sm font-semibold text-ink/65">每日上限</span>
            <button
              type="button"
              class="help-btn"
              aria-label="說明"
              @click="showTip($event, HELP.limits, 110)"
            >
              <CircleHelp :size="15" />
            </button>
          </div>
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <ToggleSwitch v-model="form.overrideNew" label="自訂新卡上限" />
              <span class="text-sm">新卡</span>
            </div>
            <NumberStepper v-if="form.overrideNew" v-model="form.newPerDay" :max="9999" />
            <div v-else class="text-right">
              <p class="text-sm">每天 {{ inherited.newPerDay }} 張</p>
              <p class="text-xs text-muted">
                {{ inherited.newFrom ? `來自上層：${inherited.newFrom}` : '來自全域' }}
              </p>
            </div>
          </div>
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <ToggleSwitch v-model="form.overrideReview" label="自訂複習上限" />
              <span class="text-sm">複習</span>
            </div>
            <NumberStepper
              v-if="form.overrideReview"
              v-model="form.reviewPerDay"
              :max="99999"
              :step="10"
            />
            <div v-else class="text-right">
              <p class="text-sm">每天 {{ inherited.reviewPerDay }} 張</p>
              <p class="text-xs text-muted">
                {{ inherited.reviewFrom ? `來自上層：${inherited.reviewFrom}` : '來自全域' }}
              </p>
            </div>
          </div>
        </div>
        <ChartTip :tip="tip" />
      </div>

      <button class="btn btn-primary w-full" type="submit">儲存</button>
    </form>
  </BottomSheet>
</template>

<style scoped>
.help-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 9999px;
  color: var(--muted);
}
</style>
