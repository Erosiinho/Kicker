export default interface IUser {
    id: number;
    guestId: string;
    displayName: string;
    roundsPlayed: number;
    roundsWon: number;
    correctGuesses: number;
    createdAt: Date;
}
