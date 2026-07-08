const SPACE_RE = /[\s\u00a0\u2000-\u200b\u202f\u205f\u3000]/

let charMappings = {}
const expectedCache = new Map()
const EXPECTED_CACHE_MAX = 48

export function setCharMappings(mappings) {
  charMappings = mappings || {}
  expectedCache.clear()
}

export function getCharMappings() {
  return charMappings
}

function isSpaceChar(ch) {
  return SPACE_RE.test(ch)
}

function hasCharMappings() {
  return Object.keys(charMappings).some((key) => key)
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

function canonicalizeSpaceChar(ch) {
  return SPACE_RE.test(ch) ? ' ' : ch
}

function normalizeWhitespace(text, { trim }) {
  let result = ''
  for (const ch of text) {
    result += canonicalizeSpaceChar(ch)
  }
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

function getExpectedNormalized(expected) {
  let cached = expectedCache.get(expected)
  if (!cached) {
    cached = normalizeExpectedWithMap(expected)
    if (expectedCache.size >= EXPECTED_CACHE_MAX) {
      const firstKey = expectedCache.keys().next().value
      expectedCache.delete(firstKey)
    }
    expectedCache.set(expected, cached)
  }
  return cached
}

/**
 * Build normalized expected text and map each normalized index to original index.
 */
export function normalizeExpectedWithMap(expected) {
  const source = normalizeNfc(expected)
  const chars = []
  const indexMap = []
  let i = 0

  while (i < source.length) {
    if (isSpaceChar(source[i])) {
      chars.push(' ')
      indexMap.push(i)
      i += 1
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

  return {
    normalized: chars.join(''),
    indexMap,
  }
}

/** O(n) map from normalized typed indices to raw string indices. */
function normalizeTypedWithRawMap(typed) {
  if (!typed) {
    return { normalized: '', normToRawStart: [], normToRawEnd: [] }
  }

  if (!hasCharMappings()) {
    const chars = []
    const normToRawStart = []
    const normToRawEnd = []
    let i = 0

    while (i < typed.length) {
      if (isSpaceChar(typed[i])) {
        chars.push(' ')
        normToRawStart.push(i)
        normToRawEnd.push(i + 1)
        i += 1
        continue
      }

      chars.push(typed[i])
      normToRawStart.push(i)
      normToRawEnd.push(i + 1)
      i += 1
    }

    return {
      normalized: chars.join(''),
      normToRawStart,
      normToRawEnd,
    }
  }

  const source = normalizeNfc(typed)
  const chars = []
  const normToRawStart = []
  const normToRawEnd = []
  let i = 0

  while (i < source.length) {
    if (isSpaceChar(source[i])) {
      chars.push(' ')
      normToRawStart.push(i)
      normToRawEnd.push(Math.min(i + 1, typed.length))
      i += 1
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

    const rawEnd = Math.min(i + consumed, typed.length)
    for (const ch of mappedText) {
      chars.push(ch)
      normToRawStart.push(i)
      normToRawEnd.push(rawEnd)
    }
    i += consumed
  }

  return {
    normalized: chars.join(''),
    normToRawStart,
    normToRawEnd,
  }
}

/**
 * O(n) greedy alignment for live typing feedback.
 * Insert/delete re-sync is only allowed before the first typo so later
 * characters (especially after spaces) stay aligned with what was typed.
 */
function alignTypedToExpected(exp, typ) {
  const ops = []
  let ei = 0
  let ti = 0
  let seenTypo = false

  const pushEqual = (expStart, expEnd, typStart, typEnd) => {
    if (expEnd > expStart) {
      ops.push({ op: 'equal', expStart, expEnd, typStart, typEnd })
    }
  }

  while (ei < exp.length || ti < typ.length) {
    if (ei < exp.length && ti < typ.length && exp[ei] === typ[ti]) {
      const expStart = ei
      const typStart = ti
      do {
        ei += 1
        ti += 1
      } while (ei < exp.length && ti < typ.length && exp[ei] === typ[ti])
      pushEqual(expStart, ei, typStart, ti)
      continue
    }

    if (ti >= typ.length) {
      ops.push({ op: 'delete', expStart: ei, expEnd: exp.length })
      break
    }
    if (ei >= exp.length) {
      ops.push({ op: 'insert', typStart: ti, typEnd: typ.length })
      break
    }

    if (!seenTypo) {
      if (ti + 1 < typ.length && exp[ei] === typ[ti + 1]) {
        ops.push({ op: 'insert', typStart: ti, typEnd: ti + 1 })
        seenTypo = true
        ti += 1
        continue
      }

      if (
        ei + 1 < exp.length &&
        typ[ti] === exp[ei + 1] &&
        exp[ei] !== ' ' &&
        typ[ti] !== ' '
      ) {
        ops.push({ op: 'delete', expStart: ei, expEnd: ei + 1 })
        ei += 1
        continue
      }
    }

    ops.push({
      op: 'replace',
      expStart: ei,
      expEnd: ei + 1,
      typStart: ti,
      typEnd: ti + 1,
    })
    seenTypo = true
    ei += 1
    ti += 1
  }

  return ops
}

function getExpectedSliceFromNorm(expected, indexMap, normStart, normEnd) {
  if (normStart >= normEnd || normStart >= indexMap.length) return ''
  const origStart = normStart === 0 ? 0 : indexMap[normStart - 1] + 1
  const origEnd = indexMap[Math.min(normEnd, indexMap.length) - 1] + 1
  return origEnd > origStart ? expected.slice(origStart, origEnd) : ''
}

function mergeAdjacentSegments(segments) {
  if (!segments.length) return segments
  const merged = [{ ...segments[0] }]
  for (let i = 1; i < segments.length; i += 1) {
    const prev = merged[merged.length - 1]
    const curr = segments[i]
    if (prev.state === curr.state) {
      prev.text += curr.text
    } else {
      merged.push({ ...curr })
    }
  }
  return merged
}

function buildGuideSegments(expected, indexMap, ops, complete, typed) {
  const { normalized: exp } = getExpectedNormalized(expected)

  if (!exp.length) {
    return [{ text: expected, state: 'pending' }]
  }
  if (!typed) {
    return [{ text: expected, state: 'pending' }]
  }
  if (complete) {
    return [{ text: expected, state: 'matched' }]
  }

  const segments = []

  const pushSlice = (normStart, normEnd, state) => {
    if (normEnd <= normStart) return
    const slice = getExpectedSliceFromNorm(expected, indexMap, normStart, normEnd)
    if (slice) {
      segments.push({ text: slice, state })
    }
  }

  for (const op of ops) {
    if (op.op === 'equal') {
      pushSlice(op.expStart, op.expEnd, 'matched')
    } else if (op.op === 'delete') {
      pushSlice(op.expStart, op.expEnd, 'pending')
    } else if (op.op === 'replace') {
      pushSlice(op.expStart, op.expEnd, 'hidden')
    }
  }

  return mergeAdjacentSegments(
    segments.length ? segments : [{ text: expected, state: 'pending' }],
  )
}

function markRawCharStates(typed, normToRawStart, normToRawEnd, ops) {
  const states = new Array(typed.length)
  for (const op of ops) {
    if (op.typStart === undefined || op.typEnd === undefined) continue
    const rawStart = normToRawStart[op.typStart] ?? 0
    const rawEnd = normToRawEnd[op.typEnd - 1] ?? typed.length
    const state = op.op === 'equal' ? 'correct' : 'typo'
    for (let i = rawStart; i < rawEnd; i += 1) {
      states[i] = state
    }
  }
  return states
}

function buildTypedSegmentsFromRaw(typed, states) {
  if (!typed) return []
  const segments = []
  let index = 0
  while (index < typed.length) {
    const state = states[index] ?? 'typo'
    let end = index + 1
    while (end < typed.length && (states[end] ?? 'typo') === state) {
      end += 1
    }
    segments.push({ text: typed.slice(index, end), state })
    index = end
  }
  return segments
}

function buildTypedSegmentsFromOps(
  typed,
  normToRawStart,
  normToRawEnd,
  ops,
  complete,
) {
  if (!typed) return []

  if (complete) {
    return [{ text: typed, state: 'correct' }]
  }

  const states = markRawCharStates(typed, normToRawStart, normToRawEnd, ops)
  return buildTypedSegmentsFromRaw(typed, states)
}

function analyzeTypingCore(expected, typed) {
  const { normalized: exp, indexMap } = getExpectedNormalized(expected)
  const { normalized: typ, normToRawStart, normToRawEnd } = normalizeTypedWithRawMap(typed || '')
  const complete = exp.length > 0 && typ === exp
  const ops = alignTypedToExpected(exp, typ)

  let matchedChars = 0
  let hasTypos = false
  let mismatchAt = -1

  for (const op of ops) {
    if (op.op === 'equal') {
      matchedChars += op.expEnd - op.expStart
      continue
    }
    // Only wrong/extra typed chars are typos — not untyped expected text (delete).
    if ((op.op === 'insert' || op.op === 'replace') && !hasTypos) {
      hasTypos = true
      mismatchAt = op.expStart ?? op.typStart ?? 0
    }
  }

  const totalChars = exp.length
  const progress = complete
    ? 1
    : totalChars > 0
      ? Math.min(matchedChars / totalChars, hasTypos ? 0.99 : 1)
      : 0
  const prefixMatch = typ.length <= exp.length && exp.startsWith(typ)

  return {
    exp,
    indexMap,
    typ,
    normToRawStart,
    normToRawEnd,
    ops,
    complete,
    matchedChars,
    totalChars,
    progress,
    mismatchAt,
    hasTypos,
    prefixMatch,
  }
}

/**
 * Single-pass analysis for overlay rendering — call once per frame, not per computed.
 */
export function analyzeTypingState(expected, typed) {
  const core = analyzeTypingCore(expected, typed)
  const guideSegments = buildGuideSegments(
    expected,
    core.indexMap,
    core.ops,
    core.complete,
    typed,
  )
  const typedSegments = buildTypedSegmentsFromOps(
    typed,
    core.normToRawStart,
    core.normToRawEnd,
    core.ops,
    core.complete,
  )

  return {
    complete: core.complete,
    progress: core.progress,
    matchedChars: core.matchedChars,
    totalChars: core.totalChars,
    mismatchAt: core.mismatchAt,
    prefixMatch: core.prefixMatch,
    hasTypos: core.hasTypos,
    guideSegments,
    typedSegments,
  }
}

export function compareTypedText(expected, typed) {
  const core = analyzeTypingCore(expected, typed)
  return {
    complete: core.complete,
    progress: core.progress,
    matchedChars: core.matchedChars,
    totalChars: core.totalChars,
    mismatchAt: core.mismatchAt,
    prefixMatch: core.prefixMatch,
  }
}

/**
 * Split expected text into matched / error / pending segments for overlay display.
 */
export function buildOverlaySegments(expected, typed) {
  return analyzeTypingState(expected, typed).guideSegments
}

/**
 * Segments of what the user typed — matched chars shown as expected glyphs
 * (so e.g. " aligns with «), wrong chars shown as typos.
 */
export function buildTypedSegments(expected, typed) {
  return analyzeTypingState(expected, typed).typedSegments
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
