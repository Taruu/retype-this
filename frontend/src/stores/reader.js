import { defineStore } from 'pinia'
import { api } from '../api/client'
import { clearDraft } from '../utils/textMatch'

export const useReaderStore = defineStore('reader', {
  state: () => ({
    bookId: null,
    book: null,
    pageCount: 0,
    currentPage: 0,
    pageData: null,
    progress: {
      reading_page: 0,
      typing_block_index: 0,
      char_offset: 0,
      draft_text: '',
    },
    pageCache: {},
    loading: false,
    error: '',
    draftText: '',
    saving: false,
  }),
  getters: {
    pageSize: (state) => state.book?.page_size || state.pageData?.page_size || 4,
    maxUnlockedPage: (state) => {
      const pageSize = state.book?.page_size || state.pageData?.page_size || 4
      return Math.floor(state.progress.typing_block_index / pageSize)
    },
    canGoForward(state) {
      return state.currentPage < this.maxUnlockedPage
    },
    canGoNextPage(state) {
      return state.currentPage < state.pageCount - 1 && this.canGoForward
    },
  },
  actions: {
    reset() {
      this.bookId = null
      this.book = null
      this.pageCount = 0
      this.currentPage = 0
      this.pageData = null
      this.pageCache = {}
      this.draftText = ''
      this.error = ''
    },
    async loadBook(bookId, page = null) {
      this.loading = true
      this.error = ''
      this.bookId = Number(bookId)
      try {
        const [book, pageCount, progress] = await Promise.all([
          api.getBook(this.bookId),
          api.getPageCount(this.bookId),
          api.getProgress(this.bookId),
        ])
        this.book = book
        this.pageCount = pageCount.page_count
        this.progress = {
          reading_page: progress.reading_page,
          typing_block_index: progress.typing_block_index,
          char_offset: progress.char_offset,
          draft_text: progress.draft_text || '',
        }
        this.draftText = this.progress.draft_text
        const targetPage = page !== null && page !== undefined
          ? Number(page)
          : progress.reading_page
        await this.loadPage(targetPage)
      } catch (error) {
        this.error = error.message || 'Failed to load book'
        throw error
      } finally {
        this.loading = false
      }
    },
    async loadPage(page) {
      const safePage = Math.max(0, page)
      if (this.pageCache[safePage]) {
        this.currentPage = safePage
        this.pageData = this.pageCache[safePage]
        this.trimCache(safePage)
        return
      }
      const data = await api.getPage(this.bookId, safePage)
      this.currentPage = safePage
      this.pageData = data
      this.pageCache[safePage] = data
      this.trimCache(safePage)
      await this.persistProgress({ reading_page: safePage })
    },
    trimCache(centerPage) {
      const keep = new Set([centerPage - 1, centerPage, centerPage + 1])
      for (const key of Object.keys(this.pageCache)) {
        if (!keep.has(Number(key))) {
          delete this.pageCache[Number(key)]
        }
      }
    },
    async persistProgress(patch = {}) {
      this.progress = {
        ...this.progress,
        ...patch,
      }
      const saved = await api.saveProgress(this.bookId, {
        reading_page: this.progress.reading_page,
        typing_block_index: this.progress.typing_block_index,
        char_offset: this.progress.char_offset,
        draft_text: this.progress.draft_text ?? this.draftText,
      })
      this.progress = {
        reading_page: saved.reading_page,
        typing_block_index: saved.typing_block_index,
        char_offset: saved.char_offset,
        draft_text: saved.draft_text || '',
      }
    },
    async saveDraftToServer(draftText) {
      if (!this.bookId || this.saving) return
      this.draftText = draftText
      this.saving = true
      try {
        await this.persistProgress({
          reading_page: this.currentPage,
          char_offset: draftText.length,
          draft_text: draftText,
        })
      } finally {
        this.saving = false
      }
    },
    async completeCurrentBlock(typedText) {
      const saved = await api.completeBlock(this.bookId, typedText)
      clearDraft(this.bookId, this.progress.typing_block_index)
      this.progress = {
        reading_page: saved.reading_page,
        typing_block_index: saved.typing_block_index,
        char_offset: saved.char_offset,
        draft_text: saved.draft_text || '',
      }
      this.draftText = ''
      delete this.pageCache[this.currentPage]
      await this.loadPage(this.currentPage)
    },
    blockStatus(blockIndex) {
      if (blockIndex < this.progress.typing_block_index) return 'done'
      if (blockIndex === this.progress.typing_block_index) return 'active'
      return 'locked'
    },
  },
})
