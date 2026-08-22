<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="$emit('cancel')"
    >
      <div class="panel-turf w-full max-w-sm items-center text-center">
        <p class="brand-title text-xl leading-none">{{ title }}</p>
        <p class="text-sm" style="color: var(--chalk-dim)">{{ message }}</p>
        <div class="flex w-full gap-3">
          <button class="btn btn-ghost flex-1" @click="$emit('cancel')">{{ cancelLabel }}</button>
          <button class="btn flex-1" :class="danger ? 'btn-danger' : 'btn-kickoff'" @click="$emit('confirm')">
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
withDefaults(
    defineProps<{
        open: boolean;
        title: string;
        message: string;
        confirmLabel?: string;
        cancelLabel?: string;
        danger?: boolean;
    }>(),
    {
        confirmLabel: 'Confirm',
        cancelLabel: 'Cancel',
        danger: false,
    },
);

defineEmits<{ confirm: []; cancel: [] }>();
</script>
