import GameEngine, { SeatedPlayer, SHOWDOWN_TIME_LIMIT_MS } from './game.engine';
import LinkEngineService from '../services/link-engine.service';
import RoundHistoryService from '../services/round-history.service';
import RoomRepository from '../repositories/room.repository';
import { GameEvent, PlayerActionType } from '../types/game.types';

const DEFAULT_STARTING_CHIPS = 1000;

interface RevealPayload {
    mysteryPlayerId: number;
    communityPlayerIds: number[];
    winners: number[];
    potAwarded: number;
    potTotal: number;
}

export type EmitEvents = (roomCode: string, events: GameEvent[]) => void;

/**
 * Map<roomCode, GameEngine> registry + lifecycle (PLAN.md §2). This is the
 * one class that touches both the pure in-memory game world and the DB-backed
 * world: it asks link-engine.service.ts for a round's scenario before handing
 * it to GameEngine, and persists round-history.service.ts's outcome + advances
 * the room's DB row whenever an engine reaches REVEAL/MATCH_END. The socket
 * gateway (sockets/game.gateway.ts) owns turning `emitEvents` into actual
 * io.to(...).emit(...) calls — this class never touches a socket directly.
 */
export default class RoomManager {
    private engines = new Map<string, GameEngine>();
    private showdownTimers = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(
        private linkEngineService: LinkEngineService,
        private roundHistoryService: RoundHistoryService,
        private roomRepository: RoomRepository,
        private emitEvents: EmitEvents,
    ) {}

    register(roomCode: string, seatedPlayers: SeatedPlayer[], maxRounds: number): GameEngine {
        let engine = this.engines.get(roomCode);
        if (!engine) {
            engine = new GameEngine(roomCode, seatedPlayers, maxRounds, DEFAULT_STARTING_CHIPS);
            this.engines.set(roomCode, engine);
        } else {
            // The engine is created on the *first* room:join (typically the host, from the
            // lobby) — every later join must still be folded into its roster, or a round can
            // start seated with only that first player. See GameEngine#syncSeatedPlayers.
            engine.syncSeatedPlayers(seatedPlayers, DEFAULT_STARTING_CHIPS);
        }
        return engine;
    }

    get(roomCode: string): GameEngine | undefined {
        return this.engines.get(roomCode);
    }

    remove(roomCode: string): void {
        this.clearShowdownTimer(roomCode);
        this.engines.delete(roomCode);
    }

    async startRound(roomCode: string, roomId: number): Promise<void> {
        const engine = this.requireEngine(roomCode);
        const scenario = await this.linkEngineService.generateRoundScenario();
        const events = engine.startRound(scenario);
        const round = engine.getSnapshot().round;
        await this.roomRepository.updateCurrentRound(roomId, round);
        if (round === 1) {
            // First round of the match — flips the room out of WAITING so
            // room.service#joinRoom's "is this room still joinable" check
            // actually engages instead of silently letting late joiners in.
            await this.roomRepository.updateStatus(roomId, 'IN_PROGRESS');
        }
        await this.handleEvents(roomCode, roomId, engine, events);
    }

    async applyAction(
        roomCode: string,
        roomId: number,
        userId: number,
        type: PlayerActionType,
        amount?: number,
    ): Promise<void> {
        const engine = this.requireEngine(roomCode);
        const events = engine.applyAction(userId, type, amount);
        await this.handleEvents(roomCode, roomId, engine, events);
    }

    async submitGuess(
        roomCode: string,
        roomId: number,
        userId: number,
        footballPlayerId: number,
    ): Promise<void> {
        const engine = this.requireEngine(roomCode);
        const events = engine.submitGuess(userId, footballPlayerId);
        await this.handleEvents(roomCode, roomId, engine, events);
    }

    /** No-ops if the room's engine is already gone (round already resolved/removed). */
    async leaveGame(roomCode: string, roomId: number, userId: number): Promise<void> {
        const engine = this.engines.get(roomCode);
        if (!engine) return;
        await this.roomRepository.setPlayerActive(roomId, userId, false);
        const events = engine.leaveGame(userId);
        await this.handleEvents(roomCode, roomId, engine, events);
    }

    private requireEngine(roomCode: string): GameEngine {
        const engine = this.engines.get(roomCode);
        if (!engine) throw new Error(`No active game for room ${roomCode}`);
        return engine;
    }

    private async handleEvents(
        roomCode: string,
        roomId: number,
        engine: GameEngine,
        events: GameEvent[],
    ): Promise<void> {
        this.emitEvents(roomCode, events);

        if (events.some((e) => e.type === 'showdown:started')) {
            this.armShowdownTimer(roomCode, roomId, engine);
        }

        const revealEvent = events.find((e) => e.type === 'round:revealed');
        if (revealEvent) {
            this.clearShowdownTimer(roomCode);
            await this.persistRoundOutcome(roomId, engine, revealEvent.payload as RevealPayload);

            const finishEvents = engine.finishRound();
            this.emitEvents(roomCode, finishEvents);
            if (finishEvents.some((e) => e.type === 'match:ended')) {
                await this.roomRepository.updateStatus(roomId, 'FINISHED');
            }
        }
    }

    private async persistRoundOutcome(
        roomId: number,
        engine: GameEngine,
        payload: RevealPayload,
    ): Promise<void> {
        const snapshot = engine.getSnapshot();
        const participantUserIds = snapshot.players.filter((p) => p.isActive).map((p) => p.userId);
        await this.roundHistoryService.persistRoundOutcome({
            roomId,
            roundNumber: snapshot.round,
            mysteryPlayerId: payload.mysteryPlayerId,
            communityPlayerIds: payload.communityPlayerIds,
            winnerUserIds: payload.winners,
            potAwarded: payload.potAwarded,
            participantUserIds,
        });
    }

    private armShowdownTimer(roomCode: string, roomId: number, engine: GameEngine): void {
        this.clearShowdownTimer(roomCode);
        const timer = setTimeout(() => {
            const events = engine.forceResolveShowdown();
            void this.handleEvents(roomCode, roomId, engine, events);
        }, SHOWDOWN_TIME_LIMIT_MS);
        this.showdownTimers.set(roomCode, timer);
    }

    private clearShowdownTimer(roomCode: string): void {
        const timer = this.showdownTimers.get(roomCode);
        if (timer) {
            clearTimeout(timer);
            this.showdownTimers.delete(roomCode);
        }
    }
}
