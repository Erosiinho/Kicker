<template>
  <div class="app-shell">
    <header class="flex items-center justify-between">
      <router-link to="/" class="flex items-center gap-2">
        <span class="brand-crest text-sm">⚽</span>
        <span class="brand-title text-lg sm:text-xl">FOOT<em>·</em>POKER</span>
      </router-link>
      <span v-if="store.room && store.gameState" class="pill pill-neutral">
        Round {{ store.gameState.round || store.room.currentRound }} / {{ store.room.maxRounds }}
      </span>
    </header>

    <p v-if="store.error && !needsToJoin" class="pill pill-red mx-auto w-fit">{{ store.error }}</p>

    <div v-if="notFound" class="empty-state">
      <p>No room found for code <span class="stat-mono">{{ code }}</span>.</p>
      <router-link to="/" class="btn btn-ghost btn-sm">Back home</router-link>
    </div>

    <div v-else-if="needsToJoin" class="mx-auto w-full max-w-sm">
      <div class="panel-turf">
        <p class="field-label">Join room {{ code }}</p>
        <input v-model="joinName" class="field-input" placeholder="Your name" maxlength="40" autocomplete="off" />
        <button class="btn btn-kickoff" :disabled="!joinName.trim() || joining" @click="joinNow">
          {{ joining ? 'Joining…' : 'Join room' }}
        </button>
        <p v-if="joinError" class="pill pill-red w-fit self-center">{{ joinError }}</p>
      </div>
    </div>

    <div v-else-if="!store.room" class="empty-state">Setting up the pitch…</div>

    <template v-else>
      <div v-if="store.room.status === 'WAITING'" class="mx-auto flex w-full max-w-md flex-col items-center gap-6">
        <RoomCodeDisplay :code="store.room.code" />
        <div class="panel-turf w-full">
          <p class="field-label">Squad ({{ store.room.players.length }}/6)</p>
          <ul class="flex flex-col gap-2">
            <li v-for="p in store.seatedPlayers" :key="p.userId" class="flex items-center gap-2">
              <span class="squad-number">{{ p.seat + 1 }}</span>
              <span class="flex-1 text-sm">{{ p.displayName }}</span>
              <span v-if="p.userId === store.room.hostUserId" class="pill pill-gold">Host</span>
              <span v-if="p.userId === store.yourUserId" class="pill pill-sky">You</span>
            </li>
          </ul>
          <button
            v-if="store.isHost"
            class="btn btn-kickoff"
            :disabled="store.room.players.length < 2"
            @click="store.ready()"
          >
            {{ store.room.players.length < 2 ? 'Need 2+ players' : 'Kick off' }}
          </button>
          <p v-else class="text-center text-sm" style="color: var(--chalk-faint)">
            Waiting for the host to kick off…
          </p>
        </div>
      </div>

      <PokerTable v-else />
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useGameStore } from '@/stores/game';
import { useUserStore } from '@/stores/user';
import RoomCodeDisplay from '@/components/RoomCodeDisplay.vue';
import PokerTable from '@/components/PokerTable.vue';

const props = defineProps<{ code: string }>();
const code = props.code.toUpperCase();

const store = useGameStore();
const userStore = useUserStore();

const notFound = ref(false);
const needsToJoin = ref(false);
const joinName = ref(userStore.displayName);
const joining = ref(false);
const joinError = ref<string | null>(null);

let lobbyPoll: ReturnType<typeof setInterval> | undefined;

function startLobbyPoll() {
    stopLobbyPoll();
    lobbyPoll = setInterval(() => {
        if (store.room?.status === 'WAITING') void store.fetchRoom(code);
        else stopLobbyPoll();
    }, 3000);
}

function stopLobbyPoll() {
    clearInterval(lobbyPoll);
    lobbyPoll = undefined;
}

async function boot() {
    notFound.value = false;
    try {
        await store.fetchRoom(code);
    } catch {
        notFound.value = true;
        return;
    }
    store.connect(code);
    startLobbyPoll();
}

watch(
    () => store.error,
    (msg) => {
        if (msg && /not a player/i.test(msg)) needsToJoin.value = true;
    },
);

async function joinNow() {
    joining.value = true;
    joinError.value = null;
    try {
        await store.joinRoom(code, joinName.value.trim());
        needsToJoin.value = false;
        await boot();
    } catch (e) {
        joinError.value = (e as Error).message;
    } finally {
        joining.value = false;
    }
}

onMounted(boot);
onUnmounted(() => {
    stopLobbyPoll();
    store.disconnect();
});
</script>
