import { randomUUID } from 'node:crypto';
import RoomRepository, { IRoomWithPlayers } from '../repositories/room.repository';
import UserRepository from '../repositories/user.repository';
import { BadRequestError, NotFoundError } from '../http/errors';

const STARTING_CHIPS = 1000;
const DEFAULT_MAX_ROUNDS = 10;
const MAX_PLAYERS_PER_ROOM = 6;

export interface RoomIdentity {
    roomCode: string;
    guestId: string;
    userId: number;
}

export default class RoomService {
    constructor(
        private roomRepository: RoomRepository,
        private userRepository: UserRepository,
    ) {}

    async createRoom(displayName: string, guestId?: string, maxRounds?: number): Promise<RoomIdentity> {
        const resolvedGuestId = guestId ?? randomUUID();
        const user = await this.userRepository.findOrCreateByGuestId(resolvedGuestId, displayName);
        const room = await this.roomRepository.createRoom(user.id, maxRounds ?? DEFAULT_MAX_ROUNDS);
        await this.roomRepository.addPlayer(room.id, user.id, 0, STARTING_CHIPS);
        return { roomCode: room.code, guestId: resolvedGuestId, userId: user.id };
    }

    async joinRoom(code: string, displayName: string, guestId: string): Promise<RoomIdentity> {
        const room = await this.roomRepository.findByCode(code);
        if (!room) throw new NotFoundError(`No room with code ${code}`);

        const user = await this.userRepository.findOrCreateByGuestId(guestId, displayName);

        // Rejoining (e.g. after a refresh) is idempotent rather than an error.
        if (room.players.some((p) => p.userId === user.id)) {
            return { roomCode: code, guestId, userId: user.id };
        }

        if (room.status !== 'WAITING') throw new BadRequestError('Room is not accepting new players');
        if (room.players.length >= MAX_PLAYERS_PER_ROOM) throw new BadRequestError('Room is full');

        const nextSeat = room.players.length; // seats assigned 0..n-1 in join order
        await this.roomRepository.addPlayer(room.id, user.id, nextSeat, STARTING_CHIPS);
        return { roomCode: code, guestId, userId: user.id };
    }

    async getRoom(code: string): Promise<IRoomWithPlayers> {
        const room = await this.roomRepository.findByCode(code);
        if (!room) throw new NotFoundError(`No room with code ${code}`);
        return room;
    }

    /**
     * A player leaving a still-open lobby. The host leaving cancels the room for everyone rather
     * than transferring the role — a WAITING room is never left ownerless. Otherwise just drops
     * that one player's seat. No-op if the room already moved past WAITING (nothing to reconcile —
     * see GameEngine#leaveGame for the in-progress path instead).
     */
    async leaveWaitingRoom(code: string, userId: number): Promise<{ room: IRoomWithPlayers; cancelled: boolean }> {
        const room = await this.getRoom(code);
        if (room.status !== 'WAITING') return { room, cancelled: false };

        if (userId === room.hostUserId) {
            await this.roomRepository.updateStatus(room.id, 'CANCELLED');
        } else {
            await this.roomRepository.removePlayer(room.id, userId);
        }
        const updated = await this.getRoom(code);
        return { room: updated, cancelled: userId === room.hostUserId };
    }
}
