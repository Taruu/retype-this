<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BlockReader from '../components/BlockReader.vue'
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
  } catch (error) {
    pageError.value = error.message || 'Could not complete block'
  }
}

function onDraft(value) {
  reader.draftText = value
}

function onSave(draftText) {
  reader.saveDraftToServer(draftText)
}

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
          Page {{ reader.currentPage + 1 }} / {{ reader.pageCount || '…' }} ·
          Block {{ reader.progress.typing_block_index + 1 }} / {{ reader.book?.block_count || '…' }}
        </p>
        <p class="muted reader-hints">Page Up / Page Down — change page · Enter — next page when finished</p>
      </div>
      <div class="reader-nav">
        <button class="btn btn-secondary" type="button" :disabled="reader.currentPage <= 0" @click="goToPage(reader.currentPage - 1)">
          Previous page
        </button>
        <button
          class="btn btn-secondary"
          type="button"
          :disabled="!canGoNextPage"
          @click="goToNextPage"
        >
          Next page
        </button>
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

      <section class="card reader-blocks">
        <BlockReader
          v-for="block in visibleBlocks"
          :key="block.index"
          :book-id="reader.bookId"
          :block="block"
          :status="reader.blockStatus(block.index)"
          :initial-draft="block.index === reader.progress.typing_block_index ? reader.progress.draft_text : ''"
          @update:draft="onDraft"
          @complete="onComplete"
          @save="onSave"
        />
      </section>
    </template>
  </main>
</template>

<style scoped>
.reader-page {
  padding: 1.25rem 0 3rem;
}

.reader-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;
}

.reader-title {
  margin: 0.5rem 0 0.2rem;
}

.reader-meta,
.reader-hints {
  margin: 0;
  font-size: 0.9rem;
}

.reader-hints {
  margin-top: 0.25rem;
  font-size: 0.8rem;
}

.reader-nav {
  display: flex;
  gap: 0.5rem;
}

.reader-error {
  margin-bottom: 0.75rem;
}

.reader-jump {
  padding: 0.75rem 1rem;
  margin-bottom: 0.75rem;
}

.reader-blocks {
  padding: 0.5rem 0.85rem 0.35rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
</style>
