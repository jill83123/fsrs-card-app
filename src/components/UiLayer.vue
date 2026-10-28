<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { Check, LoaderCircle } from '@lucide/vue'
import { useSync } from '@/stores/sync'
import { useUi } from '@/stores/ui'

const ui = useUi()
const sync = useSync()
const inputEl = ref<HTMLInputElement>()

watch(
  () => ui.dialog,
  async (d) => {
    // on touch screens, focusing pops the keyboard over the message before it can be read;
    // let the user tap the field themselves
    if (d?.input && matchMedia('(pointer: fine)').matches) {
      await nextTick()
      inputEl.value?.focus()
      inputEl.value?.select()
    }
  },
)

function submit() {
  const d = ui.dialog
  if (!d) return
  if (d.input) {
    const v = d.input.value.trim()
    if (!v) return
    ui.closeDialog(v)
  } else ui.closeDialog(true)
}
</script>

<template>
  <Teleport to="body">
    <!-- the delayed fade-in keeps quick syncs from flashing the cover -->
    <div
      v-if="sync.preEditWaiting > 0"
      class="sync-cover fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-black/40 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <LoaderCircle class="size-10 animate-spin text-white" :stroke-width="2.5" />
      <p class="text-sm font-bold text-white"><span class="relative">同步中，請稍後<span class="absolute left-full">…</span></span></p>
    </div>

    <Transition name="fade">
      <div
        v-if="ui.dialog"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
        @click.self="ui.closeDialog(null)"
        @keydown.esc="ui.closeDialog(null)"
      >
        <form class="card w-full max-w-sm space-y-4 shadow-xl" @submit.prevent="submit">
          <!-- the title, the message (one paragraph per line) and the list under it read as one block -->
          <div class="space-y-2.5">
            <h2 class="text-lg font-bold">{{ ui.dialog.title }}</h2>
            <div
              v-if="ui.dialog.message || ui.dialog.items?.length"
              class="space-y-2 text-sm text-muted"
            >
              <p v-for="(line, i) in ui.dialog.message?.split('\n')" :key="i">{{ line }}</p>
              <ul v-if="ui.dialog.items?.length" class="list-disc space-y-0.5 pl-5">
                <li v-for="item in ui.dialog.items" :key="item">{{ item }}</li>
              </ul>
            </div>
          </div>
          <label
            v-if="ui.dialog.check"
            class="-mt-1.5 flex cursor-pointer items-center gap-2.5 text-sm font-medium"
          >
            <span class="relative inline-flex shrink-0">
              <input v-model="ui.dialog.check.value" type="checkbox" class="check peer" />
              <Check class="check-icon" :stroke-width="3" />
            </span>
            {{ ui.dialog.check.label }}
          </label>
          <input
            v-if="ui.dialog.input"
            ref="inputEl"
            v-model="ui.dialog.input.value"
            class="input"
            :placeholder="ui.dialog.input.placeholder"
          />
          <div class="flex justify-end gap-2">
            <button type="button" class="btn btn-ghost" @click="ui.closeDialog(null)">
              {{ ui.dialog.cancelText }}
            </button>
            <button
              type="submit"
              class="btn"
              :class="ui.dialog.danger ? 'btn-danger' : 'btn-primary'"
            >
              {{ ui.dialog.confirmText }}
            </button>
          </div>
        </form>
      </div>
    </Transition>

    <div
      class="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4"
    >
      <TransitionGroup name="sheet">
        <div
          v-for="t in ui.toasts"
          :key="t.id"
          class="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-white shadow-lg"
          :class="{
            'bg-neutral-800': t.tone === 'info',
            'bg-danger': t.tone === 'error',
            'bg-success': t.tone === 'success',
          }"
        >
          <span>{{ t.text }}</span>
          <button
            v-if="t.action"
            class="font-bold underline"
            @click="(t.action.run(), ui.dismiss(t.id))"
          >
            {{ t.action.label }}
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.sync-cover {
  animation: sync-cover-in 0.2s ease 0.3s both;
}
@keyframes sync-cover-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
