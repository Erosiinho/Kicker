import { Router } from 'express';
import FootballPlayerController from '../controllers/football-player.controller';

export default function footballPlayerRoutes(controller: FootballPlayerController): Router {
    const router = Router();

    router.get('/', controller.list);

    return router;
}
