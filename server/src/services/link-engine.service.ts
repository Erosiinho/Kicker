import FootballPlayerRepository from '../repositories/football-player.repository';
import { GuessScore, RoundScenario } from '../types/game.types';

const MIN_ORGS_FOR_MYSTERY = Number(process.env.MIN_ORGS_FOR_MYSTERY) || 3;
const COMMUNITY_CARD_COUNT = 5;
const MAX_MYSTERY_ATTEMPTS = 30;
const MAX_RESAMPLE_ATTEMPTS_PER_MYSTERY = 20;
const MAX_SCENARIO_ATTEMPTS = 50; // shared cap across both loops (PLAN.md §4 Step 3)

export class InsufficientDataError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InsufficientDataError';
    }
}

function pickRandom<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

function sampleDistinct<T>(items: T[], count: number): T[] {
    const pool = [...items];
    const sample: T[] = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
        const index = Math.floor(Math.random() * pool.length);
        sample.push(pool.splice(index, 1)[0]);
    }
    return sample;
}

export default class LinkEngineService {
    constructor(private footballPlayerRepository: FootballPlayerRepository) {}

    /**
     * Generates one round's puzzle: a secret Mystery Player and 5 community
     * cards that are all real teammates of that player. See PLAN.md §4 for
     * the full design rationale. No more per-player hole cards — the
     * secret-guess mechanic (PLAN.md's "Proposed gameplay change") replaced
     * them, so this is now a pure function of the dataset plus RNG, with no
     * per-player output to key.
     */
    async generateRoundScenario(): Promise<RoundScenario> {
        const minTeammatesNeeded = COMMUNITY_CARD_COUNT;

        const candidateIds = await this.footballPlayerRepository.getMysteryCandidateIds(
            MIN_ORGS_FOR_MYSTERY,
        );
        if (candidateIds.length === 0) {
            throw new InsufficientDataError(
                `No Mystery Player candidates with distinctOrgCount >= ${MIN_ORGS_FOR_MYSTERY}`,
            );
        }

        let totalAttempts = 0;
        let bestFallback: { scenario: RoundScenario; ambiguityCount: number } | null = null;

        for (
            let mysteryAttempt = 0;
            mysteryAttempt < MAX_MYSTERY_ATTEMPTS && totalAttempts < MAX_SCENARIO_ATTEMPTS;
            mysteryAttempt++
        ) {
            const mysteryPlayerId = pickRandom(candidateIds);
            const teammateIds = await this.footballPlayerRepository.getTeammateIds(mysteryPlayerId);
            if (teammateIds.length < minTeammatesNeeded) continue;

            for (
                let sampleAttempt = 0;
                sampleAttempt < MAX_RESAMPLE_ATTEMPTS_PER_MYSTERY && totalAttempts < MAX_SCENARIO_ATTEMPTS;
                sampleAttempt++
            ) {
                totalAttempts++;
                const sampledTeammates = sampleDistinct(teammateIds, COMMUNITY_CARD_COUNT);
                // Displayed/revealed in the order the mystery player actually played with them —
                // earliest overlap first — rather than the sampling order (PLAN.md's "reveal order").
                sampledTeammates.sort((a, b) => a.overlapStartYear - b.overlapStartYear);
                const communityPlayerIds = sampledTeammates.map((t) => t.id) as [
                    number,
                    number,
                    number,
                    number,
                    number,
                ];

                const ambiguityCount = await this.countAmbiguousAlternatives(
                    mysteryPlayerId,
                    communityPlayerIds,
                );

                if (ambiguityCount === 0) {
                    return { mysteryPlayerId, communityPlayerIds };
                }

                if (!bestFallback || ambiguityCount < bestFallback.ambiguityCount) {
                    bestFallback = {
                        scenario: { mysteryPlayerId, communityPlayerIds },
                        ambiguityCount,
                    };
                }
            }
        }

        if (bestFallback) {
            console.warn(
                `[link-engine] no unambiguous scenario found after ${totalAttempts} attempts; ` +
                    `falling back to the least-ambiguous one found (${bestFallback.ambiguityCount} alternative mystery players)`,
            );
            return bestFallback.scenario;
        }

        throw new InsufficientDataError(
            'Could not generate a valid round scenario with the current dataset',
        );
    }

    /**
     * Scores every showdown guess by how many of the round's 5 community cards are actual
     * teammates of the guessed player — the "closest link" win condition that superseded the
     * old exact-match-only rule. Guessing the Mystery Player itself always scores
     * COMMUNITY_CARD_COUNT (every community card is one of its teammates by construction — see
     * generateRoundScenario), so it's still always at least as good as any other guess; this
     * just adds partial credit for guesses that are merely close. Ties at the highest score
     * split the pot, exactly like tying on an exact match did before; if every guess scores 0
     * there's no winner and the pot carries over, same as before too.
     */
    async scoreGuesses(
        communityPlayerIds: readonly number[],
        guesses: { userId: number; footballPlayerId: number }[],
    ): Promise<{ winnerUserIds: number[]; guessScores: GuessScore[] }> {
        const guessScores: GuessScore[] = [];
        for (const { userId, footballPlayerId } of guesses) {
            const teammates = await this.footballPlayerRepository.getTeammateIds(footballPlayerId);
            const teammateIds = new Set(teammates.map((t) => t.id));
            const linkCount = communityPlayerIds.filter((id) => teammateIds.has(id)).length;
            guessScores.push({ userId, footballPlayerId, linkCount });
        }

        const bestScore = Math.max(0, ...guessScores.map((s) => s.linkCount));
        const winnerUserIds =
            bestScore > 0 ? guessScores.filter((s) => s.linkCount === bestScore).map((s) => s.userId) : [];

        return { winnerUserIds, guessScores };
    }

    /**
     * PLAN.md §4 Step 3: counts every other player who is *also* a teammate
     * of all 5 sampled community cards (i.e. would be an equally valid
     * Mystery Player), by intersecting each community card's teammate set.
     */
    private async countAmbiguousAlternatives(
        mysteryPlayerId: number,
        communityPlayerIds: readonly number[],
    ): Promise<number> {
        let intersection: Set<number> | null = null;

        for (const communityPlayerId of communityPlayerIds) {
            const communityTeammates = await this.footballPlayerRepository.getTeammateIds(communityPlayerId);
            const teammates = new Set(communityTeammates.map((t) => t.id));
            if (intersection === null) {
                intersection = teammates;
            } else {
                const current: Set<number> = intersection;
                intersection = new Set(Array.from(current).filter((id) => teammates.has(id)));
            }
            if (intersection.size === 0) break;
        }

        intersection?.delete(mysteryPlayerId);
        return intersection?.size ?? 0;
    }
}
