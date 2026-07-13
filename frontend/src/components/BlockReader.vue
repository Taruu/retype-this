<script setup>
import TypingOverlay from './TypingOverlay.vue'

defineProps({
  block: { type: Object, required: true },
  status: { type: String, required: true },
  bookId: { type: Number, required: true },
  initialDraft: { type: String, default: '' },
  isLastBlock: { type: Boolean, default: false },
})

defineEmits(['update:draft', 'complete', 'save'])
</script>

<template>
  <article v-if="status !== 'active'" class="block-reader" :class="{
    'block-done': status === 'done',
    'block-locked': status === 'locked',
    'heading-block': block.kind === 'heading',
    'paragraph-block': block.kind !== 'heading',
  }">
    <div v-if="status === 'done'" class="muted block-reader__label">✓ completed</div>
    <div v-else-if="status === 'locked'" class="muted block-reader__label">locked</div>
    <div v-html="block.html" />
  </article>

  <TypingOverlay
    v-else
    :book-id="bookId"
    :block-index="block.index"
    :expected-text="block.text_plain"
    :initial-draft="initialDraft"
    :is-last-block="isLastBlock"
    @update:draft="$emit('update:draft', $event)"
    @complete="$emit('complete', $event)"
    @save="$emit('save', $event)"
  />
</template>

<style scoped>
.block-reader {
  padding: 0.2rem 0;
}

.block-reader + .block-reader {
  margin-top: 0.1rem;
}

.block-reader__label {
  font-size: 0.75rem;
  margin-bottom: 0.15rem;
}

.block-done {
  opacity: 0.72;
}

.block-locked {
  color: var(--locked);
  font-style: italic;
}
</style>
