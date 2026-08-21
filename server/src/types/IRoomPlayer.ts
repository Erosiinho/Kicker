export default interface IRoomPlayer {
    id: number;
    roomId: number;
    userId: number;
    seat: number;
    chips: number;
    isActive: boolean;
}
