<template>
  <div class="flex flex-col gap-6">
    <!-- Below lg: game and your panel stack vertically, same as before.
         From lg up: game on the left, your card/betting panel pinned on the right. -->
    <div class="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8">
      <div class="flex flex-col gap-6">
        <div class="stage-rail">
          <span
            v-for="group in stageGroups"
            :key="group.label"
            class="stage-step"
            :class="{
              'stage-step--active': group.active,
              'stage-step--done': group.done,
            }"
          >
            {{ group.label }}
          </span>
        </div>

        <ShowdownTimer />

        <div class="pitch-oval flex flex-col items-center gap-6 px-4 py-10 sm:py-14">
          <div v-if="opponents.length > 0" class="flex flex-wrap justify-center gap-3 sm:gap-5">
            <PlayerSeat
              v-for="p in opponents"
              :key="p.userId"
              :room-player="p"
              :player-state="playerState(p.userId)"
              :is-dealer="p.seat === store.gameState?.dealerSeat"
              :is-turn="p.userId === store.gameState?.turnUserId"
            />
          </div>

          <div class="scoreboard">
            <span class="scoreboard-label">Pot</span>
            <span class="scoreboard-value">{{ store.gameState?.pot ?? 0 }}</span>
          </div>

          <CommunityBoard />
        </div>
      </div>

      <div class="flex flex-col gap-6 lg:sticky lg:top-8">
        <div class="panel-turf items-center">
          <PlayerSeat
            v-if="me"
            :room-player="me"
            :player-state="store.me"
            :is-dealer="me.seat === store.gameState?.dealerSeat"
            :is-turn="me.userId === store.gameState?.turnUserId"
            is-me
          />
          <YourGuess />
          <BettingControls />
        </div>

        <Scoreboard />
      </div>
    </div>

    <RevealBanner v-if="showReveal" />
    <GuessModal />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import PlayerSeat from './PlayerSeat.vue';
import CommunityBoard from './CommunityBoard.vue';
import YourGuess from './YourGuess.vue';
import GuessModal from './GuessModal.vue';
import Scoreboard from './Scoreboard.vue';
import BettingControls from './BettingControls.vue';
import RevealBanner from './RevealBanner.vue';
import ShowdownTimer from './ShowdownTimer.vue';
import { useGameStore } from '@/stores/game';
import type { PlayerState, Stage } from '@/api/types';

const store = useGameStore();

const me = computed(() => store.seatedPlayers.find((p) => p.userId === store.yourUserId) ?? null);
const opponents = computed(() => store.seatedPlayers.filter((p) => p.userId !== store.yourUserId));

function playerState(userId: number): PlayerState | undefined {
    return store.gameState?.players.find((p) => p.userId === userId);
}

const showReveal = computed(() => ['REVEAL', 'ROUND_END', 'MATCH_END'].includes(store.gameState?.stage ?? ''));

const STAGE_GROUPS: { label: string; stages: Stage[] }[] = [
    { label: 'Deal', stages: ['WAITING', 'DEALING'] },
    { label: 'Pre', stages: ['PREFLOP_BETTING'] },
    { label: 'Flop', stages: ['FLOP', 'FLOP_BETTING'] },
    { label: 'Turn', stages: ['TURN', 'TURN_BETTING'] },
    { label: 'River', stages: ['RIVER', 'RIVER_BETTING'] },
    { label: 'Showdown', stages: ['SHOWDOWN'] },
    { label: 'Reveal', stages: ['REVEAL', 'ROUND_END', 'MATCH_END'] },
];

const stageGroups = computed(() => {
    const currentStage = store.gameState?.stage;
    const currentIndex = STAGE_GROUPS.findIndex((g) => g.stages.includes(currentStage as Stage));
    return STAGE_GROUPS.map((g, i) => ({
        label: g.label,
        active: i === currentIndex,
        done: currentIndex >= 0 && i < currentIndex,
    }));
});
</script>
