import type { IRoom, IUserStats, IFootballPlayer, RoomIdentity } from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'API Error');
    }
    return response.json();
}

export const api = {
    rooms: {
        async create(displayName: string, guestId?: string, maxRounds?: number): Promise<RoomIdentity> {
            const response = await fetch(`${API_BASE_URL}/rooms`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName, guestId, maxRounds }),
            });
            return handleResponse<RoomIdentity>(response);
        },

        async join(code: string, displayName: string, guestId: string): Promise<RoomIdentity> {
            const response = await fetch(`${API_BASE_URL}/rooms/${code}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName, guestId }),
            });
            return handleResponse<RoomIdentity>(response);
        },

        async get(code: string): Promise<IRoom> {
            const response = await fetch(`${API_BASE_URL}/rooms/${code}`);
            return handleResponse<IRoom>(response);
        },
    },

    users: {
        async getStats(guestId: string): Promise<IUserStats> {
            const response = await fetch(`${API_BASE_URL}/users/${guestId}/stats`);
            return handleResponse<IUserStats>(response);
        },
    },

    footballPlayers: {
        async search(query: string): Promise<IFootballPlayer[]> {
            const response = await fetch(`${API_BASE_URL}/football-players?q=${encodeURIComponent(query)}`);
            return handleResponse<IFootballPlayer[]>(response);
        },

        async getByIds(ids: number[]): Promise<IFootballPlayer[]> {
            if (ids.length === 0) return [];
            const response = await fetch(`${API_BASE_URL}/football-players?ids=${ids.join(',')}`);
            return handleResponse<IFootballPlayer[]>(response);
        },
    },
};
