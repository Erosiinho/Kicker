import { RoomStatus } from '@prisma/client';

export default interface IRoom {
    id: number;
    code: string;
    status: RoomStatus;
    hostUserId: number;
    maxRounds: number;
    currentRound: number;
    createdAt: Date;
}

export { RoomStatus };
