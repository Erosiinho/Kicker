import {
    BETTING_STAGES,
    GameEvent,
    GameState,
    GUESSABLE_STAGES,
    PlayerActionType,
    PlayerState,
    RoundScenario,
    Stage,
} from '../types/game.types';
import { IllegalActionError, NotYourTurnError } from './errors';

const STARTING_CHIPS_DEFAULT = 1000;
const MIN_RAISE_INCREMENT = Number(process.env.MIN_RAISE_INCREMENT) || 20;
export const SHOWDOWN_TIME_LIMIT_MS = Number(process.env.SHOWDOWN_TIME_LIMIT_MS) || 30000;

export interface SeatedPlayer {
    userId: number;
    seat: number;
}

const STAGE_AFTER_BETTING: Partial<Record<Stage, Stage>> = {
    PREFLOP_BETTING: 'FLOP',
    FLOP_BETTING: 'TURN',
    TURN_BETTING: 'RIVER',
    RIVER_BETTING: 'SHOWDOWN',
};

const BETTING_STAGE_AFTER_REVEAL: Partial<Record<Stage, Stage>> = {
    FLOP: 'FLOP_BETTING',
    TURN: 'TURN_BETTING',
    RIVER: 'RIVER_BETTING',
};

/**
 * One instance per active room (held by game/RoomManager.ts). Pure state
 * machine — no DB/socket I/O. Every public method returns the GameEvent[] the
 * caller (the socket gateway) should emit; nothing is broadcast from in here.
 * See PLAN.md §5 for the stage diagram and betting-rule rationale.
 */
export default class GameEngine {
    readonly roomCode: string;
    private state: GameState;
    private scenario: RoundScenario | null = null;
    private toActUserIds: number[] = [];
    private carriedPot = 0; // no-winner carryover (PLAN.md §5.4)

    constructor(
        roomCode: string,
        seatedPlayers: SeatedPlayer[],
        maxRounds: number,
        startingChips = STARTING_CHIPS_DEFAULT,
    ) {
        this.roomCode = roomCode;
        this.state = {
            roomCode,
            round: 0,
            maxRounds,
            stage: 'WAITING',
            dealerSeat: seatedPlayers[0]?.seat ?? 0,
            turnUserId: null,
            pot: 0,
            minRaise: MIN_RAISE_INCREMENT,
            currentBet: 0,
            mysteryPlayerId: null,
            revealedCommunityPlayerIds: [],
            players: seatedPlayers
                .slice()
                .sort((a, b) => a.seat - b.seat)
                .map(
                    (p): PlayerState => ({
                        userId: p.userId,
                        seat: p.seat,
                        chips: startingChips,
                        isActive: true,
                        isFolded: false,
                        isAllIn: false,
                        currentBet: 0,
                        guess: null,
                        hasGuessed: false,
                    }),
                ),
        };
    }

    /**
     * Public, broadcast-safe state. mysteryPlayerId and each player's actual guess stay
     * redacted (null) until REVEAL — hasGuessed is always truthful, since it only reveals
     * *that* a player has committed a guess, never *what* it is (PLAN.md's secret-guess design).
     */
    getSnapshot(): GameState {
        const revealed =
            this.state.stage === 'REVEAL' ||
            this.state.stage === 'ROUND_END' ||
            this.state.stage === 'MATCH_END';
        return {
            ...this.state,
            mysteryPlayerId: revealed ? this.state.mysteryPlayerId : null,
            revealedCommunityPlayerIds: [...this.state.revealedCommunityPlayerIds],
            players: this.state.players.map((p) => ({
                ...p,
                guess: revealed ? p.guess : null,
                hasGuessed: p.guess !== null,
            })),
        };
    }

    /** The one place a player's own live guess leaves the engine unredacted — always addressed to a single socket, never broadcast. */
    getMyGuess(userId: number): number | null {
        return this.state.players.find((p) => p.userId === userId)?.guess ?? null;
    }

    /**
     * Reconciles the roster against the room's current DB player list. Needed because the engine
     * is created the moment the *first* socket joins a room (RoomManager#register) — typically the
     * host, connecting from the lobby before anyone else has joined — and every later join must
     * still be reflected here, or a round can start seated with only that first player. A no-op
     * once a round is underway: RoomService already blocks new REST joins by then (PLAN.md §9.7),
     * so there is nothing new to reconcile and mid-round seating must never change.
     */
    syncSeatedPlayers(seatedPlayers: SeatedPlayer[], startingChips = STARTING_CHIPS_DEFAULT): void {
        if (this.state.stage !== 'WAITING') return;
        const known = new Set(this.state.players.map((p) => p.userId));
        for (const sp of seatedPlayers) {
            if (known.has(sp.userId)) continue;
            this.state.players.push({
                userId: sp.userId,
                seat: sp.seat,
                chips: startingChips,
                isActive: true,
                isFolded: false,
                isAllIn: false,
                currentBet: 0,
                guess: null,
                hasGuessed: false,
            });
        }
        this.state.players.sort((a, b) => a.seat - b.seat);
    }

    startRound(scenario: RoundScenario): GameEvent[] {
        if (this.state.stage !== 'WAITING' && this.state.stage !== 'ROUND_END') {
            throw new IllegalActionError(`Cannot start a round from stage ${this.state.stage}`);
        }

        this.scenario = scenario;
        this.state.round += 1;
        this.state.mysteryPlayerId = null;
        this.state.revealedCommunityPlayerIds = [];
        this.state.dealerSeat = this.nextActiveSeatAfter(this.state.dealerSeat);
        this.state.pot = this.carriedPot;
        this.carriedPot = 0;
        this.state.stage = 'DEALING';

        for (const p of this.state.players) {
            p.currentBet = 0;
            p.isFolded = !p.isActive; // busted/left players sit out — treated like a standing fold
            p.isAllIn = false;
            p.guess = null;
        }

        const dealEvent: GameEvent = {
            scope: 'room',
            type: 'round:started',
            payload: { round: this.state.round, dealerSeat: this.state.dealerSeat },
        };

        return [dealEvent, ...this.beginBettingStage('PREFLOP_BETTING')];
    }

    applyAction(userId: number, type: PlayerActionType, amount?: number): GameEvent[] {
        if (!BETTING_STAGES.includes(this.state.stage)) {
            throw new IllegalActionError(`Cannot act during stage ${this.state.stage}`);
        }
        if (this.state.turnUserId !== userId) throw new NotYourTurnError();

        const player = this.getPlayerOrThrow(userId);
        if (player.isFolded || player.isAllIn) {
            throw new IllegalActionError('Player cannot act (folded or all-in)');
        }

        switch (type) {
            case 'fold':
                player.isFolded = true;
                break;
            case 'check':
                this.handleCheck(player);
                break;
            case 'call':
                this.handleCall(player);
                break;
            case 'raise':
                this.handleRaise(player, amount);
                break;
            default:
                throw new IllegalActionError(`Unknown action type ${type as string}`);
        }

        if (type !== 'raise') {
            // Raises already rebuilt the queue starting after the raiser; every
            // other action just advances past the current front of the queue.
            this.toActUserIds.shift();
        }
        this.state.turnUserId = this.toActUserIds[0] ?? null;

        const actedEvent: GameEvent = {
            scope: 'room',
            type: 'player:acted',
            payload: {
                userId,
                action: type,
                amount: player.currentBet,
                potTotal: this.state.pot,
                currentBet: this.state.currentBet,
                minRaise: this.state.minRaise,
                nextTurnUserId: this.state.turnUserId,
                players: this.getSnapshot().players,
            },
        };

        const nonFolded = this.state.players.filter((p) => p.isActive && !p.isFolded);
        if (nonFolded.length <= 1) {
            return [actedEvent, ...this.resolveRound(nonFolded.map((p) => p.userId))];
        }
        if (this.toActUserIds.length === 0) {
            return [actedEvent, ...this.closeBettingRoundAndAdvance()];
        }
        return [actedEvent];
    }

    /**
     * Submits or changes a player's secret guess — never locked in, so this can be called
     * repeatedly with a different footballPlayerId any time during GUESSABLE_STAGES. The
     * guess itself is never broadcast (see getSnapshot()'s redaction); the room only ever
     * learns *that* this player has one via the `player:guessed` event, while the guesser
     * gets their own value echoed back via the per-socket `your:guess` event.
     */
    submitGuess(userId: number, footballPlayerId: number): GameEvent[] {
        if (!GUESSABLE_STAGES.includes(this.state.stage)) {
            throw new IllegalActionError('Guesses are not accepted right now');
        }
        const player = this.getPlayerOrThrow(userId);
        if (player.isFolded) throw new IllegalActionError('Folded players cannot guess');

        player.guess = footballPlayerId;

        const events: GameEvent[] = [
            { scope: 'room', type: 'player:guessed', payload: { userId, hasGuessed: true } },
            { scope: { userId }, type: 'your:guess', payload: { footballPlayerId } },
        ];

        if (this.state.stage === 'SHOWDOWN') {
            const nonFolded = this.state.players.filter((p) => p.isActive && !p.isFolded);
            if (nonFolded.every((p) => p.guess !== null)) {
                return [...events, ...this.resolveShowdown()];
            }
        }
        return events;
    }

    /** Called by RoomManager when a room's SHOWDOWN timer expires — unsubmitted guesses count as incorrect. */
    forceResolveShowdown(): GameEvent[] {
        if (this.state.stage !== 'SHOWDOWN') return [];
        return this.resolveShowdown();
    }

    /** Advances past REVEAL once the gateway has had a chance to persist round history / broadcast the reveal. */
    finishRound(): GameEvent[] {
        for (const player of this.state.players) {
            if (player.chips <= 0) player.isActive = false; // busted
        }
        const stillIn = this.state.players.filter((p) => p.isActive);

        if (this.state.round >= this.state.maxRounds || stillIn.length <= 1) {
            this.state.stage = 'MATCH_END';
            return [
                {
                    scope: 'room',
                    type: 'match:ended',
                    payload: {
                        finalChips: this.state.players.map((p) => ({ userId: p.userId, chips: p.chips })),
                    },
                },
            ];
        }

        this.state.stage = 'ROUND_END';
        return [
            {
                scope: 'room',
                type: 'stage:advanced',
                payload: {
                    stage: 'ROUND_END',
                    revealedCommunityPlayerIds: [...this.state.revealedCommunityPlayerIds],
                    pot: this.state.pot,
                    currentBet: this.state.currentBet,
                    minRaise: this.state.minRaise,
                    turnUserId: null,
                    players: this.getSnapshot().players,
                },
            },
        ];
    }

    private resolveShowdown(): GameEvent[] {
        const scenario = this.scenario!;
        const nonFolded = this.state.players.filter((p) => p.isActive && !p.isFolded);
        const winners = nonFolded.filter((p) => p.guess === scenario.mysteryPlayerId).map((p) => p.userId);
        return this.resolveRound(winners);
    }

    /** PLAN.md §5's showdown resolution: even split, remainder discarded, no-winner carryover. Also used for uncontested folds. */
    private resolveRound(winnerUserIds: number[]): GameEvent[] {
        const scenario = this.scenario!;
        this.state.mysteryPlayerId = scenario.mysteryPlayerId;
        this.state.revealedCommunityPlayerIds = [...scenario.communityPlayerIds];

        const potTotal = this.state.pot;
        let potAwarded = 0;
        if (winnerUserIds.length > 0) {
            potAwarded = Math.floor(potTotal / winnerUserIds.length);
            for (const userId of winnerUserIds) {
                this.getPlayerOrThrow(userId).chips += potAwarded;
            }
            this.carriedPot = 0;
        } else {
            this.carriedPot = potTotal;
        }

        this.state.pot = 0;
        this.state.stage = 'REVEAL';
        this.state.turnUserId = null;
        this.toActUserIds = [];

        return [
            {
                scope: 'room',
                type: 'round:revealed',
                payload: {
                    mysteryPlayerId: scenario.mysteryPlayerId,
                    communityPlayerIds: scenario.communityPlayerIds,
                    winners: winnerUserIds,
                    potAwarded,
                    potTotal,
                },
            },
        ];
    }

    private closeBettingRoundAndAdvance(): GameEvent[] {
        const nonFolded = this.state.players.filter((p) => p.isActive && !p.isFolded);
        if (nonFolded.length <= 1) {
            return this.resolveRound(nonFolded.map((p) => p.userId));
        }

        const nextStage = STAGE_AFTER_BETTING[this.state.stage];
        if (!nextStage) throw new IllegalActionError(`No next stage defined after ${this.state.stage}`);

        if (nextStage === 'SHOWDOWN') {
            this.state.stage = 'SHOWDOWN';
            this.state.turnUserId = null;
            return [{ scope: 'room', type: 'showdown:started', payload: { timeLimitMs: SHOWDOWN_TIME_LIMIT_MS } }];
        }
        return this.revealCommunityStage(nextStage);
    }

    private revealCommunityStage(stage: Stage): GameEvent[] {
        const scenario = this.scenario!;
        const revealCount = stage === 'FLOP' ? 3 : 1;
        const nextIds = scenario.communityPlayerIds.slice(
            this.state.revealedCommunityPlayerIds.length,
            this.state.revealedCommunityPlayerIds.length + revealCount,
        );
        this.state.revealedCommunityPlayerIds.push(...nextIds);
        this.state.stage = stage;

        const revealEvent: GameEvent = {
            scope: 'room',
            type: 'stage:advanced',
            payload: {
                stage,
                revealedCommunityPlayerIds: [...this.state.revealedCommunityPlayerIds],
                pot: this.state.pot,
                currentBet: this.state.currentBet,
                minRaise: this.state.minRaise,
                turnUserId: null,
                players: this.getSnapshot().players,
            },
        };

        const bettingStage = BETTING_STAGE_AFTER_REVEAL[stage]!;
        return [revealEvent, ...this.beginBettingStage(bettingStage)];
    }

    private beginBettingStage(stage: Stage): GameEvent[] {
        this.state.stage = stage;
        this.state.currentBet = 0;
        this.state.minRaise = MIN_RAISE_INCREMENT;
        for (const p of this.state.players) if (!p.isFolded) p.currentBet = 0;

        this.toActUserIds = this.orderedEligibleUserIds(
            this.state.dealerSeat,
            (p) => p.isActive && !p.isFolded && !p.isAllIn,
        );
        this.state.turnUserId = this.toActUserIds[0] ?? null;

        if (this.toActUserIds.length === 0) {
            // Everyone still in the hand is all-in — no more betting is possible, skip straight through.
            return this.closeBettingRoundAndAdvance();
        }

        return [
            {
                scope: 'room',
                type: 'stage:advanced',
                payload: {
                    stage,
                    revealedCommunityPlayerIds: [...this.state.revealedCommunityPlayerIds],
                    pot: this.state.pot,
                    currentBet: this.state.currentBet,
                    minRaise: this.state.minRaise,
                    turnUserId: this.state.turnUserId,
                    players: this.getSnapshot().players,
                },
            },
        ];
    }

    private handleCheck(player: PlayerState): void {
        if (player.currentBet !== this.state.currentBet) {
            throw new IllegalActionError('Cannot check facing a bet — call, raise, or fold');
        }
    }

    private handleCall(player: PlayerState): void {
        const amountToCall = this.state.currentBet - player.currentBet;
        if (amountToCall <= 0) return; // nothing outstanding — equivalent to a check
        const actualPay = Math.min(amountToCall, player.chips);
        player.chips -= actualPay;
        player.currentBet += actualPay;
        this.state.pot += actualPay;
        if (player.chips === 0) player.isAllIn = true; // no side pots (PLAN.md §5) — covering it exactly still leaves them with nothing left to act with
    }

    private handleRaise(player: PlayerState, amount: number | undefined): void {
        const desiredBetLevel = amount ?? this.state.currentBet + this.state.minRaise;
        const maxPossibleBetLevel = player.currentBet + player.chips;
        const betLevel = Math.min(desiredBetLevel, maxPossibleBetLevel);

        if (betLevel <= this.state.currentBet) {
            throw new IllegalActionError('Raise must exceed the current bet');
        }
        const isAllInRaise = betLevel === maxPossibleBetLevel;
        if (!isAllInRaise && betLevel < this.state.currentBet + this.state.minRaise) {
            throw new IllegalActionError(`Raise must be at least ${this.state.minRaise} above the current bet`);
        }

        const additional = betLevel - player.currentBet;
        const raiseIncrement = betLevel - this.state.currentBet;
        player.chips -= additional;
        player.currentBet = betLevel;
        this.state.pot += additional;
        if (player.chips === 0) player.isAllIn = true;

        this.state.currentBet = betLevel;
        if (raiseIncrement > this.state.minRaise) this.state.minRaise = raiseIncrement;

        // A raise reopens the betting round — everyone else still in the hand owes a response.
        this.toActUserIds = this.orderedEligibleUserIds(
            player.seat,
            (p) => p.isActive && !p.isFolded && !p.isAllIn && p.userId !== player.userId,
        );
    }

    private orderedEligibleUserIds(startSeat: number, predicate: (p: PlayerState) => boolean): number[] {
        const eligible = this.state.players.filter(predicate);
        const bySeat = new Map(eligible.map((p) => [p.seat, p]));
        const seats = [...bySeat.keys()].sort((a, b) => a - b);
        const startIdx = seats.findIndex((s) => s > startSeat);
        const ordered = startIdx === -1 ? seats : [...seats.slice(startIdx), ...seats.slice(0, startIdx)];
        return ordered.map((seat) => bySeat.get(seat)!.userId);
    }

    private nextActiveSeatAfter(seat: number): number {
        const activeSeats = this.state.players
            .filter((p) => p.isActive)
            .map((p) => p.seat)
            .sort((a, b) => a - b);
        if (activeSeats.length === 0) return seat;
        return activeSeats.find((s) => s > seat) ?? activeSeats[0];
    }

    private getPlayerOrThrow(userId: number): PlayerState {
        const player = this.state.players.find((p) => p.userId === userId);
        if (!player) throw new IllegalActionError(`Unknown player ${userId} in room ${this.roomCode}`);
        return player;
    }
}
