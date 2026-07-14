import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const THEME_KEY = 'retype_theme'

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    // ignore
  }
  return 'light'
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
}

export function initTheme() {
  const theme = readStoredTheme()
  applyTheme(theme)
  return theme
}

export const useThemeStore = defineStore('theme', () => {
  const theme = ref(readStoredTheme())
  applyTheme(theme.value)

  watch(theme, (value) => {
    applyTheme(value)
    try {
      localStorage.setItem(THEME_KEY, value)
    } catch {
      // ignore quota errors
    }
  })

  function toggle() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  const isDark = () => theme.value === 'dark'

  return { theme, toggle, isDark }
})
