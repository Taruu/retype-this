<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useBooksStore } from '../stores/books'
import { useSettingsStore } from '../stores/settings'

const auth = useAuthStore()
const booksStore = useBooksStore()
const settings = useSettingsStore()
const router = useRouter()
const fileInput = ref(null)

onMounted(async () => {
  await settings.load()
  booksStore.fetchBooks()
})

function openUpload() {
  fileInput.value?.click()
}

async function renameBook(book) {
  const nextTitle = window.prompt('Book title', book.title)
  if (!nextTitle || nextTitle.trim() === book.title) return
  try {
    await booksStore.renameBook(book.id, nextTitle.trim())
  } catch {
    // error shown in store
  }
}

async function onFileChange(event) {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    const book = await booksStore.uploadBook(file)
    const title = window.prompt('Name this book', book.title)
    if (title && title.trim() && title.trim() !== book.title) {
      await booksStore.renameBook(book.id, title.trim())
    }
    router.push(`/book/${book.id}`)
  } catch {
    // error shown in store
  } finally {
    event.target.value = ''
  }
}

async function removeBook(id) {
  if (!confirm('Delete this book and all progress?')) return
  await booksStore.deleteBook(id)
}

function openBook(book) {
  const page = book.progress?.reading_page ?? 0
  router.push(`/book/${book.id}/page/${page}`)
}

function logout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <main class="container" style="padding: 2rem 0 4rem;">
    <header style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 2rem;">
      <div>
        <h1 style="margin: 0;">Library</h1>
        <p class="muted" style="margin: 0.25rem 0 0;">Upload EPUB or FB2 files and retype them page by page.</p>
      </div>
      <div style="display: flex; gap: 0.75rem;">
        <button class="btn" type="button" :disabled="booksStore.uploadLoading" @click="openUpload">
          {{ booksStore.uploadLoading ? 'Uploading…' : 'Upload book' }}
        </button>
        <button class="btn btn-secondary" type="button" @click="logout">Logout</button>
      </div>
      <input ref="fileInput" type="file" accept=".epub,.fb2" hidden @change="onFileChange" />
    </header>

    <p v-if="booksStore.error" class="error">{{ booksStore.error }}</p>
    <p v-if="booksStore.loading" class="muted">Loading books…</p>

    <section v-if="!booksStore.loading && booksStore.books.length === 0" class="card" style="padding: 2rem;">
      <h2 style="margin-top: 0;">No books yet</h2>
      <p class="muted">Upload an EPUB or FB2 file to start retyping.</p>
    </section>

    <section v-else style="display: grid; gap: 1rem;">
      <article v-for="book in booksStore.books" :key="book.id" class="card" style="padding: 1.25rem 1.5rem;">
        <div style="display: flex; justify-content: space-between; gap: 1rem; align-items: start;">
          <div>
            <h2 style="margin: 0 0 0.25rem;">{{ book.title }}</h2>
            <p class="muted" style="margin: 0;">
              {{ book.author || 'Unknown author' }} · {{ book.format.toUpperCase() }} ·
              {{ book.block_count }} blocks
            </p>
            <p v-if="book.progress" class="muted" style="margin: 0.5rem 0 0;">
              Page {{ book.progress.reading_page + 1 }} · Block {{ book.progress.typing_block_index + 1 }}
            </p>
          </div>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="btn" type="button" @click="openBook(book)">Continue</button>
            <button class="btn btn-secondary" type="button" @click="renameBook(book)">Rename</button>
            <button class="btn btn-secondary" type="button" @click="removeBook(book.id)">Delete</button>
          </div>
        </div>
      </article>
    </section>
  </main>
</template>
