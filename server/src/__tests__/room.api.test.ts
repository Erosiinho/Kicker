import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp, mockClient } from './fixtures';

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
});
