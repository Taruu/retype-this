<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useTimerStore } from '../stores/timer'

const timer = useTimerStore()
const rootRef = ref(null)

const toggleLabel = computed(() => {
  if (timer.finished) return 'Timer finished — open to stop alarm'
  if (timer.running) return `Timer running — ${timer.display}`
  return timer.open ? 'Close timer' : 'Open timer'
})

function onHoursInput(event) {
  timer.setHours(event.target.value)
}

function onMinutesInput(event) {
  timer.setMinutes(event.target.value)
}

function onDocPointerDown(event) {
  if (!timer.open) return
  if (rootRef.value?.contains(event.target)) return
  timer.open = false
}

function onKeydown(event) {
  if (event.key === 'Escape' && timer.open) {
    event.stopPropagation()
    timer.open = false
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    ref="rootRef"
    class="session-timer"
    :class="{
      'session-timer--open': timer.open,
      'session-timer--running': timer.running,
      'session-timer--finished': timer.finished,
    }"
  >
    <button
      class="btn btn-secondary session-timer__toggle"
      type="button"
      :aria-expanded="timer.open"
      aria-controls="session-timer-panel"
      :aria-label="toggleLabel"
      :title="toggleLabel"
      @click="timer.toggleOpen()"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2 2" />
        <path d="M9 3h6" />
      </svg>
      <span v-if="timer.running || timer.finished" class="session-timer__badge" aria-hidden="true">
        {{ timer.finished ? '!' : '•' }}
      </span>
    </button>

    <div
      v-show="timer.open"
      id="session-timer-panel"
      class="session-timer__panel"
      role="dialog"
      aria-label="Session timer"
    >
      <div class="session-timer__panel-head">
        <span class="session-timer__title">Timer</span>
        <span class="session-timer__display" :title="timer.finished ? 'Time is up' : 'Remaining time'">
          {{ timer.display }}
        </span>
      </div>

      <div class="session-timer__setup">
        <label class="session-timer__field">
          <span class="session-timer__label">Hours</span>
          <input
            class="session-timer__input"
            type="number"
            min="0"
            max="99"
            :value="timer.hours"
            :disabled="timer.running"
            @change="onHoursInput"
          />
        </label>
        <label class="session-timer__field">
          <span class="session-timer__label">Min</span>
          <input
            class="session-timer__input"
            type="number"
            min="0"
            max="59"
            :value="timer.minutes"
            :disabled="timer.running"
            @change="onMinutesInput"
          />
        </label>
      </div>

      <div class="session-timer__actions">
        <button
          v-if="!timer.running"
          class="btn session-timer__btn"
          type="button"
          :disabled="!timer.canStart"
          @click="timer.start()"
        >
          {{ timer.canResume ? 'Resume' : 'Start' }}
        </button>
        <button
          v-else
          class="btn btn-secondary session-timer__btn"
          type="button"
          @click="timer.pause()"
        >
          Pause
        </button>
        <button class="btn btn-secondary session-timer__btn" type="button" @click="timer.reset()">
          Reset
        </button>
      </div>

      <div v-if="timer.finished || timer.alarming" class="session-timer__alarm">
        <p class="session-timer__alarm-text">Time is up</p>
        <button class="btn session-timer__btn" type="button" @click="timer.dismissFinished()">
          Stop timer
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.session-timer {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}

.session-timer__toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  padding: 0;
}

.session-timer--running .session-timer__toggle {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  color: var(--accent);
}

.session-timer--finished .session-timer__toggle {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  animation: session-timer-pulse 1s ease-in-out infinite;
}

.session-timer__badge {
  position: absolute;
  top: 0.15rem;
  right: 0.2rem;
  font-size: 0.7rem;
  line-height: 1;
  font-weight: 700;
}

.session-timer__panel {
  position: absolute;
  top: calc(100% + 0.4rem);
  right: 0;
  z-index: 40;
  width: 15.5rem;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: 0 12px 32px var(--shadow);
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.session-timer__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.session-timer__title {
  font-size: 0.85rem;
  font-weight: 600;
}

.session-timer__display {
  font-family: var(--font-typing);
  font-size: 1.05rem;
  font-variant-numeric: tabular-nums;
}

.session-timer__setup {
  display: flex;
  gap: 0.5rem;
}

.session-timer__field {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.2rem;
}

.session-timer__label {
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}

.session-timer__input {
  width: 100%;
  padding: 0.4rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
}

.session-timer__input:disabled {
  opacity: 0.7;
}

.session-timer__actions {
  display: flex;
  gap: 0.4rem;
}

.session-timer__btn {
  flex: 1;
  padding: 0.45rem 0.55rem;
  font-size: 0.85rem;
}

.session-timer__alarm {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-top: 0.35rem;
  border-top: 1px solid var(--border);
}

.session-timer__alarm-text {
  margin: 0;
  font-size: 0.85rem;
  color: var(--accent);
  font-weight: 600;
}

@keyframes session-timer-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.06);
  }
}
</style>
