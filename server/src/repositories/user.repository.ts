import { PrismaClient } from '@prisma/client';
import IDb from '../database/db';
import IUser from '../types/IUser';

export default class UserRepository {
    constructor(private db: IDb) {}

    private get client(): PrismaClient {
        return this.db.getClient<PrismaClient>();
    }

    async findByGuestId(guestId: string): Promise<IUser | null> {
        return this.client.user.findUnique({ where: { guestId } });
    }

    async findById(id: number): Promise<IUser | null> {
        return this.client.user.findUnique({ where: { id } });
    }

    async findOrCreateByGuestId(guestId: string, displayName: string): Promise<IUser> {
        const existing = await this.findByGuestId(guestId);
        if (existing) return existing;
        return this.client.user.create({ data: { guestId, displayName } });
    }

    async incrementStats(
        userId: number,
        stats: { roundsPlayed?: number; roundsWon?: number; correctGuesses?: number },
    ): Promise<IUser> {
        return this.client.user.update({
            where: { id: userId },
            data: {
                roundsPlayed: { increment: stats.roundsPlayed ?? 0 },
                roundsWon: { increment: stats.roundsWon ?? 0 },
                correctGuesses: { increment: stats.correctGuesses ?? 0 },
            },
        });
    }
}
