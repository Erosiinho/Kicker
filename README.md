# Kicker ⚽️🃏

A real-time multiplayer party game that borrows Texas Hold'em's structure — private cards, staged community reveals, a check/call/raise/fold betting round — and swaps the poker hand for a football deduction puzzle.

The name plays on the double meaning: a **kicker** is someone who kicks a ball, and in poker a **kicker** is the side card that breaks a tie — fitting, since this game is exactly that overlap.

Each round the server secretly picks a **Mystery Player** and reveals five other footballers (the "community cards") who really played alongside them at some club or national team. Players bet across four streets while piecing together the clues, then lock in a guess. Anyone who guesses right splits the pot.

## How a round works

1. **Deal** — the Link Engine picks a Mystery Player and samples five real ex-teammates as community cards.
2. **Bet & deduce** — Pre-flop, Flop (3 cards), Turn (+1), River (+1), with a betting round between each stage. A guess can be submitted (and changed) at any point once betting starts — there's no separate "reveal your hand" moment.
3. **Showdown** — non-folded players have a time limit to lock in a final guess.
4. **Reveal** — the Mystery Player and the organization(s) that link everyone are announced. Correct guessers split the pot; if nobody guessed right, the pot carries over to the next round.

## Tech stack

| Layer | Choice |
|---|---|
| Client | Vue 3 (`<script setup>`), Pinia, Vue Router, Tailwind CSS, Vite |
| Server | Node.js, Express 5, Socket.io |
| Data | PostgreSQL + Prisma ORM |
| Football dataset | Wikidata (SPARQL), ingested offline into a committed JSON snapshot |
| Testing | Vitest (+ Supertest on the server) |
| Infra | Docker Compose (Postgres + pgAdmin), Nginx (client), Dockerfiles for both apps |

## Architecture

```
kicker/
├── client/          # Vue 3 SPA — lobby, poker table, betting UI, guess picker
│   └── src/
│       ├── api/         # REST calls (rooms, users)
│       ├── sockets/     # socket.io-client wiring
│       ├── stores/      # Pinia: user identity, live game state
│       ├── components/  # PokerTable, PlayerCard, BettingControls, GuessModal, ...
│       └── views/       # HomeView (create/join), RoomView (lobby + live game)
├── server/
│   └── src/
│       ├── database/       # Prisma client wrapper (IDb abstraction)
│       ├── repositories/   # DB access: users, rooms, football players, round history
│       ├── services/       # room/user/round-history services + the Link Engine
│       ├── game/           # GameEngine (pure state machine) + RoomManager registry
│       ├── sockets/        # Socket.io gateway — the one place the engines meet the network
│       ├── http/           # Express controllers/routes/middleware (REST)
│       └── scripts/        # ingest-wikidata-players.ts (dataset build/seed)
└── docker-compose.yml   # Postgres + pgAdmin
```

Two pieces carry most of the design risk and live in their own modules:
- **Link Engine** (`server/src/services/link-engine.service.ts`) — generates a valid, ideally-unique puzzle each round from the players/clubs/national-teams graph.
- **Game Engine** (`server/src/game/game.engine.ts`) — the poker-shaped state machine (stages, turn order, betting, pot, showdown). It's pure and DB/socket-free, so it's unit-tested as a plain state machine; `RoomManager` and the Socket.io gateway are what wire it up to real players.

Game state (pot, current stage, whose turn) lives in-process, in memory, per room — nothing about a live hand touches Postgres. Only the durable stuff (users, rooms, the football dataset, finished-round history) is persisted. This is a single-instance design: it doesn't horizontally scale without moving room state into something shared like Redis.

## REST API

| Endpoint | Purpose |
|---|---|
| `POST /api/rooms` | Create a room, upsert a guest user, become host |
| `POST /api/rooms/:code/join` | Join a room by its invite code |
| `GET /api/rooms/:code` | Room + player list (lobby / reconnect) |
| `GET /api/users/:guestId/stats` | Rounds played/won, correct guesses |
| `GET /api/football-players?q=...` | Search players by name (used by the guess picker) |

## Socket.io events

**Client → Server:** `room:join`, `player:ready` (host starts the round), `player:action` (check/call/raise/fold), `player:guess` (submit or change a guess).

**Server → Client:** `room:state` (full snapshot, sent to a joining/reconnecting socket only), `round:started`, `stage:advanced`, `player:acted`, `player:guessed`, `your:guess` (private echo), `showdown:started`, `round:revealed`, `room:error` (sent only to the offending socket).

## Getting started

```bash
# 1. Infra (Postgres + pgAdmin)
cp .env.example .env
docker compose up -d

# 2. Server
cd server
npm install
cp .env.example .env   # fill in DATABASE_URL to match the compose credentials
npx prisma migrate deploy
npm run seed:wikidata   # loads the committed football dataset — no network calls
npm run dev

# 3. Client
cd ../client
npm install
cp .env.example .env
npm run dev
```

Open two browser tabs, create a room in one, join with the code in the other.

## The football dataset

Player/club/national-team data comes from Wikidata (`server/src/scripts/ingest-wikidata-players.ts`), but the app never talks to Wikidata at runtime:

- **`npm run dump:wikidata`** (maintainer-only, needs network access) — fetches from Wikidata's SPARQL endpoint and writes a consolidated, committed snapshot: `server/prisma/data/football-dataset.json`.
- **`npm run seed:wikidata`** (what every environment actually runs) — reads that committed file and upserts it into Postgres. No Wikidata dependency, fully reproducible.

Two knobs in `server/.env` control puzzle quality:
- `NOTABILITY_SITELINKS_THRESHOLD` — how famous a player must be (via Wikipedia language-edition count) to be included at all.
- `MIN_ORGS_FOR_MYSTERY` — how many distinct clubs/national teams a player must have appeared for to be eligible as the Mystery Player (too few teammates makes for a weak puzzle).

To add another club or national team, extend the seed-entity list in `server/src/lib/seed-entities.ts`, re-run `npm run dump:wikidata`, and commit the updated dataset JSON as a reviewable diff.

## Game rules (MVP simplifications)

- No blinds — first-to-act each street is always the seat clockwise from the dealer button.
- No side pots — a player who can't cover a call/raise goes all-in for the whole pot; multi-way partial-pot splits are out of scope.
- A guess can be submitted or changed any time from the first betting round through showdown; a non-folded player with no guess at reveal simply can't win.
- If nobody guesses correctly, the pot carries over to the next round instead of being refunded.
- Identity is guest-only: a client-generated ID stored in `localStorage`, no accounts or passwords.
