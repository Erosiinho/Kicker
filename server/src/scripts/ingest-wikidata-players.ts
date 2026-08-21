import 'dotenv/config';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import PrismaDb from '../database/prisma.db';
import { SEED_ENTITIES } from '../lib/seed-entities';
import { fetchTeamMemberships, chunk, RawMembership } from '../lib/wikidata-client';
import type { PrismaClient, OrganizationType } from '@prisma/client';

const NOTABILITY_SITELINKS_THRESHOLD = Number(process.env.NOTABILITY_SITELINKS_THRESHOLD) || 25;
const TEAM_BATCH_SIZE = Number(process.env.WIKIDATA_TEAM_BATCH_SIZE) || 5;
const CACHE_DIR = path.resolve(import.meta.dirname, '../../prisma/data/wikidata-cache');
const DATASET_PATH = path.resolve(import.meta.dirname, '../../prisma/data/football-dataset.json');

interface CliFlags {
    dump: boolean;
    ifEmpty: boolean;
    force: boolean;
    dryRun: boolean;
}

function parseFlags(argv: string[]): CliFlags {
    return {
        dump: argv.includes('--dump'),
        ifEmpty: argv.includes('--if-empty'),
        force: argv.includes('--force'),
        dryRun: argv.includes('--dry-run'),
    };
}

interface FootballDataset {
    generatedAt: string;
    notabilitySitelinksThreshold: number;
    organizations: { wikidataQid: string; name: string; type: OrganizationType }[];
    players: { wikidataQid: string; name: string; photoUrl: string | null }[];
    stints: { playerQid: string; teamQid: string; startYear: number; endYear: number | null }[];
}

/**
 * Pulls every P54 membership for all seed entities, batched to keep
 * individual SPARQL response sizes reasonable (63 entities / 5 per batch ≈
 * 13 requests). Caches each batch's raw response for reproducibility.
 */
async function fetchAllMemberships(): Promise<RawMembership[]> {
    const batches = chunk(SEED_ENTITIES, TEAM_BATCH_SIZE);
    const all: RawMembership[] = [];

    await mkdir(CACHE_DIR, { recursive: true });

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const qids = batch.map((e) => e.qid);
        console.log(
            `[ingest] batch ${i + 1}/${batches.length}: ${batch.map((e) => e.name).join(', ')}`,
        );

        const memberships = await fetchTeamMemberships(qids, NOTABILITY_SITELINKS_THRESHOLD);
        all.push(...memberships);

        await writeFile(
            path.join(CACHE_DIR, `batch-${String(i).padStart(2, '0')}.json`),
            JSON.stringify(memberships, null, 2),
        );
    }

    return all;
}

/**
 * Drops rows with no start year (can't compute teammate overlap without one)
 * and de-duplicates identical (player, team, start, end) tuples — Wikidata
 * can occasionally return the same statement twice across batch boundaries
 * or via redundant qualifiers.
 */
function normalizeMemberships(raw: RawMembership[]): RawMembership[] {
    const seen = new Set<string>();
    const normalized: RawMembership[] = [];
    let droppedNoStart = 0;

    for (const m of raw) {
        if (m.startYear === null) {
            droppedNoStart++;
            continue;
        }
        const key = `${m.playerQid}|${m.teamQid}|${m.startYear}|${m.endYear ?? 'ongoing'}`;
        if (seen.has(key)) continue;
        seen.add(key);
        normalized.push(m);
    }

    console.log(
        `[ingest] normalized ${normalized.length} stints (dropped ${droppedNoStart} with no start date, ${raw.length - droppedNoStart - normalized.length} exact duplicates)`,
    );
    return normalized;
}

function buildDataset(memberships: RawMembership[]): FootballDataset {
    const playersByQid = new Map<string, { name: string; photoUrl: string | null }>();
    for (const m of memberships) {
        const existing = playersByQid.get(m.playerQid);
        // Prefer a record that already has a photo; otherwise first-seen wins.
        if (!existing || (!existing.photoUrl && m.imageUrl)) {
            playersByQid.set(m.playerQid, { name: m.playerName, photoUrl: m.imageUrl });
        }
    }

    return {
        generatedAt: new Date().toISOString(),
        notabilitySitelinksThreshold: NOTABILITY_SITELINKS_THRESHOLD,
        organizations: SEED_ENTITIES.map((e) => ({
            wikidataQid: e.qid,
            name: e.name,
            type: e.type,
        })),
        players: Array.from(playersByQid.entries()).map(([wikidataQid, p]) => ({
            wikidataQid,
            name: p.name,
            photoUrl: p.photoUrl,
        })),
        stints: memberships.map((m) => ({
            playerQid: m.playerQid,
            teamQid: m.teamQid,
            startYear: m.startYear!,
            endYear: m.endYear,
        })),
    };
}

/**
 * `--dump` mode: talks to Wikidata (the only mode that does), writes a single
 * consolidated, git-committed dataset file. Run manually/occasionally by a
 * maintainer to refresh the dataset — never at app startup, and never on a
 * fresh instance (that's the load path below, which needs no network access
 * to Wikidata at all).
 */
async function runDumpMode(flags: CliFlags): Promise<void> {
    const rawMemberships = await fetchAllMemberships();
    const memberships = normalizeMemberships(rawMemberships);
    const dataset = buildDataset(memberships);

    console.log(
        `[ingest] built dataset: ${dataset.organizations.length} organizations, ${dataset.players.length} players, ${dataset.stints.length} stints`,
    );

    if (flags.dryRun) {
        console.log('[ingest] --dry-run: not writing dataset file');
        return;
    }

    await writeFile(DATASET_PATH, JSON.stringify(dataset, null, 2));
    console.log(`[ingest] wrote dataset to ${DATASET_PATH} — commit this file`);
}

async function readDataset(): Promise<FootballDataset> {
    let raw: string;
    try {
        raw = await readFile(DATASET_PATH, 'utf-8');
    } catch {
        throw new Error(
            `No dataset file at ${DATASET_PATH}. Run "npm run dump:wikidata" once (needs network access to Wikidata) and commit the resulting file before loading.`,
        );
    }
    return JSON.parse(raw) as FootballDataset;
}

async function replaceStints(client: PrismaClient, dataset: FootballDataset): Promise<void> {
    const organizations = await client.organization.findMany({
        where: { wikidataQid: { in: dataset.organizations.map((o) => o.wikidataQid) } },
        select: { id: true, wikidataQid: true },
    });
    const orgIdByQid = new Map(organizations.map((o) => [o.wikidataQid, o.id]));

    const players = await client.footballPlayer.findMany({
        where: { wikidataQid: { in: dataset.players.map((p) => p.wikidataQid) } },
        select: { id: true, wikidataQid: true },
    });
    const playerIdByQid = new Map(players.map((p) => [p.wikidataQid, p.id]));

    // Re-runnable: wipe stints for the organizations we manage, then reinsert
    // the freshly loaded set, rather than trying to diff row-by-row.
    await client.stint.deleteMany({
        where: { organizationId: { in: Array.from(orgIdByQid.values()) } },
    });

    const stintRows = dataset.stints
        .map((s) => {
            const footballPlayerId = playerIdByQid.get(s.playerQid);
            const organizationId = orgIdByQid.get(s.teamQid);
            if (!footballPlayerId || !organizationId) return null;
            return { footballPlayerId, organizationId, startYear: s.startYear, endYear: s.endYear };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

    const STINT_INSERT_CHUNK = 5000;
    for (const batch of chunk(stintRows, STINT_INSERT_CHUNK)) {
        await client.stint.createMany({ data: batch });
    }

    console.log(`[ingest] inserted ${stintRows.length} stints`);
}

/**
 * distinctOrgCount is denormalized on FootballPlayer (see PLAN.md §3) so the
 * Link Engine can filter Mystery Player candidates without a GROUP BY on
 * every round. Recomputed globally each run — cheap relative to the bulk
 * inserts above, and simplest to reason about.
 *
 * Zeroes every player first, not just the ones with a stint row: a
 * `--force` reload with a stricter NOTABILITY_SITELINKS_THRESHOLD than a
 * prior run leaves some previously-loaded players with none of their old
 * stints re-inserted (replaceStints only re-adds what the new, filtered
 * dataset actually contains) — without this reset those orphaned players
 * would keep whatever distinctOrgCount they had from the earlier, looser
 * load and could still wrongly surface as Mystery Player candidates.
 */
async function recomputeDistinctOrgCounts(client: PrismaClient): Promise<void> {
    await client.footballPlayer.updateMany({ data: { distinctOrgCount: 0 } });
    await client.$executeRawUnsafe(`
        UPDATE football_players fp
        SET "distinctOrgCount" = sub.cnt
        FROM (
            SELECT "footballPlayerId", COUNT(DISTINCT "organizationId") AS cnt
            FROM stints
            GROUP BY "footballPlayerId"
        ) sub
        WHERE fp.id = sub."footballPlayerId"
    `);
    console.log('[ingest] recomputed distinctOrgCount for all players (zeroed first, so orphaned players from a stricter re-run correctly drop out)');
}

/**
 * Default mode: loads the committed dataset file into the database. Never
 * contacts Wikidata — this is what runs on every fresh instance (via
 * entrypoint.sh --if-empty), so a rate-limited or unreachable Wikidata never
 * blocks spinning up a new environment.
 */
async function runLoadMode(flags: CliFlags): Promise<void> {
    const dataset = await readDataset();
    console.log(
        `[ingest] loaded dataset file (generated ${dataset.generatedAt}): ${dataset.organizations.length} organizations, ${dataset.players.length} players, ${dataset.stints.length} stints`,
    );

    if (flags.dryRun) {
        console.log('[ingest] --dry-run: skipping database writes');
        return;
    }

    const db = new PrismaDb();
    await db.connect();
    const client = db.getClient<PrismaClient>();

    try {
        if (flags.ifEmpty && !flags.force) {
            const existing = await client.organization.count();
            if (existing > 0) {
                console.log(
                    `[ingest] --if-empty: ${existing} organizations already present, skipping (use --force to re-load)`,
                );
                return;
            }
        }

        await client.organization.createMany({ data: dataset.organizations, skipDuplicates: true });
        await client.footballPlayer.createMany({ data: dataset.players, skipDuplicates: true });
        await replaceStints(client, dataset);
        await recomputeDistinctOrgCounts(client);

        console.log('[ingest] done');
    } finally {
        await client.$disconnect();
    }
}

async function main(): Promise<void> {
    const flags = parseFlags(process.argv.slice(2));
    if (flags.dump) {
        await runDumpMode(flags);
    } else {
        await runLoadMode(flags);
    }
}

main().catch((err) => {
    console.error('[ingest] fatal error:', err);
    process.exit(1);
});
