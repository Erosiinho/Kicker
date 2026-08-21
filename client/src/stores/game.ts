import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '@/api/api';
import { connectSocket, disconnectSocket, getSocket } from '@/sockets/socket';
import { useUserStore } from '@/stores/user';
import type {
    GameState,
    IFootballPlayer,
    IRoom,
    MatchEndedPayload,
    PlayerActedPayload,
    PlayerActionType,
    PlayerGuessedPayload,
    PlayerLeftPayload,
    RoomErrorPayload,
    RoomStatePayload,
    RoomUpdatedPayload,
    RoundRevealedPayload,
    RoundStartedPayload,
    ShowdownStartedPayload,
    Stage,
    StageAdvancedPayload,
    YourGuessPayload,
} from '@/api/types';
import { GUESSABLE_STAGES } from '@/api/types';

export const useGameStore = defineStore('game', () => {
    const room = ref<IRoom | null>(null);
    const gameState = ref<GameState | null>(null);
    const yourUserId = ref<number | null>(null);
    /** Your own current secret guess — redacted from everyone else, never part of gameState.players. */
    const myGuess = ref<number | null>(null);
    const guessPickerOpen = ref(false);

    const lastReveal = ref<RoundRevealedPayload | null>(null);
    const matchResult = ref<MatchEndedPayload | null>(null);
    const showdownTimeLimitMs = ref<number | null>(null);
    const showdownStartedAt = ref<number | null>(null);
    /** Set once the server acks our own room:leave — the view watches this to navigate home. */
    const leftRoom = ref(false);

    const footballPlayers = ref<Record<number, IFootballPlayer>>({});

    const connected = ref(false);
    const loading = ref(false);
    const error = ref<string | null>(null);

    const me = computed(() => gameState.value?.players.find((p) => p.userId === yourUserId.value) ?? null);
    const isMyTurn = computed(() => !!gameState.value && gameState.value.turnUserId === yourUserId.value);
    const isHost = computed(() => !!room.value && room.value.hostUserId === yourUserId.value);
    const amountToCall = computed(() => (gameState.value && me.value ? gameState.value.currentBet - me.value.currentBet : 0));
    const seatedPlayers = computed(() =>
        [...(room.value?.players ?? [])].sort((a, b) => a.seat - b.seat),
    );
    /** Can (re-)submit a secret guess right now — never locked in, available across the whole live round. */
    const canGuess = computed(
        () => !!me.value && !me.value.isFolded && GUESSABLE_STAGES.includes(gameState.value?.stage as Stage),
    );

    function playerName(userId: number): string {
        return room.value?.players.find((p) => p.userId === userId)?.displayName ?? `Player ${userId}`;
    }

    function footballPlayer(id: number | null): IFootballPlayer | null {
        return id === null ? null : (footballPlayers.value[id] ?? null);
    }

    async function ensureFootballPlayers(ids: (number | null | undefined)[]): Promise<void> {
        const missing = [...new Set(ids.filter((id): id is number => id != null))].filter(
            (id) => !footballPlayers.value[id],
        );
        if (missing.length === 0) return;
        const players = await api.footballPlayers.getByIds(missing);
        for (const p of players) footballPlayers.value[p.id] = p;
    }

    async function createRoom(displayName: string, maxRounds?: number): Promise<string> {
        loading.value = true;
        error.value = null;
        try {
            const userStore = useUserStore();
            userStore.setDisplayName(displayName);
            const identity = await api.rooms.create(displayName, userStore.guestId, maxRounds);
            userStore.guestId = identity.guestId;
            return identity.roomCode;
        } catch (e) {
            error.value = (e as Error).message;
            throw e;
        } finally {
            loading.value = false;
        }
    }

    async function joinRoom(code: string, displayName: string): Promise<string> {
        loading.value = true;
        error.value = null;
        try {
            const userStore = useUserStore();
            userStore.setDisplayName(displayName);
            const identity = await api.rooms.join(code, displayName, userStore.guestId);
            return identity.roomCode;
        } catch (e) {
            error.value = (e as Error).message;
            throw e;
        } finally {
            loading.value = false;
        }
    }

    async function fetchRoom(code: string): Promise<void> {
        room.value = await api.rooms.get(code);
    }

    function connect(roomCode: string): void {
        const userStore = useUserStore();

        // Only clean up the *game* listeners here — connectSocket()'s own internal 'connect'
        // listener (which re-sends room:join on every connect/reconnect) lives on the socket
        // singleton itself and must never be touched by an indiscriminate socket.off('connect').
        const socket = getSocket();
        socket.off('room:state');
        socket.off('round:started');
        socket.off('stage:advanced');
        socket.off('player:acted');
        socket.off('player:guessed');
        socket.off('your:guess');
        socket.off('showdown:started');
        socket.off('round:revealed');
        socket.off('match:ended');
        socket.off('room:error');
        socket.off('room:updated');
        socket.off('player:left');
        socket.off('room:left');

        connectSocket(roomCode, userStore.guestId);

        socket.on('connect', () => {
            connected.value = true;
        });
        socket.on('disconnect', () => {
            connected.value = false;
        });

        socket.on('room:state', (payload: RoomStatePayload) => {
            const { myGuess: guess, yourUserId: uid, ...state } = payload;
            gameState.value = state;
            myGuess.value = guess;
            yourUserId.value = uid;
            error.value = null;
            void ensureFootballPlayers([...state.revealedCommunityPlayerIds, guess, state.mysteryPlayerId]);
        });

        socket.on('round:started', (payload: RoundStartedPayload) => {
            if (gameState.value) {
                gameState.value.round = payload.round;
                gameState.value.dealerSeat = payload.dealerSeat;
                gameState.value.stage = 'DEALING';
                gameState.value.revealedCommunityPlayerIds = [];
                gameState.value.mysteryPlayerId = null;
            }
            myGuess.value = null;
            guessPickerOpen.value = false;
            lastReveal.value = null;
            matchResult.value = null;
        });

        socket.on('stage:advanced', (payload: StageAdvancedPayload) => {
            if (gameState.value) {
                gameState.value.stage = payload.stage;
                gameState.value.revealedCommunityPlayerIds = payload.revealedCommunityPlayerIds;
                gameState.value.pot = payload.pot;
                gameState.value.currentBet = payload.currentBet;
                gameState.value.minRaise = payload.minRaise;
                gameState.value.turnUserId = payload.turnUserId;
                gameState.value.players = payload.players;
            }
            void ensureFootballPlayers(payload.revealedCommunityPlayerIds);
        });

        socket.on('player:acted', (payload: PlayerActedPayload) => {
            if (gameState.value) {
                gameState.value.pot = payload.potTotal;
                gameState.value.currentBet = payload.currentBet;
                gameState.value.minRaise = payload.minRaise;
                gameState.value.turnUserId = payload.nextTurnUserId;
                gameState.value.players = payload.players;
            }
        });

        socket.on('player:guessed', (payload: PlayerGuessedPayload) => {
            const player = gameState.value?.players.find((p) => p.userId === payload.userId);
            if (player) player.hasGuessed = payload.hasGuessed;
        });

        socket.on('your:guess', (payload: YourGuessPayload) => {
            myGuess.value = payload.footballPlayerId;
            void ensureFootballPlayers([payload.footballPlayerId]);
        });

        socket.on('showdown:started', (payload: ShowdownStartedPayload) => {
            if (gameState.value) gameState.value.stage = 'SHOWDOWN';
            showdownTimeLimitMs.value = payload.timeLimitMs;
            showdownStartedAt.value = Date.now();
        });

        socket.on('round:revealed', (payload: RoundRevealedPayload) => {
            if (gameState.value) {
                gameState.value.stage = 'REVEAL';
                gameState.value.mysteryPlayerId = payload.mysteryPlayerId;
                gameState.value.revealedCommunityPlayerIds = payload.communityPlayerIds;
            }
            lastReveal.value = payload;
            void ensureFootballPlayers([payload.mysteryPlayerId, ...payload.communityPlayerIds]);
        });

        socket.on('match:ended', (payload: MatchEndedPayload) => {
            if (gameState.value) gameState.value.stage = 'MATCH_END';
            matchResult.value = payload;
        });

        socket.on('room:error', (payload: RoomErrorPayload) => {
            error.value = payload.message;
        });

        socket.on('room:updated', (payload: RoomUpdatedPayload) => {
            room.value = payload;
        });

        socket.on('player:left', (payload: PlayerLeftPayload) => {
            if (gameState.value) {
                gameState.value.pot = payload.potTotal;
                gameState.value.currentBet = payload.currentBet;
                gameState.value.minRaise = payload.minRaise;
                gameState.value.turnUserId = payload.nextTurnUserId;
                gameState.value.players = payload.players;
            }
        });

        socket.on('room:left', () => {
            leftRoom.value = true;
        });
    }

    function disconnect(): void {
        disconnectSocket();
        connected.value = false;
        room.value = null;
        gameState.value = null;
        yourUserId.value = null;
        myGuess.value = null;
        guessPickerOpen.value = false;
        lastReveal.value = null;
        matchResult.value = null;
        leftRoom.value = false;
    }

    function ready(): void {
        getSocket().emit('player:ready');
    }

    function act(type: PlayerActionType, amount?: number): void {
        getSocket().emit('player:action', { type, amount });
    }

    /** Cancels the lobby (if you're the host) or forfeits/folds out of a live game — server decides which by room status. */
    function leaveRoom(): void {
        getSocket().emit('room:leave');
    }

    /** Submits or changes your secret guess — never locked in, callable throughout the round. */
    function guess(footballPlayerId: number): void {
        getSocket().emit('player:guess', { footballPlayerId });
    }

    function openGuessPicker(): void {
        guessPickerOpen.value = true;
    }

    function closeGuessPicker(): void {
        guessPickerOpen.value = false;
    }

    return {
        room,
        gameState,
        yourUserId,
        myGuess,
        guessPickerOpen,
        lastReveal,
        matchResult,
        showdownTimeLimitMs,
        showdownStartedAt,
        footballPlayers,
        connected,
        loading,
        error,
        leftRoom,
        me,
        isMyTurn,
        isHost,
        amountToCall,
        seatedPlayers,
        canGuess,
        playerName,
        footballPlayer,
        ensureFootballPlayers,
        createRoom,
        joinRoom,
        fetchRoom,
        connect,
        disconnect,
        ready,
        act,
        guess,
        leaveRoom,
        openGuessPicker,
        closeGuessPicker,
    };
});

export type { Stage, PlayerActionType };
