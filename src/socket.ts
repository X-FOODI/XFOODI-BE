import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { ENV } from './config/env';

let io: Server;

export function initializeSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: (origin: string | undefined, callback: any) => {
        if (!origin) return callback(null, true);
        const isLocalSubdomain = /^https?:\/\/[a-zA-Z0-9-]+\.localhost(:\d+)?$/.test(origin);
        const isProdSubdomain = /^https?:\/\/([a-zA-Z0-9-]+\.)?xfoodi\.website$/.test(origin);
        const allowed = isLocalSubdomain || isProdSubdomain || origin === 'http://localhost:3000' || origin === ENV.FRONTEND_URL;
        callback(null, allowed);
      },
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

    // Handle staff calls (e.g., call staff for cash checkout) and broadcast to the restaurant's room
    socket.on('CALL_STAFF', (data: any) => {
      if (data && data.restaurantId) {
        io.to(`restaurant_${data.restaurantId}`).emit('CALL_STAFF', data);
        console.log(`[Socket] Broadcasted CALL_STAFF from table ${data.tableCode} to room restaurant_${data.restaurantId}`);
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
