import { PrismaClient } from '@prisma/client';
import IDb from '../database/db';
import IRoom, { RoomStatus } from '../types/IRoom';
import IRoomPlayer from '../types/IRoomPlayer';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids ambiguous invite codes
const ROOM_CODE_LENGTH = 6;
const MAX_CODE_GENERATION_ATTEMPTS = 10;

export interface IRoomPlayerWithUser extends IRoomPlayer {
    displayName: string;
}

export interface IRoomWithPlayers extends IRoom {
    players: IRoomPlayerWithUser[];
}

function generateRoomCode(): string {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    }
    return code;
}

export default class RoomRepository {
    constructor(private db: IDb) {}

    private get client(): PrismaClient {
        return this.db.getClient<PrismaClient>();
    }

    /** Retries on the rare invite-code collision rather than trusting a single random draw to be unique. */
    async createRoom(hostUserId: number, maxRounds: number): Promise<IRoom> {
        let lastError: unknown;
        for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
            try {
                return await this.client.room.create({
                    data: { code: generateRoomCode(), hostUserId, maxRounds },
                });
            } catch (err) {
                lastError = err;
            }
        }
        throw lastError instanceof Error
            ? lastError
            : new Error('Failed to generate a unique room code');
    }

    async findByCode(code: string): Promise<IRoomWithPlayers | null> {
        const room = await this.client.room.findUnique({
            where: { code },
            include: {
                players: {
                    orderBy: { seat: 'asc' },
                    include: { user: { select: { displayName: true } } },
                },
            },
        });
        if (!room) return null;
        return {
            ...room,
            players: room.players.map(({ user, ...player }) => ({ ...player, displayName: user.displayName })),
        };
    }

    async findById(id: number): Promise<IRoom | null> {
        return this.client.room.findUnique({ where: { id } });
    }

    async updateStatus(roomId: number, status: RoomStatus): Promise<IRoom> {
        return this.client.room.update({ where: { id: roomId }, data: { status } });
    }

    async updateCurrentRound(roomId: number, currentRound: number): Promise<IRoom> {
        return this.client.room.update({ where: { id: roomId }, data: { currentRound } });
    }

    async addPlayer(roomId: number, userId: number, seat: number, chips: number): Promise<IRoomPlayer> {
        return this.client.roomPlayer.create({ data: { roomId, userId, seat, chips } });
    }

    async listPlayers(roomId: number): Promise<IRoomPlayer[]> {
        return this.client.roomPlayer.findMany({ where: { roomId }, orderBy: { seat: 'asc' } });
    }

    async findPlayer(roomId: number, userId: number): Promise<IRoomPlayer | null> {
        return this.client.roomPlayer.findUnique({ where: { roomId_userId: { roomId, userId } } });
    }

    async updatePlayerChips(roomId: number, userId: number, chips: number): Promise<IRoomPlayer> {
        return this.client.roomPlayer.update({
            where: { roomId_userId: { roomId, userId } },
            data: { chips },
        });
    }

    async setPlayerActive(roomId: number, userId: number, isActive: boolean): Promise<IRoomPlayer> {
        return this.client.roomPlayer.update({
            where: { roomId_userId: { roomId, userId } },
            data: { isActive },
        });
    }
}
