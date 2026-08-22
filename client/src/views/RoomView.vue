<template>
  <div class="app-shell">
    <header class="flex items-center justify-between">
      <router-link to="/" class="flex items-center gap-2">
        <img :src="logo" alt="Kicker crest" class="h-8 w-8 sm:h-9 sm:w-9" />
        <span class="brand-title text-lg sm:text-xl">KICKER</span>
      </router-link>
      <span v-if="store.room && store.gameState" class="pill pill-neutral">
        {{ t('room.round', { current: store.gameState.round || store.room.currentRound, max: store.room.maxRounds }) }}
      </span>
      <div class="flex items-center gap-2">
        <LocaleSwitcher />
        <button v-if="store.room?.status !== 'IN_PROGRESS'" class="btn btn-ghost btn-sm" @click="showRules = true">
          {{ t('common.rules') }}
        </button>
        <button v-if="store.room?.status === 'IN_PROGRESS'" class="btn btn-ghost btn-sm" @click="leaveInGame">
          {{ t('room.leave') }}
        </button>
      </div>
    </header>

    <p v-if="store.error && !needsToJoin" class="pill pill-red mx-auto w-fit">{{ store.error }}</p>

    <div v-if="notFound" class="empty-state">
      <p>{{ t('room.notFound', { code }) }}</p>
      <router-link to="/" class="btn btn-ghost btn-sm">{{ t('room.backHome') }}</router-link>
    </div>

    <div v-else-if="store.room?.status === 'CANCELLED'" class="empty-state">
      <p>{{ t('room.cancelled') }}</p>
    </div>

    <div v-else-if="store.room?.status === 'FINISHED'" class="empty-state">
      <p>{{ t('room.finished') }}</p>
    </div>

    <div v-else-if="needsToJoin" class="mx-auto w-full max-w-sm">
      <div class="panel-turf">
        <p class="field-label">{{ t('room.joinRoomTitle', { code }) }}</p>
        <input
          v-model="joinName"
          class="field-input"
          :placeholder="t('room.namePlaceholder')"
          maxlength="40"
          autocomplete="off"
        />
        <button class="btn btn-kickoff" :disabled="!joinName.trim() || joining" @click="joinNow">
          {{ joining ? t('home.joining') : t('home.joinRoom') }}
        </button>
        <p v-if="joinError" class="pill pill-red w-fit self-center">{{ joinError }}</p>
      </div>
    </div>

    <div v-else-if="!store.room" class="empty-state">{{ t('room.settingUpPitch') }}</div>

    <template v-else>
      <div v-if="store.room.status === 'WAITING'" class="mx-auto flex w-full max-w-md flex-col items-center gap-6">
        <RoomCodeDisplay :code="store.room.code" />
        <div class="panel-turf w-full">
          <p class="field-label">{{ t('room.squad', { count: store.room.players.length }) }}</p>
          <ul class="flex flex-col gap-2">
            <li v-for="p in store.seatedPlayers" :key="p.userId" class="flex items-center gap-2">
              <span class="squad-number">{{ p.seat + 1 }}</span>
              <span class="flex-1 text-sm">{{ p.displayName }}</span>
              <span v-if="p.userId === store.room.hostUserId" class="pill pill-gold">{{ t('common.host') }}</span>
              <span v-if="p.userId === store.yourUserId" class="pill pill-sky">{{ t('common.you') }}</span>
            </li>
          </ul>
          <button
            v-if="store.isHost"
            class="btn btn-kickoff"
            :disabled="store.room.players.length < 2"
            @click="store.ready()"
          >
            {{ store.room.players.length < 2 ? t('room.need2Players') : t('room.kickOff') }}
          </button>
          <p v-else class="text-center text-sm" style="color: var(--chalk-faint)">
            {{ t('room.waitingHostKickoff') }}
          </p>
          <button class="btn btn-ghost btn-sm" :class="{ 'btn-danger': store.isHost }" @click="store.leaveRoom()">
            {{ store.isHost ? t('room.cancelLobby') : t('room.leaveLobby') }}
          </button>
        </div>
      </div>

      <PokerTable v-else />
    </template>

    <ConfirmModal
      :open="showLeaveConfirm"
      :title="t('room.leaveMatchTitle')"
      :message="t('room.leaveMatchMessage')"
      :confirm-label="t('room.leaveConfirm')"
      :cancel-label="t('room.stay')"
      danger
      @confirm="confirmLeaveInGame"
      @cancel="showLeaveConfirm = false"
    />
    <RulesModal :open="showRules" @close="showRules = false" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useGameStore } from '@/stores/game';
import { useUserStore } from '@/stores/user';
import RoomCodeDisplay from '@/components/RoomCodeDisplay.vue';
import PokerTable from '@/components/PokerTable.vue';
import ConfirmModal from '@/components/ConfirmModal.vue';
import RulesModal from '@/components/RulesModal.vue';
import LocaleSwitcher from '@/components/LocaleSwitcher.vue';
import logo from '@/assets/logo.svg';

const props = defineProps<{ code: string }>();
const code = props.code.toUpperCase();

const router = useRouter();
const store = useGameStore();
const userStore = useUserStore();
const { t } = useI18n();

const notFound = ref(false);
const needsToJoin = ref(false);
const joinName = ref(userStore.displayName);
const joining = ref(false);
const joinError = ref<string | null>(null);

async function boot() {
    notFound.value = false;
    try {
        await store.fetchRoom(code);
    } catch {
        notFound.value = true;
        return;
    }
    store.connect(code);
}

watch(
    () => store.error,
    (msg) => {
        if (msg && /not a player/i.test(msg)) needsToJoin.value = true;
    },
);

watch(
    () => store.leftRoom,
    (left) => {
        if (left) router.push('/');
    },
);

// Landing on (or refreshing into) a room that's over — either it wrapped up (FINISHED) or the
// host cancelled the lobby (CANCELLED) — bounces back home instead of stranding the player on a
// dead room screen. Never fires for a live match ending under the player's feet: nothing updates
// room.status to FINISHED over the socket (see room.manager.ts's startRound for why only the
// WAITING -> IN_PROGRESS transition broadcasts room:updated), so this only ever reacts to a fresh
// REST fetch — i.e. this player just navigated/refreshed into an already-finished room.
watch(
    () => store.room?.status,
    (status) => {
        if (status === 'CANCELLED' || status === 'FINISHED') router.push('/');
    },
);

const showLeaveConfirm = ref(false);
const showRules = ref(false);

function leaveInGame() {
    showLeaveConfirm.value = true;
}

function confirmLeaveInGame() {
    showLeaveConfirm.value = false;
    store.leaveRoom();
}

// Closing the tab/refreshing/navigating away mid-match: the browser ignores any custom text and
// shows its own native popup regardless — there's no way to swap in our own modal here — but
// preventDefault + returnValue is still the required trigger (Chrome insists on returnValue,
// everyone else is happy with just preventDefault).
function handleBeforeUnload(e: BeforeUnloadEvent) {
    if (store.room?.status !== 'IN_PROGRESS') return;
    e.preventDefault();
    e.returnValue = '';
}

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

onMounted(() => {
    boot();
    window.addEventListener('beforeunload', handleBeforeUnload);
});
onUnmounted(() => {
    store.disconnect();
    window.removeEventListener('beforeunload', handleBeforeUnload);
});
</script>
