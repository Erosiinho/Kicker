import FootballPlayerRepository from '../repositories/football-player.repository';
import IFootballPlayer from '../types/IFootballPlayer';

/** Read-only lookups the client's GuessModal (PLAN.md §7) needs — search by name, or resolve ids to display data. */
export default class FootballPlayerService {
    constructor(private footballPlayerRepository: FootballPlayerRepository) {}

    async search(query: string): Promise<IFootballPlayer[]> {
        return this.footballPlayerRepository.searchByName(query);
    }

    async getByIds(ids: number[]): Promise<IFootballPlayer[]> {
        return this.footballPlayerRepository.getByIds(ids);
    }
}
