import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { nav: true } },
    {
      path: '/node/:id',
      name: 'node',
      component: () => import('@/views/NodeView.vue'),
      meta: { nav: true },
    },
    {
      path: '/node/:id/stats',
      name: 'node-stats',
      component: () => import('@/views/DeckStatsView.vue'),
      meta: { nav: true },
    },
    { path: '/card/new', name: 'card-new', component: () => import('@/views/CardEditView.vue') },
    { path: '/card/:id', name: 'card', component: () => import('@/views/CardDetailView.vue') },
    {
      path: '/card/:id/edit',
      name: 'card-edit',
      component: () => import('@/views/CardEditView.vue'),
    },
    {
      path: '/study/:mode(review|learn)',
      name: 'study',
      component: () => import('@/views/StudyView.vue'),
      meta: { focus: true },
    },
    { path: '/practice', name: 'practice', component: () => import('@/views/PracticeView.vue') },
    { path: '/ocr', name: 'ocr', component: () => import('@/views/OcrView.vue') },
    {
      path: '/stats',
      name: 'stats',
      component: () => import('@/views/StatsView.vue'),
      meta: { nav: true },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { nav: true },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior(to, _from, saved) {
    if (to.hash) return { el: to.hash, top: 72, behavior: 'smooth' }
    return saved ?? { top: 0 }
  },
})

export default router
