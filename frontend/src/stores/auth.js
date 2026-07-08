import { defineStore } from 'pinia'
import { api, clearToken, getToken, setToken } from '../api/client'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: getToken(),
    error: '',
    loading: false,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token),
  },
  actions: {
    async login(username, password) {
      this.loading = true
      this.error = ''
      try {
        const data = await api.login(username, password)
        this.token = data.access_token
        setToken(data.access_token)
      } catch (error) {
        this.error = error.message || 'Login failed'
        throw error
      } finally {
        this.loading = false
      }
    },
    logout() {
      this.token = null
      clearToken()
    },
  },
})
