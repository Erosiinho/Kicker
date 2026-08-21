import { PrismaClient } from '@prisma/client';
import IDb from './db';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';

export default class PrismaDb implements IDb {
    private client: PrismaClient;

    constructor() {
        dotenv.config();
        const adapter = new PrismaPg({
            connectionString: process.env.DATABASE_URL!,
        });
        this.client = new PrismaClient({ adapter });
    }

    async connect(): Promise<void> {
        try {
            await this.client.$connect();
            console.log('[database]: connected!');
        } catch (err) {
            console.error('[database]: connection error: ', err);
            await this.client.$disconnect();
        }
    }

    getClient<PrismaClient>(): PrismaClient {
        return this.client as PrismaClient;
    }
}
