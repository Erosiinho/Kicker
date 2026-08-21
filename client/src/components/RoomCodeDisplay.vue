<template>
  <div class="panel-turf items-center text-center">
    <span class="field-label">Invite code</span>
    <div class="flex items-center gap-3">
      <span class="brand-title text-3xl sm:text-4xl">{{ code }}</span>
      <button class="btn btn-ghost btn-sm" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button>
    </div>
    <p class="text-sm" style="color: var(--chalk-dim)">Share this code — friends join at the home screen.</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{ code: string }>();
const copied = ref(false);

async function copy() {
    try {
        await navigator.clipboard.writeText(props.code);
        copied.value = true;
        setTimeout(() => (copied.value = false), 1500);
    } catch {
        // clipboard API unavailable — silently ignore, the code is already on screen
    }
}
</script>
