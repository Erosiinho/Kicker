<template>
  <div class="panel-turf items-center text-center">
    <span class="field-label">{{ t('roomCode.inviteCode') }}</span>
    <div class="flex items-center gap-3">
      <span class="brand-title text-3xl sm:text-4xl">{{ code }}</span>
      <button class="btn btn-ghost btn-sm" @click="copy">{{ copied ? t('common.copied') : t('common.copy') }}</button>
    </div>
    <p class="text-sm" style="color: var(--chalk-dim)">{{ t('roomCode.share') }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const props = defineProps<{ code: string }>();
const copied = ref(false);

async function copy() {
    try {
        await navigator.clipboard.writeText(props.code);
        copied.value = true;
        setTimeout(() => (copied.value = false), 1500);
    } catch {
        // clipboard API unavailable — silently ignore, the code is already on screen
    }
}
</script>
