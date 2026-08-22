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

/**
 * Stages during which a non-folded player may submit/change their secret Mystery Player
 * guess (PLAN.md's "Proposed gameplay change" — the guess is never locked, so this spans
 * the whole live round rather than being confined to a single showdown window). DEALING,
 * FLOP, TURN and RIVER never linger long enough for a client action to land during them —
 * GameEngine always synchronously advances straight into the following betting stage — so
 * they're intentionally left out here.
 */
export const GUESSABLE_STAGES: readonly Stage[] = [...BETTING_STAGES, 'SHOWDOWN'];

export type PlayerActionType = 'check' | 'call' | 'raise' | 'fold';

/**
 * Output of link-engine.service.ts#generateRoundScenario (PLAN.md §4).
 * mysteryPlayerId stays server-side/opaque to GameEngine's public snapshots
 * until REVEAL — see getSnapshot()'s redaction in GameEngine.ts. No more
 * per-player hole cards (superseded by the secret-guess mechanic — see
 * PlayerState#guess): the puzzle is now just the Mystery Player + the 5
 * community cards, deduced purely from the shared board and betting reads.
 */
export interface RoundScenario {
    mysteryPlayerId: number;
    communityPlayerIds: [number, number, number, number, number];
}

/**
 * One non-folded player's guess scored against the round's 5 community cards — the
 * "closest link" win condition (link-engine.service.ts#scoreGuesses): guessing the exact
 * Mystery Player always scores 5 (every community card is one of its teammates by
 * construction), but a guess merely close to it can still win if nobody did better.
 */
export interface GuessScore {
    userId: number;
    footballPlayerId: number;
    linkCount: number;
}

export interface PlayerState {
    userId: number;
    seat: number;
    chips: number;
    isActive: boolean; // still seated for future rounds (not busted/removed)
    isFolded: boolean; // folded this round
    isAllIn: boolean;
    currentBet: number; // chips committed to the pot this betting stage
    /**
     * The player's current secret Mystery Player guess — re-submittable any time during
     * GUESSABLE_STAGES, never locked in. Redacted to null in every broadcast snapshot
     * before REVEAL (see GameEngine#getSnapshot); a player only ever learns their own
     * current value via GameEngine#getMyGuess (per-socket) or the `your:guess` event.
     */
    guess: number | null;
    /** Broadcast-safe companion to `guess` — reveals *that* a guess exists, never *what* it is, pre-REVEAL. */
    hasGuessed: boolean;
}

export interface GameState {
    roomCode: string;
    round: number;
    maxRounds: number;
    stage: Stage;
    dealerSeat: number;
    turnUserId: number | null;
    pot: number;
    minRaise: number;
    currentBet: number; // highest currentBet among players this betting stage
    /**
     * Only populated from REVEAL onward — kept out of every snapshot before
     * that so GameEngine can never accidentally leak it early. Each player's
     * own live guess is never part of GameState at all; it's delivered
     * per-socket via GameEngine#getMyGuess / the `your:guess` event, never
     * broadcast room-wide.
     */
    mysteryPlayerId: number | null;
    revealedCommunityPlayerIds: number[]; // grows 0 -> 3 -> 4 -> 5 across FLOP/TURN/RIVER
    players: PlayerState[];
}

/**
 * Everything GameEngine's public methods return: what happened, addressed
 * either to the whole room or to one specific player. The socket gateway
 * (sockets/game.gateway.ts) is the only place that turns these into actual
 * io.to(...).emit(...) calls — GameEngine itself never touches a socket.
 */
export type GameEventScope = 'room' | { userId: number };

export interface GameEvent {
    scope: GameEventScope;
    type: string;
    payload: unknown;
}
