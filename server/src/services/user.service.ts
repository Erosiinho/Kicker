import UserRepository from '../repositories/user.repository';
import { NotFoundError } from '../http/errors';
import IUser from '../types/IUser';

export default class UserService {
    constructor(private userRepository: UserRepository) {}

    async getStats(guestId: string): Promise<IUser> {
        const user = await this.userRepository.findByGuestId(guestId);
        if (!user) throw new NotFoundError(`No user with guestId ${guestId}`);
        return user;
    }
}
