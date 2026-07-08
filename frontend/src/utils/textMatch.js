const SPACE_RE = /[\s\u00a0\u2000-\u200b\u202f\u205f\u3000]/

let charMappings = {}

export function setCharMappings(mappings) {
  charMappings = mappings || {}
}

export function getCharMappings() {
  return charMappings
}

function isSpaceChar(ch) {
  return SPACE_RE.test(ch)
}

function normalizeNfc(text) {
  return (text || '').normalize('NFC')
}

function applyCharMappings(text) {
  let result = text
  for (const [from, to] of Object.entries(charMappings)) {
    if (!from) continue
    result = result.split(from).join(to)
  }
  return result
}

function normalizeWhitespace(text, { trim }) {
  let result = text
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, ' ')
    .replace(/\s+/g, ' ')
  return trim ? result.trim() : result
}

function normalizeCore(text, { trim }) {
  return normalizeWhitespace(applyCharMappings(normalizeNfc(text)), { trim })
}

/** Full normalization for final "block complete" check. */
export function normalizeText(text) {
  return normalizeCore(text, { trim: true })
}

/** Normalize typed text while user is still typing — do not trim end spaces. */
export function normalizeTypedLive(text) {
  return normalizeCore(text, { trim: false })
}

/**
 * Build normalized expected text and map each normalized index to original index.
 */
export function normalizeExpectedWithMap(expected) {
  const source = normalizeNfc(expected)
  const chars = []
  const indexMap = []
  let i = 0

  while (i < source.length && isSpaceChar(source[i])) {
    i += 1
  }

  while (i < source.length) {
    if (isSpaceChar(source[i])) {
      if (chars.length > 0 && chars[chars.length - 1] !== ' ') {
        chars.push(' ')
        indexMap.push(i)
      }
      while (i < source.length && isSpaceChar(source[i])) {
        i += 1
      }
      continue
    }

    let mappedText = source[i]
    let consumed = 1
    for (const [from, to] of Object.entries(charMappings)) {
      if (from && source.startsWith(from, i)) {
        mappedText = to
        consumed = from.length
        break
      }
    }

    const originalEnd = i + consumed - 1
    for (const ch of mappedText) {
      chars.push(ch)
      indexMap.push(originalEnd)
    }
    i += consumed
  }

  while (chars.length > 0 && chars[chars.length - 1] === ' ') {
    chars.pop()
    indexMap.pop()
  }

  return {
    normalized: chars.join(''),
    indexMap,
  }
}

export function compareTypedText(expected, typed) {
  const { normalized: exp } = normalizeExpectedWithMap(expected)
  const typ = normalizeTypedLive(typed)
  const complete = exp.length > 0 && exp === normalizeText(typed)

  let matchedChars = 0
  while (
    matchedChars < exp.length &&
    matchedChars < typ.length &&
    exp[matchedChars] === typ[matchedChars]
  ) {
    matchedChars += 1
  }

  const totalChars = exp.length
  const progress = totalChars > 0 ? matchedChars / totalChars : 0
  const mismatchAt = matchedChars < typ.length || matchedChars < exp.length ? matchedChars : -1

  return {
    complete,
    progress: complete ? 1 : Math.min(progress, 1),
    matchedChars,
    totalChars,
    mismatchAt,
    prefixMatch: typ.length <= exp.length && exp.startsWith(typ),
  }
}

/** Map normalized character range back to original expected substring. */
function getExpectedSliceFromNorm(expected, normStart, normEnd) {
  const { indexMap } = normalizeExpectedWithMap(expected)
  if (normStart >= normEnd || normStart >= indexMap.length) return ''
  const origStart = normStart === 0 ? 0 : indexMap[normStart - 1] + 1
  const origEnd = indexMap[Math.min(normEnd, indexMap.length) - 1] + 1
  return origEnd > origStart ? expected.slice(origStart, origEnd) : ''
}

/**
 * Split expected text into matched / error / pending segments for overlay display.
 */
export function buildOverlaySegments(expected, typed) {
  const { normalized: exp, indexMap } = normalizeExpectedWithMap(expected)
  const typ = normalizeTypedLive(typed)
  const comparison = compareTypedText(expected, typed)

  if (!exp.length) {
    return [{ text: expected, state: 'pending' }]
  }
  if (!typ.length) {
    return [{ text: expected, state: 'pending' }]
  }
  if (comparison.complete) {
    return [{ text: expected, state: 'matched' }]
  }

  const matched = comparison.matchedChars
  const segments = []

  const sliceFromNorm = (normStart, normEnd, state) => {
    const slice = getExpectedSliceFromNorm(expected, normStart, normEnd)
    if (slice) {
      segments.push({ text: slice, state })
    }
  }

  if (matched > 0) {
    sliceFromNorm(0, matched, 'matched')
  }

  const hasMismatch = typ.length > matched
  if (hasMismatch && matched < exp.length) {
    // Hide as many expected chars as typed typo chars so typos replace, not stack on, pending text.
    const typoLen = typ.length - matched
    const hiddenCount = Math.min(typoLen, exp.length - matched)
    sliceFromNorm(matched, matched + hiddenCount, 'hidden')
    const pendingNormStart = matched + hiddenCount
    if (pendingNormStart < exp.length) {
      const pendingStart = pendingNormStart === 0 ? 0 : indexMap[pendingNormStart - 1] + 1
      if (pendingStart < expected.length) {
        segments.push({ text: expected.slice(pendingStart), state: 'pending' })
      }
    }
  } else if (matched < exp.length) {
    const pendingStart = matched > 0 ? indexMap[matched - 1] + 1 : 0
    if (pendingStart < expected.length) {
      segments.push({ text: expected.slice(pendingStart), state: 'pending' })
    }
  }

  return segments.length ? segments : [{ text: expected, state: 'pending' }]
}

function findRawIndexForNormLength(raw, normLen) {
  if (normLen <= 0) return 0
  for (let i = 1; i <= raw.length; i += 1) {
    if (normalizeTypedLive(raw.slice(0, i)).length >= normLen) {
      return i
    }
  }
  return raw.length
}

/**
 * Segments of what the user typed — matched chars shown as expected glyphs
 * (so e.g. " aligns with «), wrong chars shown as typos.
 */
export function buildTypedSegments(expected, typed) {
  if (!typed) return []

  const comparison = compareTypedText(expected, typed)
  const typ = normalizeTypedLive(typed)
  const matched = comparison.matchedChars

  if (comparison.complete) {
    return [{ text: expected, state: 'correct' }]
  }

  if (matched >= typ.length) {
    const displayText = getExpectedSliceFromNorm(expected, 0, matched)
    return [{ text: displayText, state: 'correct' }]
  }

  const rawMatchEnd = findRawIndexForNormLength(typed, matched)
  const segments = []

  if (matched > 0) {
    segments.push({ text: getExpectedSliceFromNorm(expected, 0, matched), state: 'correct' })
  }
  if (rawMatchEnd < typed.length) {
    segments.push({ text: typed.slice(rawMatchEnd), state: 'typo' })
  }

  return segments.length ? segments : [{ text: typed, state: 'typo' }]
}

/** @deprecated use buildOverlaySegments */
export function buildHighlightSegments(expected, typed) {
  return buildOverlaySegments(expected, typed)
}

export function draftStorageKey(bookId, blockIndex) {
  return `retype-draft:${bookId}:${blockIndex}`
}

export function loadDraft(bookId, blockIndex) {
  try {
    return localStorage.getItem(draftStorageKey(bookId, blockIndex)) || ''
  } catch {
    return ''
  }
}

export function saveDraft(bookId, blockIndex, text) {
  try {
    const key = draftStorageKey(bookId, blockIndex)
    if (text) {
      localStorage.setItem(key, text)
    } else {
      localStorage.removeItem(key)
    }
  } catch {
    // ignore quota errors
  }
}

export function clearDraft(bookId, blockIndex) {
  saveDraft(bookId, blockIndex, '')
}
