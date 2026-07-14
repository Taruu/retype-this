import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

const SETUP_KEY = 'retype_timer_setup'
const RUN_KEY = 'retype_timer_run'

function clampInt(value, min, max) {
  const n = Number.parseInt(value, 10)
  if (Number.isNaN(n)) return min
  return Math.min(max, Math.max(min, n))
}

function readSetup() {
  try {
    const raw = localStorage.getItem(SETUP_KEY)
    if (!raw) return { hours: 0, minutes: 25 }
    const parsed = JSON.parse(raw)
    return {
      hours: clampInt(parsed?.hours, 0, 99),
      minutes: clampInt(parsed?.minutes, 0, 59),
    }
  } catch {
    return { hours: 0, minutes: 25 }
  }
}

function readRun() {
  try {
    const raw = localStorage.getItem(RUN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const remainingMs = typeof parsed.remainingMs === 'number' ? parsed.remainingMs : null
    const endsAt = typeof parsed.endsAt === 'number' ? parsed.endsAt : null
    if (remainingMs == null && endsAt == null) return null
    return {
      endsAt,
      remainingMs,
      running: Boolean(parsed.running) && endsAt != null,
    }
  } catch {
    return null
  }
}

function persistSetup(hours, minutes) {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify({ hours, minutes }))
  } catch {
    // ignore quota errors
  }
}

function persistRun(state) {
  try {
    if (!state) {
      localStorage.removeItem(RUN_KEY)
      return
    }
    localStorage.setItem(RUN_KEY, JSON.stringify(state))
  } catch {
    // ignore quota errors
  }
}

function formatDuration(totalSeconds) {
  const safe = Math.max(0, totalSeconds)
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Repeating alarm via Web Audio API — keeps sounding until stopAlarm(). */
function createAlarmController() {
  let ctx = null
  let intervalId = null

  function beep() {
    try {
      if (!ctx) ctx = new AudioContext()
      if (ctx.state === 'suspended') ctx.resume()
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, now)
      osc.frequency.setValueAtTime(660, now + 0.15)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.4)
    } catch {
      // Audio may be blocked until a user gesture
    }
  }

  function start() {
    if (intervalId != null) return
    beep()
    intervalId = setInterval(beep, 900)
  }

  function stop() {
    if (intervalId != null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  return { start, stop }
}

const alarm = createAlarmController()

export const useTimerStore = defineStore('timer', () => {
  const setup = readSetup()
  const hours = ref(setup.hours)
  const minutes = ref(setup.minutes)
  const open = ref(false)

  const remainingMs = ref(0)
  const running = ref(false)
  const finished = ref(false)
  const alarming = ref(false)
  let endsAt = null
  let tickId = null

  const setupTotalMs = computed(() => (hours.value * 3600 + minutes.value * 60) * 1000)

  const display = computed(() => formatDuration(Math.ceil(remainingMs.value / 1000)))

  const canStart = computed(() => setupTotalMs.value > 0 || remainingMs.value > 0)

  const canResume = computed(
    () =>
      !running.value &&
      remainingMs.value > 0 &&
      remainingMs.value < setupTotalMs.value,
  )

  function saveSetup() {
    hours.value = clampInt(hours.value, 0, 99)
    minutes.value = clampInt(minutes.value, 0, 59)
    persistSetup(hours.value, minutes.value)
  }

  function clearTick() {
    if (tickId != null) {
      clearInterval(tickId)
      tickId = null
    }
  }

  function stopAlarm() {
    alarm.stop()
    alarming.value = false
  }

  function startAlarm() {
    alarming.value = true
    alarm.start()
  }

  function markFinished() {
    remainingMs.value = 0
    running.value = false
    finished.value = true
    endsAt = null
    clearTick()
    persistRun(null)
    open.value = true
    startAlarm()
  }

  function syncRemaining() {
    if (!running.value || endsAt == null) return
    const left = endsAt - Date.now()
    if (left <= 0) {
      markFinished()
      return
    }
    remainingMs.value = left
    persistRun({ endsAt, remainingMs: left, running: true })
  }

  function startTick() {
    clearTick()
    tickId = setInterval(syncRemaining, 250)
  }

  function writePausedState() {
    persistRun({
      endsAt: null,
      remainingMs: remainingMs.value,
      running: false,
    })
  }

  function toggleOpen() {
    open.value = !open.value
  }

  function start() {
    stopAlarm()
    saveSetup()
    if (!canStart.value && remainingMs.value <= 0) return

    if (remainingMs.value <= 0) {
      remainingMs.value = setupTotalMs.value
    }

    finished.value = false
    endsAt = Date.now() + remainingMs.value
    running.value = true
    persistRun({ endsAt, remainingMs: remainingMs.value, running: true })
    startTick()
  }

  function pause() {
    if (!running.value) return
    syncRemaining()
    if (!running.value) return
    remainingMs.value = Math.max(0, endsAt - Date.now())
    running.value = false
    endsAt = null
    clearTick()
    writePausedState()
  }

  function reset() {
    stopAlarm()
    clearTick()
    running.value = false
    finished.value = false
    endsAt = null
    remainingMs.value = setupTotalMs.value
    persistRun(null)
  }

  function dismissFinished() {
    stopAlarm()
    finished.value = false
    remainingMs.value = setupTotalMs.value
  }

  function setHours(value) {
    hours.value = clampInt(value, 0, 99)
    saveSetup()
    if (!running.value) {
      stopAlarm()
      finished.value = false
      remainingMs.value = setupTotalMs.value
      persistRun(null)
    }
  }

  function setMinutes(value) {
    minutes.value = clampInt(value, 0, 59)
    saveSetup()
    if (!running.value) {
      stopAlarm()
      finished.value = false
      remainingMs.value = setupTotalMs.value
      persistRun(null)
    }
  }

  // Restore run state from a previous session (client-only).
  const restored = readRun()
  if (restored?.running && restored.endsAt != null) {
    endsAt = restored.endsAt
    const left = endsAt - Date.now()
    if (left > 0) {
      remainingMs.value = left
      running.value = true
      startTick()
    } else {
      remainingMs.value = 0
      finished.value = true
      persistRun(null)
      // Alarm waits for a user gesture (opening the panel) if autoplay is blocked
    }
  } else if (restored && typeof restored.remainingMs === 'number' && restored.remainingMs > 0) {
    remainingMs.value = restored.remainingMs
  } else {
    remainingMs.value = setupTotalMs.value
  }

  watch([hours, minutes], () => {
    persistSetup(hours.value, minutes.value)
  })

  watch(open, (isOpen) => {
    // Resume blocked alarm after user opens the panel (user gesture)
    if (isOpen && finished.value && !alarming.value && remainingMs.value <= 0) {
      startAlarm()
    }
  })

  return {
    hours,
    minutes,
    remainingMs,
    running,
    finished,
    alarming,
    open,
    display,
    canStart,
    canResume,
    setHours,
    setMinutes,
    saveSetup,
    toggleOpen,
    start,
    pause,
    reset,
    stopAlarm,
    dismissFinished,
  }
})
