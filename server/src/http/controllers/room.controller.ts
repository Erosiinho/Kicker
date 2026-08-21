import { z } from 'zod';
import RoomService from '../../services/room.service';
import asyncController from './controller';
import { BadRequestError } from '../errors';

const createRoomSchema = z.object({
    displayName: z.string().trim().min(1).max(40),
    guestId: z.string().uuid().optional(),
    maxRounds: z.number().int().min(1).max(50).optional(),
});

const joinRoomSchema = z.object({
    displayName: z.string().trim().min(1).max(40),
    guestId: z.string().uuid(),
});

export default class RoomController {
    constructor(private roomService: RoomService) {}

    create = asyncController(async (req, res) => {
        const parsed = createRoomSchema.safeParse(req.body);
        if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? 'Invalid body');

        const result = await this.roomService.createRoom(
            parsed.data.displayName,
            parsed.data.guestId,
            parsed.data.maxRounds,
        );
        res.status(201).json(result);
    });

    join = asyncController(async (req, res) => {
        const parsed = joinRoomSchema.safeParse(req.body);
        if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? 'Invalid body');

        const result = await this.roomService.joinRoom(
            String(req.params.code).toUpperCase(),
            parsed.data.displayName,
            parsed.data.guestId,
        );
        res.status(200).json(result);
    });

    get = asyncController(async (req, res) => {
        const room = await this.roomService.getRoom(String(req.params.code).toUpperCase());
        res.status(200).json(room);
    });
}
