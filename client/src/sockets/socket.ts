import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

let socket: Socket | null = null;
let currentJoin: { roomCode: string; guestId: string } | null = null;

/**
 * Singleton so every store/component talks to the same connection instead of opening several.
 * Registers a *persistent* 'connect' handler that re-sends room:join on every (re)connection —
 * socket.io reconnects automatically after a transport hiccup, and without this the server's
 * per-socket registry (game.gateway.ts's SocketRegistry) goes stale after any reconnect, silently
 * breaking every per-player event (hole cards, room:error) to that client until a full page reload.
 */
export function getSocket(): Socket {
    if (!socket) {
        socket = io(SOCKET_URL, { autoConnect: false });
        socket.on('connect', () => {
            if (currentJoin) socket!.emit('room:join', currentJoin);
        });
    }
    return socket;
}

/** Connects (if needed) and (re-)sends room:join — safe to call again after a reconnect. */
export function connectSocket(roomCode: string, guestId: string): Socket {
    const s = getSocket();
    currentJoin = { roomCode, guestId };
    if (s.connected) s.emit('room:join', currentJoin);
    else s.connect();
    return s;
}

export function disconnectSocket(): void {
    currentJoin = null;
    socket?.disconnect();
}
