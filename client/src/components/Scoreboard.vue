<template>
  <div class="panel-turf gap-3">
    <span class="field-label">Standings</span>
    <div class="flex flex-col gap-1.5">
      <div
        v-for="(row, i) in standings"
        :key="row.userId"
        class="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5"
        :style="row.userId === store.yourUserId ? { background: 'var(--gold-soft)' } : undefined"
      >
        <span class="squad-number">{{ i + 1 }}</span>
        <span
          class="flex-1 truncate text-sm"
          :style="{ color: row.userId === store.yourUserId ? 'var(--gold)' : 'var(--chalk)' }"
        >
          {{ store.playerName(row.userId) }}
        </span>
        <span v-if="!row.isActive" class="pill pill-neutral">Out</span>
        <span class="stat-mono text-sm font-semibold" style="color: var(--gold)">
          {{ row.chips.toLocaleString() }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useGameStore } from '@/stores/game';

const store = useGameStore();

// Live off gameState.players — the engine's running chip total, carried forward round
// to round for the whole match, never reset between rounds (only WAITING resets a room).
const standings = computed(() => [...(store.gameState?.players ?? [])].sort((a, b) => b.chips - a.chips));
</script>
