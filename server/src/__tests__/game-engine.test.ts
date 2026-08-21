import { describe, expect, it } from 'vitest';
import GameEngine, { SeatedPlayer } from '../game/game.engine';
import { GameEvent, RoundScenario } from '../types/game.types';

const PLAYERS: SeatedPlayer[] = [
    { userId: 1, seat: 0 },
    { userId: 2, seat: 1 },
    { userId: 3, seat: 2 },
];
const MYSTERY_PLAYER_ID = 999;

function makeScenario(): RoundScenario {
    return {
        mysteryPlayerId: MYSTERY_PLAYER_ID,
        communityPlayerIds: [101, 102, 103, 104, 105],
    };
}

/**
 * Drives every seat owed an action on the *current* street, in whatever
 * order the engine's turn queue produces (immune to dealer-rotation
 * details) — stops as soon as the stage moves on, since a single
 * applyAction call can itself cascade through several stages internally.
 */
function actUntilStageChanges(engine: GameEngine, action: 'check' | 'call'): void {
    const startingStage = engine.getSnapshot().stage;
    let turnUserId = engine.getSnapshot().turnUserId;
    while (turnUserId !== null && engine.getSnapshot().stage === startingStage) {
        engine.applyAction(turnUserId, action);
        turnUserId = engine.getSnapshot().turnUserId;
    }
}

function payloadOf(events: GameEvent[], type: string): Record<string, unknown> | undefined {
    return events.find((e) => e.type === type)?.payload as Record<string, unknown> | undefined;
}

describe('GameEngine', () => {
    it('runs a full round to REVEAL when everyone checks every street', () => {
        const engine = new GameEngine('ABC123', PLAYERS, 5, 1000);
        engine.startRound(makeScenario());

        actUntilStageChanges(engine, 'check');
        expect(engine.getSnapshot().stage).toBe('FLOP_BETTING');
        expect(engine.getSnapshot().revealedCommunityPlayerIds).toHaveLength(3);

        actUntilStageChanges(engine, 'check');
        expect(engine.getSnapshot().stage).toBe('TURN_BETTING');
        expect(engine.getSnapshot().revealedCommunityPlayerIds).toHaveLength(4);

        actUntilStageChanges(engine, 'check');
        expect(engine.getSnapshot().stage).toBe('RIVER_BETTING');
        expect(engine.getSnapshot().revealedCommunityPlayerIds).toHaveLength(5);

        actUntilStageChanges(engine, 'check');
        expect(engine.getSnapshot().stage).toBe('SHOWDOWN');

        engine.submitGuess(1, MYSTERY_PLAYER_ID);
        engine.submitGuess(2, 1);
        const events = engine.submitGuess(3, 2);

        const revealPayload = payloadOf(events, 'round:revealed');
        expect(revealPayload).toMatchObject({ mysteryPlayerId: MYSTERY_PLAYER_ID, winners: [1], potAwarded: 0 });

        const snapshot = engine.getSnapshot();
        expect(snapshot.stage).toBe('REVEAL');
        expect(snapshot.mysteryPlayerId).toBe(MYSTERY_PLAYER_ID);
        expect(snapshot.players.find((p) => p.userId === 1)!.chips).toBe(1000); // nobody bet, so no chip movement
    });

    it('rejects an action from a player whose turn it is not', () => {
        const engine = new GameEngine('ABC123', PLAYERS, 5);
        engine.startRound(makeScenario());

        const turnUserId = engine.getSnapshot().turnUserId!;
        const wrongUserId = PLAYERS.map((p) => p.userId).find((id) => id !== turnUserId)!;

        expect(() => engine.applyAction(wrongUserId, 'check')).toThrow('It is not your turn');
    });

    it('awards the pot uncontested — without a showdown — when everyone else folds', () => {
        const engine = new GameEngine('ABC123', PLAYERS, 5, 1000);
        engine.startRound(makeScenario());

        const raiser = engine.getSnapshot().turnUserId!;
        engine.applyAction(raiser, 'raise', 100);

        let events: GameEvent[] = [];
        let turnUserId = engine.getSnapshot().turnUserId;
        while (turnUserId !== null) {
            events = engine.applyAction(turnUserId, 'fold');
            turnUserId = engine.getSnapshot().turnUserId;
        }

        const revealPayload = payloadOf(events, 'round:revealed');
        expect(revealPayload).toMatchObject({ winners: [raiser] });

        const snapshot = engine.getSnapshot();
        expect(snapshot.stage).toBe('REVEAL');
        expect(snapshot.players.find((p) => p.userId === raiser)!.chips).toBe(1000); // raised 100, won it back
    });

    it('caps a call at the player\'s remaining chips instead of erroring, per the no-side-pots rule', () => {
        const engine = new GameEngine('ABC123', PLAYERS, 5, 50);
        engine.startRound(makeScenario());

        const raiser = engine.getSnapshot().turnUserId!;
        engine.applyAction(raiser, 'raise', 50); // shoves their whole stack

        let turnUserId = engine.getSnapshot().turnUserId;
        while (turnUserId !== null) {
            engine.applyAction(turnUserId, 'call');
            turnUserId = engine.getSnapshot().turnUserId;
        }

        const snapshot = engine.getSnapshot();
        for (const player of snapshot.players) {
            expect(player.chips).toBe(0);
            expect(player.isAllIn).toBe(true);
        }
        // Everyone all-in with nothing left to bet — the engine should skip straight through to SHOWDOWN.
        expect(snapshot.stage).toBe('SHOWDOWN');
        expect(snapshot.pot).toBe(150);
    });

    it('carries the pot over to the next round when nobody guesses correctly', () => {
        const engine = new GameEngine('ABC123', PLAYERS, 5, 1000);
        engine.startRound(makeScenario());

        const raiser = engine.getSnapshot().turnUserId!;
        engine.applyAction(raiser, 'raise', 60);
        actUntilStageChanges(engine, 'call');
        actUntilStageChanges(engine, 'check'); // flop
        actUntilStageChanges(engine, 'check'); // turn
        actUntilStageChanges(engine, 'check'); // river
        expect(engine.getSnapshot().stage).toBe('SHOWDOWN');

        engine.submitGuess(1, 1);
        engine.submitGuess(2, 2);
        const events = engine.submitGuess(3, 3);

        const revealPayload = payloadOf(events, 'round:revealed');
        expect(revealPayload).toMatchObject({ winners: [], potAwarded: 0, potTotal: 180 });

        engine.finishRound();
        expect(engine.getSnapshot().stage).toBe('ROUND_END');

        engine.startRound(makeScenario());
        expect(engine.getSnapshot().pot).toBe(180); // carried over, per PLAN.md §5.4
    });

    it('syncSeatedPlayers folds in players who join after the engine already exists (lobby timing)', () => {
        // Mirrors RoomManager#register: the engine is created off whoever has connected so far
        // (typically just the host, from the lobby) — a later joiner must still show up before
        // the round starts, or a 1-player roster makes any first action instantly uncontested.
        const engine = new GameEngine('ABC123', [{ userId: 1, seat: 0 }], 5, 1000);
        expect(engine.getSnapshot().players).toHaveLength(1);

        engine.syncSeatedPlayers([
            { userId: 1, seat: 0 },
            { userId: 2, seat: 1 },
        ]);
        expect(engine.getSnapshot().players.map((p) => p.userId)).toEqual([1, 2]);

        engine.startRound(makeScenario());
        const firstActor = engine.getSnapshot().turnUserId!;
        const events = engine.applyAction(firstActor, 'raise', 50);

        // A single action from a 2-player table must never resolve the round by itself.
        expect(payloadOf(events, 'round:revealed')).toBeUndefined();
        expect(engine.getSnapshot().stage).toBe('PREFLOP_BETTING');
    });

    it('syncSeatedPlayers is a no-op once a round is underway', () => {
        const engine = new GameEngine('ABC123', PLAYERS, 5, 1000);
        engine.startRound(makeScenario());

        engine.syncSeatedPlayers([...PLAYERS, { userId: 4, seat: 3 }]);
        expect(engine.getSnapshot().players.map((p) => p.userId)).toEqual([1, 2, 3]);
    });

    it('syncSeatedPlayers prunes a player who left the lobby before the round started', () => {
        const engine = new GameEngine('ABC123', PLAYERS, 5, 1000);
        engine.syncSeatedPlayers([
            { userId: 1, seat: 0 },
            { userId: 2, seat: 1 },
        ]);
        expect(engine.getSnapshot().players.map((p) => p.userId)).toEqual([1, 2]);
    });

    describe('leaveGame', () => {
        it('auto-folds and advances the turn when it was the leaver\'s turn to act', () => {
            const engine = new GameEngine('ABC123', PLAYERS, 5, 1000);
            engine.startRound(makeScenario());
            const leaver = engine.getSnapshot().turnUserId!;

            const events = engine.leaveGame(leaver);

            const snapshot = engine.getSnapshot();
            expect(snapshot.stage).toBe('PREFLOP_BETTING');
            expect(snapshot.players.find((p) => p.userId === leaver)).toMatchObject({
                isActive: false,
                isFolded: true,
            });
            expect(snapshot.turnUserId).not.toBe(leaver);
            expect(payloadOf(events, 'player:left')).toMatchObject({ userId: leaver });
        });

        it('removes a queued (not-yet-acted) player without disrupting whoever is currently on the clock', () => {
            const engine = new GameEngine('ABC123', PLAYERS, 5, 1000);
            engine.startRound(makeScenario());
            const currentTurn = engine.getSnapshot().turnUserId!;
            const queuedLeaver = PLAYERS.map((p) => p.userId).find((id) => id !== currentTurn)!;

            engine.leaveGame(queuedLeaver);

            const snapshot = engine.getSnapshot();
            expect(snapshot.turnUserId).toBe(currentTurn);
            expect(snapshot.stage).toBe('PREFLOP_BETTING');
            expect(snapshot.players.find((p) => p.userId === queuedLeaver)).toMatchObject({
                isActive: false,
                isFolded: true,
            });
        });

        it('resolves the round uncontested when it drops non-folded players to one', () => {
            const engine = new GameEngine('ABC123', PLAYERS, 5, 1000);
            engine.startRound(makeScenario());
            const firstToAct = engine.getSnapshot().turnUserId!;
            engine.applyAction(firstToAct, 'fold');

            const remaining = engine
                .getSnapshot()
                .players.filter((p) => !p.isFolded)
                .map((p) => p.userId);
            const [staying, leaving] = remaining;

            const events = engine.leaveGame(leaving);

            const revealPayload = payloadOf(events, 'round:revealed');
            expect(revealPayload).toMatchObject({ winners: [staying] });
            expect(engine.getSnapshot().stage).toBe('REVEAL');
        });

        it('outside a betting stage just marks the player inactive, without touching fold state', () => {
            const engine = new GameEngine('ABC123', PLAYERS, 5, 1000);
            engine.startRound(makeScenario());
            actUntilStageChanges(engine, 'check');
            actUntilStageChanges(engine, 'check');
            actUntilStageChanges(engine, 'check');
            actUntilStageChanges(engine, 'check');
            expect(engine.getSnapshot().stage).toBe('SHOWDOWN');

            const events = engine.leaveGame(3);

            const player = engine.getSnapshot().players.find((p) => p.userId === 3)!;
            expect(player.isActive).toBe(false);
            expect(player.isFolded).toBe(false);
            expect(engine.getSnapshot().stage).toBe('SHOWDOWN');
            expect(payloadOf(events, 'round:revealed')).toBeUndefined();
        });

        it('is a no-op for an unknown or already-departed player', () => {
            const engine = new GameEngine('ABC123', PLAYERS, 5, 1000);
            engine.startRound(makeScenario());

            expect(engine.leaveGame(999)).toEqual([]);

            const leaver = engine.getSnapshot().turnUserId!;
            engine.leaveGame(leaver);
            expect(engine.leaveGame(leaver)).toEqual([]);
        });
    });

    it('lets a non-folded player guess (and re-guess) as soon as the round starts, well before SHOWDOWN', () => {
        const engine = new GameEngine('ABC123', PLAYERS, 5, 1000);
        engine.startRound(makeScenario());
        expect(engine.getSnapshot().stage).toBe('PREFLOP_BETTING');

        const events = engine.submitGuess(2, 1);
        expect(payloadOf(events, 'player:guessed')).toEqual({ userId: 2, hasGuessed: true });
        expect(events.find((e) => e.type === 'your:guess')).toMatchObject({
            scope: { userId: 2 },
            payload: { footballPlayerId: 1 },
        });
        expect(engine.getMyGuess(2)).toBe(1);

        // Never locked in — the same player can change their mind any time before REVEAL.
        engine.submitGuess(2, 7);
        expect(engine.getMyGuess(2)).toBe(7);

        // Broadcast state reveals *that* player 2 has guessed, never *what*.
        const snapshot = engine.getSnapshot();
        const p2 = snapshot.players.find((p) => p.userId === 2)!;
        expect(p2.hasGuessed).toBe(true);
        expect(p2.guess).toBeNull();
    });

    it('rejects a guess once a player has folded, and rejects guessing outside a live round', () => {
        const engine = new GameEngine('ABC123', PLAYERS, 5, 1000);
        expect(() => engine.submitGuess(1, 1)).toThrow('Guesses are not accepted right now'); // still WAITING

        engine.startRound(makeScenario());
        const raiser = engine.getSnapshot().turnUserId!;
        engine.applyAction(raiser, 'fold');

        expect(() => engine.submitGuess(raiser, 1)).toThrow('Folded players cannot guess');
    });

    it('ends the match after maxRounds and reports final chip counts', () => {
        const engine = new GameEngine('ABC123', PLAYERS, 1, 1000);
        engine.startRound(makeScenario());
        actUntilStageChanges(engine, 'check');
        actUntilStageChanges(engine, 'check');
        actUntilStageChanges(engine, 'check');
        actUntilStageChanges(engine, 'check');
        expect(engine.getSnapshot().stage).toBe('SHOWDOWN');

        engine.submitGuess(1, MYSTERY_PLAYER_ID);
        engine.submitGuess(2, 1);
        engine.submitGuess(3, 2);

        const finishEvents = engine.finishRound();
        expect(engine.getSnapshot().stage).toBe('MATCH_END');
        expect(payloadOf(finishEvents, 'match:ended')).toBeDefined();
    });
});
