import { Router } from 'express';
import UserController from '../controllers/user.controller';

export default function userRoutes(controller: UserController): Router {
    const router = Router();

    router.get('/:guestId/stats', controller.getStats);

    return router;
}
