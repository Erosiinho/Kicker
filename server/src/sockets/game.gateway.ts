import { Server, Socket } from 'socket.io';
import RoomManager, { EmitEvents } from '../game/room.manager';
import RoomService from '../services/room.service';
import UserRepository from '../repositories/user.repository';
import { GameEvent, PlayerActionType } from '../types/game.types';

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
        socket.on('disconnect', () => this.handleDisconnect(socket));
    }

    private async handleJoin(socket: Socket, payload: RoomJoinPayload): Promise<void> {
        if (!payload?.roomCode || !payload?.guestId) {
            throw new Error('roomCode and guestId are required');
        }
        const roomCode = payload.roomCode.toUpperCase();
        const room = await this.roomService.getRoom(roomCode);
        const user = await this.userRepository.findByGuestId(payload.guestId);
        const roomPlayer = user && room.players.find((p) => p.userId === user.id);
        if (!user || !roomPlayer) {
            throw new Error('You are not a player in this room');
        }

        const auth: SocketAuth = { roomCode, roomId: room.id, userId: user.id };
        socket.data.auth = auth;
        socket.join(roomCode);
        this.registry.track(roomCode, user.id, socket.id);

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

    private handleDisconnect(socket: Socket): void {
        const auth = socket.data.auth as SocketAuth | undefined;
        if (auth) this.registry.untrack(auth.roomCode, auth.userId);
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
