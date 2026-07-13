<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ThemeToggle from '../components/ThemeToggle.vue'
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

  if (event.key.toLowerCase() === 'd' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault()
    resetProgress(book)
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

async function resetProgress(book) {
  if (!confirm(`Reset progress for "${book.title}"? You will start from the beginning.`)) return
  try {
    await booksStore.resetBookProgress(book.id)
  } catch {
    // error shown in store
  }
}

function openBook(book) {
  const pageSize = book.page_size ?? 4
  const typingIndex = book.progress?.typing_block_index ?? 0
  const typingPage = Math.floor(typingIndex / pageSize)
  router.push(`/book/${book.id}/page/${typingPage}`)
}

function bookProgress(book) {
  const finished = book.progress?.typing_block_index ?? 0
  const total = book.block_count || 0
  return {
    finished,
    total,
    percent: total > 0 ? Math.round((finished / total) * 100) : 0,
    isComplete: total > 0 && finished >= total,
  }
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
      <div style="display: flex; gap: 0.75rem; align-items: center;">
        <ThemeToggle />
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
      ↑↓ select book · Enter continue · R rename · D reset · Delete remove · Esc logout
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
        <div class="library-book__content">
          <h2 class="library-book__title">{{ book.title }}</h2>
          <p class="muted library-book__meta">
            {{ book.author || 'Unknown author' }} · {{ book.format.toUpperCase() }} ·
            {{ book.block_count }} blocks
          </p>

          <div v-if="book.block_count" class="library-book__progress">
            <div class="library-book__progress-track" aria-hidden="true">
              <div
                class="library-book__progress-bar"
                :class="{ 'library-book__progress-bar--complete': bookProgress(book).isComplete }"
                :style="{ width: `${bookProgress(book).percent}%` }"
              />
            </div>
            <span class="muted library-book__progress-label">
              <template v-if="bookProgress(book).isComplete">Complete</template>
              <template v-else>
                {{ bookProgress(book).finished }} / {{ bookProgress(book).total }} blocks
                ({{ bookProgress(book).percent }}%)
              </template>
            </span>
          </div>

          <div class="library-book__actions">
            <div class="library-action">
              <button
                class="library-action__btn"
                type="button"
                aria-label="Continue"
                aria-keyshortcuts="Enter"
                @click.stop="openBook(book)"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
              <kbd class="library-action__key">Enter</kbd>
            </div>
            <div class="library-action">
              <button
                class="library-action__btn"
                type="button"
                aria-label="Rename"
                aria-keyshortcuts="R"
                @click.stop="renameBook(book)"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
              <kbd class="library-action__key">R</kbd>
            </div>
            <div class="library-action">
              <button
                class="library-action__btn library-action__btn--reset"
                type="button"
                aria-label="Reset progress"
                aria-keyshortcuts="D"
                @click.stop="resetProgress(book)"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
              <kbd class="library-action__key">D</kbd>
            </div>
            <div class="library-action">
              <button
                class="library-action__btn library-action__btn--danger"
                type="button"
                aria-label="Delete"
                aria-keyshortcuts="Delete"
                @click.stop="removeBook(book.id)"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
              <kbd class="library-action__key">Del</kbd>
            </div>
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

.library-book__content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.library-book__title {
  margin: 0;
}

.library-book__meta {
  margin: 0;
}

.library-book__progress {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.library-book__progress-track {
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}

.library-book__progress-bar {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.2s ease;
}

.library-book__progress-bar--complete {
  background: var(--success);
}

.library-book__progress-label {
  font-size: 0.8rem;
}

.library-book__actions {
  display: flex;
  gap: 1.25rem;
  margin-top: 0.25rem;
}

.library-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.library-action__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
}

.library-action__btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.library-action__btn--danger:hover {
  border-color: var(--danger);
  color: var(--danger);
}

.library-action__btn--reset:hover {
  border-color: var(--hint);
  color: var(--hint);
}

.library-action__key {
  font-family: inherit;
  font-size: 0.68rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--muted);
  background: none;
  border: none;
  padding: 0;
}
</style>
