<template>
  <div v-if="visible" class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" @click.self="close">
    <div class="panel-turf w-full max-w-md">
      <div class="flex items-start justify-between gap-3">
        <div>
          <span class="field-label">Secret guess</span>
          <h2 class="brand-title text-2xl leading-none">Who's the mystery player?</h2>
        </div>
        <div class="flex items-start gap-2">
          <span v-if="secondsLeft !== null" class="scoreboard shrink-0 px-3 py-1.5">
            <span class="scoreboard-value text-lg">{{ secondsLeft }}s</span>
          </span>
          <button class="btn btn-ghost btn-sm" aria-label="Close" @click="close">✕</button>
        </div>
      </div>

      <p class="text-sm" style="color: var(--chalk-dim)">
        Your pick stays hidden from everyone else — you can change it as often as you like until the reveal.
      </p>

      <input
        v-model="query"
        class="field-input"
        placeholder="Search a footballer…"
        autocomplete="off"
        autofocus
      />

      <div class="flex max-h-72 flex-col gap-1 overflow-y-auto">
        <button
          v-for="p in results"
          :key="p.id"
          class="flex items-center gap-3 rounded-[var(--radius-sm)] p-2 text-left transition-colors hover:bg-white/5"
          @click="submit(p.id)"
        >
          <img v-if="p.photoUrl" :src="p.photoUrl" class="h-9 w-9 rounded-full object-cover" :alt="p.name" />
          <div v-else class="h-9 w-9 rounded-full" style="background: var(--turf-lighter)" />
          <span class="text-sm">{{ p.name }}</span>
        </button>
        <p v-if="query.trim().length >= 2 && !searching && results.length === 0" class="empty-state">
          No matches — try another spelling
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { api } from '@/api/api';
import { useGameStore } from '@/stores/game';
import type { IFootballPlayer } from '@/api/types';

const store = useGameStore();

const query = ref('');
const results = ref<IFootballPlayer[]>([]);
const searching = ref(false);
let debounceHandle: ReturnType<typeof setTimeout> | undefined;

const visible = computed(() => store.guessPickerOpen && store.canGuess);

watch(query, (q) => {
    clearTimeout(debounceHandle);
    if (q.trim().length < 2) {
        results.value = [];
        return;
    }
    debounceHandle = setTimeout(async () => {
        searching.value = true;
        try {
            results.value = await api.footballPlayers.search(q.trim());
        } catch {
            results.value = [];
        } finally {
            searching.value = false;
        }
    }, 250);
});

function submit(footballPlayerId: number) {
    store.guess(footballPlayerId);
    close();
}

function close() {
    store.closeGuessPicker();
    query.value = '';
    results.value = [];
}

// Nudge players who haven't picked yet the moment the final SHOWDOWN window opens —
// still entirely optional/changeable, just a reminder that time is now limited.
watch(
    () => store.gameState?.stage,
    (stage) => {
        if (stage === 'SHOWDOWN' && store.myGuess === null && store.canGuess) store.openGuessPicker();
    },
);

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
