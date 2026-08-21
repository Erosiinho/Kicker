export default interface IRoundHistory {
    id: number;
    roomId: number;
    roundNumber: number;
    mysteryPlayerId: number;
    communityPlayerIds: number[];
    winnerUserIds: number[];
    potAwarded: number;
    playedAt: Date;
}
