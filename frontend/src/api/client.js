const TOKEN_KEY = 'retype_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) }
  const token = getToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(path, { ...options, headers })
  if (response.status === 401) {
    clearToken()
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }
    throw new Error('Unauthorized')
  }

  if (response.status === 204) {
    return null
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = data.detail
    const message = Array.isArray(detail)
      ? detail.map((item) => item.msg || String(item)).join(', ')
      : detail || data.message || 'Request failed'
    throw new Error(message)
  }
  return data
}

export const api = {
  login(username, password) {
    return request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
  },
  listBooks() {
    return request('/api/books')
  },
  uploadBook(file) {
    const body = new FormData()
    body.append('file', file)
    return request('/api/books', { method: 'POST', body })
  },
  deleteBook(id) {
    return request(`/api/books/${id}`, { method: 'DELETE' })
  },
  getBook(id) {
    return request(`/api/books/${id}`)
  },
  getPageCount(id) {
    return request(`/api/books/${id}/page-count`)
  },
  getPage(id, page) {
    return request(`/api/books/${id}/pages/${page}`)
  },
  getProgress(id) {
    return request(`/api/books/${id}/progress`)
  },
  saveProgress(id, progress) {
    return request(`/api/books/${id}/progress`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(progress),
    })
  },
  completeBlock(id, typedText) {
    return request(`/api/books/${id}/complete-block`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ typed_text: typedText }),
    })
  },
  resetProgress(id) {
    return request(`/api/books/${id}/reset-progress`, { method: 'POST' })
  },
  renameBook(id, title) {
    return request(`/api/books/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
  },
  getSettings() {
    return request('/api/settings')
  },
}
