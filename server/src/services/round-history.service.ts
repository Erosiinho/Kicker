import RoundHistoryRepository from '../repositories/round-history.repository';
import UserRepository from '../repositories/user.repository';

export interface PersistRoundOutcomeInput {
    roomId: number;
    roundNumber: number;
    mysteryPlayerId: number;
    communityPlayerIds: number[];
    winnerUserIds: number[];
    potAwarded: number;
    /** Every player who played the round (folded or not) — drives roundsPlayed. */
    participantUserIds: number[];
}

export default class RoundHistoryService {
    constructor(
        private roundHistoryRepository: RoundHistoryRepository,
        private userRepository: UserRepository,
    ) {}

    async persistRoundOutcome(input: PersistRoundOutcomeInput): Promise<void> {
        await this.roundHistoryRepository.create({
            roomId: input.roomId,
            roundNumber: input.roundNumber,
            mysteryPlayerId: input.mysteryPlayerId,
            communityPlayerIds: input.communityPlayerIds,
            winnerUserIds: input.winnerUserIds,
            potAwarded: input.potAwarded,
        });

        const winners = new Set(input.winnerUserIds);
        await Promise.all(
            input.participantUserIds.map((userId) =>
                this.userRepository.incrementStats(userId, {
                    roundsPlayed: 1,
                    roundsWon: winners.has(userId) ? 1 : 0,
                    correctGuesses: winners.has(userId) ? 1 : 0,
                }),
            ),
        );
    }
}
