import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { ENV } from '../../../config/env';

const SOCKET_PATH = '/hubs/social/socket.io';

let io: Server | null = null;

function getToken(socket: Socket): string | undefined {
  const auth = socket.handshake.auth as { token?: string };
  if (auth?.token) return auth.token;
  const header = socket.handshake.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}

/**
 * Socket.io realtime for social notifications (additive; legacy REST unchanged).
 */
export function initSocialRealtime(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    path: SOCKET_PATH,
    cors: {
      origin: [ENV.FRONTEND_URL, 'http://localhost:3000', /\.xfoodi\.website$/],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = getToken(socket);
    if (!token) {
      return next(new Error('Unauthorized'));
    }
    try {
      const decoded = jwt.verify(token, ENV.JWT.ACCESS_SECRET) as { sub?: string };
      if (!decoded.sub) return next(new Error('Unauthorized'));
      socket.data.userId = decoded.sub;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);
    socket.on('disconnect', () => {
      socket.leave(`user:${userId}`);
    });
  });

  console.log(`[SocialRealtime] Socket.io path: ${SOCKET_PATH}`);
  return io;
}

export function emitSocialNotification(userId: string, payload: Record<string, unknown>): void {
  if (!io) return;
  io.to(`user:${userId}`).emit('ReceiveNotification', payload);
  io.to(`user:${userId}`).emit('NotificationReceived', payload);
}

export function getSocialSocketPath(): string {
  return SOCKET_PATH;
}
