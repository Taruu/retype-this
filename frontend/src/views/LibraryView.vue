<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useBooksStore } from '../stores/books'
import { useSettingsStore } from '../stores/settings'

const auth = useAuthStore()
const booksStore = useBooksStore()
const settings = useSettingsStore()
const router = useRouter()
const fileInput = ref(null)
const bookListRef = ref(null)
const selectedIndex = ref(-1)

const selectedBook = computed(() => {
  const books = booksStore.books
  if (selectedIndex.value < 0 || selectedIndex.value >= books.length) return null
  return books[selectedIndex.value]
})

watch(
  () => booksStore.books,
  (books) => {
    if (!books.length) {
      selectedIndex.value = -1
      return
    }
    if (selectedIndex.value < 0) selectedIndex.value = 0
    else if (selectedIndex.value >= books.length) selectedIndex.value = books.length - 1
  },
  { immediate: true },
)

function isEditableTarget(event) {
  const el = event.target
  if (!el || typeof el !== 'object') return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

function scrollSelectedIntoView() {
  nextTick(() => {
    bookListRef.value?.querySelector('.library-book--selected')?.scrollIntoView({ block: 'nearest' })
  })
}

function selectBook(index) {
  if (index < 0 || index >= booksStore.books.length) return
  selectedIndex.value = index
  scrollSelectedIntoView()
}

function moveSelection(delta) {
  const books = booksStore.books
  if (!books.length) return
  if (selectedIndex.value < 0) {
    selectedIndex.value = 0
  } else {
    selectedIndex.value = Math.max(0, Math.min(books.length - 1, selectedIndex.value + delta))
  }
  scrollSelectedIntoView()
}

function onKeydown(event) {
  if (isEditableTarget(event)) return
  if (booksStore.loading) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveSelection(1)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveSelection(-1)
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    logout()
    return
  }

  const book = selectedBook.value
  if (!book) return

  if (event.key === 'Enter') {
    event.preventDefault()
    openBook(book)
    return
  }

  if (event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault()
    renameBook(book)
    return
  }

  if (
    (event.key === 'Delete' || event.key === 'Backspace') &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    event.preventDefault()
    removeBook(book.id)
  }
}

onMounted(async () => {
  await settings.load()
  booksStore.fetchBooks()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
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
  const pageSize = book.page_size ?? 4
  const typingIndex = book.progress?.typing_block_index ?? 0
  const typingPage = Math.floor(typingIndex / pageSize)
  router.push(`/book/${book.id}/page/${typingPage}`)
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
    <p v-else-if="booksStore.books.length" class="muted library-shortcuts">
      ↑↓ select book · Enter continue · R rename · Delete remove · Esc logout
    </p>

    <section v-if="!booksStore.loading && booksStore.books.length === 0" class="card" style="padding: 2rem;">
      <h2 style="margin-top: 0;">No books yet</h2>
      <p class="muted">Upload an EPUB or FB2 file to start retyping.</p>
    </section>

    <section v-else ref="bookListRef" class="library-list">
      <article
        v-for="(book, index) in booksStore.books"
        :key="book.id"
        class="card library-book"
        :class="{ 'library-book--selected': index === selectedIndex }"
        @click="selectBook(index)"
      >
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
          <div class="library-book__actions">
            <button class="btn" type="button" @click.stop="openBook(book)">Continue</button>
            <button class="btn btn-secondary btn-sm" type="button" @click.stop="renameBook(book)">Rename</button>
            <button class="btn btn-secondary btn-sm" type="button" @click.stop="removeBook(book.id)">Delete</button>
          </div>
        </div>
      </article>
    </section>
  </main>
</template>

<style scoped>
.library-shortcuts {
  margin: 0 0 1rem;
  font-size: 0.85rem;
}

.library-list {
  display: grid;
  gap: 1rem;
}

.library-book {
  padding: 1.25rem 1.5rem;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.library-book--selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent);
}

.library-book__actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
}

.btn-sm {
  padding: 0.35rem 0.6rem;
  font-size: 0.8rem;
  border-radius: 8px;
}
</style>
