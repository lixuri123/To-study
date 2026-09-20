import { invoke } from '@tauri-apps/api/core'

const form = document.querySelector<HTMLFormElement>('#connection-form')!
const input = document.querySelector<HTMLInputElement>('#server-url')!
const button = document.querySelector<HTMLButtonElement>('#connect')!
const message = document.querySelector<HTMLParagraphElement>('#message')!

invoke<string | null>('get_server_url').then((url) => {
  if (url) input.value = url
})

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  button.disabled = true
  button.textContent = '正在连接…'
  message.textContent = ''
  try {
    await invoke('connect_server', { value: input.value })
  } catch (error) {
    message.textContent = typeof error === 'string' ? error : '连接失败，请重试。'
    button.disabled = false
    button.textContent = '重试连接'
  }
})
