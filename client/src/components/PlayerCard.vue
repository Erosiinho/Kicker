<template>
  <div
    class="card-dossier"
    :class="{
      'card-dossier--hidden': resolvedState === 'hidden',
      'card-dossier--empty': resolvedState === 'empty',
      'card-dossier--winner': winner,
    }"
  >
    <template v-if="resolvedState === 'revealed' && player">
      <div class="card-dossier-photo">
        <img v-if="player.photoUrl" :src="player.photoUrl" :alt="player.name" loading="lazy" />
        <div v-else class="flex h-full w-full items-center justify-center text-2xl font-semibold" style="color: var(--chalk-faint); font-family: var(--font-display)">
          {{ initials }}
        </div>
      </div>
      <div class="card-dossier-name">{{ player.name }}</div>
    </template>

    <template v-else-if="resolvedState === 'hidden'">
      <span class="stamp">{{ t('card.classified') }}</span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { IFootballPlayer } from '@/api/types';

const { t } = useI18n();

const props = withDefaults(
    defineProps<{
        player?: IFootballPlayer | null;
        state?: 'revealed' | 'hidden' | 'empty';
        winner?: boolean;
    }>(),
    { player: null, state: undefined, winner: false },
);

const resolvedState = computed(() => props.state ?? (props.player ? 'revealed' : 'empty'));

const initials = computed(() =>
    (props.player?.name ?? '')
        .split(' ')
        .filter(Boolean)
        .map((w) => w[0])
        .slice(0, 2)
        .join(''),
);
</script>
