<template>
  <div class="locale-switch" role="group" aria-label="Language">
    <button
      v-for="locale in SUPPORTED_LOCALES"
      :key="locale"
      type="button"
      class="locale-switch-option"
      :class="{ 'locale-switch-option--active': currentLocale === locale }"
      @click="setLocale(locale)"
    >
      {{ locale.toUpperCase() }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { SUPPORTED_LOCALES, setLocale, type Locale } from '@/i18n';

const { locale } = useI18n();
const currentLocale = computed(() => locale.value as Locale);
</script>

<style scoped>
.locale-switch {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: var(--radius-sm);
  background: var(--turf-lighter);
}

.locale-switch-option {
  padding: 0.15rem 0.5rem;
  border-radius: calc(var(--radius-sm) - 2px);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--chalk-faint);
  transition: background-color 0.15s ease, color 0.15s ease;
}

.locale-switch-option--active {
  background: var(--gold);
  color: var(--gold-ink);
}
</style>
