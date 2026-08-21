import { Server, Socket } from 'socket.io';
import RoomManager, { EmitEvents } from '../game/room.manager';
import RoomService from '../services/room.service';
import UserRepository from '../repositories/user.repository';
import { GameEvent, PlayerActionType } from '../types/game.types';

const DISCONNECT_GRACE_MS = Number(process.env.DISCONNECT_GRACE_MS) || 30000;

interface RoomJoinPayload {
    roomCode: string;
    guestId: string;
}

interface PlayerActionPayload {
    type: PlayerActionType;
    amount?: number;
}

interface PlayerGuessPayload {
    footballPlayerId: number;
}

interface SocketAuth {
    roomCode: string;
    roomId: number;
    userId: number;
}

/** userId <-> socketId bookkeeping per room, so per-player events (hole cards, errors) never get broadcast room-wide. */
export class SocketRegistry {
    private byRoom = new Map<string, Map<number, string>>();

    track(roomCode: string, userId: number, socketId: string): void {
        if (!this.byRoom.has(roomCode)) this.byRoom.set(roomCode, new Map());
        this.byRoom.get(roomCode)!.set(userId, socketId);
    }

    untrack(roomCode: string, userId: number): void {
        this.byRoom.get(roomCode)?.delete(userId);
        if (this.byRoom.get(roomCode)?.size === 0) this.byRoom.delete(roomCode);
    }

    socketIdFor(roomCode: string, userId: number): string | undefined {
        return this.byRoom.get(roomCode)?.get(userId);
    }
}

/**
 * Gives a disconnected socket ~30s to reconnect (refresh, network blip) before the room treats it
 * as a real departure — cancel(...) is called from handleJoin on any (re-)auth, same style as
 * RoomManager's showdownTimers map.
 */
class DisconnectGraceManager {
    private timers = new Map<string, ReturnType<typeof setTimeout>>();

    schedule(roomCode: string, userId: number, onExpire: () => void): void {
        this.cancel(roomCode, userId);
        const key = `${roomCode}:${userId}`;
        this.timers.set(
            key,
            setTimeout(() => {
                this.timers.delete(key);
                onExpire();
            }, DISCONNECT_GRACE_MS),
        );
    }

    cancel(roomCode: string, userId: number): void {
        const key = `${roomCode}:${userId}`;
        const timer = this.timers.get(key);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(key);
        }
    }
}

/** Turns GameEngine/RoomManager's addressed-but-transport-agnostic GameEvent[] into actual socket emits. */
export function createEmitEvents(io: Server, registry: SocketRegistry): EmitEvents {
    return (roomCode: string, events: GameEvent[]) => {
        for (const event of events) {
            if (event.scope === 'room') {
                io.to(roomCode).emit(event.type, event.payload);
                continue;
            }
            const socketId = registry.socketIdFor(roomCode, event.scope.userId);
            if (socketId) io.to(socketId).emit(event.type, event.payload);
        }
    };
}

export default class GameGateway {
    private disconnectGrace = new DisconnectGraceManager();

    constructor(
        private io: Server,
        private roomManager: RoomManager,
        private roomService: RoomService,
        private userRepository: UserRepository,
        private registry: SocketRegistry,
    ) {
        this.io.on('connection', (socket) => this.handleConnection(socket));
    }

    private handleConnection(socket: Socket): void {
        socket.on('room:join', (payload: RoomJoinPayload) => {
            this.handleJoin(socket, payload).catch((err) => this.emitError(socket, err));
        });
        socket.on('player:ready', () => {
            this.handleReady(socket).catch((err) => this.emitError(socket, err));
        });
        socket.on('player:action', (payload: PlayerActionPayload) => {
            this.handleAction(socket, payload).catch((err) => this.emitError(socket, err));
        });
        socket.on('player:guess', (payload: PlayerGuessPayload) => {
            this.handleGuess(socket, payload).catch((err) => this.emitError(socket, err));
        });
        socket.on('room:leave', () => {
            this.handleLeave(socket).catch((err) => this.emitError(socket, err));
        });
        socket.on('disconnect', () => this.handleDisconnect(socket));
    }

    private async handleJoin(socket: Socket, payload: RoomJoinPayload): Promise<void> {
        if (!payload?.roomCode || !payload?.guestId) {
            throw new Error('roomCode and guestId are required');
        }
        const roomCode = payload.roomCode.toUpperCase();
        const room = await this.roomService.getRoom(roomCode);
        if (room.status === 'CANCELLED') {
            throw new Error('This room has been cancelled');
        }
        const user = await this.userRepository.findByGuestId(payload.guestId);
        const roomPlayer = user && room.players.find((p) => p.userId === user.id);
        if (!user || !roomPlayer) {
            throw new Error('You are not a player in this room');
        }

        const auth: SocketAuth = { roomCode, roomId: room.id, userId: user.id };
        socket.data.auth = auth;
        socket.join(roomCode);
        this.registry.track(roomCode, user.id, socket.id);
        // Reconnecting within the grace window (see handleDisconnect) — this join is proof of life.
        this.disconnectGrace.cancel(roomCode, user.id);

        const engine = this.roomManager.register(
            roomCode,
            room.players.map((p) => ({ userId: p.userId, seat: p.seat })),
            room.maxRounds,
        );
        // room:state is only ever sent to the joining socket, never broadcast — so it's the one
        // place safe to fold this player's own live guess in unredacted, letting a mid-round
        // refresh/reconnect (PLAN.md §9.7) recover it instead of relying on the `your:guess`
        // event having already landed (it may have fired before this socket ever connected).
        const myGuess = engine.getMyGuess(user.id);
        socket.emit('room:state', { ...engine.getSnapshot(), myGuess, yourUserId: user.id });
    }

    private async handleReady(socket: Socket): Promise<void> {
        const auth = this.requireAuth(socket);
        const room = await this.roomService.getRoom(auth.roomCode);
        if (room.hostUserId !== auth.userId) {
            throw new Error('Only the host can start the round');
        }
        await this.roomManager.startRound(auth.roomCode, auth.roomId);
    }

    private async handleAction(socket: Socket, payload: PlayerActionPayload): Promise<void> {
        const auth = this.requireAuth(socket);
        await this.roomManager.applyAction(auth.roomCode, auth.roomId, auth.userId, payload.type, payload.amount);
    }

    private async handleGuess(socket: Socket, payload: PlayerGuessPayload): Promise<void> {
        const auth = this.requireAuth(socket);
        await this.roomManager.submitGuess(auth.roomCode, auth.roomId, auth.userId, payload.footballPlayerId);
    }

    private async handleLeave(socket: Socket): Promise<void> {
        const auth = this.requireAuth(socket);
        await this.performLeave(auth.roomCode, auth.roomId, auth.userId, socket);
    }

    private handleDisconnect(socket: Socket): void {
        const auth = socket.data.auth as SocketAuth | undefined;
        if (!auth) return;
        this.registry.untrack(auth.roomCode, auth.userId);
        // Not a real departure yet — give reconnects (refresh, network blip) a grace window before
        // treating this like an explicit room:leave. Cancelled by handleJoin if they come back.
        this.disconnectGrace.schedule(auth.roomCode, auth.userId, () => {
            this.performLeave(auth.roomCode, auth.roomId, auth.userId).catch((err) => {
                console.error(`[game.gateway]: disconnect-grace leave failed for room ${auth.roomCode}`, err);
            });
        });
    }

    /**
     * The one funnel every departure goes through — an explicit room:leave, or a disconnect grace
     * period expiring (`socket` is omitted in that case, since there's no live client to notify).
     */
    private async performLeave(roomCode: string, roomId: number, userId: number, socket?: Socket): Promise<void> {
        this.disconnectGrace.cancel(roomCode, userId);
        this.registry.untrack(roomCode, userId);
        const room = await this.roomService.getRoom(roomCode);

        if (room.status === 'WAITING') {
            const { room: updated, cancelled } = await this.roomService.leaveWaitingRoom(roomCode, userId);
            const engine = this.roomManager.get(roomCode);
            engine?.syncSeatedPlayers(updated.players.map((p) => ({ userId: p.userId, seat: p.seat })));
            if (cancelled) this.roomManager.remove(roomCode);
            this.io.to(roomCode).emit('room:updated', updated);
        } else if (room.status === 'IN_PROGRESS') {
            await this.roomManager.leaveGame(roomCode, roomId, userId);
        }

        if (socket) {
            socket.emit('room:left', {});
            socket.leave(roomCode);
            socket.data.auth = undefined;
        }
    }

    private requireAuth(socket: Socket): SocketAuth {
        const auth = socket.data.auth as SocketAuth | undefined;
        if (!auth) throw new Error('Send room:join before any other event');
        return auth;
    }

    private emitError(socket: Socket, err: unknown): void {
        const message = err instanceof Error ? err.message : 'Unexpected error';
        socket.emit('room:error', { message });
    }
}
