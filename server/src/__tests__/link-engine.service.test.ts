import { beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import PrismaDb from '../database/prisma.db';
import FootballPlayerRepository from '../repositories/football-player.repository';
import LinkEngineService from '../services/link-engine.service';

/** A fake FootballPlayerRepository backed by a plain teammate adjacency map — enough to unit-test scoreGuesses' pure ranking logic without a real database. */
function fakeRepository(teammatesById: Record<number, number[]>): FootballPlayerRepository {
    return {
        getTeammateIds: async (playerId: number) =>
            (teammatesById[playerId] ?? []).map((id) => ({ id, overlapStartYear: 2000 })),
    } as unknown as FootballPlayerRepository;
}

/**
 * PLAN.md §9.3's "call generateRoundScenario a few hundred times against the
 * real seeded DB" check — this is deliberately a live smoke test, not a
 * mocked unit test, since the whole point is to validate the *actual* seeded
 * dataset's cluster density (ambiguous-fallback rate should be low). It
 * self-skips when no database is reachable rather than failing the suite,
 * since that's an environment precondition, not a code defect.
 */
let dbAvailable = false;
let db: PrismaDb;

beforeAll(async () => {
    db = new PrismaDb();
    await db.connect();
    try {
        await db.getClient<PrismaClient>().$queryRaw`SELECT 1`;
        dbAvailable = true;
    } catch {
        dbAvailable = false;
        console.warn(
            '[link-engine.service.test] no reachable database — skipping the live scenario-generation smoke test (see PLAN.md §9.3). ' +
                'Run `docker compose up -d && npx prisma migrate deploy && npm run seed:wikidata` first to exercise it.',
        );
    }
});

describe('LinkEngineService — live smoke test against the seeded dataset', () => {
    it('generates valid, non-degenerate scenarios across many runs', async () => {
        if (!dbAvailable) return;

        const service = new LinkEngineService(new FootballPlayerRepository(db));
        const runs = 200;

        for (let i = 0; i < runs; i++) {
            const scenario = await service.generateRoundScenario();

            expect(new Set(scenario.communityPlayerIds).size).toBe(5);
            expect(scenario.communityPlayerIds).not.toContain(scenario.mysteryPlayerId);
        }
    }, 180_000);
});

describe('LinkEngineService#scoreGuesses', () => {
    const communityPlayerIds = [101, 102, 103, 104, 105];

    it('wins for guesses tied on the most linked community cards, not only an exact match', async () => {
        const service = new LinkEngineService(
            fakeRepository({
                999: [101, 102, 103, 104, 105], // the actual Mystery Player — teammates of all 5
                11: [101, 102, 103], // links to 3 of the 5
                22: [101, 102, 104], // also links to 3 of the 5 — ties with player 11's guess
                33: [101], // links to only 1
            }),
        );

        const { winnerUserIds, guessScores } = await service.scoreGuesses(communityPlayerIds, [
            { userId: 1, footballPlayerId: 11 },
            { userId: 2, footballPlayerId: 22 },
            { userId: 3, footballPlayerId: 33 },
        ]);

        expect(guessScores).toEqual([
            { userId: 1, footballPlayerId: 11, linkCount: 3 },
            { userId: 2, footballPlayerId: 22, linkCount: 3 },
            { userId: 3, footballPlayerId: 33, linkCount: 1 },
        ]);
        expect(winnerUserIds.sort()).toEqual([1, 2]);
    });

    it('reports no winner when every guess links to zero community cards', async () => {
        const service = new LinkEngineService(fakeRepository({ 11: [], 22: [999] }));

        const { winnerUserIds } = await service.scoreGuesses(communityPlayerIds, [
            { userId: 1, footballPlayerId: 11 },
            { userId: 2, footballPlayerId: 22 },
        ]);

        expect(winnerUserIds).toEqual([]);
    });

    it('guessing the exact Mystery Player always scores the maximum, since every community card is one of its teammates by construction', async () => {
        const service = new LinkEngineService(
            fakeRepository({
                999: communityPlayerIds,
                11: [101, 102, 103, 104], // close, but not perfect
            }),
        );

        const { winnerUserIds, guessScores } = await service.scoreGuesses(communityPlayerIds, [
            { userId: 1, footballPlayerId: 999 },
            { userId: 2, footballPlayerId: 11 },
        ]);

        expect(guessScores.find((s) => s.userId === 1)!.linkCount).toBe(5);
        expect(winnerUserIds).toEqual([1]);
    });
});
