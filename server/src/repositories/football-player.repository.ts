import { PrismaClient } from '@prisma/client';
import IDb from '../database/db';
import IFootballPlayer from '../types/IFootballPlayer';
import IOrganization from '../types/IOrganization';

/**
 * All "who played with whom" queries the Link Engine (services/link-engine.service.ts)
 * needs. Teammate/overlap logic lives here as raw SQL rather than Prisma's query
 * builder — "same organizationId, overlapping [startYear, endYear] ranges" (a
 * null endYear treated as open-ended) isn't expressible as a Prisma filter, and
 * doing the overlap check in application code would mean pulling every stint
 * for a player's orgs into memory just to filter most of them back out.
 */
export default class FootballPlayerRepository {
    constructor(private db: IDb) {}

    private get client(): PrismaClient {
        return this.db.getClient<PrismaClient>();
    }

    /** Mystery Player candidate pool: PLAN.md §3/§4's "well-traveled" floor. */
    async getMysteryCandidateIds(minDistinctOrgs: number): Promise<number[]> {
        const rows = await this.client.footballPlayer.findMany({
            where: { distinctOrgCount: { gte: minDistinctOrgs } },
            select: { id: true },
        });
        return rows.map((r) => r.id);
    }

    /**
     * Every player who shares an org with `playerId` during an overlapping stint, each tagged
     * with `overlapStartYear` — the earliest year their stints actually overlapped (across every
     * shared org, if there's more than one) — so callers can order teammates chronologically by
     * "when did they first play together" (link-engine.service.ts's community card ordering).
     */
    async getTeammateIds(playerId: number): Promise<{ id: number; overlapStartYear: number }[]> {
        const rows = await this.client.$queryRaw<{ id: number; overlapStartYear: number }[]>`
            SELECT s2."footballPlayerId" AS id, MIN(GREATEST(s1."startYear", s2."startYear")) AS "overlapStartYear"
            FROM stints s1
            JOIN stints s2
              ON s1."organizationId" = s2."organizationId"
             AND s2."footballPlayerId" != s1."footballPlayerId"
            WHERE s1."footballPlayerId" = ${playerId}
              AND s1."startYear" <= COALESCE(s2."endYear", 9999)
              AND s2."startYear" <= COALESCE(s1."endYear", 9999)
            GROUP BY s2."footballPlayerId"
        `;
        return rows;
    }

    /**
     * Every Organization where `playerId` and `otherPlayerId` had an overlapping
     * stint — the "why are these two linked" data for the REVEAL stage (PLAN.md §5).
     */
    async getLinkingOrganizations(playerId: number, otherPlayerId: number): Promise<IOrganization[]> {
        return this.client.$queryRaw<IOrganization[]>`
            SELECT DISTINCT o.id, o."wikidataQid", o.name, o.type
            FROM stints s1
            JOIN stints s2 ON s1."organizationId" = s2."organizationId"
            JOIN organizations o ON o.id = s1."organizationId"
            WHERE s1."footballPlayerId" = ${playerId}
              AND s2."footballPlayerId" = ${otherPlayerId}
              AND s1."startYear" <= COALESCE(s2."endYear", 9999)
              AND s2."startYear" <= COALESCE(s1."endYear", 9999)
        `;
    }

    async getByIds(ids: number[]): Promise<IFootballPlayer[]> {
        if (ids.length === 0) return [];
        return this.client.footballPlayer.findMany({ where: { id: { in: ids } } });
    }

    async getById(id: number): Promise<IFootballPlayer | null> {
        return this.client.footballPlayer.findUnique({ where: { id } });
    }

    /** Case-insensitive name search, for the client's guess picker. */
    async searchByName(query: string, limit = 20): Promise<IFootballPlayer[]> {
        return this.client.footballPlayer.findMany({
            where: { name: { contains: query, mode: 'insensitive' } },
            take: limit,
            orderBy: { distinctOrgCount: 'desc' },
        });
    }
}
