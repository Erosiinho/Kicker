import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp, mockClient } from './fixtures';
import RoomRepository from '../repositories/room.repository';
import UserRepository from '../repositories/user.repository';
import RoomService from '../services/room.service';

function buildRoomService(db: ReturnType<typeof mockClient>['db']): RoomService {
    return new RoomService(new RoomRepository(db), new UserRepository(db));
}

describe('Room REST API', () => {
    it('creates a room and returns a roomCode + guestId', async () => {
        const { db } = mockClient();
        const { app } = buildApp(db);

        const res = await request(app).post('/api/rooms').send({ displayName: 'Alice' });

        expect(res.status).toBe(201);
        expect(res.body.roomCode).toMatch(/^[A-Z2-9]{6}$/);
        expect(res.body.guestId).toBeTruthy();
    });

    it('lets a second player join an existing room', async () => {
        const { db } = mockClient();
        const { app } = buildApp(db);

        const createRes = await request(app).post('/api/rooms').send({ displayName: 'Alice' });
        const { roomCode } = createRes.body;

        const joinRes = await request(app)
            .post(`/api/rooms/${roomCode}/join`)
            .send({ displayName: 'Bob', guestId: randomUUID() });
        expect(joinRes.status).toBe(200);

        const getRes = await request(app).get(`/api/rooms/${roomCode}`);
        expect(getRes.status).toBe(200);
        expect(getRes.body.players).toHaveLength(2);
        expect(getRes.body.players[1].seat).toBe(1);
    });

    it('rejects joining a room that does not exist', async () => {
        const { db } = mockClient();
        const { app } = buildApp(db);

        const res = await request(app)
            .post('/api/rooms/ZZZZZZ/join')
            .send({ displayName: 'Bob', guestId: randomUUID() });

        expect(res.status).toBe(404);
        expect(res.body.error).toBeTruthy();
    });

    it('rejects an invalid create-room body', async () => {
        const { db } = mockClient();
        const { app } = buildApp(db);

        const res = await request(app).post('/api/rooms').send({ displayName: '' });

        expect(res.status).toBe(400);
    });

    it('exposes user stats after a room is created', async () => {
        const { db } = mockClient();
        const { app } = buildApp(db);

        const createRes = await request(app).post('/api/rooms').send({ displayName: 'Alice' });
        const { guestId } = createRes.body;

        const statsRes = await request(app).get(`/api/users/${guestId}/stats`);

        expect(statsRes.status).toBe(200);
        expect(statsRes.body).toMatchObject({ roundsPlayed: 0, roundsWon: 0, correctGuesses: 0 });
    });

    it('returns 404 for stats on an unknown guestId', async () => {
        const { db } = mockClient();
        const { app } = buildApp(db);

        const res = await request(app).get(`/api/users/${randomUUID()}/stats`);

        expect(res.status).toBe(404);
    });

    describe('leaveWaitingRoom', () => {
        it('cancels the whole room when the host leaves', async () => {
            const { db } = mockClient();
            const { app } = buildApp(db);
            const roomService = buildRoomService(db);

            const createRes = await request(app).post('/api/rooms').send({ displayName: 'Alice' });
            const { roomCode, userId: hostUserId } = createRes.body;
            await request(app)
                .post(`/api/rooms/${roomCode}/join`)
                .send({ displayName: 'Bob', guestId: randomUUID() });

            const { room, cancelled } = await roomService.leaveWaitingRoom(roomCode, hostUserId);

            expect(cancelled).toBe(true);
            expect(room.status).toBe('CANCELLED');
        });

        it('just drops that seat when a non-host player leaves', async () => {
            const { db } = mockClient();
            const { app } = buildApp(db);
            const roomService = buildRoomService(db);

            const createRes = await request(app).post('/api/rooms').send({ displayName: 'Alice' });
            const { roomCode } = createRes.body;
            const joinRes = await request(app)
                .post(`/api/rooms/${roomCode}/join`)
                .send({ displayName: 'Bob', guestId: randomUUID() });

            const { room, cancelled } = await roomService.leaveWaitingRoom(roomCode, joinRes.body.userId);

            expect(cancelled).toBe(false);
            expect(room.status).toBe('WAITING');
            expect(room.players).toHaveLength(1);
            expect(room.players[0].displayName).toBe('Alice');
        });

        it('is a no-op once the room is no longer WAITING', async () => {
            const { db } = mockClient();
            const { app } = buildApp(db);
            const roomService = buildRoomService(db);

            const createRes = await request(app).post('/api/rooms').send({ displayName: 'Alice' });
            const { roomCode, userId: hostUserId } = createRes.body;
            const room = await roomService.getRoom(roomCode);
            // Simulate the round having started, bypassing the socket layer this test doesn't exercise.
            await new RoomRepository(db).updateStatus(room.id, 'IN_PROGRESS');

            const result = await roomService.leaveWaitingRoom(roomCode, hostUserId);

            expect(result.cancelled).toBe(false);
            expect(result.room.status).toBe('IN_PROGRESS');
            expect(result.room.players).toHaveLength(1); // untouched
        });
    });
});
