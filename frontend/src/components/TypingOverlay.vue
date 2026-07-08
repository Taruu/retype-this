<script setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  analyzeTypingState,
  clearDraft,
  loadDraft,
  normalizeText,
  saveDraft,
} from '../utils/textMatch'

const IDLE_SAVE_MS = 15000
const DRAFT_SAVE_MS = 400
const HINT_CURSOR_RADIUS = 1

const props = defineProps({
  bookId: { type: Number, required: true },
  blockIndex: { type: Number, required: true },
  expectedText: { type: String, required: true },
  initialDraft: { type: String, default: '' },
})

const emit = defineEmits(['update:draft', 'complete', 'save'])

const submitBlockCompletion = inject('submitBlockCompletion', null)

const text = ref('')
const cursorPos = ref(0)
const completing = ref(false)
const guideRef = ref(null)
const typedRef = ref(null)
const inputRef = ref(null)
let idleTimer = null
let draftTimer = null
let needsServerSave = false

function emitDraft() {
  emit('update:draft', { blockIndex: props.blockIndex, text: text.value })
}

function emitSave() {
  if (completing.value || !needsServerSave) return
  emit('save', {
    blockIndex: props.blockIndex,
    text: text.value,
    onSaved: () => {
      needsServerSave = false
    },
  })
}

function restoreDraft() {
  const local = loadDraft(props.bookId, props.blockIndex)
  text.value = props.initialDraft || local || ''
  needsServerSave = false
  emitDraft()
}

watch(
  () => [props.bookId, props.blockIndex, props.initialDraft],
  () => {
    completing.value = false
    restoreDraft()
    focusInput()
  },
  { immediate: true },
)

const typingState = computed(() => analyzeTypingState(props.expectedText, text.value))
const isComplete = computed(() => typingState.value.complete || completing.value)
const guideSegments = computed(() => typingState.value.guideSegments)
const typedSegments = computed(() => typingState.value.typedSegments)
const progressPercent = computed(() => Math.round(typingState.value.progress * 100))
const hasTypos = computed(() => typingState.value.hasTypos)

const statusMessage = computed(() => {
  if (!text.value.trim()) {
    return 'Type over the text exactly — one character at a time.'
  }
  if (isComplete.value) {
    return '✓ Match — moving to next block…'
  }
  if (hasTypos.value) {
    return 'Move the cursor near a red mistake to see the orange correction.'
  }
  const { matchedChars, totalChars } = typingState.value
  return `${matchedChars} / ${totalChars} characters matched.`
})

function syncInputHeight() {
  const guideH = guideRef.value?.offsetHeight ?? 0
  const typedH = typedRef.value?.offsetHeight ?? 0
  const height = Math.max(guideH, typedH)
  if (inputRef.value && height) {
    inputRef.value.style.height = `${height}px`
  }
}

function isHintNearCursor(segment) {
  if (segment.state !== 'hint' || segment.typoRawStart === undefined) return false
  const start = segment.typoRawStart
  const end = segment.typoRawEnd ?? start + 1
  const cursor = cursorPos.value
  return cursor >= start - HINT_CURSOR_RADIUS && cursor <= end + HINT_CURSOR_RADIUS
}

function guideSegmentClass(segment) {
  if (segment.state === 'hint') return 'typing-overlay__hidden'
  return `typing-overlay__${segment.state}`
}

function hintSegmentClass(segment) {
  if (isHintNearCursor(segment)) {
    return 'typing-overlay__hint typing-overlay__hint--float'
  }
  return 'typing-overlay__hints-spacer'
}

function syncCursorFromInput(event) {
  const target = event?.target ?? inputRef.value
  if (!target) return
  cursorPos.value = target.selectionStart ?? text.value.length
}

function focusInput() {
  nextTick(() => {
    const el = inputRef.value
    if (!el) return
    el.focus()
    cursorPos.value = el.selectionStart ?? text.value.length
  })
}

onMounted(() => {
  syncInputHeight()
  window.addEventListener('mousemove', onMouseMove)
  focusInput()
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMouseMove)
  clearTimeout(idleTimer)
  clearTimeout(draftTimer)
  flushDraftSave()
  emitSave()
})

watch([guideSegments, typedSegments], () => {
  requestAnimationFrame(syncInputHeight)
})

function scheduleIdleSave() {
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    emitSave()
  }, IDLE_SAVE_MS)
}

function onMouseMove() {
  if (!needsServerSave || completing.value) return
  clearTimeout(idleTimer)
  emitSave()
}

function flushDraftSave() {
  clearTimeout(draftTimer)
  saveDraft(props.bookId, props.blockIndex, text.value)
}

function scheduleDraftSave() {
  clearTimeout(draftTimer)
  draftTimer = setTimeout(flushDraftSave, DRAFT_SAVE_MS)
}

function onInput(event) {
  text.value = event.target.value
  syncCursorFromInput(event)
  emitDraft()
  needsServerSave = true
  scheduleDraftSave()
  scheduleIdleSave()
}

async function autoComplete() {
  if (completing.value) return
  const state = analyzeTypingState(props.expectedText, text.value)
  if (!state.complete) return
  completing.value = true
  clearTimeout(idleTimer)
  needsServerSave = false
  const normalized = normalizeText(text.value)
  try {
    if (submitBlockCompletion) {
      const ok = await submitBlockCompletion(normalized)
      if (ok) {
        text.value = ''
        clearDraft(props.bookId, props.blockIndex)
      } else {
        completing.value = false
      }
    } else {
      emit('complete', normalized)
      text.value = ''
      clearDraft(props.bookId, props.blockIndex)
    }
  } catch {
    completing.value = false
  }
}

watch(
  () => typingState.value.complete,
  (complete) => {
    if (complete && text.value && !completing.value) {
      autoComplete()
    }
  },
)
</script>

<template>
  <section
    class="typing-overlay card"
    :class="{
      'typing-overlay--complete': isComplete,
      'typing-overlay--error': hasTypos,
    }"
  >
    <div class="typing-overlay__progress" aria-hidden="true">
      <div class="typing-overlay__progress-bar" :style="{ width: `${progressPercent}%` }" />
    </div>
    <p class="typing-overlay__status" :class="{ 'typing-overlay__status--ok': isComplete, 'typing-overlay__status--warn': hasTypos }">
      {{ statusMessage }}
    </p>

    <div class="typing-overlay__wrap">
      <div class="typing-overlay__hint-row" aria-hidden="true" />
      <div ref="guideRef" class="typing-overlay__guide" aria-hidden="true">
        <span
          v-for="(segment, index) in guideSegments"
          :key="`g-${index}`"
          :class="guideSegmentClass(segment)"
        >{{ segment.text }}</span>
      </div>
      <div class="typing-overlay__hints" aria-hidden="true">
        <span
          v-for="(segment, index) in guideSegments"
          :key="`h-${index}`"
          :class="hintSegmentClass(segment)"
        >{{ segment.text }}</span>
      </div>
      <div ref="typedRef" class="typing-overlay__typed" aria-hidden="true">
        <span
          v-for="(segment, index) in typedSegments"
          :key="`t-${index}`"
          :class="segment.state === 'typo' ? 'typing-overlay__typo' : 'typing-overlay__correct'"
        >{{ segment.text }}</span>
      </div>
      <textarea
        ref="inputRef"
        :value="text"
        class="typing-overlay__input"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        @input="onInput"
        @click="syncCursorFromInput"
        @keyup="syncCursorFromInput"
        @select="syncCursorFromInput"
      />
    </div>
  </section>
</template>

<style scoped>
.typing-overlay {
  padding: 0.5rem 0.65rem;
  margin-top: 0.2rem;
  border: 1px solid var(--border);
  overflow: visible;
}

.typing-overlay--complete {
  border-color: var(--success);
}

.typing-overlay--error {
  border-color: #e57373;
}

.typing-overlay__progress {
  height: 3px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 0.35rem;
}

.typing-overlay__progress-bar {
  height: 100%;
  background: var(--accent);
}

.typing-overlay--complete .typing-overlay__progress-bar {
  background: var(--success);
}

.typing-overlay__status {
  margin: 0 0 0.4rem;
  font-size: 0.8rem;
  color: var(--muted);
}

.typing-overlay__status--ok {
  color: var(--success);
}

.typing-overlay__status--warn {
  color: #c62828;
}

.typing-overlay__wrap {
  position: relative;
  --typing-size: 1.05rem;
  --typing-line: 1.65;
  --typing-pad-y: 0.6rem;
  --typing-pad-x: 0.7rem;
  --hint-row: calc(var(--typing-line) * 1em);
  font-family: var(--font-typing);
  font-size: var(--typing-size);
  line-height: var(--typing-line);
  letter-spacing: 0;
  font-variant-ligatures: none;
  font-feature-settings: normal;
  tab-size: 4;
  overflow: visible;
}

.typing-overlay__hint-row {
  height: var(--hint-row);
  pointer-events: none;
}

.typing-overlay__guide,
.typing-overlay__typed,
.typing-overlay__input {
  font-family: var(--font-typing);
  font-size: var(--typing-size);
  line-height: var(--typing-line);
  letter-spacing: 0;
  font-weight: 400;
  font-variant-ligatures: none;
  font-feature-settings: normal;
  tab-size: 4;
  padding: var(--typing-pad-y) var(--typing-pad-x);
  white-space: pre-wrap;
  overflow-wrap: normal;
  word-break: normal;
}

.typing-overlay__guide,
.typing-overlay__typed {
  pointer-events: none;
}

.typing-overlay__guide {
  color: var(--locked);
}

.typing-overlay__matched {
  color: var(--text);
}

.typing-overlay__pending {
  color: var(--locked);
}

.typing-overlay__hidden {
  color: transparent;
}

.typing-overlay__hints {
  position: absolute;
  top: var(--hint-row);
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 3;
  pointer-events: none;
  padding: var(--typing-pad-y) var(--typing-pad-x);
  font-family: var(--font-typing);
  font-size: var(--typing-size);
  line-height: var(--typing-line);
  letter-spacing: 0;
  font-weight: 400;
  font-variant-ligatures: none;
  font-feature-settings: normal;
  tab-size: 4;
  white-space: pre-wrap;
  overflow-wrap: normal;
  word-break: normal;
}

.typing-overlay__hints-spacer {
  color: transparent;
}

.typing-overlay__hint {
  color: #fff;
  background: #ef6c00;
}

.typing-overlay__hint--float {
  position: relative;
  display: inline-block;
  transform: translateY(calc(-1 * var(--hint-row)));
  vertical-align: bottom;
  z-index: 3;
}

.typing-overlay__typed {
  position: absolute;
  top: var(--hint-row);
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1;
  color: var(--text);
}

.typing-overlay__correct {
  color: inherit;
}

.typing-overlay__typo {
  color: #fff;
  background: #c62828;
}

.typing-overlay__input {
  position: absolute;
  top: var(--hint-row);
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  width: 100%;
  min-height: 100%;
  margin: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  resize: none;
  overflow: hidden;
  color: transparent;
  caret-color: var(--text);
  background: transparent;
}

.typing-overlay__input:focus {
  outline: none;
  border-color: var(--accent);
}
</style>
