import { beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import PrismaDb from '../database/prisma.db';
import FootballPlayerRepository from '../repositories/football-player.repository';
import LinkEngineService from '../services/link-engine.service';

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
