import express, { Express } from 'express';
import cors from 'cors';
import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import IDb from './database/db';

import UserRepository from './repositories/user.repository';
import RoomRepository from './repositories/room.repository';
import FootballPlayerRepository from './repositories/football-player.repository';
import RoundHistoryRepository from './repositories/round-history.repository';

import UserService from './services/user.service';
import RoomService from './services/room.service';
import LinkEngineService from './services/link-engine.service';
import RoundHistoryService from './services/round-history.service';
import FootballPlayerService from './services/football-player.service';

import RoomManager from './game/room.manager';
import GameGateway, { SocketRegistry, createEmitEvents } from './sockets/game.gateway';

import UserController from './http/controllers/user.controller';
import RoomController from './http/controllers/room.controller';
import FootballPlayerController from './http/controllers/football-player.controller';
import roomRoutes from './http/routes/room.routes';
import userRoutes from './http/routes/user.routes';
import footballPlayerRoutes from './http/routes/football-player.routes';
import errorMiddleware from './http/middlewares/error';

export interface App {
    app: Express;
    server: http.Server;
    io: SocketIOServer;
}

/** DI root: wires DB -> repository -> service -> controller/gateway (PLAN.md's layering). */
export function createApp(db: IDb): App {
    const userRepository = new UserRepository(db);
    const roomRepository = new RoomRepository(db);
    const footballPlayerRepository = new FootballPlayerRepository(db);
    const roundHistoryRepository = new RoundHistoryRepository(db);

    const userService = new UserService(userRepository);
    const roomService = new RoomService(roomRepository, userRepository);
    const linkEngineService = new LinkEngineService(footballPlayerRepository);
    const roundHistoryService = new RoundHistoryService(roundHistoryRepository, userRepository);
    const footballPlayerService = new FootballPlayerService(footballPlayerRepository);

    const app = express();
    app.use(cors());
    app.use(express.json());

    const roomController = new RoomController(roomService);
    const userController = new UserController(userService);
    const footballPlayerController = new FootballPlayerController(footballPlayerService);
    app.use('/api/rooms', roomRoutes(roomController));
    app.use('/api/users', userRoutes(userController));
    app.use('/api/football-players', footballPlayerRoutes(footballPlayerController));

    // Registered AFTER routes — an error middleware mounted earlier never sees their errors (Express requirement).
    app.use(errorMiddleware);

    const server = http.createServer(app);
    const io = new SocketIOServer(server, { cors: { origin: '*' } });

    const registry = new SocketRegistry();
    const emitEvents = createEmitEvents(io, registry);
    const roomManager = new RoomManager(linkEngineService, roundHistoryService, roomRepository, emitEvents);
    new GameGateway(io, roomManager, roomService, userRepository, registry);

    return { app, server, io };
}
