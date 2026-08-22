<template>
  <div class="app-shell-narrow">
    <div class="flex justify-end">
      <button class="btn btn-ghost btn-sm" @click="showRules = true">Rules</button>
    </div>

    <div class="brand-lockup flex-col gap-3 text-center">
      <img :src="logo" alt="Kicker crest" class="brand-crest-img" width="72" height="72" />
      <h1 class="brand-title">KICKER</h1>
      <p class="brand-subtitle max-w-sm">
        Five community cards. One mystery footballer who played with all of them,
        revealed in the order they crossed paths. Bet your chips on how sure you are — then guess.
      </p>
    </div>

    <div v-if="mode === 'choose'" class="flex flex-col gap-4">
      <button class="btn btn-kickoff btn-big" @click="mode = 'create'">Create room</button>
      <button class="btn btn-ghost btn-big" @click="mode = 'join'">Join room</button>
    </div>

    <div v-else class="panel-turf">
      <button class="back-link" type="button" @click="backToChoice">← Back</button>

      <template v-if="mode === 'create'">
        <div class="flex flex-col gap-1.5">
          <label class="field-label" for="displayName">Your name</label>
          <input
            id="displayName"
            v-model="displayName"
            class="field-input"
            placeholder="e.g. Kev"
            maxlength="40"
            autocomplete="off"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="field-label" for="maxRounds">Rounds this match</label>
          <input
            id="maxRounds"
            v-model.number="maxRounds"
            class="field-input"
            type="number"
            min="1"
            max="50"
          />
        </div>

        <button class="btn btn-kickoff" :disabled="!canCreate || creating" @click="createRoom">
          {{ creating ? 'Setting up…' : 'Create a room' }}
        </button>
      </template>

      <template v-else>
        <div class="flex flex-col gap-1.5">
          <label class="field-label" for="displayName">Your name</label>
          <input
            id="displayName"
            v-model="displayName"
            class="field-input"
            placeholder="e.g. Kev"
            maxlength="40"
            autocomplete="off"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="field-label" for="roomCode">Room code</label>
          <input
            id="roomCode"
            v-model="roomCode"
            class="field-input field-input--code"
            placeholder="XXXXXX"
            maxlength="6"
            autocomplete="off"
            @input="roomCode = roomCode.toUpperCase()"
          />
        </div>

        <button class="btn btn-ghost" :disabled="!canJoin || joining" @click="joinRoom">
          {{ joining ? 'Joining…' : 'Join room' }}
        </button>
      </template>

      <p v-if="error" class="pill pill-red w-fit self-center">{{ error }}</p>
    </div>

    <RulesModal :open="showRules" @close="showRules = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '@/stores/game';
import { useUserStore } from '@/stores/user';
import RulesModal from '@/components/RulesModal.vue';
import logo from '@/assets/logo.svg';

const router = useRouter();
const store = useGameStore();
const userStore = useUserStore();

const showRules = ref(false);
const mode = ref<'choose' | 'create' | 'join'>('choose');
const displayName = ref(userStore.displayName);
const roomCode = ref('');
const maxRounds = ref(10);
const creating = ref(false);
const joining = ref(false);
const error = ref<string | null>(null);

function backToChoice() {
    mode.value = 'choose';
    error.value = null;
}

const hasName = computed(() => displayName.value.trim().length > 0);
const canCreate = computed(
    () => hasName.value && Number.isInteger(maxRounds.value) && maxRounds.value >= 1 && maxRounds.value <= 50,
);
const canJoin = computed(() => hasName.value && roomCode.value.trim().length === 6);

async function createRoom() {
    if (!canCreate.value || creating.value) return;
    creating.value = true;
    error.value = null;
    try {
        const code = await store.createRoom(displayName.value.trim(), maxRounds.value);
        await router.push(`/room/${code}`);
    } catch (e) {
        error.value = (e as Error).message;
    } finally {
        creating.value = false;
    }
}

async function joinRoom() {
    if (!canJoin.value || joining.value) return;
    joining.value = true;
    error.value = null;
    try {
        const code = await store.joinRoom(roomCode.value.trim(), displayName.value.trim());
        await router.push(`/room/${code}`);
    } catch (e) {
        error.value = (e as Error).message;
    } finally {
        joining.value = false;
    }
}
</script>
