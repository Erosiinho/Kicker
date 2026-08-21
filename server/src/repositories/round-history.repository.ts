import { PrismaClient } from '@prisma/client';
import IDb from '../database/db';
import IRoundHistory from '../types/IRoundHistory';

export interface CreateRoundHistoryInput {
    roomId: number;
    roundNumber: number;
    mysteryPlayerId: number;
    communityPlayerIds: number[];
    winnerUserIds: number[];
    potAwarded: number;
}

export default class RoundHistoryRepository {
    constructor(private db: IDb) {}

    private get client(): PrismaClient {
        return this.db.getClient<PrismaClient>();
    }

    async create(input: CreateRoundHistoryInput): Promise<IRoundHistory> {
        const row = await this.client.roundHistory.create({
            data: {
                roomId: input.roomId,
                roundNumber: input.roundNumber,
                mysteryPlayerId: input.mysteryPlayerId,
                communityPlayerIds: input.communityPlayerIds,
                winnerUserIds: input.winnerUserIds,
                potAwarded: input.potAwarded,
            },
        });
        return this.toDomain(row);
    }

    async findByRoom(roomId: number): Promise<IRoundHistory[]> {
        const rows = await this.client.roundHistory.findMany({
            where: { roomId },
            orderBy: { roundNumber: 'asc' },
        });
        return rows.map(this.toDomain);
    }

    private toDomain(row: {
        id: number;
        roomId: number;
        roundNumber: number;
        mysteryPlayerId: number;
        communityPlayerIds: unknown;
        winnerUserIds: unknown;
        potAwarded: number;
        playedAt: Date;
    }): IRoundHistory {
        return {
            ...row,
            communityPlayerIds: row.communityPlayerIds as number[],
            winnerUserIds: row.winnerUserIds as number[],
        };
    }
}
