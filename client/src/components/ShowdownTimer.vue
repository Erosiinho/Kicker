<template>
  <div v-if="secondsLeft !== null" class="scoreboard shrink-0" :class="compact ? 'px-3 py-1.5' : 'mx-auto px-5 py-2'">
    <span v-if="!compact" class="scoreboard-label">Time left</span>
    <span class="scoreboard-value" :class="{ 'text-lg': compact }">{{ secondsLeft }}s</span>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useGameStore } from '@/stores/game';

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });

const store = useGameStore();

const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
    tick = setInterval(() => (now.value = Date.now()), 500);
});
onUnmounted(() => clearInterval(tick));

const secondsLeft = computed(() => {
    if (store.gameState?.stage !== 'SHOWDOWN' || !store.showdownStartedAt || !store.showdownTimeLimitMs) return null;
    const remaining = store.showdownStartedAt + store.showdownTimeLimitMs - now.value;
    return Math.max(0, Math.ceil(remaining / 1000));
});
</script>
