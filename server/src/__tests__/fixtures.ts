import IDb from '../database/db';
import { createApp, App } from '../server';
import { RoomStatus } from '../types/IRoom';

interface FakeUser {
    id: number;
    guestId: string;
    displayName: string;
    roundsPlayed: number;
    roundsWon: number;
    correctGuesses: number;
    createdAt: Date;
}

interface FakeRoom {
    id: number;
    code: string;
    status: RoomStatus;
    hostUserId: number;
    maxRounds: number;
    currentRound: number;
    createdAt: Date;
}

interface FakeRoomPlayer {
    id: number;
    roomId: number;
    userId: number;
    seat: number;
    chips: number;
    isActive: boolean;
}

/**
 * A tiny in-memory stand-in for the Prisma models the room/user REST flow
 * touches — enough to exercise RoomService/UserService/their repositories
 * end-to-end through supertest without a real Postgres connection. Not a
 * general-purpose Prisma mock; only implements what those two flows call.
 */
class FakePrismaClient {
    private users: FakeUser[] = [];
    private rooms: FakeRoom[] = [];
    private roomPlayers: FakeRoomPlayer[] = [];
    private nextUserId = 1;
    private nextRoomId = 1;
    private nextRoomPlayerId = 1;

    user = {
        findUnique: async ({ where }: { where: { guestId?: string; id?: number } }) => {
            if (where.guestId !== undefined) return this.users.find((u) => u.guestId === where.guestId) ?? null;
            if (where.id !== undefined) return this.users.find((u) => u.id === where.id) ?? null;
            return null;
        },
        create: async ({ data }: { data: { guestId: string; displayName: string } }) => {
            const user: FakeUser = {
                id: this.nextUserId++,
                guestId: data.guestId,
                displayName: data.displayName,
                roundsPlayed: 0,
                roundsWon: 0,
                correctGuesses: 0,
                createdAt: new Date(),
            };
            this.users.push(user);
            return user;
        },
        update: async ({
            where,
            data,
        }: {
            where: { id: number };
            data: Record<string, { increment?: number } | undefined>;
        }) => {
            const user = this.users.find((u) => u.id === where.id);
            if (!user) throw new Error(`FakePrismaClient: no user ${where.id}`);
            for (const field of ['roundsPlayed', 'roundsWon', 'correctGuesses'] as const) {
                const increment = data[field]?.increment;
                if (increment) user[field] += increment;
            }
            return user;
        },
    };

    room = {
        create: async ({ data }: { data: { code: string; hostUserId: number; maxRounds: number } }) => {
            const room: FakeRoom = {
                id: this.nextRoomId++,
                code: data.code,
                status: 'WAITING',
                hostUserId: data.hostUserId,
                maxRounds: data.maxRounds,
                currentRound: 0,
                createdAt: new Date(),
            };
            this.rooms.push(room);
            return room;
        },
        findUnique: async ({
            where,
            include,
        }: {
            where: { code?: string; id?: number };
            include?: { players?: boolean };
        }) => {
            const room = this.rooms.find((r) => (where.code ? r.code === where.code : r.id === where.id));
            if (!room) return null;
            if (include?.players) {
                return {
                    ...room,
                    players: this.roomPlayers
                        .filter((p) => p.roomId === room.id)
                        .sort((a, b) => a.seat - b.seat)
                        .map((p) => ({
                            ...p,
                            user: { displayName: this.users.find((u) => u.id === p.userId)?.displayName ?? '' },
                        })),
                };
            }
            return room;
        },
        update: async ({ where, data }: { where: { id: number }; data: Partial<FakeRoom> }) => {
            const room = this.rooms.find((r) => r.id === where.id);
            if (!room) throw new Error(`FakePrismaClient: no room ${where.id}`);
            Object.assign(room, data);
            return room;
        },
    };

    roomPlayer = {
        create: async ({
            data,
        }: {
            data: { roomId: number; userId: number; seat: number; chips: number };
        }) => {
            const player: FakeRoomPlayer = { id: this.nextRoomPlayerId++, isActive: true, ...data };
            this.roomPlayers.push(player);
            return player;
        },
        findMany: async ({ where }: { where: { roomId: number } }) =>
            this.roomPlayers.filter((p) => p.roomId === where.roomId).sort((a, b) => a.seat - b.seat),
        findUnique: async ({ where }: { where: { roomId_userId: { roomId: number; userId: number } } }) =>
            this.roomPlayers.find(
                (p) => p.roomId === where.roomId_userId.roomId && p.userId === where.roomId_userId.userId,
            ) ?? null,
    };
}

export function mockClient(): { db: IDb; client: FakePrismaClient } {
    const client = new FakePrismaClient();
    const db: IDb = {
        connect: async () => {},
        getClient: <T>() => client as unknown as T,
    };
    return { db, client };
}

export function buildApp(db: IDb): App {
    return createApp(db);
}
