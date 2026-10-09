<script setup lang="ts">
import BottomSheet from './BottomSheet.vue'
import PillTabs from './PillTabs.vue'
import SelectBox from './SelectBox.vue'
import {
  defaultFilter,
  FAM_BUCKETS,
  SORT_OPTIONS,
  type CardFilter,
  type TriState,
} from '@/lib/filter'
import { State, STATE_LABEL } from '@/lib/fsrs'
import { LANGS } from '@/db/defaults'

const open = defineModel<boolean>({ required: true })
const f = defineModel<CardFilter>('filter', { required: true })
defineProps<{ hideDraft?: boolean }>()

const tri: { value: TriState; label: string }[] = [
  { value: 'any', label: '全部' },
  { value: 'yes', label: '是' },
  { value: 'no', label: '否' },
]

const triRows: { key: 'starred' | 'suspended' | 'learned' | 'draft'; label: string }[] = [
  { key: 'starred', label: '星號' },
  { key: 'suspended', label: '暫停' },
  { key: 'learned', label: '已學習（有複習紀錄）' },
  { key: 'draft', label: '未完成' },
]

const states = [State.New, State.Learning, State.Review, State.Relearning]

function toggleState(s: State) {
  f.value.states = f.value.states.includes(s)
    ? f.value.states.filter((x) => x !== s)
    : [...f.value.states, s]
}

function reset() {
  const q = f.value.q
  f.value = { ...defaultFilter(), q }
}
</script>

<template>
  <BottomSheet v-model="open" title="篩選與排序">
    <div class="space-y-5">
      <div>
        <label class="label">排序</label>
        <div class="flex gap-2">
          <SelectBox v-model="f.sort" class="py-2 text-xs font-medium">
            <option v-for="o in SORT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </SelectBox>
          <button
            class="btn btn-ghost shrink-0 px-3 py-2 text-xs font-medium"
            @click="f.desc = !f.desc"
          >
            {{ f.desc ? '由大到小' : '由小到大' }}
          </button>
        </div>
      </div>

      <div>
        <label class="label">卡片類型</label>
        <PillTabs
          v-model="f.type"
          size="sm"
          :options="[
            { value: 'any', label: '全部' },
            { value: 'basic', label: '正反卡' },
            { value: 'vocab', label: '單字卡' },
          ]"
        />
      </div>

      <div>
        <label class="label">單字語言</label>
        <PillTabs
          v-model="f.lang"
          size="sm"
          :options="[
            { value: 'any', label: '全部' },
            ...LANGS.map((l) => ({ value: l.id, label: l.label })),
          ]"
        />
      </div>

      <template v-for="r in triRows" :key="r.key">
        <div v-if="!(hideDraft && r.key === 'draft')">
          <label class="label">{{ r.label }}</label>
          <PillTabs v-model="f[r.key]" size="sm" :options="tri" />
        </div>
      </template>

      <div>
        <label class="label">熟悉度（目前記得的機率）</label>
        <PillTabs v-model="f.fam" size="sm" :options="FAM_BUCKETS" />
      </div>

      <div>
        <label class="label">卡片狀態</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="s in states"
            :key="s"
            class="chip"
            :class="{ 'chip-on': f.states.includes(s) }"
            @click="toggleState(s)"
          >
            {{ STATE_LABEL[s] }}
          </button>
        </div>
      </div>

      <div class="flex gap-2">
        <button class="btn btn-ghost flex-1" @click="reset">重設</button>
        <button class="btn btn-primary flex-1" @click="open = false">完成</button>
      </div>
    </div>
  </BottomSheet>
</template>
