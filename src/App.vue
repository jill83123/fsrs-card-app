<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { BarChart3, House, RefreshCw, Settings } from '@lucide/vue'
import UiLayer from '@/components/UiLayer.vue'
import { usePwa } from '@/stores/pwa'

const route = useRoute()
const showNav = computed(() => route.meta.nav === true)

const pwa = usePwa()

const isActive = (to: string) =>
  to === '/' ? route.path === '/' || route.path.startsWith('/node/') : route.path === to

const tabs = [
  { to: '/', label: '首頁', icon: House },
  { to: '/stats', label: '統計', icon: BarChart3 },
  { to: '/settings', label: '設定', icon: Settings },
]
</script>

<template>
  <div
    class="mx-auto min-h-dvh w-full max-w-2xl px-4 pt-[env(safe-area-inset-top)]"
    :class="
      showNav
        ? 'pb-[calc(6rem+env(safe-area-inset-bottom))]'
        : 'pb-[calc(2.5rem+env(safe-area-inset-bottom))]'
    "
  >
    <RouterView />
  </div>

  <nav
    v-if="showNav"
    class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
  >
    <div class="mx-auto flex max-w-2xl">
      <RouterLink
        v-for="t in tabs"
        :key="t.to"
        :to="t.to"
        class="relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors"
        :class="isActive(t.to) ? 'text-primary' : 'text-muted hover:text-ink'"
      >
        <span v-if="isActive(t.to)" class="absolute top-0 h-0.5 w-10 rounded-b bg-primary" />
        <component :is="t.icon" :size="22" :stroke-width="isActive(t.to) ? 2.4 : 1.8" />
        <span>{{ t.label }}</span>
      </RouterLink>
    </div>
  </nav>

  <div
    v-if="pwa.needRefresh"
    class="fixed inset-x-0 z-40 mx-auto flex max-w-md items-center gap-3 px-4"
    :class="
      showNav
        ? 'bottom-[calc(4.5rem+env(safe-area-inset-bottom))]'
        : 'bottom-[calc(1rem+env(safe-area-inset-bottom))]'
    "
    role="status"
  >
    <div class="card flex w-full items-center gap-3 py-3 shadow-lg">
      <RefreshCw :size="18" class="shrink-0 text-primary" />
      <span class="flex-1 text-sm font-semibold">有新版本可用</span>
      <button class="text-sm text-muted" @click="pwa.needRefresh = false">稍後</button>
      <button class="btn btn-primary py-1.5 text-sm" @click="pwa.update()">重新整理</button>
    </div>
  </div>

  <UiLayer />
</template>
