import UserService from '../../services/user.service';
import asyncController from './controller';

export default class UserController {
    constructor(private userService: UserService) {}

    getStats = asyncController(async (req, res) => {
        const stats = await this.userService.getStats(String(req.params.guestId));
        res.status(200).json(stats);
    });
}
