<template>
  <div v-if="show" class="flex flex-col items-center gap-2">
    <span class="field-label">Your secret guess</span>
    <button class="flex flex-col items-center gap-2" @click="store.openGuessPicker()">
      <div class="w-24 sm:w-28">
        <PlayerCard :player="guessedPlayer" :state="guessedPlayer ? 'revealed' : 'empty'" />
      </div>
      <span class="btn btn-ghost btn-sm">{{ guessedPlayer ? 'Change guess' : 'Propose a player' }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import PlayerCard from './PlayerCard.vue';
import { useGameStore } from '@/stores/game';

const store = useGameStore();

const show = computed(() => store.canGuess);
const guessedPlayer = computed(() => store.footballPlayer(store.myGuess));
</script>
