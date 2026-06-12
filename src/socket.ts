import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { ENV } from './config/env';

let io: Server;

export function initializeSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: [ENV.FRONTEND_URL, 'http://localhost:3000', /\.xfoodi\.website$/],
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Join a room specific to a restaurant
    socket.on('join_restaurant', (restaurantId: string) => {
      if (restaurantId) {
        socket.join(`restaurant_${restaurantId}`);
        console.log(`[Socket] Socket ${socket.id} joined room: restaurant_${restaurantId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.io has not been initialized!');
  }
  return io;
}
