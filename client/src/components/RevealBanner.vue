<template>
  <div v-if="reveal" class="panel-turf items-center text-center">
    <span class="pill pill-gold">Final Whistle</span>

    <div class="w-28 sm:w-32">
      <PlayerCard :player="store.footballPlayer(reveal.mysteryPlayerId)" winner />
    </div>

    <div>
      <p class="field-label">The mystery player was</p>
      <h2 class="brand-title text-2xl sm:text-3xl">
        {{ store.footballPlayer(reveal.mysteryPlayerId)?.name ?? '…' }}
      </h2>
    </div>

    <div v-if="winnerNames.length > 0" class="flex flex-col items-center gap-1">
      <span class="pill pill-gold">Correct guess</span>
      <p style="color: var(--chalk)">
        {{ winnerNames.join(', ') }} split the pot —
        <span class="stat-mono font-semibold" style="color: var(--gold)">{{ reveal.potAwarded }}</span> chips each
      </p>
    </div>
    <div v-else class="flex flex-col items-center gap-1">
      <span class="pill pill-red">Nobody guessed it</span>
      <p style="color: var(--chalk-dim)">
        The <span class="stat-mono">{{ reveal.potTotal }}</span> chip pot carries over to the next round.
      </p>
    </div>

    <template v-if="store.gameState?.stage === 'ROUND_END'">
      <button v-if="store.isHost" class="btn btn-kickoff" @click="store.ready()">Start next round</button>
      <p v-else class="text-sm" style="color: var(--chalk-faint)">Waiting for the host to start the next round…</p>
    </template>

    <template v-else-if="store.gameState?.stage === 'MATCH_END' && store.matchResult">
      <div class="divider w-full" />
      <p class="field-label">Final standings</p>
      <div class="flex flex-col gap-1">
        <div
          v-for="row in standings"
          :key="row.userId"
          class="flex items-center justify-between gap-6 text-sm"
        >
          <span>{{ store.playerName(row.userId) }}</span>
          <span class="stat-mono" style="color: var(--gold)">{{ row.chips.toLocaleString() }}</span>
        </div>
      </div>
      <router-link to="/" class="btn btn-ghost">Back to lobby</router-link>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import PlayerCard from './PlayerCard.vue';
import { useGameStore } from '@/stores/game';

const store = useGameStore();

const reveal = computed(() => store.lastReveal);
const winnerNames = computed(() => (reveal.value?.winners ?? []).map((id) => store.playerName(id)));
const standings = computed(() =>
    [...(store.matchResult?.finalChips ?? [])].sort((a, b) => b.chips - a.chips),
);
</script>
