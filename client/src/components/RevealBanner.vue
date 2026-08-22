<template>
  <div v-if="reveal" class="panel-turf items-center text-center">
    <span class="pill pill-gold">{{ t('reveal.finalWhistle') }}</span>

    <div class="w-28 sm:w-32">
      <PlayerCard :player="store.footballPlayer(reveal.mysteryPlayerId)" winner />
    </div>

    <div>
      <p class="field-label">{{ t('reveal.mysteryPlayerWas') }}</p>
      <h2 class="brand-title text-2xl sm:text-3xl">
        {{ store.footballPlayer(reveal.mysteryPlayerId)?.name ?? '…' }}
      </h2>
    </div>

    <div v-if="winnerNames.length > 0" class="flex flex-col items-center gap-1">
      <span class="pill pill-gold">{{ t('reveal.correctGuess') }}</span>
      <p style="color: var(--chalk)">
        {{ t('reveal.splitPot', { names: winnerNames.join(', ') }) }}
        <span class="stat-mono font-semibold" style="color: var(--gold)">{{ reveal.potAwarded }}</span> {{ t('reveal.chipsEach') }}
      </p>
    </div>
    <div v-else class="flex flex-col items-center gap-1">
      <span class="pill pill-red">{{ t('reveal.nobodyGuessed') }}</span>
      <p style="color: var(--chalk-dim)">
        {{ t('reveal.carriesOver', { amount: reveal.potTotal }) }}
      </p>
    </div>

    <div v-if="guessStandings.length > 0" class="flex flex-col gap-1.5 w-full">
      <span class="field-label">{{ t('reveal.guesses') }}</span>
      <div
        v-for="row in guessStandings"
        :key="row.userId"
        class="flex items-center justify-between gap-3 text-sm"
        :style="row.isWinner ? { color: 'var(--gold)' } : { color: 'var(--chalk-dim)' }"
      >
        <span class="truncate">{{ store.playerName(row.userId) }}</span>
        <span class="flex-1 truncate text-right" style="color: var(--chalk-faint)">
          {{ store.footballPlayer(row.footballPlayerId)?.name ?? '…' }}
        </span>
        <span class="stat-mono font-semibold">{{ row.linkCount }}/5</span>
      </div>
    </div>

    <template v-if="store.gameState?.stage === 'ROUND_END'">
      <button v-if="store.isHost" class="btn btn-kickoff" @click="store.ready()">{{ t('reveal.startNextRound') }}</button>
      <p v-else class="text-sm" style="color: var(--chalk-faint)">{{ t('reveal.waitingHostNextRound') }}</p>
    </template>

    <template v-else-if="store.gameState?.stage === 'MATCH_END' && store.matchResult">
      <div class="divider w-full" />
      <p class="field-label">{{ t('reveal.finalStandings') }}</p>
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
      <router-link to="/" class="btn btn-ghost">{{ t('reveal.backToLobby') }}</router-link>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import PlayerCard from './PlayerCard.vue';
import { useGameStore } from '@/stores/game';

const store = useGameStore();
const { t } = useI18n();

const reveal = computed(() => store.lastReveal);
const winnerNames = computed(() => (reveal.value?.winners ?? []).map((id) => store.playerName(id)));
const standings = computed(() =>
    [...(store.matchResult?.finalChips ?? [])].sort((a, b) => b.chips - a.chips),
);

/** Every non-folded player's guess this round, ranked by how many community cards it links to — the closest link(s) won the pot (a tie splits it). */
const guessStandings = computed(() => {
    const winners = new Set(reveal.value?.winners ?? []);
    return [...(reveal.value?.guessScores ?? [])]
        .sort((a, b) => b.linkCount - a.linkCount)
        .map((s) => ({ ...s, isWinner: winners.has(s.userId) }));
});
</script>
