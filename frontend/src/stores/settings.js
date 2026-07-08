import { defineStore } from 'pinia'
import { api } from '../api/client'
import { setCharMappings } from '../utils/textMatch'

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    loaded: false,
    charMappings: {},
  }),
  actions: {
    async load() {
      if (this.loaded) return
      try {
        const data = await api.getSettings()
        this.charMappings = data.char_mappings || {}
        setCharMappings(this.charMappings)
        this.loaded = true
      } catch {
        setCharMappings({})
        this.loaded = true
      }
    },
  },
})
