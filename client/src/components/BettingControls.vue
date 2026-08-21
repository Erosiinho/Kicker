<template>
  <div v-if="visible" class="flex w-full flex-col items-center gap-3">
    <div v-if="store.amountToCall > 0" class="text-sm" style="color: var(--chalk-dim)">
      To call: <span class="stat-mono font-semibold" style="color: var(--gold)">{{ store.amountToCall }}</span>
    </div>

    <div class="flex flex-wrap justify-center gap-2">
      <button class="btn btn-danger btn-sm" @click="store.act('fold')">Fold</button>
      <button v-if="store.amountToCall === 0" class="btn btn-ghost btn-sm" @click="store.act('check')">Check</button>
      <button v-else class="btn btn-sky btn-sm" @click="store.act('call')">Call {{ store.amountToCall }}</button>
      <button class="btn btn-kickoff btn-sm" :disabled="raiseAmount <= currentBet" @click="raise">
        Raise to <span class="stat-mono">{{ raiseAmount }}</span>
      </button>
    </div>

    <input
      v-if="raiseMax > raiseMin"
      v-model.number="raiseAmount"
      type="range"
      class="w-full max-w-xs"
      style="accent-color: var(--gold)"
      :min="raiseMin"
      :max="raiseMax"
    />
  </div>

  <p v-else-if="waitingLabel" class="text-center text-sm" style="color: var(--chalk-faint)">{{ waitingLabel }}</p>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useGameStore } from '@/stores/game';
import { BETTING_STAGES } from '@/api/types';

const store = useGameStore();

const currentBet = computed(() => store.gameState?.currentBet ?? 0);

const isBettingStage = computed(() => BETTING_STAGES.includes(store.gameState?.stage as never));

const visible = computed(
    () => store.isMyTurn && !!store.me && !store.me.isFolded && !store.me.isAllIn && isBettingStage.value,
);

const raiseMax = computed(() => (store.me ? store.me.currentBet + store.me.chips : 0));
const raiseMin = computed(() => Math.min(currentBet.value + (store.gameState?.minRaise ?? 0), raiseMax.value));

const raiseAmount = ref(raiseMin.value);
watch([raiseMin, raiseMax, visible], () => {
    if (visible.value) raiseAmount.value = raiseMin.value;
});

function raise() {
    store.act('raise', raiseAmount.value);
}

const waitingLabel = computed(() => {
    if (!isBettingStage.value) return null;
    if (store.me?.isFolded) return 'You folded — watching the rest of this round.';
    if (store.me?.isAllIn) return "You're all-in — sit back and watch.";
    if (store.gameState?.turnUserId != null) {
        return `Waiting on ${store.playerName(store.gameState.turnUserId)}…`;
    }
    return null;
});
</script>
