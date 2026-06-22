import { ref } from 'vue'

export const snackbar = ref(false)

export const snackbarText = ref('')

export const snackbarColor = ref<'success' | 'error' | 'warning'>('success')

export const showMessage = (
  message: string,
  color: 'success' | 'error' | 'warning' = 'success',
) => {
  snackbarText.value = message
  snackbarColor.value = color
  snackbar.value = true
}
