<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BlockReader from '../components/BlockReader.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import { useReaderStore } from '../stores/reader'
import { useSettingsStore } from '../stores/settings'
import { compareTypedText } from '../utils/textMatch'

const props = defineProps({
  id: { type: [String, Number], required: true },
  page: { type: [String, Number], default: null },
})

const route = useRoute()
const router = useRouter()
const reader = useReaderStore()
const settings = useSettingsStore()
const pageError = ref('')
const activeBlockRef = ref(null)
const hasScrolledInitially = ref(false)

const saveStatusLabel = computed(() => {
  switch (reader.saveStatus) {
    case 'saving':
      return 'Saving…'
    case 'unsaved':
      return 'Unsaved'
    case 'error':
      return 'Save failed'
    default:
      return 'Saved'
  }
})

const saveStatusTitle = computed(() => {
  switch (reader.saveStatus) {
    case 'saving':
      return 'Auto-saving your progress…'
    case 'unsaved':
      return 'Changes not saved yet — auto-save runs when you move the mouse or pause typing'
    case 'error':
      return 'Could not save — will retry on next auto-save'
    default:
      return reader.lastSavedAt
        ? `Auto-saved ${new Date(reader.lastSavedAt).toLocaleTimeString()}`
        : 'Progress is saved'
  }
})

const activeBlock = computed(() => {
  if (!reader.pageData) return null
  return reader.pageData.blocks.find((block) => block.index === reader.progress.typing_block_index) || null
})

const typingBlockPage = computed(() => {
  const pageSize = reader.book?.page_size || reader.pageData?.page_size || 4
  return Math.floor(reader.progress.typing_block_index / pageSize)
})

const activeBlockComplete = computed(() => {
  if (!activeBlock.value) return true
  return compareTypedText(activeBlock.value.text_plain, reader.draftText).complete
})

const isPageTypingComplete = computed(() => {
  if (!reader.pageData) return false
  const lastBlockOnPage = Math.max(...reader.pageData.blocks.map((block) => block.index))
  return reader.progress.typing_block_index > lastBlockOnPage
})

const canGoNextPage = computed(() => {
  return reader.currentPage < reader.pageCount - 1 && isPageTypingComplete.value
})

/** Client-side only: hide paragraphs after the current typing block. */
const visibleBlocks = computed(() => {
  if (!reader.pageData) return []
  const currentIndex = reader.progress.typing_block_index
  return reader.pageData.blocks.filter((block) => block.index <= currentIndex)
})

async function bootstrap() {
  await settings.load()
  reader.reset()
  pageError.value = ''
  hasScrolledInitially.value = false
  try {
    await reader.loadBook(props.id, props.page)
    if (route.name === 'book-redirect') {
      router.replace(`/book/${props.id}/page/${reader.currentPage}`)
    }
  } catch {
    // surfaced in template
  }
}

onMounted(() => {
  bootstrap()
  window.addEventListener('beforeunload', flushProgress)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', flushProgress)
  window.removeEventListener('keydown', onKeydown)
  flushProgress()
})

watch(
  () => [props.id, props.page],
  () => bootstrap(),
)

function flushProgress() {
  if (!reader.bookId) return
  reader.saveDraftToServer(reader.draftText)
}

async function goToPage(nextPage) {
  pageError.value = ''
  if (nextPage < 0 || nextPage >= reader.pageCount) return

  const goingForward = nextPage > reader.currentPage
  if (goingForward) {
    if (nextPage > reader.maxUnlockedPage) {
      pageError.value = 'Finish the current typing block before reading further.'
      return
    }
    if (!isPageTypingComplete.value && activeBlock.value && !activeBlockComplete.value) {
      pageError.value = 'Your typed text must match the current block before you continue.'
      return
    }
  }

  await reader.saveDraftToServer(reader.draftText)
  await reader.loadPage(nextPage)
  router.replace(`/book/${props.id}/page/${nextPage}`)
}

async function goToNextPage() {
  if (!canGoNextPage.value) return
  await goToPage(reader.currentPage + 1)
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    flushProgress()
    backToLibrary()
    return
  }

  if (reader.loading || !reader.pageData) return

  if (event.key === 'PageUp') {
    event.preventDefault()
    goToPage(reader.currentPage - 1)
    return
  }

  if (event.key === 'PageDown') {
    event.preventDefault()
    goToPage(reader.currentPage + 1)
    return
  }

  if (event.key === 'Enter' && !event.shiftKey && isPageTypingComplete.value) {
    if (canGoNextPage.value) {
      event.preventDefault()
      goToNextPage()
    }
  }
}

async function onComplete(typedText) {
  pageError.value = ''
  try {
    await reader.completeCurrentBlock(typedText)
    return true
  } catch (error) {
    pageError.value = error.message || 'Could not complete block'
    return false
  }
}

provide('submitBlockCompletion', onComplete)

function onDraft({ blockIndex, text }) {
  if (blockIndex === reader.progress.typing_block_index) {
    reader.draftText = text
    if (text !== reader.progress.draft_text) {
      reader.markDraftDirty()
    }
  }
}

async function onSave({ blockIndex, text, onSaved }) {
  if (blockIndex !== reader.progress.typing_block_index) return
  try {
    await reader.saveDraftToServer(text)
    onSaved?.()
  } catch {
    // needsServerSave stays true — next mouse move or idle timer retries
  }
}

function setActiveBlockRef(el) {
  activeBlockRef.value = el
}

function scrollActiveBlockIntoView(behavior = 'smooth') {
  nextTick(() => {
    nextTick(() => {
      requestAnimationFrame(() => {
        const block = activeBlockRef.value
        const scrollEl = block?.closest('.reader-scroll')
        if (!block || !scrollEl) return

        const containerRect = scrollEl.getBoundingClientRect()
        const blockRect = block.getBoundingClientRect()
        const targetTop = containerRect.top + scrollEl.clientHeight * 0.26
        const delta = blockRect.top - targetTop
        scrollEl.scrollBy({ top: delta, behavior })
      })
    })
  })
}

watch(
  () => [reader.loading, reader.pageData, reader.progress.typing_block_index],
  ([loading, pageData]) => {
    if (!loading && pageData && activeBlock.value) {
      scrollActiveBlockIntoView(hasScrolledInitially.value ? 'smooth' : 'instant')
      hasScrolledInitially.value = true
    }
  },
)

function backToLibrary() {
  router.push('/')
}
</script>

<template>
  <main class="container reader-page">
    <header class="reader-header">
      <div>
        <button class="btn btn-secondary" type="button" @click="backToLibrary">← Library</button>
        <h1 class="reader-title">{{ reader.book?.title || 'Loading…' }}</h1>
        <p class="muted reader-meta">
          <span>
            Page {{ reader.currentPage + 1 }} / {{ reader.pageCount || '…' }} ·
            Block {{ reader.progress.typing_block_index + 1 }} / {{ reader.book?.block_count || '…' }}
          </span>
          <span
            class="reader-save"
            :class="`reader-save--${reader.saveStatus}`"
            :title="saveStatusTitle"
            aria-live="polite"
          >
            <span class="reader-save__icon" aria-hidden="true">
              <span v-if="reader.saveStatus === 'saving'" class="reader-save__spinner" />
              <span v-else-if="reader.saveStatus === 'saved'">✓</span>
              <span v-else-if="reader.saveStatus === 'error'">!</span>
              <span v-else>○</span>
            </span>
            <span class="reader-save__label">{{ saveStatusLabel }}</span>
          </span>
        </p>
        <p class="muted reader-hints">Enter — next page when finished · Esc — library</p>
      </div>
      <div class="reader-nav">
        <ThemeToggle />
        <div class="reader-nav__group">
          <span class="reader-nav__hint muted">Page Up</span>
          <button class="btn btn-secondary" type="button" :disabled="reader.currentPage <= 0" @click="goToPage(reader.currentPage - 1)">
            Previous page
          </button>
        </div>
        <div class="reader-nav__group">
          <span class="reader-nav__hint muted">Page Down</span>
          <button
            class="btn btn-secondary"
            type="button"
            :disabled="!canGoNextPage"
            @click="goToNextPage"
          >
            Next page
          </button>
        </div>
      </div>
    </header>

    <p v-if="pageError" class="error reader-error">{{ pageError }}</p>
    <p v-if="reader.loading" class="muted">Loading…</p>
    <p v-else-if="reader.error" class="error">{{ reader.error }}</p>

    <template v-else-if="reader.pageData">
      <p
        v-if="!activeBlock && typingBlockPage <= reader.maxUnlockedPage"
        class="card reader-jump"
      >
        Current typing block is on page {{ typingBlockPage + 1 }}.
        <button class="btn btn-secondary" type="button" @click="goToPage(typingBlockPage)">
          Go to typing page
        </button>
      </p>

      <div class="reader-scroll">
        <section class="card reader-blocks">
          <div
            v-for="block in visibleBlocks"
            :key="block.index"
            :ref="block.index === reader.progress.typing_block_index ? setActiveBlockRef : undefined"
            class="reader-block-slot"
            :class="{ 'reader-block-slot--active': block.index === reader.progress.typing_block_index }"
          >
            <BlockReader
              :book-id="reader.bookId"
              :block="block"
              :status="reader.blockStatus(block.index)"
              :initial-draft="block.index === reader.progress.typing_block_index ? reader.progress.draft_text : ''"
              @update:draft="onDraft"
              @complete="onComplete"
              @save="onSave"
            />
          </div>
        </section>
      </div>
    </template>
  </main>
</template>

<style scoped>
.reader-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 1rem 0 0;
  max-width: none;
  width: 100%;
}

.reader-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  margin-bottom: 0;
  width: min(960px, calc(100% - 2rem));
  margin-inline: auto;
  flex-shrink: 0;
}

.reader-title {
  margin: 0.5rem 0 0.2rem;
}

.reader-meta {
  margin: 0;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.reader-save {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 88%, var(--bg));
  font-size: 0.78rem;
  line-height: 1.2;
}

.reader-save--saved {
  color: var(--success);
  border-color: color-mix(in srgb, var(--success) 35%, var(--border));
}

.reader-save--saving {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
}

.reader-save--unsaved {
  color: var(--muted);
}

.reader-save--error {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 35%, var(--border));
}

.reader-save__icon {
  display: inline-flex;
  width: 0.9rem;
  justify-content: center;
  font-weight: 700;
}

.reader-save__spinner {
  width: 0.75rem;
  height: 0.75rem;
  border: 2px solid color-mix(in srgb, var(--accent) 25%, transparent);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: reader-save-spin 0.7s linear infinite;
}

@keyframes reader-save-spin {
  to {
    transform: rotate(360deg);
  }
}

.reader-hints {
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
}

.reader-nav {
  display: flex;
  gap: 0.75rem;
  align-items: flex-end;
}

.reader-nav__group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.reader-nav__hint {
  font-size: 0.72rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.reader-error {
  margin-bottom: 0.75rem;
  width: min(960px, calc(100% - 2rem));
  margin-inline: auto;
}

.reader-jump {
  padding: 0.75rem 1rem;
  margin-bottom: 0.75rem;
  width: min(56rem, calc(100% - 2rem));
  margin-inline: auto;
}

.reader-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin-top: 1rem;
  scroll-behavior: smooth;
}

.reader-blocks {
  width: min(56rem, calc(100% - 2rem));
  margin: 0 auto;
  padding: clamp(4rem, 12vh, 8rem) 1.25rem clamp(2rem, 6vh, 4rem);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.reader-block-slot--active {
  padding-bottom: clamp(10rem, 36vh, 18rem);
  scroll-margin-top: 26vh;
}

.reader-block-slot:not(.reader-block-slot--active) {
  opacity: 0.8;
}
</style>
