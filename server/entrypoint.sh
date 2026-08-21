#!/bin/sh
set -e

echo "🧩 Running Prisma migrations..."
npx prisma migrate deploy

echo "⚽ Seeding football data from Wikidata (skipped if already seeded)..."
node dist/scripts/ingest-wikidata-players.js --if-empty

echo "🚀 Starting server..."
node dist/index.js
