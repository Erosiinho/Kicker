import { Router } from 'express';
import RoomController from '../controllers/room.controller';

export default function roomRoutes(controller: RoomController): Router {
    const router = Router();

    router.post('/', controller.create);
    router.post('/:code/join', controller.join);
    router.get('/:code', controller.get);

    return router;
}
