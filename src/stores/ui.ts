import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'error' | 'success'
  action?: { label: string; run: () => void }
}

export interface DialogState {
  title: string
  message?: string
  confirmText: string
  cancelText: string
  danger: boolean
  input?: { value: string; placeholder?: string }
  resolve: (v: string | boolean | null) => void
}

export const useUi = defineStore('ui', () => {
  const toasts = ref<Toast[]>([])
  const dialog = ref<DialogState | null>(null)
  let seq = 0

  function toast(text: string, tone: Toast['tone'] = 'info', action?: Toast['action'], ms = 3200) {
    const id = ++seq
    toasts.value.push({ id, text, tone, action })
    setTimeout(() => dismiss(id), action ? ms + 2000 : ms)
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function confirm(
    title: string,
    opts: { message?: string; confirmText?: string; danger?: boolean } = {},
  ): Promise<boolean> {
    return new Promise((resolve) => {
      dialog.value = {
        title,
        message: opts.message,
        confirmText: opts.confirmText ?? '確定',
        cancelText: '取消',
        danger: opts.danger ?? false,
        resolve: (v) => resolve(Boolean(v)),
      }
    })
  }

  function prompt(
    title: string,
    opts: { value?: string; placeholder?: string; confirmText?: string; message?: string } = {},
  ): Promise<string | null> {
    return new Promise((resolve) => {
      dialog.value = {
        title,
        message: opts.message,
        confirmText: opts.confirmText ?? '確定',
        cancelText: '取消',
        danger: false,
        input: { value: opts.value ?? '', placeholder: opts.placeholder },
        resolve: (v) => resolve(typeof v === 'string' ? v : null),
      }
    })
  }

  function closeDialog(result: string | boolean | null) {
    const d = dialog.value
    dialog.value = null
    d?.resolve(result)
  }

  return { toasts, dialog, toast, dismiss, confirm, prompt, closeDialog }
})
