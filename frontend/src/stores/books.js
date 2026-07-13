import { defineStore } from 'pinia'
import { api } from '../api/client'
import { clearAllDraftsForBook } from '../utils/textMatch'

export const useBooksStore = defineStore('books', {
  state: () => ({
    books: [],
    loading: false,
    error: '',
    uploadLoading: false,
  }),
  actions: {
    async fetchBooks() {
      this.loading = true
      this.error = ''
      try {
        this.books = await api.listBooks()
      } catch (error) {
        this.error = error.message || 'Failed to load books'
      } finally {
        this.loading = false
      }
    },
    async uploadBook(file) {
      this.uploadLoading = true
      this.error = ''
      try {
        const book = await api.uploadBook(file)
        await this.fetchBooks()
        return book
      } catch (error) {
        this.error = error.message || 'Upload failed'
        throw error
      } finally {
        this.uploadLoading = false
      }
    },
    async deleteBook(id) {
      await api.deleteBook(id)
      this.books = this.books.filter((book) => book.id !== id)
    },
    async renameBook(id, title) {
      this.error = ''
      try {
        const book = await api.renameBook(id, title)
        const index = this.books.findIndex((item) => item.id === id)
        if (index >= 0) {
          this.books[index] = { ...this.books[index], title: book.title }
        }
        return book
      } catch (error) {
        this.error = error.message || 'Rename failed'
        throw error
      }
    },
    async resetBookProgress(id) {
      this.error = ''
      try {
        const progress = await api.resetProgress(id)
        const index = this.books.findIndex((item) => item.id === id)
        if (index >= 0) {
          this.books[index] = { ...this.books[index], progress }
        }
        clearAllDraftsForBook(id)
        return progress
      } catch (error) {
        this.error = error.message || 'Reset failed'
        throw error
      }
    },
  },
})
