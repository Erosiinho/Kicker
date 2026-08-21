import { z } from 'zod';
import FootballPlayerService from '../../services/football-player.service';
import asyncController from './controller';
import { BadRequestError } from '../errors';

const idsSchema = z
    .string()
    .transform((s) => s.split(',').map((id) => Number(id.trim())))
    .refine((ids) => ids.every((id) => Number.isInteger(id) && id > 0), 'ids must be a comma-separated list of positive integers');

export default class FootballPlayerController {
    constructor(private footballPlayerService: FootballPlayerService) {}

    list = asyncController(async (req, res) => {
        if (typeof req.query.ids === 'string') {
            const parsed = idsSchema.safeParse(req.query.ids);
            if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? 'Invalid ids');
            res.status(200).json(await this.footballPlayerService.getByIds(parsed.data));
            return;
        }

        const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        if (!query) throw new BadRequestError('q (search text) or ids is required');
        res.status(200).json(await this.footballPlayerService.search(query));
    });
}
