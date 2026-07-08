<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const username = ref('me')
const password = ref('password')
const localError = ref('')

async function submit() {
  localError.value = ''
  try {
    await auth.login(username.value, password.value)
    const redirect = route.query.redirect || '/'
    router.replace(String(redirect))
  } catch {
    localError.value = auth.error
  }
}
</script>

<template>
  <main class="container" style="padding: 4rem 0;">
    <section class="card" style="max-width: 420px; margin: 0 auto; padding: 2rem;">
      <h1 style="margin-top: 0;">Retype Book</h1>
      <p class="muted">Sign in to upload books and practice touch typing.</p>
      <form style="display: grid; gap: 1rem;" @submit.prevent="submit">
        <label>
          <div class="muted">Username</div>
          <input v-model="username" autocomplete="username" style="width: 100%; padding: 0.65rem;" />
        </label>
        <label>
          <div class="muted">Password</div>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            style="width: 100%; padding: 0.65rem;"
          />
        </label>
        <p v-if="localError" class="error">{{ localError }}</p>
        <button class="btn" type="submit" :disabled="auth.loading">
          {{ auth.loading ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
    </section>
  </main>
</template>
