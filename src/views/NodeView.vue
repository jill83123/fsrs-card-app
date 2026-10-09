<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BarChart3, FilePlus2, FolderPlus, Pencil, ScanText } from '@lucide/vue'
import PageHeader from '@/components/PageHeader.vue'
import StudyEntry from '@/components/StudyEntry.vue'
import NodeLegend from '@/components/NodeLegend.vue'
import NodeRow from '@/components/NodeRow.vue'
import NodeFormSheet from '@/components/NodeFormSheet.vue'
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

// a deck holds either cards or sub-decks; an empty one can take both
const canAddCards = computed(() => children.value.length === 0)
const canAddChildren = computed(() => ownCards.value.length === 0)

const template = computed(() => effectiveTemplate(data.nodes, id.value))

function addCard() {
  const t = template.value
  router.push({
    path: '/card/new',
    query: { deck: id.value, type: t?.type ?? 'basic', ...(t?.lang ? { lang: t.lang } : {}) },
  })
}

const tab = ref<'children' | 'cards'>('children')
const showCards = computed(() => canAddCards.value || tab.value === 'cards')

const collapsed = ref(new Set<string>())
function toggle(nid: string) {
  const s = new Set(collapsed.value)
  if (s.has(nid)) s.delete(nid)
  else s.add(nid)
  collapsed.value = s
}

const showEdit = ref(false)
const showAdd = ref(false)

function onDeleted(parentId: string | null) {
  router.replace(parentId ? `/node/${parentId}` : '/')
}
</script>

<template>
  <div v-if="node">
    <PageHeader :title="node.name" :back="node.parentId ? `/node/${node.parentId}` : '/'">
      <template #right>
        <button class="icon-btn" aria-label="統計" @click="router.push(`/node/${node.id}/stats`)">
          <BarChart3 :size="18" />
        </button>
        <button class="icon-btn" aria-label="編輯" @click="showEdit = true">
          <Pencil :size="18" />
        </button>
      </template>
    </PageHeader>

    <nav
      v-if="path.length"
      class="-mt-2 mb-3 flex flex-wrap items-center justify-center gap-1 text-xs text-muted"
    >
      <template v-for="(p, i) in path" :key="p.id">
        <RouterLink :to="`/node/${p.id}`" class="hover:text-primary">{{ p.name }}</RouterLink>
        <span v-if="i < path.length - 1">/</span>
      </template>
    </nav>

    <section class="card mb-4">
      <StudyEntry :scope="node.id">
        <CardStateBar v-if="scopeCards.length" :cards="scopeCards" compact />
      </StudyEntry>
    </section>

    <!-- add actions -->
    <div class="mb-4 flex flex-wrap gap-2">
      <template v-if="canAddCards">
        <button class="btn btn-primary" :title="templateLabel(template)" @click="addCard">
          <FilePlus2 :size="18" /> 新增卡片
        </button>
        <button
          class="btn btn-ghost"
          @click="router.push({ path: '/ocr', query: { deck: node.id } })"
        >
          <ScanText :size="18" /> 圖片辨識
        </button>
      </template>
      <button v-if="canAddChildren" class="btn btn-ghost" @click="showAdd = true">
        <FolderPlus :size="18" /> 子牌組
      </button>
    </div>

    <PillTabs
      v-if="!canAddCards"
      v-model="tab"
      class="mb-4"
      :options="[
        { value: 'children', label: `子項目（${children.length}）` },
        { value: 'cards', label: `全部卡片（${scopeCards.length}）` },
      ]"
    />

    <div v-if="!showCards">
      <div v-if="children.length" class="card divide-y divide-line overflow-hidden p-0">
        <NodeLegend />
        <NodeRow
          v-for="c in children"
          :key="c.id"
          :node="c"
          :collapsed="collapsed"
          @toggle="toggle"
        />
      </div>
      <p v-else class="card text-center text-sm text-muted">
        這個牌組是空的，可以新增卡片或子牌組。
      </p>
    </div>
    <CardList
      v-else
      :cards="canAddCards ? ownCards : scopeCards"
      :show-deck="!canAddCards"
      :storage-key="node.id"
    />

    <NodeFormSheet v-model="showEdit" :node="node" @deleted="onDeleted" />
    <NodeFormSheet v-model="showAdd" :parent-id="node.id" />
  </div>
  <div v-else-if="data.ready" class="py-20 text-center text-muted">
    找不到這個項目。<RouterLink to="/" class="text-primary">回首頁</RouterLink>
  </div>
</template>
