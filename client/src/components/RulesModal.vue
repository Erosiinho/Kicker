<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      @click.self="$emit('close')"
    >
      <div class="panel-turf w-full max-w-md" style="max-height: 85vh; overflow-y: auto">
        <div class="flex items-start justify-between gap-3">
          <div>
            <span class="field-label">{{ t('rules.howToPlay') }}</span>
            <h2 class="brand-title text-2xl leading-none">{{ t('rules.title') }}</h2>
          </div>
          <button class="btn btn-ghost btn-sm" :aria-label="t('common.close')" @click="$emit('close')">✕</button>
        </div>

        <div class="flex flex-col gap-4 text-sm" style="color: var(--chalk-dim)">
          <section class="flex flex-col gap-1">
            <p class="field-label" style="color: var(--gold)">{{ t('rules.puzzleTitle') }}</p>
            <p>{{ t('rules.puzzleBody') }}</p>
          </section>

          <section class="flex flex-col gap-1">
            <p class="field-label" style="color: var(--gold)">{{ t('rules.streetsTitle') }}</p>
            <p>{{ t('rules.streetsBody') }}</p>
          </section>

          <section class="flex flex-col gap-1">
            <p class="field-label" style="color: var(--gold)">{{ t('rules.guessTitle') }}</p>
            <p>{{ t('rules.guessBody') }}</p>
          </section>

          <section class="flex flex-col gap-1">
            <p class="field-label" style="color: var(--gold)">{{ t('rules.showdownTitle') }}</p>
            <p>{{ t('rules.showdownBody') }}</p>
          </section>

          <section class="flex flex-col gap-1">
            <p class="field-label" style="color: var(--gold)">{{ t('rules.matchTitle') }}</p>
            <p>{{ t('rules.matchBody') }}</p>
          </section>
        </div>

        <button class="btn btn-kickoff" @click="$emit('close')">{{ t('rules.gotIt') }}</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{ open: boolean }>();
defineEmits<{ close: [] }>();

const { t } = useI18n();
</script>
