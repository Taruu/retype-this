<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ThemeToggle from '../components/ThemeToggle.vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
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
  <main class="container login-page">
    <div class="login-toolbar">
      <ThemeToggle />
    </div>
    <section class="card login-card">
      <h1 class="login-title">retype-this</h1>
      <p class="muted">Sign in to upload books and practice touch typing.</p>
      <form class="login-form" autocomplete="off" @submit.prevent="submit">
        <label>
          <div class="muted">Username</div>
          <input
            v-model="username"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            class="login-input"
          />
        </label>
        <label>
          <div class="muted">Password</div>
          <input
            v-model="password"
            type="password"
            autocomplete="off"
            class="login-input"
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

<style scoped>
.login-page {
  padding: 4rem 0;
  position: relative;
}

.login-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 1rem;
}

.login-card {
  max-width: 420px;
  margin: 0 auto;
  padding: 2rem;
}

.login-title {
  margin-top: 0;
}

.login-form {
  display: grid;
  gap: 1rem;
}

.login-input {
  width: 100%;
  padding: 0.65rem;
}
</style>
