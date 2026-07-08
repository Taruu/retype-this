<script setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  buildOverlaySegments,
  buildTypedSegments,
  clearDraft,
  compareTypedText,
  loadDraft,
  normalizeText,
  saveDraft,
} from '../utils/textMatch'

const IDLE_SAVE_MS = 15000

const props = defineProps({
  bookId: { type: Number, required: true },
  blockIndex: { type: Number, required: true },
  expectedText: { type: String, required: true },
  initialDraft: { type: String, default: '' },
})

const emit = defineEmits(['update:draft', 'complete', 'save'])

const submitBlockCompletion = inject('submitBlockCompletion', null)

const text = ref('')
const completing = ref(false)
const guideRef = ref(null)
const inputRef = ref(null)
let idleTimer = null
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

const comparison = computed(() => compareTypedText(props.expectedText, text.value))
const isComplete = computed(() => comparison.value.complete || completing.value)
const guideSegments = computed(() => buildOverlaySegments(props.expectedText, text.value))
const typedSegments = computed(() => buildTypedSegments(props.expectedText, text.value))
const progressPercent = computed(() => Math.round(comparison.value.progress * 100))
const hasTypos = computed(() => typedSegments.value.some((segment) => segment.state === 'typo'))

const statusMessage = computed(() => {
  if (!text.value.trim()) {
    return 'Type over the text — your typos appear in red.'
  }
  if (isComplete.value) {
    return '✓ Match — moving to next block…'
  }
  if (hasTypos.value) {
    return 'Fix red characters to continue.'
  }
  const { matchedChars, totalChars } = comparison.value
  return `${matchedChars} / ${totalChars} characters matched.`
})

function syncInputHeight() {
  if (guideRef.value && inputRef.value) {
    inputRef.value.style.height = `${guideRef.value.offsetHeight}px`
  }
}

function focusInput() {
  nextTick(() => {
    inputRef.value?.focus()
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
  emitSave()
})

watch(guideSegments, () => {
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

function onInput() {
  saveDraft(props.bookId, props.blockIndex, text.value)
  emitDraft()
  needsServerSave = true
  scheduleIdleSave()
  requestAnimationFrame(syncInputHeight)
}

async function autoComplete() {
  if (!comparison.value.complete || completing.value) return
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
  () => comparison.value.complete,
  (complete) => {
    if (complete && text.value) {
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
      <div ref="guideRef" class="typing-overlay__guide" aria-hidden="true">
        <span
          v-for="(segment, index) in guideSegments"
          :key="`g-${index}`"
          :class="`typing-overlay__${segment.state}`"
        >{{ segment.text }}</span>
      </div>
      <div class="typing-overlay__typed" aria-hidden="true">
        <span
          v-for="(segment, index) in typedSegments"
          :key="`t-${index}`"
          :class="segment.state === 'typo' ? 'typing-overlay__typo' : 'typing-overlay__correct'"
        >{{ segment.text }}</span>
      </div>
      <textarea
        ref="inputRef"
        v-model="text"
        class="typing-overlay__input"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        @input="onInput"
      />
    </div>
  </section>
</template>

<style scoped>
.typing-overlay {
  padding: 0.5rem 0.65rem;
  margin-top: 0.2rem;
  border: 1px solid var(--border);
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
  transition: width 0.15s ease;
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
  font-family: var(--font-typing);
  font-size: var(--typing-size);
  line-height: var(--typing-line);
  letter-spacing: 0;
  font-variant-ligatures: none;
  font-feature-settings: normal;
  tab-size: 4;
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

.typing-overlay__typed {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.typing-overlay__correct {
  color: var(--text);
}

.typing-overlay__typo {
  color: #fff;
  background: #c62828;
  border-radius: 2px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.typing-overlay__input {
  position: absolute;
  inset: 0;
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
