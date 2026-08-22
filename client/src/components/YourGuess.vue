<template>
  <div v-if="show" class="flex flex-col items-center gap-2">
    <span class="field-label">{{ t('yourGuess.label') }}</span>
    <button class="flex flex-col items-center gap-2" @click="store.openGuessPicker()">
      <div class="w-24 sm:w-28">
        <PlayerCard :player="guessedPlayer" :state="guessedPlayer ? 'revealed' : 'empty'" />
      </div>
      <span class="btn btn-ghost btn-sm">{{ guessedPlayer ? t('yourGuess.change') : t('yourGuess.propose') }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import PlayerCard from './PlayerCard.vue';
import { useGameStore } from '@/stores/game';

const store = useGameStore();
const { t } = useI18n();

const show = computed(() => store.canGuess);
const guessedPlayer = computed(() => store.footballPlayer(store.myGuess));
</script>
