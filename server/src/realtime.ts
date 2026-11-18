import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';

// WebSocket-комнаты: encounter:<id> (врач, загрузки со смартфона, статусы доставки) и cashier (касса).
const rooms = new Map<string, Set<WebSocket>>();

export function attachRealtime(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('error', () => undefined); // ошибки порта обрабатывает main.ts
  wss.on('connection', (ws) => {
    const joined = new Set<string>();
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as { type: string; room?: string };
        if (msg.type === 'subscribe' && msg.room) {
          if (!rooms.has(msg.room)) rooms.set(msg.room, new Set());
          rooms.get(msg.room)!.add(ws);
          joined.add(msg.room);
        }
        if (msg.type === 'unsubscribe' && msg.room) {
          rooms.get(msg.room)?.delete(ws);
          joined.delete(msg.room);
        }
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
      } catch { /* игнорируем мусор */ }
    });
    ws.on('close', () => joined.forEach((r) => rooms.get(r)?.delete(ws)));
  });
  // keepalive
  setInterval(() => wss.clients.forEach((c) => c.readyState === c.OPEN && c.ping()), 30000).unref();
}

export function emit(room: string, type: string, payload: unknown) {
  const msg = JSON.stringify({ type, room, payload });
  rooms.get(room)?.forEach((ws) => ws.readyState === ws.OPEN && ws.send(msg));
}
