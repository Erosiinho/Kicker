export type RoomStatus = 'WAITING' | 'IN_PROGRESS' | 'FINISHED';

export interface IRoomPlayer {
    id: number;
    roomId: number;
    userId: number;
    seat: number;
    chips: number;
    isActive: boolean;
    displayName: string;
}

export interface IRoom {
    id: number;
    code: string;
    status: RoomStatus;
    hostUserId: number;
    maxRounds: number;
    currentRound: number;
    createdAt: string;
    players: IRoomPlayer[];
}

export interface IUserStats {
    id: number;
    guestId: string;
    displayName: string;
    roundsPlayed: number;
    roundsWon: number;
    correctGuesses: number;
    createdAt: string;
}

export interface IFootballPlayer {
    id: number;
    wikidataQid: string;
    name: string;
    photoUrl: string | null;
    distinctOrgCount: number;
}

export interface RoomIdentity {
    roomCode: string;
    guestId: string;
    userId: number;
}

/** Mirrors server/src/types/game.types.ts (PLAN.md §5) — the wire shape of the real-time game state. */
export type Stage =
    | 'WAITING'
    | 'DEALING'
    | 'PREFLOP_BETTING'
    | 'FLOP'
    | 'FLOP_BETTING'
    | 'TURN'
    | 'TURN_BETTING'
    | 'RIVER'
    | 'RIVER_BETTING'
    | 'SHOWDOWN'
    | 'REVEAL'
    | 'ROUND_END'
    | 'MATCH_END';

export const BETTING_STAGES: readonly Stage[] = [
    'PREFLOP_BETTING',
    'FLOP_BETTING',
    'TURN_BETTING',
    'RIVER_BETTING',
];

export type PlayerActionType = 'check' | 'call' | 'raise' | 'fold';

export interface PlayerState {
    userId: number;
    seat: number;
    chips: number;
    isActive: boolean;
    isFolded: boolean;
    isAllIn: boolean;
    currentBet: number;
    /** Always redacted (null) for everyone but the guesser and REVEAL onward — see `hasGuessed`. */
    guess: number | null;
    /** Broadcast-safe: reveals *that* this player has a live guess, never *what* it is, pre-REVEAL. */
    hasGuessed: boolean;
}

/** Stages a non-folded player may submit/change their secret guess in (mirrors server GUESSABLE_STAGES). */
export const GUESSABLE_STAGES: readonly Stage[] = [...BETTING_STAGES, 'SHOWDOWN'];

export interface GameState {
    roomCode: string;
    round: number;
    maxRounds: number;
    stage: Stage;
    dealerSeat: number;
    turnUserId: number | null;
    pot: number;
    minRaise: number;
    currentBet: number;
    mysteryPlayerId: number | null;
    revealedCommunityPlayerIds: number[];
    players: PlayerState[];
}

// --- Socket.io payloads (sockets/game.gateway.ts) ---

export interface RoomStatePayload extends GameState {
    myGuess: number | null;
    yourUserId: number;
}

export interface RoundStartedPayload {
    round: number;
    dealerSeat: number;
}

export interface PlayerGuessedPayload {
    userId: number;
    hasGuessed: boolean;
}

export interface YourGuessPayload {
    footballPlayerId: number;
}

export interface StageAdvancedPayload {
    stage: Stage;
    revealedCommunityPlayerIds: number[];
    pot: number;
    currentBet: number;
    turnUserId: number | null;
    players: PlayerState[];
}

export interface PlayerActedPayload {
    userId: number;
    action: PlayerActionType;
    amount: number;
    potTotal: number;
    currentBet: number;
    nextTurnUserId: number | null;
    players: PlayerState[];
}

export interface ShowdownStartedPayload {
    timeLimitMs: number;
}

export interface RoundRevealedPayload {
    mysteryPlayerId: number;
    communityPlayerIds: number[];
    winners: number[];
    potAwarded: number;
    potTotal: number;
}

export interface MatchEndedPayload {
    finalChips: { userId: number; chips: number }[];
}

export interface RoomErrorPayload {
    message: string;
}
