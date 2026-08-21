-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'FINISHED');

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('CLUB', 'NATIONAL_TEAM');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "guestId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "roundsPlayed" INTEGER NOT NULL DEFAULT 0,
    "roundsWon" INTEGER NOT NULL DEFAULT 0,
    "correctGuesses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(6) NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'WAITING',
    "hostUserId" INTEGER NOT NULL,
    "maxRounds" INTEGER NOT NULL DEFAULT 10,
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_players" (
    "id" SERIAL NOT NULL,
    "roomId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "seat" INTEGER NOT NULL,
    "chips" INTEGER NOT NULL DEFAULT 1000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "room_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "football_players" (
    "id" SERIAL NOT NULL,
    "wikidataQid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "photoUrl" TEXT,
    "distinctOrgCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "football_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" SERIAL NOT NULL,
    "wikidataQid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OrganizationType" NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stints" (
    "id" SERIAL NOT NULL,
    "footballPlayerId" INTEGER NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "startYear" INTEGER NOT NULL,
    "endYear" INTEGER,

    CONSTRAINT "stints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_history" (
    "id" SERIAL NOT NULL,
    "roomId" INTEGER NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "mysteryPlayerId" INTEGER NOT NULL,
    "communityPlayerIds" JSONB NOT NULL,
    "winnerUserIds" JSONB NOT NULL,
    "potAwarded" INTEGER NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "round_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_guestId_key" ON "users"("guestId");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_code_key" ON "rooms"("code");

-- CreateIndex
CREATE UNIQUE INDEX "room_players_roomId_userId_key" ON "room_players"("roomId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "room_players_roomId_seat_key" ON "room_players"("roomId", "seat");

-- CreateIndex
CREATE UNIQUE INDEX "football_players_wikidataQid_key" ON "football_players"("wikidataQid");

-- CreateIndex
CREATE INDEX "football_players_distinctOrgCount_idx" ON "football_players"("distinctOrgCount");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_wikidataQid_key" ON "organizations"("wikidataQid");

-- CreateIndex
CREATE INDEX "stints_organizationId_idx" ON "stints"("organizationId");

-- CreateIndex
CREATE INDEX "stints_footballPlayerId_idx" ON "stints"("footballPlayerId");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_players" ADD CONSTRAINT "room_players_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_players" ADD CONSTRAINT "room_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stints" ADD CONSTRAINT "stints_footballPlayerId_fkey" FOREIGN KEY ("footballPlayerId") REFERENCES "football_players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stints" ADD CONSTRAINT "stints_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_history" ADD CONSTRAINT "round_history_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

