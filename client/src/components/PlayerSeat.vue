<template>
  <div class="flex flex-col items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2.5 transition-colors" :class="seatClass">
    <div class="relative">
      <div
        class="flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold"
        :class="{ 'turn-ring': isTurn && !isFolded }"
        style="background: var(--turf-lighter); color: var(--chalk); font-family: var(--font-display)"
      >
        {{ initials }}
      </div>
      <span v-if="isDealer" class="dealer-chip">D</span>
    </div>

    <div class="flex items-center gap-1.5">
      <span class="squad-number">{{ roomPlayer.seat + 1 }}</span>
      <span class="text-sm font-medium" :style="{ color: isMe ? 'var(--gold)' : 'var(--chalk)' }">
        {{ roomPlayer.displayName }}<template v-if="isMe"> (you)</template>
      </span>
    </div>

    <div class="stat-mono text-sm" style="color: var(--gold)">{{ chips.toLocaleString() }}</div>

    <div class="flex min-h-[1.25rem] flex-wrap justify-center gap-1">
      <span v-if="currentBet > 0" class="pill pill-gold">Bet {{ currentBet }}</span>
      <span v-if="isFolded" class="pill pill-neutral">Folded</span>
      <span v-else-if="isAllIn" class="pill pill-red">All-in</span>
      <span v-else-if="isTurn" class="pill pill-sky">Thinking…</span>
      <span v-else-if="hasGuessed" class="pill pill-gold">Guessed</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { IRoomPlayer, PlayerState } from '@/api/types';

const props = defineProps<{
    roomPlayer: IRoomPlayer;
    playerState?: PlayerState | null;
    isDealer?: boolean;
    isTurn?: boolean;
    isMe?: boolean;
}>();

const chips = computed(() => props.playerState?.chips ?? props.roomPlayer.chips);
const currentBet = computed(() => props.playerState?.currentBet ?? 0);
const isFolded = computed(() => props.playerState?.isFolded ?? false);
const isAllIn = computed(() => props.playerState?.isAllIn ?? false);
const hasGuessed = computed(() => props.playerState?.hasGuessed ?? false);

const seatClass = computed(() => ({
    'opacity-50': isFolded.value,
}));

const initials = computed(() =>
    props.roomPlayer.displayName
        .split(' ')
        .filter(Boolean)
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase(),
);
</script>

<style scoped>
.dealer-chip {
  position: absolute;
  right: -0.35rem;
  bottom: -0.35rem;
  display: flex;
  height: 1.25rem;
  width: 1.25rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-family: var(--font-display);
  font-size: 0.65rem;
  font-weight: 700;
  background: var(--gold);
  color: var(--gold-ink);
  border: 2px solid var(--pitch);
}
</style>
