<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowUpDown,
  BarChart3,
  Check,
  FilePlus2,
  FolderPlus,
  Pencil,
  Plus,
  Upload,
} from '@lucide/vue'
import PageHeader from '@/components/PageHeader.vue'
import StudyEntry from '@/components/StudyEntry.vue'
import NodeLegend from '@/components/NodeLegend.vue'
import NodeList from '@/components/NodeList.vue'
import NodeFormSheet from '@/components/NodeFormSheet.vue'
import ImportCardsSheet from '@/components/ImportCardsSheet.vue'
import CardList from '@/components/CardList.vue'
import PillTabs from '@/components/PillTabs.vue'
import CardStateBar from '@/components/stats/CardStateBar.vue'
import { useData } from '@/stores/data'
import { childrenOf, effectiveTemplate, pathTo } from '@/lib/tree'
import { templateLabel } from '@/lib/cards'

const route = useRoute()
const router = useRouter()
const data = useData()

const id = computed(() => String(route.params.id))
const node = computed(() => data.nodeById.get(id.value))
const path = computed(() => pathTo(data.nodes, id.value).slice(0, -1))
const children = computed(() => childrenOf(data.nodes, id.value))
const ownCards = computed(() => data.cardsByDeck.get(id.value) ?? [])
const scopeCards = computed(() => data.cardsInScope(id.value))

// a deck holds either cards or sub-decks; adding a sub-deck to one with cards asks what to do with them
const sorting = ref(false)

const template = computed(() => effectiveTemplate(data.nodes, id.value))

function addCard() {
  const t = template.value
  router.push({
    path: '/card/new',
    query: { deck: id.value, type: t?.type ?? 'basic', ...(t?.lang ? { lang: t.lang } : {}) },
  })
}

const tab = ref<'children' | 'cards'>('children')
const hasChildren = computed(() => children.value.length > 0)
const showCards = computed(() => !hasChildren.value || tab.value === 'cards')

const showEdit = ref(false)
const showAdd = ref(false)
const showImport = ref(false)

function onDeleted(parentId: string | null) {
  router.replace(parentId ? `/node/${parentId}` : '/')
}
</script>

<template>
  <div v-if="node">
    <PageHeader :title="node.name" :back="node.parentId ? `/node/${node.parentId}` : '/'">
      <template v-if="path.length" #subtitle>
        <template v-for="(p, i) in path" :key="p.id">
          <RouterLink :to="`/node/${p.id}`" class="hover:text-primary">{{ p.name }}</RouterLink>
          <span v-if="i < path.length - 1"> / </span>
        </template>
      </template>
      <template #right>
        <button class="icon-btn" aria-label="統計" @click="router.push(`/node/${node.id}/stats`)">
          <BarChart3 :size="18" />
        </button>
        <button class="icon-btn" aria-label="編輯" @click="showEdit = true">
          <Pencil :size="18" />
        </button>
      </template>
    </PageHeader>

    <section class="card" :class="scopeCards.length ? 'mb-2.5' : 'mb-4'">
      <StudyEntry :scope="node.id" />
    </section>

    <section v-if="scopeCards.length" class="card mb-4">
      <CardStateBar :cards="scopeCards" compact />
    </section>

    <!-- a deck without sub-decks: add a sub-deck, or cards (the main action last, on the right) -->
    <div v-if="!hasChildren" class="mb-4 flex flex-wrap gap-2">
      <button class="btn btn-ghost" @click="showAdd = true">
        <FolderPlus :size="18" /> 子牌組
      </button>
      <div class="ml-auto flex gap-2">
        <button class="btn btn-ghost" @click="showImport = true">
          <Upload :size="18" /> 匯入
        </button>
        <button class="btn btn-primary" :title="templateLabel(template)" @click="addCard">
          <FilePlus2 :size="18" /> 新增卡片
        </button>
      </div>
    </div>

    <PillTabs
      v-if="hasChildren"
      v-model="tab"
      class="mb-4"
      :options="[
        { value: 'children', label: `子牌組（${children.length}）` },
        { value: 'cards', label: `全部卡片（${scopeCards.length}）` },
      ]"
    />

    <!-- same header as the home page: heading and legend on the left, buttons on the right -->
    <div v-if="hasChildren && !showCards" class="mb-3 flex items-end justify-between">
      <div class="min-w-0 space-y-1.5 pb-0.5 pl-2">
        <h2 class="text-sm font-semibold tracking-wide text-ink uppercase">子牌組一覽</h2>
        <NodeLegend plain />
      </div>
      <div class="flex gap-2">
        <button
          v-if="children.length > 1 || sorting"
          class="btn"
          :class="sorting ? 'btn-primary' : 'btn-ghost'"
          @click="sorting = !sorting"
        >
          <Check v-if="sorting" :size="18" />
          <ArrowUpDown v-else :size="18" />
          {{ sorting ? '完成' : '排序' }}
        </button>
        <button class="btn btn-ghost" @click="showAdd = true"><Plus :size="18" /> 新增</button>
      </div>
    </div>

    <div v-if="!showCards">
      <div v-if="children.length" class="card divide-y divide-line overflow-hidden p-0">
        <NodeList :nodes="children" :sorting="sorting" />
      </div>
      <p v-else class="card text-center text-sm text-muted">
        這個牌組是空的，可以新增卡片或子牌組。
      </p>
    </div>
    <CardList
      v-else
      :cards="hasChildren ? scopeCards : ownCards"
      :show-deck="hasChildren"
      :storage-key="node.id"
    />

    <NodeFormSheet v-model="showEdit" :node="node" @deleted="onDeleted" />
    <NodeFormSheet v-model="showAdd" :parent-id="node.id" />
    <ImportCardsSheet v-model="showImport" :deck-id="node.id" />
  </div>
  <div v-else-if="data.ready" class="py-20 text-center text-muted">
    找不到這個項目。<RouterLink to="/" class="text-primary">回首頁</RouterLink>
  </div>
</template>
