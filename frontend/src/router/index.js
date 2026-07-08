import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from '../api/client'
import { useSettingsStore } from '../stores/settings'
import LoginView from '../views/LoginView.vue'
import LibraryView from '../views/LibraryView.vue'
import ReaderView from '../views/ReaderView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    { path: '/', name: 'library', component: LibraryView },
    { path: '/book/:id', name: 'book-redirect', component: ReaderView, props: true },
    { path: '/book/:id/page/:page', name: 'reader', component: ReaderView, props: true },
  ],
})

router.beforeEach(async (to) => {
  if (!to.meta.public && !getToken()) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && getToken()) {
    return { name: 'library' }
  }
  if (!to.meta.public && getToken()) {
    const settings = useSettingsStore()
    await settings.load()
  }
  return true
})

export default router
