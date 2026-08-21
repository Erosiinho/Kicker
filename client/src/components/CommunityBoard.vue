<template>
  <div class="flex flex-col items-center gap-2">
    <span class="field-label">Community</span>
    <div class="flex gap-2 sm:gap-3 lg:gap-4">
      <div
        v-for="(id, i) in slots"
        :key="`${i}-${id ?? 'empty'}`"
        class="board-card w-16 sm:w-24 lg:w-28 xl:w-32"
        :style="{ animationDelay: `${i * 90}ms` }"
      >
        <PlayerCard
          :player="id ? store.footballPlayer(id) : null"
          :state="id ? 'revealed' : 'empty'"
          :winner="revealStage && id === store.gameState?.mysteryPlayerId"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import PlayerCard from './PlayerCard.vue';
import { useGameStore } from '@/stores/game';

const store = useGameStore();

const slots = computed<(number | null)[]>(() => {
    const revealed = store.gameState?.revealedCommunityPlayerIds ?? [];
    return Array.from({ length: 5 }, (_, i) => revealed[i] ?? null);
});

const revealStage = computed(() =>
    ['REVEAL', 'ROUND_END', 'MATCH_END'].includes(store.gameState?.stage ?? ''),
);
</script>

<style scoped>
.board-card {
  animation: card-flip-in 0.45s ease-out both;
}

@keyframes card-flip-in {
  from {
    transform: rotateY(90deg);
    opacity: 0;
  }
  to {
    transform: rotateY(0deg);
    opacity: 1;
  }
}
</style>
