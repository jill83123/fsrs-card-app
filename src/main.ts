import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { useSettings } from './stores/settings'
import { useData } from './stores/data'
import { useSync } from './stores/sync'

const app = createApp(App)
app.use(createPinia())

await useSettings().load()
useData().start()
useSync().init()

app.use(router)
app.mount('#app')
