import { ref } from 'vue'
import { FONT_SCALE_STORAGE_KEY, FONT_SCALE_MIN, FONT_SCALE_MAX, FONT_SCALE_DEFAULT } from '@/design'

const fontScale = ref(FONT_SCALE_DEFAULT)

const clamp = (v: number) => Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, v))

const applyFontScale = (v: number) => {
  document.documentElement.style.setProperty('--font-scale', String(v))
}

export const useFontScale = () => {
  const setFontScale = (v: number) => {
    const clamped = clamp(v)
    fontScale.value = clamped
    applyFontScale(clamped)
    localStorage.setItem(FONT_SCALE_STORAGE_KEY, String(clamped))
  }

  const initFontScale = () => {
    const saved = Number(localStorage.getItem(FONT_SCALE_STORAGE_KEY))
    const initial = saved && !Number.isNaN(saved) ? clamp(saved) : FONT_SCALE_DEFAULT
    fontScale.value = initial
    applyFontScale(initial)
  }

  return {
    fontScale,
    min: FONT_SCALE_MIN,
    max: FONT_SCALE_MAX,
    setFontScale,
    initFontScale,
  }
}
