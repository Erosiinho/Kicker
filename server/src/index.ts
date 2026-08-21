import 'dotenv/config';
import PrismaDb from './database/prisma.db';
import { createApp } from './server';

async function main(): Promise<void> {
    const db = new PrismaDb();
    await db.connect();

    const { server } = createApp(db);
    const port = Number(process.env.PORT) || 3000;
    server.listen(port, () => {
        console.log(`[server]: listening on port ${port}`);
    });
}

main().catch((err) => {
    console.error('[server]: fatal error', err);
    process.exit(1);
});
